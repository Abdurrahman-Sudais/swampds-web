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

  Build: ESP32 Arduino core 3.x, board "ESP32 Dev Module".
  Libraries: "Firebase Arduino Client Library for ESP8266 and ESP32" (Mobizt),
  "Adafruit SSD1306", "Adafruit GFX Library".
  Tools > Partition Scheme > "Huge APP (3MB No OTA/1MB SPIFFS)": with the default
  scheme this sketch fills ~97% of flash, so any addition will not fit.
*/

#include <WiFi.h>
#include <Wire.h>
#include <time.h>
#include <esp_system.h>
#include <sys/time.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>

// ======================= Credentials =======================
// WIFI_SSID, WIFI_PASSWORD, API_KEY, DATABASE_URL, USER_EMAIL, USER_PASSWORD
#include "secrets.h"

#define DEVICE_ID      "SWAMPDS-ESP32-01"
#define FW_VERSION     "1.2-2flow"
#define TZ_OFFSET_SEC  3600                             // Nigeria (WAT, UTC+1)

// ======================= Pins =======================
#define PIN_TRIG 5
#define PIN_ECHO 18
const uint8_t FLOW_PINS[2] = {32, 33};                  // flow1 = nearest the pump, flow2 = downstream
#define PIN_SDA 21
#define PIN_SCL 22
#define PIN_RELAY 15                                    // strapping pin: pulled up at boot, so the LOW-trigger relay stays off
#define PIN_LED_GREEN 25
#define PIN_LED_RED 26
#define PIN_LED_YELLOW 27
#define PIN_BUZZER 14
#define RELAY_ACTIVE_HIGH false                         // 1-channel LOW-level-trigger module: IN pulled LOW = relay ON

// ======================= Tunables — keep in step with src/twin/config.js and PUMP_THRESHOLDS =======================
// Delivery tank geometry. Only the first three are measured; the rest follow from them.
const float TANK_HEIGHT_CM       = 19.0;         // inside height of the tank
const float SENSOR_DROP_CM       = 1.2;          // how far below the rim the ultrasonic sensor's face sits
const float SENSOR_CLEARANCE_CM  = 3.8;          // allowance under the sensor (HC-SR04 is blind closer than ~2 cm)
const float SENSOR_TO_BOTTOM_CM  = TANK_HEIGHT_CM - SENSOR_DROP_CM;            // 17.8 cm
const float DELIVERY_HEIGHT_CM   = SENSOR_TO_BOTTOM_CM - SENSOR_CLEARANCE_CM;  // 14 cm = 100 % (highest safe level)
const float FLOW_K[2]            = {7.5, 7.5};   // YF-S201: 7.5 pulses/s per L/min (datasheet) — fine-tune each sensor with the jug test
const float TOLERANCE_PCT        = 20.0;         // flow loss between flow1/flow2 that counts as a leak
const uint32_t PERSIST_SEC       = 10;
const float MIN_FLOW_LPM         = 0.5;
// Auto-mode pump levels. These are the DEFAULTS: admins can change them from the dashboard's
// Settings page (config/pumpOnCm, config/pumpOffCm), within the limits below. The same limits
// are enforced by the database rules and src/twin/config.js (PUMP_LIMITS).
const float PUMP_ON_BELOW_CM     = 2.0;                        // auto: pump ON at or below this water depth (14 %)
const float PUMP_OFF_ABOVE_CM    = DELIVERY_HEIGHT_CM - 0.5;   // auto: pump OFF at 13.5 cm (96 %); 0.5 cm for water still in the pipe
const float MIN_PUMP_ON_CM       = 1.5;                        // limit: ON no lower than this (above the low-level warning)
const float MAX_PUMP_OFF_CM      = PUMP_OFF_ABOVE_CM;          // limit: OFF no higher than the safe level
const float MIN_PUMP_GAP_CM      = 2.0;                        // limit: OFF at least this far above ON (no rapid cycling)
const float LOW_LEVEL_WARN_CM    = 1.0;          // warning below this depth (pump should have started at 2 cm)
const uint32_t DRY_RUN_SEC       = 15;
const float DRY_RUN_MIN_FLOW     = 0.3;
const uint32_t DRY_RUN_HOLD_MS   = 60000;
const uint8_t SENSOR_FAULT_AFTER = 5;

const uint32_t PUBLISH_MS = 2000;
const uint32_t CONFIG_POLL_MS = 10000;                         // how often admin-set levels are re-read

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
bool levelKnown = false;          // no good reading yet: levelCm = 0 would look like an empty tank

