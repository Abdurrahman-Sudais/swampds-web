# SWAMPDS prototype: wiring guide

How to wire the SWAMPDS prototype from scratch: the ESP32, the three flow sensors, the level sensor, the OLED, the relay and pump, the LEDs and the buzzer. Every pin here matches `swampds_prototype_2flow.ino`. If you change a pin, change it in the `#define PIN_...` lines of the sketch as well.

> **Golden rules**
> 1. **Never feed 5 V into an ESP32 pin.** The ESP32 runs at 3.3 V. Signals from 5 V parts (the HC-SR04's ECHO and the flow sensors' yellow wire) go through a voltage divider first.
> 2. **One shared GND** for the ESP32 and every sensor, LED and module. Most "random" faults come from a missing or loose ground.
> 3. **The pump never runs from the ESP32's power.** It gets its own supply and is switched only by the relay's contacts.

---

## 1. Parts list

| Qty | Part | Notes |
|---|---|---|
| 1 | ESP32 DevKit V1 (ESP32-WROOM-32, 30- or 38-pin) | Arduino board setting: **ESP32 Dev Module** |
| 3 | YF-S201 Hall-effect flow sensors | 1/2" thread, 5 V, wires: red / black / yellow |
| 1 | HC-SR04 ultrasonic sensor | 5 V |
| 1 | 0.96" OLED, 128 × 64, **SSD1306, I2C** (4 pins) | Not the 1.3" SH1106; that needs a different library |
| 1 | 1-channel **5 V relay module, low-level trigger** | Pins `DC+ DC- IN`, contacts `COM NO NC` |
| 1 | Small DC water pump + its own power supply | e.g. 12 V pump with a 12 V adapter |
| 3 | 5 mm LEDs: green, blue, red | |
| 3 | 330 Ω resistors | One per LED |
| 1 | Passive buzzer (5 V) | The firmware plays a tone; a passive buzzer is the right type |
| 1 | NPN transistor (2N2222, BC547 or S8050) + 1 kΩ resistor | Drives the buzzer from the 5 V rail |
| 4 | 10 kΩ resistors | Top half of each voltage divider |
| 4 | 20 kΩ resistors (or 2 × 10 kΩ in series each) | Bottom half of each voltage divider |
| 3 | 10 nF ceramic capacitors (optional, recommended) | Filters noise on the flow-sensor signals |
| 1 | 1N4007 (or 1N5819) diode | Across the pump motor |
| 1 | 100 nF ceramic capacitor | Across the pump motor terminals |
| 1 | 470–1000 µF electrolytic capacitor, ≥ 10 V | Across the 5 V rail, near the ESP32 |
| 1 | 5 V, 2 A power supply | For the 5 V rail (sensors, relay, and the ESP32 when not on USB) |
| — | 2 breadboards (or 1 large), jumper wires | The ESP32 is wide: put it across two boards |

---

## 2. Pin map

