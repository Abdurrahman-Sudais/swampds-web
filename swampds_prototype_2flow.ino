/*
  SWAMPDS Prototype Firmware — 2 flow sensors
  ------------------------------------------------------------------------
  Same contract as swampds_prototype.ino, reduced to 2 flow sensors.
  Only sensors/flow1 and sensors/flow2 are published — flow3 no longer
  exists in the payload at all (make sure the dashboard/twin no longer
  expect it).

  Leak detection: ONE segment ("A"), comparing flow1 (near the pump) to
  flow2 (downstream). Anything past flow2's physical position is NOT
  monitored — a leak there will not be detected. leakSegments can only
  ever come back as "A" or be absent; "B" and "A,B" no longer occur.

  Pins, libraries, and setup are otherwise identical to the 3-sensor
  version — see that file's header comment for board/IDE setup.

  Credentials live in secrets.h (git-ignored). Copy secrets.example.h to
  secrets.h in this folder and fill it in before compiling.
*/

#include <WiFi.h>
#include <Wire.h>
#include <time.h>
#include <sys/time.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>

// ======================= Credentials =======================
// WIFI_SSID, WIFI_PASSWORD, API_KEY, DATABASE_URL, USER_EMAIL, USER_PASSWORD
#include "secrets.h"

#define DEVICE_ID      "SWAMPDS-ESP32-01"
#define FW_VERSION     "1.1-2flow"
#define TZ_OFFSET_SEC  3600                             // Nigeria (WAT, UTC+1)

// ======================= Pins =======================
#define PIN_TRIG 5
#define PIN_ECHO 18
const uint8_t FLOW_PINS[2] = {32, 33};                  // flow1 = nearest the pump, flow2 = downstream
#define PIN_SDA 21
#define PIN_SCL 22
#define PIN_RELAY 19
#define PIN_LED_GREEN 25
#define PIN_LED_RED 26
#define PIN_LED_YELLOW 27
#define PIN_BUZZER 14
#define RELAY_ACTIVE_HIGH true                          // many relay boards are active-LOW: set false

// ======================= Tunables — keep in step with src/twin/config.js and PUMP_THRESHOLDS =======================
const float DELIVERY_HEIGHT_CM   = 18.0;         // physical tank height
const float SENSOR_TO_BOTTOM_CM  = 18.0;         // ultrasonic sensor to tank bottom — MEASURE this on the rig
const float FLOW_K[2]            = {7.5, 7.5};   // pulses/s per L/min — calibrate each sensor
const float TOLERANCE_PCT        = 20.0;         // flow loss between flow1/flow2 that counts as a leak
const uint32_t PERSIST_SEC       = 10;
const float MIN_FLOW_LPM         = 0.5;
const float PUMP_ON_BELOW_CM     = 2.0;          // auto: pump ON at or below this water depth
const float PUMP_OFF_ABOVE_CM    = 13.0;         // auto: pump OFF at or above; leaves 5 cm below the sensor (HC-SR04 dead zone + ripple)
const float LOW_LEVEL_WARN_CM    = 1.0;          // warning below this depth (pump should have started at 2 cm)
const uint32_t DRY_RUN_SEC       = 15;
const float DRY_RUN_MIN_FLOW     = 0.3;
const uint32_t DRY_RUN_HOLD_MS   = 60000;
const uint8_t SENSOR_FAULT_AFTER = 5;

const uint32_t PUBLISH_MS = 2000;

// ======================= Globals =======================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
FirebaseData fbdoWrite, fbdoModeStream, fbdoCmdStream;
FirebaseAuth auth;
FirebaseConfig config;

volatile uint32_t flowPulses[2] = {0, 0};
void IRAM_ATTR isr0() { flowPulses[0]++; }
void IRAM_ATTR isr1() { flowPulses[1]++; }

enum Status { S_NORMAL, S_WARNING, S_LEAK };

float flow[2] = {0, 0};
float levelPct = 0, levelCm = 0;
uint8_t badReads = 0;
bool sensorFault = false;