float pumpOnCm  = PUMP_ON_BELOW_CM;    // levels in force (defaults until config/ is read)
float pumpOffCm = PUMP_OFF_ABOVE_CM;
uint32_t lastConfigPoll = 0;

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
uint32_t lastTick = 0, lastPublish = 0, lastWifiRetry = 0, lastWifiWaitMsg = 0;
bool wifiUp = false, firebaseStarted = false, firebaseAnnounced = false;

// Only touch Firebase once it is started and Wi-Fi is up; otherwise its calls can block the loop.
bool online() { return firebaseStarted && WiFi.status() == WL_CONNECTED && Firebase.ready(); }
bool buzzerTone = false;
uint8_t oledAddr = 0;             // I2C address the OLED answered at; 0 = not found
uint32_t lastOledCheck = 0;

// Hardware check (Serial Monitor). Counters cover the time since the last report.
const uint32_t HW_REPORT_MS = 10000;
uint32_t lastHwReport = 0;
uint32_t hwFlowPulses[2] = {0, 0};
uint16_t hwPumpOnSec = 0, hwRelaySwitches = 0;
uint8_t lastEchoes = 0;           // valid echoes (of 5) in the latest level reading
float lastDistCm = -1;            // sensor-to-water distance of the latest good reading
esp_reset_reason_t bootReason;

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
  if (!online()) return;
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
  if (!online() || pumpStartedMs == 0 || end == 0) return;
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
  hwRelaySwitches++;
  digitalWrite(PIN_RELAY, (on == RELAY_ACTIVE_HIGH) ? HIGH : LOW);
  if (on) { pumpOnSince = millis(); pumpStartedMs = nowMs(); }
  else    { logPumpRun(); pumpStartedMs = 0; }
  snapshotDue = true;
  Serial.printf("Pump %s\n", on ? "ON" : "OFF");
}

void writePumpCommand(const char *v) {
  if (online()) Firebase.RTDB.setString(&fbdoWrite, "control/pumpCommand", v);
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
  lastEchoes = n;
  if (n < 3) { if (++badReads >= SENSOR_FAULT_AFTER) sensorFault = true; return; }
  badReads = 0; sensorFault = false; levelKnown = true;
  for (int i = 1; i < n; i++) { float k = s[i]; int j = i - 1; while (j >= 0 && s[j] > k) { s[j + 1] = s[j]; j--; } s[j + 1] = k; }
  lastDistCm = s[n / 2];
  float h = constrain(SENSOR_TO_BOTTOM_CM - s[n / 2], 0.0f, DELIVERY_HEIGHT_CM);
  levelCm = h;
  levelPct = h / DELIVERY_HEIGHT_CM * 100.0f;
}

void calcFlows(uint32_t dtMs) {
  uint32_t p[2];
  noInterrupts(); for (int i = 0; i < 2; i++) { p[i] = flowPulses[i]; flowPulses[i] = 0; } interrupts();
  for (int i = 0; i < 2; i++) { flow[i] = (p[i] * 1000.0f / dtMs) / FLOW_K[i]; hwFlowPulses[i] += p[i]; }
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
    bool blocked = !levelKnown || sensorFault || leakA || holdActive(now);
    if (pumpOn && (levelCm >= pumpOffCm || blocked)) setPump(false);
    else if (!pumpOn && !blocked && levelCm <= pumpOnCm) setPump(true);
  } else if (leakA) {
    // Leak protection overrides manual mode (same as the twin). Drop the command too, so the
    // pump does not restart by itself once the leak is cleared by switching modes.
    setPump(false);
    if (manualCommand != "off") { manualCommand = "off"; writePumpCommand("off"); }
  } else {
    setPump(manualCommand == "on");
  }
}

