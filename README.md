# SWAMPDS

Smart Water Management & Pipeline Leak Detection System. A web dashboard plus a browser-based **digital twin** that stands in for the physical prototype (ESP32, two inline flow sensors, relay, pump). Firmware: [`swampds_prototype_2flow.ino`](swampds_prototype_2flow.ino).

Water path: `SOURCE TANK → PUMP → F1 → VALVE A → F2 → DELIVERY TANK`. A leak is declared when F2 reads below F1 by more than a tolerance for a set time (compare-and-persist), which cuts the pump. Only the pipe between F1 and F2 (segment `A`) is monitored; a leak past F2 is not detected.

## Two ways to use it

| | Route | Login | Firebase |
|---|---|---|---|
| **Digital twin** (simulation) | `/twin` | none (public) | not loaded unless you click *Dashboard link → Connect* |
| **Operator dashboard** | `/dashboard` and the other pages | required | reads and writes live data |

### Linking the twin to the dashboard

On `/twin`, *Dashboard link → Connect* (needs a team login) makes the twin act as the device:

- it publishes sensor readings, status, alerts and pump history to Firebase about once a second;
- it obeys the dashboard's Auto/Manual and Start/Stop controls;
- only one twin can publish at a time (a lock); *Take over* is available if another is stuck;
- the dashboard shows a **Simulated data** banner while the twin is connected, and an **offline** banner if it stops sending.

Keep the twin tab open and visible while linked. Browsers slow down background tabs.

## Firebase data layout

Defined in [`src/twin/contract.js`](src/twin/contract.js). Real hardware should follow the same layout.

| Path | Written by | Value |
|---|---|---|
| `sensors/flow1`, `flow2` | device | L/min (F1 near the pump, F2 downstream) |
| `sensors/waterLevelPercent`, `waterLevelCm` | device | delivery tank level |
| `sensors/lastUpdated` | device | ms epoch; **changes on every update** (heartbeat) |
| `system/status` | device | `NORMAL` \| `WARNING` \| `LEAK` |
| `system/pumpState` | device | `ON` \| `OFF` |
| `system/pumpMode` | device | mirror of `status/controlMode` |
| `system/pumpStartedAt` | device | ms epoch the current run began; absent while the pump is off, so the dashboard can show a real runtime instead of counting from when its page loaded |
| `system/source` | device | e.g. `digital-twin`; dashboard warns if it is the twin |
| `system/online` | device | `true`; set to `false` on clean disconnect |
| `system/leakSegments` | device | `A` (absent when no leak) |
| `twin/tolerancePct`, `twin/persistSec` | device | leak rule in use; shown on the Flow Sensors page |
| `alerts/<id>` | device | `{ time, severity, message, timestamp }`; includes a connect/disconnect notice each time the twin links to the dashboard, so that's visible in the alert list and pumping-history log, not just the banner |
| `pumpHistory/<id>` | device | `{ date, start, end, duration, startTimestamp }` |
| `status/controlMode` | dashboard | `auto` \| `manual` |
| `control/pumpCommand` | dashboard | `on` \| `off` (manual mode only) |
| `config/pumpOnCm`, `pumpOffCm` | dashboard (admins, Settings page) | auto-pump levels in cm; absent = firmware defaults (2 / 13.5). Limits: ON ≥ 1.5, OFF ≤ 13.5, OFF ≥ ON + 2 - enforced by the Settings page, the database rules and the firmware |
| `hardware/pumpOnCm`, `pumpOffCm` | device | the levels the ESP32 is actually using, so Settings can confirm a change took effect |
| `twinLock` | twin | single-publisher lock |

## Firmware

[`swampds_prototype_2flow.ino`](swampds_prototype_2flow.ino) runs the ESP32 prototype. Before compiling, copy [`secrets.example.h`](secrets.example.h) to `secrets.h` in the same folder and fill in the Wi-Fi, Firebase and device-account values. `secrets.h` is git-ignored.

Arduino IDE: the sketch must be in a folder named `swampds_prototype_2flow` (with `secrets.h` next to it). Board *ESP32 Dev Module* (ESP32 core 3.x); install the libraries *Firebase Arduino Client Library for ESP8266 and ESP32*, *Adafruit SSD1306* and *Adafruit GFX Library*; set **Tools → Partition Scheme → Huge APP**, because the sketch fills ~97% of flash with the default scheme.