bool pumpOn = false;
uint32_t pumpOnSince = 0;
int64_t pumpStartedMs = 0;
bool modeAuto = true;
String manualCommand = "off";
uint32_t dryRunHoldUntil = 0;
bool dryRunHoldActive = false;   // separate flag so the millis() rollover can't fake a hold

bool leakA = false;               // single segment now. LATCHED on purpose: it stays true (pump blocked in both
                                  // modes) until the operator switches mode, so someone must inspect the pipe.
uint32_t overSinceA = 0;

Status status = S_NORMAL, prevStatus = S_NORMAL;
String prevLeakStr = "";
String prevWarnReason = "";

// Fields that are only written sometimes. RTDB updateNode merges, so a field we stop
// sending would linger; track them and delete when they stop applying. Start true so
// stale values left by a previous run are cleaned on the first publish.
bool leakFieldSet = true, pumpStartFieldSet = true;

volatile bool modeEvent = false, cmdEvent = false;
String pendingMode, pendingCmd;
bool modeKnown = false, cmdKnown = false, streamsStarted = false, bootAnnounced = false;

bool snapshotDue = false;
uint32_t lastTick = 0, lastPublish = 0, lastWifiRetry = 0;
bool buzzerTone = false;

// ======================= Time helpers =======================
bool timeSynced() { return time(nullptr) > 1700000000; }

int64_t nowMs() {
  if (!timeSynced()) return 0;
  struct timeval tv; gettimeofday(&tv, nullptr);
  return (int64_t)tv.tv_sec * 1000LL + tv.tv_usec / 1000;
}

String fmtTime(int64_t ms) {
  time_t t = ms / 1000; struct tm tmv; localtime_r(&t, &tmv);
  char b[16]; strftime(b, sizeof b, "%I:%M %p", &tmv);
  return String(b[0] == '0' ? b + 1 : b);
}
String fmtDate(int64_t ms) {
  time_t t = ms / 1000; struct tm tmv; localtime_r(&t, &tmv);
  char b[20]; strftime(b, sizeof b, "%b %d %Y", &tmv);
  return String(b);
}
String fmtDuration(uint32_t sec) {
  uint32_t h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60;
  return h > 0 ? String(h) + "h " + m + "m " + s + "s" : String(m) + "m " + s + "s";
}

// Rollover-safe (millis() wraps after ~49 days)
bool holdActive(uint32_t now) {
  if (!dryRunHoldActive) return false;
  if ((int32_t)(dryRunHoldUntil - now) > 0) return true;
  dryRunHoldActive = false;
  return false;
}

// ======================= Alerts / history =======================
void pushAlert(const char *severity, const String &message) {
  if (!Firebase.ready()) return;
  FirebaseJson j;
  int64_t ms = nowMs();
  j.set("time", ms ? fmtTime(ms) : String("--"));
  j.set("severity", severity);
  j.set("message", message);
  j.set("timestamp/.sv", "timestamp");
  j.set("source", "esp32");
  Firebase.RTDB.pushJSON(&fbdoWrite, "alerts", &j);
  Serial.printf("ALERT [%s] %s\n", severity, message.c_str());
}

void logPumpRun() {
  int64_t end = nowMs();
  if (!Firebase.ready() || pumpStartedMs == 0 || end == 0) return;
  FirebaseJson j;
  j.set("date", fmtDate(pumpStartedMs));
  j.set("start", fmtTime(pumpStartedMs));
  j.set("end", fmtTime(end));
  j.set("duration", fmtDuration((uint32_t)((end - pumpStartedMs) / 1000)));
  j.set("startTimestamp", (double)pumpStartedMs);
  Firebase.RTDB.pushJSON(&fbdoWrite, "pumpHistory", &j);
}

// ======================= Pump =======================
void setPump(bool on) {
  if (on == pumpOn) return;
  pumpOn = on;
  digitalWrite(PIN_RELAY, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW);
  if (on) { pumpOnSince = millis(); pumpStartedMs = nowMs(); }
  else    { logPumpRun(); pumpStartedMs = 0; }
  snapshotDue = true;
  Serial.printf("Pump %s\n", on ? "ON" : "OFF");
}

void writePumpCommand(const char *v) {
  if (Firebase.ready()) Firebase.RTDB.setString(&fbdoWrite, "control/pumpCommand", v);
}