// Admin-set levels from config/. Anything missing or outside the safe limits falls back to the
// defaults, so a bad value can never reach the pump. On a read error the current levels are kept.
void pollConfig() {
  if (!online()) return;
  if (!Firebase.RTDB.get(&fbdoWrite, "config")) { Serial.println(fbdoWrite.errorReason()); return; }

  float on = PUMP_ON_BELOW_CM, off = PUMP_OFF_ABOVE_CM;
  if (fbdoWrite.dataType() == "json") {
    FirebaseJson *j = fbdoWrite.to<FirebaseJson *>();
    FirebaseJsonData a, b;
    j->get(a, "pumpOnCm");
    j->get(b, "pumpOffCm");
    if (a.success && b.success) {
      float wantOn = a.to<float>(), wantOff = b.to<float>();
      if (wantOn >= MIN_PUMP_ON_CM && wantOff <= MAX_PUMP_OFF_CM && wantOff - wantOn >= MIN_PUMP_GAP_CM - 0.01f) {
        on = wantOn; off = wantOff;
      } else {
        Serial.printf("config: %.1f/%.1f cm is outside the safe limits, using defaults\n", wantOn, wantOff);
      }
    }
  }
  if (on != pumpOnCm || off != pumpOffCm) {
    pumpOnCm = on; pumpOffCm = off;
    pushAlert("info", "Auto pump levels now ON at " + String(on, 1) + " cm, OFF at " + String(off, 1) + " cm.");
    snapshotDue = true;
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

// ======================= Connection report (Serial Monitor, 115200 baud) =======================
const char *wifiReason(wl_status_t s) {
  switch (s) {
    case WL_NO_SSID_AVAIL:  return "network not found - is the hotspot on and set to 2.4 GHz?";
    case WL_CONNECT_FAILED: return "connection refused - check the password";
    case WL_CONNECTION_LOST:
    case WL_DISCONNECTED:   return "not connected yet - wrong password, or the hotspot is out of range";
    default:                return "waiting";
  }
}

void reportConnection(uint32_t now) {
  bool up = WiFi.status() == WL_CONNECTED;
  if (up != wifiUp) {
    wifiUp = up;
    if (up) Serial.printf("\n>>> Connected to Wi-Fi \"%s\" | IP %s | signal %d dBm\n",
                          WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
    else    Serial.printf("\n>>> Wi-Fi lost, reconnecting to \"%s\"...\n", WIFI_SSID);
    snapshotDue = true;
  } else if (!up && now - lastWifiWaitMsg >= 3000) {
    lastWifiWaitMsg = now;
    Serial.printf("... still trying to reach \"%s\": %s\n", WIFI_SSID, wifiReason(WiFi.status()));
  }
  if (up && !firebaseStarted) {
    Serial.println(">>> Signing in to Firebase...");
    Firebase.begin(&config, &auth);
    firebaseStarted = true;
  }
  if (up && !firebaseAnnounced && online()) {
    firebaseAnnounced = true;
    Serial.println(">>> Firebase connected - live data is going to the dashboard");
  }
}

// ======================= Status, alerts, indicators =======================
void evaluateStatus() {
  String warn = "";
  if (sensorFault) warn = "Water level sensor is not responding.";
  else if (holdActive(millis())) warn = "Pump stopped after running without flow.";
  else if (levelKnown && levelCm < LOW_LEVEL_WARN_CM) warn = "Water level is low (" + String(levelCm, 1) + " cm).";

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

// ======================= OLED check =======================
// Most modules answer at 0x3C, some at 0x3D. 0 = nothing answered.
uint8_t findOled() {
  for (uint8_t a = 0x3C; a <= 0x3D; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) return a; }
  return 0;
}

// While the OLED is missing, re-scan every 5 s: a fixed wire brings the screen up without a reboot.
void checkOled(uint32_t now) {
  if (oledAddr || now - lastOledCheck < 5000) return;
  lastOledCheck = now;
  if ((oledAddr = findOled())) display.begin(SSD1306_SWITCHCAPVCC, oledAddr);
}

// ======================= Hardware check (Serial Monitor, every 10 s) =======================
// Reports every part as OK or PROBLEM with what to check. Printed from loop() rather than setup(),
// so it still reaches a Serial Monitor opened after boot. The relay and LEDs cannot be sensed, so
// for those it prints what the code is asking for: if the hardware does something else, it is wiring.
bool resetIsProblem(esp_reset_reason_t r) {
  return r == ESP_RST_BROWNOUT || r == ESP_RST_PANIC || r == ESP_RST_INT_WDT || r == ESP_RST_TASK_WDT || r == ESP_RST_WDT;
}

const char *resetText(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON:  return "power on (normal)";
    case ESP_RST_EXT:
    case ESP_RST_SW:       return "reset button / upload (normal)";
    case ESP_RST_BROWNOUT: return "BROWNOUT: the supply voltage dipped, usually the pump starting. Give the pump its own supply (shared GND)";
    case ESP_RST_PANIC:    return "firmware crash. Copy the Serial Monitor text from before the reboot";
    case ESP_RST_INT_WDT:
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:      return "watchdog: the program froze and was restarted";
    default:               return "other";
  }
}

void hwLine(const char *part, bool ok, const String &msg, String &problems) {
  Serial.printf("  %-13s: %s%s\n", part, ok ? "OK  " : "PROBLEM - ", msg.c_str());
  if (!ok) problems += problems.length() ? String(", ") + part : String(part);
}

void flowLine(int i, String &problems) {
  const char *name = i == 0 ? "Flow 1" : "Flow 2";
  uint32_t p = hwFlowPulses[i];
  String pin = String("GPIO") + FLOW_PINS[i];
  if (i == 0 && holdActive(millis()))   // the dry-run stop is itself proof flow 1 saw no water
    hwLine(name, false, "the pump ran " + String(DRY_RUN_SEC) + " s with no flow here and was stopped. Water moving? If yes, check red->5V, black->GND, yellow->divider->" + pin + ", arrow points with the flow", problems);
  else if (hwPumpOnSec >= 5 && p == 0)
    hwLine(name, false, "pump ran " + String(hwPumpOnSec) + " s but no pulses on " + pin +
           ". Check red->5V, black->GND, yellow->divider->" + pin + ", arrow points with the flow", problems);
  else if (hwPumpOnSec == 0 && p > 0)
    hwLine(name, true, String(p) + " pulses while the pump was OFF (water draining, or noise on the signal wire)", problems);
  else
    hwLine(name, true, String(p) + " pulses, " + String(flow[i], 1) + " L/min" + (hwPumpOnSec ? "" : " (pump OFF, 0 is normal)"), problems);
}

void hardwareReport() {
  String problems = "";
  Serial.printf("\n---------- HARDWARE CHECK  (up %s, firmware %s) ----------\n", fmtDuration(millis() / 1000).c_str(), FW_VERSION);

  hwLine("Last reboot", !resetIsProblem(bootReason), resetText(bootReason), problems);

  if (WiFi.status() == WL_CONNECTED) {
    int rssi = WiFi.RSSI();
    hwLine("Wi-Fi", rssi > -80, "\"" + WiFi.SSID() + "\" " + rssi + " dBm" + (rssi > -80 ? "" : " (weak - move closer to the hotspot)"), problems);
  } else hwLine("Wi-Fi", false, String("not connected to \"") + WIFI_SSID + "\": " + wifiReason(WiFi.status()), problems);

  if (online()) hwLine("Firebase", true, "connected", problems);
  else if (WiFi.status() != WL_CONNECTED) hwLine("Firebase", false, "waiting for Wi-Fi", problems);
  else hwLine("Firebase", false, "not connected: " + fbdoWrite.errorReason() + " (check secrets.h)", problems);

  if (oledAddr) hwLine("OLED", true, "found at 0x" + String(oledAddr, HEX), problems);
  else {
    String seen = "";
    for (uint8_t a = 1; a < 127; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) seen += " 0x" + String(a, HEX); }
    hwLine("OLED", false, "not found. Check SDA->GPIO21, SCL->GPIO22 (try swapping), VCC->3.3V, GND. I2C devices seen:" +
           (seen.length() ? seen + " (wrong address, or not an SSD1306)" : String(" none")), problems);
  }

  if (lastEchoes == 0)
    hwLine("Level sensor", false, "no echo at all. Check TRIG->GPIO5, ECHO->divider->GPIO18, VCC->5V, GND", problems);
  else if (lastEchoes < 3)
    hwLine("Level sensor", false, "unstable, " + String(lastEchoes) + "/5 echoes. Loose wire, or not aimed straight at the water", problems);
  else if (lastDistCm > SENSOR_TO_BOTTOM_CM + 3)
    hwLine("Level sensor", false, String(lastDistCm, 1) + " cm away, deeper than the tank (" + String(SENSOR_TO_BOTTOM_CM, 1) +
           " cm). Is it mounted straight, facing the water?", problems);
  else
    hwLine("Level sensor", true, String(lastDistCm, 1) + " cm to the water, depth " + String(levelCm, 1) + " cm (" +
           String(lastEchoes) + "/5 echoes)", problems);

  flowLine(0, problems);
  flowLine(1, problems);

  String relay = String("pump ") + (pumpOn ? "ON" : "OFF") + ", GPIO" + PIN_RELAY + " " + (digitalRead(PIN_RELAY) ? "HIGH" : "LOW") +
                 " (relay should be " + (pumpOn ? "pulled in, LED on" : "released, LED off") + "), switched " +
                 hwRelaySwitches + "x in the last 10 s";
  if (hwRelaySwitches > 4) hwLine("Relay", false, relay + " - the code is switching it rapidly", problems);
  else hwLine("Relay", true, relay + ". If it clicks more than this, it is power or wiring", problems);

  const char *st = status == S_LEAK ? "LEAK" : status == S_WARNING ? "WARNING" : "NORMAL";
  const char *led = status == S_LEAK ? "RED (and the buzzer)" : status == S_WARNING ? "YELLOW" : "GREEN";
  Serial.printf("  %-13s: only %s should be lit (status %s)\n", "LEDs", led, st);

  uint32_t heap = ESP.getFreeHeap();
  hwLine("Free memory", heap > 20000, String(heap / 1024) + " KB", problems);

  if (problems.length()) Serial.printf("  >>> CHECK: %s\n", problems.c_str());
  else                   Serial.println("  >>> All hardware OK");
  Serial.println("----------------------------------------------------------------");

  hwFlowPulses[0] = hwFlowPulses[1] = 0; hwPumpOnSec = 0; hwRelaySwitches = 0;
}

void updateDisplay() {
  display.clearDisplay(); display.setCursor(0, 0);
  display.printf("SWAMPDS   %s\n", online() ? "ONLINE" : "OFFLINE");
  if (wifiUp) display.printf("IP %s\n", WiFi.localIP().toString().c_str());
  else        display.println("WiFi connecting...");
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
  if (!online()) return;
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
  root.set("hardware/wifi", WiFi.SSID());
  root.set("hardware/ip", WiFi.localIP().toString());
  root.set("hardware/pumpOnCm", pumpOnCm);     // levels actually in force, so the dashboard can confirm a change
  root.set("hardware/pumpOffCm", pumpOffCm);
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
  bootReason = esp_reset_reason();

  // Set the "off" level BEFORE making the pin an output: a new output starts LOW, which on a
  // low-level-trigger relay would click the pump on for a moment at every boot.
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_HIGH ? LOW : HIGH);
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

  // begin() must run even when the OLED is missing: every display call writes into the buffer it
  // allocates. The hardware check reports the result once loop() is running.
  Wire.begin(PIN_SDA, PIN_SCL);
  oledAddr = findOled();
  if (!display.begin(SSD1306_SWITCHCAPVCC, oledAddr ? oledAddr : 0x3C)) Serial.println("OLED: not enough memory for the display buffer");
  display.setTextColor(SSD1306_WHITE); display.setTextSize(1);
  display.clearDisplay(); display.setCursor(0, 0); display.println("SWAMPDS booting...");
  display.printf("WiFi: %s\n", WIFI_SSID); display.display();

  Serial.printf("\n\nSWAMPDS %s (%s) - connecting to Wi-Fi \"%s\"...\n", FW_VERSION, DEVICE_ID, WIFI_SSID);
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
  // Firebase.begin() is called from loop() once Wi-Fi is up: started earlier, its sign-in blocks.
}