| ESP32 pin | Connects to | Direction | Notes |
|---|---|---|---|
| **GPIO34** | Flow sensor 1 (near the pump), yellow wire | in | Through a **10k/20k divider** |
| **GPIO35** | Flow sensor 2 (midpoint), yellow wire | in | Through a **10k/20k divider** |
| **GPIO32** | Flow sensor 3 (end of the pipe, before the delivery tank), yellow wire | in | Through a **10k/20k divider** |
| **GPIO17** | HC-SR04 `TRIG` | out | Direct: 3.3 V is enough to trigger it |
| **GPIO16** | HC-SR04 `ECHO` | in | Through a **10k/20k divider** (ECHO is 5 V) |
| **GPIO21** | OLED `SDA` | I2C | |
| **GPIO22** | OLED `SCL` | I2C | |
| **GPIO23** | Relay module `IN` | out | LOW = relay on = pump on |
| **GPIO25** | Green LED (through 330 Ω) | out | Status NORMAL |
| **GPIO27** | Blue LED (through 330 Ω) | out | Status WARNING |
| **GPIO26** | Red LED (through 330 Ω) | out | Status LEAK |
| **GPIO33** | Buzzer transistor base (through 1 kΩ) | out | Sounds during a leak |
| **3V3** | OLED `VCC` | power | |
| **VIN / 5V** | 5 V rail | power | See [Power](#3-power) |
| **GND** | Ground rail | power | Use more than one GND pin if you can |

### Why these pins

The ESP32 has pins that look free but cause trouble. This map avoids all of them:

| Pins | Problem | Used here? |
|---|---|---|
| GPIO6–11 | Wired to the onboard flash chip. Using them crashes the board | Never |
| GPIO1, GPIO3 | USB serial (uploading and the Serial Monitor) | Never |
| GPIO0, 2, 5, 12, 15 | **Strapping pins**: their level at power-up decides how the chip boots. Something pulling on them can stop it booting or uploading | No |
| GPIO5, 14, 15 | Put out a signal **during boot**. On the relay, that clicks the pump on at every power-up; on the buzzer, a chirp | No (that's why the relay moved off GPIO15 and the buzzer off GPIO14) |
| GPIO34–39 | Input only, with no internal pull-ups | GPIO34/35 for flow sensors 1 and 2: inputs are all they need, and the firmware uses no pull-ups anyway |
| GPIO36, 39 | Known ESP32 quirk: they see brief false edges while Wi-Fi is running | Not for flow sensors (every false edge would count as a pulse). That's why flow sensor 3 is on GPIO32 |
| GPIO16, 17 | Used by the PSRAM chip on **ESP32-WROVER** modules | Yes, for the HC-SR04. Fine on the WROOM-32 this guide uses; on a WROVER board, move them |

**Free for later:** GPIO4, 13, 18, 19 (outputs or inputs) and GPIO36, 39 (inputs only, e.g. an analogue pressure sensor).

---

## 3. Power

```
            5 V 2 A supply                                  Pump supply (e.g. 12 V)
            +        -                                       +          -
            |        |                                       |          |
   5V RAIL -+        +- GND RAIL ---- ESP32 GND              |          |
     |                  |                                    |      Pump (-)
     |-- ESP32 VIN      |-- every sensor/module GND          |          |
     |-- HC-SR04 VCC    |                                 Relay COM     |
     |-- YF-S201 red ×3 |                                 Relay NO -- Pump (+)
     |-- Relay DC+      |
     |                  |                         (pump circuit: completely separate,
   [1000 µF across 5V RAIL and GND RAIL]           no wire to the ESP32 side at all)
```

- **The 5 V rail** feeds the HC-SR04, all three flow sensors and the relay module. On its own, the ESP32 also runs from this rail through its `VIN` pin.
- **On USB, for uploading or the Serial Monitor:** the ESP32 is powered by USB. **Unplug the wire from the 5 V rail to `VIN`** while USB is connected, so the two supplies don't fight. Keep the GND wire connected; the sensors stay powered from the rail.
- **Why a 5 V 2 A supply instead of USB alone:** Wi-Fi draws short peaks of 300–400 mA, and the relay, sensors and OLED add about 200 mA. A PC USB port gives about 500 mA. Running on USB alone causes slow Wi-Fi connections and random resets ("brownouts").
- **The 1000 µF capacitor** across the 5 V rail smooths those Wi-Fi peaks. Mind its polarity: the stripe goes to GND.
- **The OLED runs from 3V3, not 5 V.** Its built-in I2C pull-ups connect to its VCC. At 5 V they would pull GPIO21 and GPIO22 to 5 V.
- **The pump circuit is isolated.** The relay contacts switch it, so it needs **no** connection to the ESP32's GND. Keep its wires away from the sensor wires.

---

## 4. Wiring each part

### 4.1 Voltage divider (used four times)

The HC-SR04's ECHO and the flow sensors' signal wire swing to 5 V. A divider brings that down to 3.3 V:

```
 5 V signal ──[ 10 kΩ ]──┬──── to ESP32 pin
                         │
                      [ 20 kΩ ]        5 V × 20k / (10k + 20k) = 3.3 V
                         │
 GND ────────────────────┘
```

No 20 kΩ resistors? Two 10 kΩ in series make one.

### 4.2 Flow sensors (YF-S201) × 3

| Sensor wire | Goes to |
|---|---|
| Red | 5 V rail |
| Black | GND rail |
| Yellow | Divider → **GPIO34** (sensor 1), **GPIO35** (sensor 2) or **GPIO32** (sensor 3) |

```
 Yellow ──[ 10 kΩ ]──┬──────── GPIO34 (or GPIO35, GPIO32)
                     ├──[ 20 kΩ ]── GND
                     └──| 10 nF |── GND     (optional noise filter)
```

- **Direction:** the **arrow** on the sensor body must point the way the water flows. Backwards, it reads poorly or not at all.
- **Order:** sensor 1 is the one **nearest the pump**, sensor 2 is at the **midpoint** of the pipe and sensor 3 at the **end**, just before the delivery tank. Leak detection compares neighbouring sensors (1 with 2 = section A, 2 with 3 = section B) and reports which section is leaking, so swapping any two breaks it.
- **Spacing:** put sensor 2 roughly halfway, so each section covers about half the pipe. A leak is located only to the section it is in.
- **The 10 nF capacitor** stops interference from the pump motor showing up as fake pulses.
- **The firmware sets these pins to plain `INPUT`, with no internal pull-up.** With a pull-up behind the divider, a wire the sensor isn't driving sits at about 1 V, between LOW and HIGH, and fires thousands of fake pulses a second. That once made flow 2 read 4,859 L/min with the pump off. Without the pull-up, the divider's 20 kΩ pulls an undriven line cleanly to 0 V.
- **If a sensor gives no pulses at all with water clearly flowing**, its output only pulls down and needs a pull-up. Add **10 kΩ from the yellow wire to 5 V**, on the sensor side of the divider.
- **The firmware ignores pulses closer together than 2 ms** (faster than any real flow) and counts them as noise. The hardware report flags a sensor with lots of them.
- **Test with a multimeter:** with the board powered and the pump off, measure GPIO34, GPIO35 and GPIO32 to GND. Each should read close to **0 V or 3.3 V**. Around **1–2 V** means a loose wire or a missing divider resistor.
- **Wiring:** keep the yellow wires short, and twist each one with its black wire if the run is long.
- **Calibration:** 7.5 pulses per second = 1 L/min (`FLOW_K` in the sketch). Fine-tune it with a jug test: run 1 L through and compare.

### 4.3 Level sensor (HC-SR04)

| HC-SR04 pin | Goes to |
|---|---|
| VCC | 5 V rail |
| GND | GND rail |
| TRIG | **GPIO17** (direct) |
| ECHO | Divider → **GPIO16** |

- **Mounting:** in the delivery tank, **face down**, square to the water surface, with the face **1.2 cm below the rim**. A tilted sensor misses its echo.
- **Clearance:** keep it away from the tank wall and the inlet pipe, or it measures those instead of the water.
- **Blind zone:** it can't measure closer than about 2 cm. That's why the firmware leaves allowance between the sensor and the highest water level.
- **If you change the tank or the mounting,** update the geometry at the top of the sketch: `TANK_HEIGHT_CM`, `SENSOR_DROP_CM`, `SENSOR_CLEARANCE_CM`. Also update `src/twin/config.js` so the dashboard agrees.

### 4.4 OLED (SSD1306, I2C)

| OLED pin | Goes to |
|---|---|
| VCC | **3V3** |
| GND | GND rail |
| SDA | **GPIO21** |
| SCL | **GPIO22** |

- **Go by the labels printed on the OLED.** Pin order differs between brands (`GND VCC SCL SDA` and `VCC GND SCL SDA` both exist).
- **Address:** most modules use I2C address 0x3C, some 0x3D. The firmware tries both.

### 4.5 Relay and pump

| Relay module pin | Goes to |
|---|---|
| DC+ (VCC) | 5 V rail |
| DC- (GND) | GND rail |
| IN | **GPIO23** |
| COM | Pump supply **+** |
| NO (normally open) | Pump **+** |
| NC | Leave empty |

The pump's **−** goes straight to the pump supply's **−**.

```
 Pump supply + ──── COM ┐
                         relay contacts (closed while IN is LOW)
 Pump +       ──── NO  ┘

 Across the pump terminals:
     Pump + ──┬──|◄──┬── Pump -      1N4007: striped end (cathode) to Pump +
              └─|| ──┘               100 nF ceramic capacitor
```

- **Use NO, not NC.** With NO, the pump stays **off** if the ESP32 is off, rebooting or unplugged. NC would run it.
- **The diode** absorbs the voltage spike a motor makes when switched off. Without it, that spike causes resets and relay chatter.
- **If the relay LED glows dimly or the relay won't release:** the module is a 5 V design driven by 3.3 V logic. Fixes, best first:
  1. If the module has a `JD-VCC` jumper, remove it. Connect `JD-VCC` to 5 V (coil) and `VCC` to **3V3** (input side), with GND shared.
  2. Power the whole module's DC+ from 3V3. Many modules trigger fine at 3.3 V; the relay may click more softly.
  3. Use a relay module made for 3.3 V logic.
- **Mains (AC) pump:** don't wire mains on a breadboard. Use a low-voltage DC pump for the prototype.

### 4.6 Status LEDs

Each LED: **ESP32 pin → 330 Ω resistor → LED long leg (+) → LED short leg (−) → GND**.

| LED | Pin | On when |
|---|---|---|
| Green | GPIO25 | Status NORMAL |
| Blue | GPIO27 | Status WARNING: low water, level sensor fault, a leak being verified |
| Red | GPIO26 | Leak detected (latched until the mode is switched or the alarm is reset) |

- **The blue LED may look dim.** A blue LED needs about 3 V of the pin's 3.3 V, leaving little for the resistor, so only ~1 mA flows. If it's hard to see, use 100 Ω for the blue one.

### 4.7 Buzzer

Driven through an NPN transistor, so it runs from the 5 V rail and is louder than a pin alone could make it. It beeps on and off during a leak.

```
 GPIO33 ──[ 1 kΩ ]── base
                     collector ── buzzer (−)      buzzer (+) ── 5 V rail
                     emitter   ── GND
```

- **Transistor legs:** check the pinout for your part. 2N2222 and BC547 differ (E-B-C vs C-B-E, flat face toward you).
- **The buzzer type matters.** Use a **passive** buzzer; an **active** buzzer sounds rough with the tone the firmware plays.

---

## 5. Build order

Wire **one part at a time** and check it before adding the next. The firmware prints a **HARDWARE CHECK** to the Serial Monitor (115200 baud) every 10 seconds, marking each part **OK** or **PROBLEM** with what to check. (The settings for Arduino IDE are in [section 6](#6-before-uploading).)

| Step | Wire | Check in the report |
|---|---|---|
| 1 | ESP32 on USB only. Upload the sketch | Wi-Fi OK, Firebase OK |
| 2 | Power rails + 1000 µF capacitor + common GND | Last reboot: "power on (normal)" |
| 3 | OLED | OLED: found at 0x3C. The screen shows live values |
| 4 | LEDs and buzzer | Exactly the LED the report names is lit |
| 5 | HC-SR04 | Level sensor: 5/5 echoes, and a sensible distance (empty tank ≈ 17.8 cm) |
| 6 | Flow sensors (pump still unplugged) | Flow 1 / Flow 2 / Flow 3: 0 pulses, and no pulses while nothing flows |
| 7 | Relay (pump still unplugged) | Switch manual ON/OFF from the dashboard: relay clicks once per switch, "switched 1x" |
| 8 | Pump on its own supply | Run in manual: flow 1, 2 and 3 read close to each other, no reboots |

**When a step fails, stop and fix it before going on.** A fault added together with three other parts is much harder to find.

---

## 6. Before uploading

- **Board:** Tools → Board → **ESP32 Dev Module**.
- **Partition scheme:** Tools → Partition Scheme → **Huge APP (3MB No OTA/1MB SPIFFS)**. The sketch doesn't fit the default.
- **Libraries:** *Firebase Arduino Client Library for ESP8266 and ESP32* (Mobizt), *Adafruit SSD1306*, *Adafruit GFX Library*.
- **Credentials:** copy `secrets.example.h` to `secrets.h` in this folder and fill it in. `secrets.h` is never committed.
- **Hotspot:** it must be **2.4 GHz**. On iPhone, turn on *Maximize Compatibility*.

---

## 7. Troubleshooting

| Symptom | Most likely cause |
|---|---|
| Board reboots when the pump starts ("BROWNOUT" in the report) | Pump sharing the ESP32's power, or no diode across the pump |
| Relay clicks or buzzes on its own | Same as above; or the 5 V relay driven by 3.3 V (see [4.5](#45-relay-and-pump)) |
| Relay works backwards (on when it should be off) | Module is high-level trigger. Set `RELAY_ACTIVE_HIGH true` in the sketch, or change the module's H/L jumper |
| Pump stops after ~15 s, "ran without flow" | Flow 1 not counting: check its divider, GPIO34, the arrow direction, and that water actually moves (only when `FLOW_SENSORS_FITTED` is true) |
| Leak alarm on every normal fill (level-rate check) | `FILL_RATE_CM_PER_MIN` is set higher than the pump really fills. Set it to the rate the hardware check prints with no leak |
| Leak alarm with no leak | The section's downstream sensor (flow 2 for A, flow 3 for B) reading low, or its upstream sensor counting extra pulses (noise): add the 10 nF capacitors, keep the yellow wires away from the pump wires. Or two sensors are swapped |
| A flow sensor reads a huge, impossible value (hundreds or thousands of L/min) | Its signal line is floating: loose yellow or red wire, or a broken divider. Measure the pin; see [4.2](#42-flow-sensors-yf-s201--3) |
| OLED blank, report says NOT FOUND | SDA/SCL swapped, OLED on 5 V instead of 3V3, or a loose wire |
| Level sensor "no echo" | ECHO divider wrong, TRIG/ECHO swapped, sensor tilted or too close to the wall |
| Upload fails ("Failed to connect") | Something wired to a strapping pin (0, 2, 5, 12, 15). Unplug it, or hold BOOT while uploading |
| Buzzer silent | Transistor legs swapped (check E-B-C for your part), or an active buzzer instead of passive |
| Slow Wi-Fi connection | Weak power (use the 5 V 2 A supply), 5 GHz hotspot, or the phone screen off |