// ======================= Sensors =======================
float pingCm() {
  digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long d = pulseIn(PIN_ECHO, HIGH, 30000);
  return d == 0 ? -1.0f : d * 0.0343f / 2.0f;
}

void readLevel() {
  float s[5]; int n = 0;
  for (int i = 0; i < 5; i++) { float x = pingCm(); if (x >= 2 && x <= 400) s[n++] = x; delay(30); }
  if (n < 3) { if (++badReads >= SENSOR_FAULT_AFTER) sensorFault = true; return; }
  badReads = 0; sensorFault = false;
  for (int i = 1; i < n; i++) { float k = s[i]; int j = i - 1; while (j >= 0 && s[j] > k) { s[j + 1] = s[j]; j--; } s[j + 1] = k; }
  float h = constrain(SENSOR_TO_BOTTOM_CM - s[n / 2], 0.0f, DELIVERY_HEIGHT_CM);
  levelCm = h;
  levelPct = h / DELIVERY_HEIGHT_CM * 100.0f;
}

void calcFlows(uint32_t dtMs) {
  uint32_t p[2];
  noInterrupts(); for (int i = 0; i < 2; i++) { p[i] = flowPulses[i]; flowPulses[i] = 0; } interrupts();
  for (int i = 0; i < 2; i++) flow[i] = (p[i] * 1000.0f / dtMs) / FLOW_K[i];
}

// Single segment: flow1 (near pump) vs flow2 (downstream). Anything past
// flow2's physical location is unmonitored by design — no data for it exists.
void updateLeak(uint32_t now) {
  float up = flow[0], dn = flow[1];
  bool over = up >= MIN_FLOW_LPM && ((up - dn) / up * 100.0f) > TOLERANCE_PCT;
  if (over) {
    if (overSinceA == 0) overSinceA = now;
    else if (now - overSinceA >= PERSIST_SEC * 1000UL) leakA = true;
  } else overSinceA = 0;
}

String leakString() { return leakA ? "A" : ""; }   // "B" and "A,B" no longer possible

// ======================= Control =======================
void checkDryRun(uint32_t now) {
  if (pumpOn && now - pumpOnSince > DRY_RUN_SEC * 1000UL && flow[0] < DRY_RUN_MIN_FLOW) {
    setPump(false);
    manualCommand = "off";
    dryRunHoldUntil = now + DRY_RUN_HOLD_MS;
    dryRunHoldActive = true;
    if (!modeAuto) writePumpCommand("off");
    pushAlert("warning", "Pump ran without flow and was stopped to protect it. Check the water source and pipework.");
  }
}

void runPumpControl(uint32_t now) {
  if (modeAuto) {
    bool blocked = sensorFault || leakA || holdActive(now);
    if (pumpOn && (levelCm >= PUMP_OFF_ABOVE_CM || blocked)) setPump(false);
    else if (!pumpOn && !blocked && levelCm <= PUMP_ON_BELOW_CM) setPump(true);
  } else if (leakA) {
    // Leak protection overrides manual mode (same as the twin). Drop the command too, so the
    // pump does not restart by itself once the leak is cleared by switching modes.
    setPump(false);
    if (manualCommand != "off") { manualCommand = "off"; writePumpCommand("off"); }
  } else {
    setPump(manualCommand == "on");
  }
}

void handleStreamEvents() {
  if (modeEvent) {
    modeEvent = false;
    String m = pendingMode; m.toLowerCase();
    if (m == "auto" || m == "manual") {
      bool wantAuto = (m == "auto");
      if (!modeKnown) { modeKnown = true; modeAuto = wantAuto; }
      else if (wantAuto != modeAuto) {
        modeAuto = wantAuto;
        leakA = false; overSinceA = 0;
        manualCommand = pumpOn ? "on" : "off";
        if (!modeAuto) writePumpCommand(manualCommand.c_str());
        snapshotDue = true;
      }
    }
  }
  if (cmdEvent) {
    cmdEvent = false;
    String c = pendingCmd; c.toLowerCase();
    if (c == "on" || c == "off") {
      if (!cmdKnown) {
        cmdKnown = true; manualCommand = "off";
        if (!modeAuto) writePumpCommand("off");
      } else if (!modeAuto) manualCommand = c;
    }
  }
}