void loop() {
  uint32_t now = millis();

  if (WiFi.status() != WL_CONNECTED && now - lastWifiRetry > 10000) {
    WiFi.disconnect(); WiFi.reconnect(); lastWifiRetry = now;
  }
  reportConnection(now);
  checkOled(now);

  if (online() && !streamsStarted) {
    bool a = Firebase.RTDB.beginStream(&fbdoModeStream, "status/controlMode");
    bool b = Firebase.RTDB.beginStream(&fbdoCmdStream, "control/pumpCommand");
    if (a && b) {
      Firebase.RTDB.setStreamCallback(&fbdoModeStream, streamModeCb, streamTimeoutCb);
      Firebase.RTDB.setStreamCallback(&fbdoCmdStream, streamCmdCb, streamTimeoutCb);
      streamsStarted = true;
    }
  }
  if (online() && streamsStarted && !bootAnnounced) announceBoot();

  handleStreamEvents();

  if (now - lastTick >= 1000) {
    uint32_t dt = now - lastTick; lastTick = now;
    calcFlows(dt);
    if (pumpOn) hwPumpOnSec++;
    readLevel();
    updateLeak(now);
    checkDryRun(now);
    runPumpControl(now);
    evaluateStatus();
    updateIndicators();
    updateDisplay();
  }
  updateBuzzer();

  if (now - lastHwReport >= HW_REPORT_MS) { lastHwReport = now; hardwareReport(); }

  if (streamsStarted && (lastConfigPoll == 0 || now - lastConfigPoll >= CONFIG_POLL_MS)) {
    lastConfigPoll = now ? now : 1;
    pollConfig();
  }

  if (snapshotDue || now - lastPublish >= PUBLISH_MS) publishSnapshot();
}