The leak rule (20% of F1's flow missing at F2 for 10 s) and the tank settings are set in the firmware and mirrored in [`src/twin/config.js`](src/twin/config.js), which the dashboard also reads. Change both together.

Tank: 19 cm tall, the ultrasonic sensor's face sits 1.2 cm below the rim, and 3.8 cm is left as allowance under it, so the highest safe level is 14 cm (= 100%). By default auto mode starts the pump at 2 cm (14%) and stops it at 13.5 cm (96%); admins can change both on the Settings page within the safe limits, and the ESP32 picks the change up within ~10 s.

Before first power-on with the pump connected, check:
- **Relay**: a 1-channel LOW-level-trigger module (`RELAY_ACTIVE_HIGH` is `false`: IN pulled LOW = relay on). Wire the pump through the **NO** (normally open) terminal, so the pump only runs while the relay is energised. With the pump unplugged, boot the board: the relay must stay off (LED off, no click), then use Start/Stop in manual mode to hear it switch.
  - Power the relay module's VCC from the **same supply as the ESP32**. With a low-trigger module, an ESP32 that loses power while the relay still has 5 V pulls IN low and switches the pump on; a shared supply makes both go off together.
  - If the relay stays on (or its LED glows faintly) when it should be off, the ESP32's 3.3 V "off" level is not enough for a 5 V module: power the module's VCC from 3.3 V if it is rated for it, or drive IN through a small transistor.
- **Flow sensors** are YF-S201 (`FLOW_K` = 7.5 pulses per second per L/min, from the datasheet). Individual sensors can be off by up to ~10%, so check each one: run water into a measuring jug for 60 s and compare the litres with the reported L/min. The YF-S201 needs 5 V power and its signal wire then pulses at 5 V, so put a voltage divider (e.g. 10 kΩ / 20 kΩ) between the signal wire and GPIO 32/33. Full wiring for every part: [swampds_prototype_2flow/README.md](swampds_prototype_2flow/README.md).
- **Signal voltage**: the ESP32 inputs take 3.3 V. A 5 V HC-SR04 echo pin and 5 V flow-sensor outputs need a voltage divider (or 3.3 V-tolerant modules).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173  (twin: /twin)
npm test           # simulation engine, data contract and Firebase bridge tests
npm run build
```

Create `.env.local` with your Firebase web-app settings (never commit it):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`/twin` works without any of these; only the dashboard and *Dashboard link* need them.

## Layout

- `src/twin/engine.js`: pure simulation (physics, detection, pump control)
- `src/twin/config.js`: every threshold; **tolerance and persistence are placeholders** until the project spec's values are confirmed
- `src/twin/contract.js`, `bridge.js`: the Firebase data contract and the twin/Firebase link
- `src/twin/*.jsx`: the `/twin` page
- `src/data/swampdsData.js`: the dashboard's data layer

## Roles: admin vs. view-only

Every signed-in account can see the dashboard. Only accounts with `roles/<uid>` set to
`"admin"` in the Realtime Database can control the pump or connect the Digital Twin to it;
everyone else is treated as view-only, including any account with no `roles` entry at all.

To make someone an admin:
1. Firebase console → **Authentication → Users** → copy their UID.
2. **Realtime Database → Data** → add `roles/<their UID>` with the value `admin` (a string).

Leave an account out of `roles`, or set it to anything other than `"admin"`, to keep it
view-only.

## Firebase setup checklist

- Realtime Database rules: reads may be public, but every write needs the signed-in
  account's `roles/<uid>` to be `"admin"` - `auth != null` alone is not enough once
  roles are in use. The ESP32 signs in with its own account whose role is `"device"`; it
  may write only the nodes the firmware publishes (it also resets `control/pumpCommand`
  after a dry-run or leak stop). `roles` itself is never writable from the client.
  The rules are in [`database.rules.json`](database.rules.json): paste its contents into
  Firebase console → Realtime Database → **Rules** → Publish (or `firebase deploy --only database`).
  (Write rules add up down the tree: admins keep full write access through the root rule, and
  the per-node rules only add the device account.) Without the device entries the ESP32 signs in
  but every write it makes is rejected with "Permission denied".
  Add a `roles/<uid>: "admin"` entry for every existing account before applying this -
  otherwise every account loses write access until you do.
- Authentication → Settings → User actions: turn off **Enable create (sign-up)**; accounts are created manually in the console.
- Authentication → Sign-in method: keep **Anonymous** disabled (it would satisfy `auth != null`).

## Deploy

Vercel (SPA rewrite in `vercel.json`). Set the `VITE_FIREBASE_*` variables in the project settings.