void streamModeCb(FirebaseStream d) { if (d.dataType() == "string") { pendingMode = d.stringData(); modeEvent = true; } }
void streamCmdCb(FirebaseStream d)  { if (d.dataType() == "string") { pendingCmd  = d.stringData(); cmdEvent  = true; } }
void streamTimeoutCb(bool t) { if (t) Serial.println("stream timeout, resuming"); }

// ======================= Status, alerts, indicators =======================
void evaluateStatus() {
  String warn = "";
  if (sensorFault) warn = "Water level sensor is not responding.";
  else if (holdActive(millis())) warn = "Pump stopped after running without flow.";
  else if (levelCm < LOW_LEVEL_WARN_CM) warn = "Water level is low (" + String(levelCm, 1) + " cm).";

  status = leakA ? S_LEAK : (warn.length() ? S_WARNING : S_NORMAL);

  String ls = leakString();
  if (status == S_LEAK && ls != prevLeakStr)
    pushAlert("critical", "Leak detected between the flow sensors. Flow is dropping from flow1 to flow2 — note that anything downstream of flow2 is not monitored.");
  else if (status == S_WARNING && (prevStatus != S_WARNING || warn != prevWarnReason))
    pushAlert("warning", warn);
  else if (status == S_NORMAL && prevStatus != S_NORMAL)
    pushAlert("info", "System returned to normal.");

  if (status != prevStatus || ls != prevLeakStr) snapshotDue = true;
  prevStatus = status; prevLeakStr = ls; prevWarnReason = warn;
}

void updateIndicators() {
  digitalWrite(PIN_LED_GREEN,  status == S_NORMAL);
  digitalWrite(PIN_LED_YELLOW, status == S_WARNING);
  digitalWrite(PIN_LED_RED,    status == S_LEAK);
}

void updateBuzzer() {
  bool want = (status == S_LEAK) && ((millis() / 500) % 2 == 0);
  if (want != buzzerTone) { ledcWriteTone(PIN_BUZZER, want ? 1000 : 0); buzzerTone = want; }
}

void updateDisplay() {
  display.clearDisplay(); display.setCursor(0, 0);
  display.printf("SWAMPDS   %s\n", Firebase.ready() ? "ONLINE" : "OFFLINE");
  display.printf("Level %d%%  %.1fcm\n", (int)round(levelPct), levelCm);
  display.printf("F1 %.1f  F2 %.1f\n", flow[0], flow[1]);
  display.printf("Pump %s  %s\n", pumpOn ? "ON" : "OFF", modeAuto ? "AUTO" : "MANUAL");
  const char *st = status == S_LEAK ? "LEAK" : status == S_WARNING ? "WARNING" : "NORMAL";
  display.printf("%s %s\n", st, leakString().c_str());
  if (sensorFault) display.println("Level sensor fault");
  display.display();
}

// ======================= Publishing =======================
float r1(float v) { return roundf(v * 10.0f) / 10.0f; }

