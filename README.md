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
| `twinLock` | twin | single-publisher lock |

## Firmware

[`swampds_prototype_2flow.ino`](swampds_prototype_2flow.ino) runs the ESP32 prototype. Before compiling, copy [`secrets.example.h`](secrets.example.h) to `secrets.h` in the same folder and fill in the Wi-Fi, Firebase and device-account values. `secrets.h` is git-ignored.

The leak rule (20% of F1's flow missing at F2 for 10 s) and the pump thresholds (on at 2 cm, off at 13 cm, in an 18 cm tank) are set in the firmware and mirrored in [`src/twin/config.js`](src/twin/config.js) and `PUMP_THRESHOLDS` in [`src/data/swampdsData.js`](src/data/swampdsData.js). Change them in all three places together.

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
  roles are in use. `roles` itself is never writable from the client:
  ```json
  {
    "rules": {
      ".read": true,
      "roles": { ".write": false },
      ".write": "auth != null && root.child('roles').child(auth.uid).val() === 'admin'"
    }
  }
  ```
  Add a `roles/<uid>: "admin"` entry for every existing account before applying this -
  otherwise every account loses write access until you do.
- Authentication → Settings → User actions: turn off **Enable create (sign-up)**; accounts are created manually in the console.
- Authentication → Sign-in method: keep **Anonymous** disabled (it would satisfy `auth != null`).

## Deploy

Vercel (SPA rewrite in `vercel.json`). Set the `VITE_FIREBASE_*` variables in the project settings.