void publishSnapshot() {
  if (!Firebase.ready()) return;
  FirebaseJson root;
  root.set("sensors/flow1", r1(flow[0]));
  root.set("sensors/flow2", r1(flow[1]));
  // No sensors/flow3 — the 2-sensor dashboard/twin must not expect this field.
  root.set("sensors/waterLevelPercent", (int)round(levelPct));
  root.set("sensors/waterLevelCm", r1(levelCm));
  root.set("sensors/lastUpdated/.sv", "timestamp");

  root.set("system/status", status == S_LEAK ? "LEAK" : status == S_WARNING ? "WARNING" : "NORMAL");
  root.set("system/pumpState", pumpOn ? "ON" : "OFF");
  root.set("system/pumpMode", modeAuto ? "AUTO" : "MANUAL");
  root.set("system/source", "esp32");
  root.set("system/online", true);
  String ls = leakString();
  bool hasLeak = ls.length() > 0;
  bool hasStart = pumpOn && pumpStartedMs;
  if (hasLeak) root.set("system/leakSegments", ls);   // only ever "A"; deleted below when it clears
  if (hasStart) root.set("system/pumpStartedAt", (double)pumpStartedMs);

  root.set("hardware/deviceId", DEVICE_ID);
  root.set("hardware/firmware", FW_VERSION);
  root.set("hardware/lastSeen/.sv", "timestamp");

  if (Firebase.RTDB.updateNode(&fbdoWrite, "/", &root)) {
    if (hasLeak) leakFieldSet = true;
    else if (leakFieldSet && Firebase.RTDB.deleteNode(&fbdoWrite, "system/leakSegments")) leakFieldSet = false;
    if (hasStart) pumpStartFieldSet = true;
    else if (pumpStartFieldSet && Firebase.RTDB.deleteNode(&fbdoWrite, "system/pumpStartedAt")) pumpStartFieldSet = false;
  } else Serial.println(fbdoWrite.errorReason());
  lastPublish = millis(); snapshotDue = false;
}

void announceBoot() {
  FirebaseJson j;
  j.set("twin/tolerancePct", TOLERANCE_PCT);
  j.set("twin/persistSec", (int)PERSIST_SEC);
  Firebase.RTDB.updateNode(&fbdoWrite, "/", &j);
  pushAlert("info", "Hardware connected (" DEVICE_ID "). This dashboard is now showing live sensor data (2-sensor configuration).");
  bootAnnounced = true;
}

// ======================= Arduino =======================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(PIN_LED_GREEN, OUTPUT); pinMode(PIN_LED_YELLOW, OUTPUT); pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_TRIG, OUTPUT); pinMode(PIN_ECHO, INPUT);
  ledcAttach(PIN_BUZZER, 2000, 8); ledcWriteTone(PIN_BUZZER, 0);

  pinMode(FLOW_PINS[0], INPUT_PULLUP);
  pinMode(FLOW_PINS[1], INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PINS[0]), isr0, RISING);
  attachInterrupt(digitalPinToInterrupt(FLOW_PINS[1]), isr1, RISING);
  // GPIO34 (formerly flow3) is now free — available if you add a sensor back later.

  Wire.begin(PIN_SDA, PIN_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE); display.setTextSize(1);
  display.clearDisplay(); display.setCursor(0, 0); display.println("SWAMPDS booting..."); display.display();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTime(TZ_OFFSET_SEC, 0, "pool.ntp.org", "time.google.com");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;
  fbdoWrite.setBSSLBufferSize(4096, 1024);
  fbdoModeStream.setBSSLBufferSize(2048, 512);
  fbdoCmdStream.setBSSLBufferSize(2048, 512);
  Firebase.reconnectWiFi(true);
  Firebase.begin(&config, &auth);
}

void loop() {
  uint32_t now = millis();

  if (WiFi.status() != WL_CONNECTED && now - lastWifiRetry > 10000) {
    WiFi.disconnect(); WiFi.reconnect(); lastWifiRetry = now;
  }

  if (Firebase.ready() && !streamsStarted) {
    bool a = Firebase.RTDB.beginStream(&fbdoModeStream, "status/controlMode");
    bool b = Firebase.RTDB.beginStream(&fbdoCmdStream, "control/pumpCommand");
    if (a && b) {
      Firebase.RTDB.setStreamCallback(&fbdoModeStream, streamModeCb, streamTimeoutCb);
      Firebase.RTDB.setStreamCallback(&fbdoCmdStream, streamCmdCb, streamTimeoutCb);
      streamsStarted = true;
    }
  }
  if (Firebase.ready() && streamsStarted && !bootAnnounced) announceBoot();

  handleStreamEvents();

  if (now - lastTick >= 1000) {
    uint32_t dt = now - lastTick; lastTick = now;
    calcFlows(dt);
    readLevel();
    updateLeak(now);
    checkDryRun(now);
    runPumpControl(now);
    evaluateStatus();
    updateIndicators();
    updateDisplay();
  }
  updateBuzzer();

  if (snapshotDue || now - lastPublish >= PUBLISH_MS) publishSnapshot();
}
