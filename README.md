# Quick Start

## Backend

```bash
npm install
cp .env.example .env
npm run dev
```

Backend:

```txt
http://localhost:3000
```

Default admin account:

```txt
Email: test@test.com
Password: 123456
```

## Dashboard

```bash
cd frontend/dashboard
npm install
npm run dev
```

Dashboard:

```txt
http://localhost:5173
```

## Mobile App

```bash
cd frontend/mobile
npm install
npx expo start --lan
```

Open Expo Go on iPhone and scan the QR code.

For iPhone, Backend URL should be:

```txt
http://YOUR_MAC_IP:3000
```

## Demo Flow

1. Start backend
2. Login to dashboard
3. Login to mobile app
4. Press Start Driving
5. Move the phone
6. Observe realtime alerts, trips, vehicles and analytics updates

## Notes

The repository does not include:

* .env
* node_modules
* SQLite database

Create `.env` from `.env.example` before running the backend.


# Safe Driving Backend

Backend service for the **Safe Driving and Driver Behavior Analysis** platform — a term project for *Node.js ile Web Programlama* at Bursa Teknik Üniversitesi (Senaryo 1: Güvenli Sürüş).

The platform consists of:
- Backend API (Node.js + Express)
- Fleet Dashboard (React + Vite)
- Mobile Application (Expo + React Native)

The mobile application sends accelerometer, gyroscope and GPS telemetry to the backend. The dashboard visualizes vehicles, trips, alerts and analytics in real time.

## What this repo owns

| Layer | Status |
|-------|--------|
| REST API (Express) | ✅ |
| SQLite database (`better-sqlite3`) | ✅ |
| JWT auth (`user` and `admin` roles) | ✅ |
| Threshold-based anomaly detection | ✅ |
| Alarm persistence + acknowledgement | ✅ |
| Socket.io live event gateway | ✅ |
| Sensor simulator (mobile-stand-in) | ✅ |
| OpenAPI 3.0 spec + Swagger UI | ✅ |
| Mobile Application (Expo) | ✅ |
| Fleet Dashboard (React + Vite) | ✅ |

## Tech stack

- **Node.js 18+**, **Express 5**
- **better-sqlite3** (synchronous SQLite — zero config, file-based)
- **bcrypt** + **jsonwebtoken** for auth
- **socket.io** for live alarm push
- **swagger-ui-express** for API docs at `/docs`
- **node:test** (built-in) + **supertest** for tests

## Setup

```bash
git clone <repo-url>
cd safe-driving-backend
npm install
cp .env.example .env       # edit JWT_SECRET before anything serious
npm start
```

The SQLite database file is created automatically at `./data/app.db` on first start.

Open <http://localhost:3000/docs> for the interactive API documentation.

**Integrating with this API?** See [`docs/INTEGRATION.md`](docs/INTEGRATION.md) — a step-by-step guide for mobile and dashboard teams.

## Environment variables (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `SQLITE_PATH` | `./data/app.db` | DB file |
| `JWT_SECRET` | — | **required**, sign/verify JWTs |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |

## Running the test suite

```bash
npm test
```

All tests use an in-memory SQLite database (`:memory:`) and a stubbed Socket.io emitter — no external services required.

Test breakdown:
- `auth.test.js` — register, login, validation, duplicates
- `devices.test.js` — auth requirement, ownership, admin visibility
- `telemetry.test.js` — batch ingest, time-range query, ownership
- `analysis.test.js` — pure-function rules with TDD: thresholds, boundaries, severity bands
- `alarms.test.js` — telemetry-to-alarm pipeline, ack flow, WS auth middleware
- `docs.test.js` — OpenAPI spec + Swagger UI mount

## Running the simulator (mobile stand-in)

With the server running in one terminal, start the simulator in another:

```bash
npm run simulate
```

The simulator auto-registers a user (`driver@example.com` / `demo123`), creates a device, and POSTs realistic accel/gyro/gps batches every second. It randomly injects anomalies (~3% chance each per tick) so you can see alarms appear in real time.

## API at a glance

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness |
| `POST` | `/auth/register` | Create user (`role` defaults to `user`) |
| `POST` | `/auth/login` | Returns `{ token, user }` |
| `GET`  | `/devices` | Own devices (admin: all) |
| `POST` | `/devices` | Register a device |
| `POST` | `/telemetry` | Batch sensor samples; triggers analysis |
| `GET`  | `/telemetry` | Filter by `deviceId`, `from`, `to`, `sensorType` |
| `GET`  | `/alarms` | Filter by `status=active`, `deviceId` |
| `PATCH`| `/alarms/:id/ack` | Acknowledge an alarm |
| `GET`  | `/docs` | Swagger UI |
| `GET`  | `/openapi.json` | Raw OpenAPI spec |

Full request/response schemas at `/docs` once the server is up.

## Data model

```
users(id, email, password_hash, role, created_at)
devices(id, user_id → users, label, created_at)
sensor_samples(id, device_id → devices, ts, sensor_type, payload[JSON])
alarms(id, device_id → devices, ts, kind, severity, details[JSON],
       acknowledged_at, acknowledged_by → users, created_at)
```

All FKs cascade on delete.

## Analysis rules (`src/analysis.js`)

Pure functions, exhaustively unit-tested.

| Kind | Trigger | Severity bands (low/medium/high) |
|------|---------|----------------------------------|
| `HARD_BRAKE` | `accel.x ≤ −4 m/s²` | 4 / 6 / 8 |
| `RAPID_ACCEL` | `accel.x ≥ +4 m/s²` | 4 / 6 / 8 |
| `SHARP_TURN` | `|gyro.z| ≥ 1.5 rad/s` | 1.5 / 2 / 3 |

Convention: phone is mounted in the vehicle so that `accel.x` aligns with the longitudinal axis (forward = positive). The simulator follows this convention.

## Socket.io events

Connect with the JWT in the handshake auth:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3000', { auth: { token: '<jwt>' } });
socket.on('alarm:new', (alarm) => { /* ... */ });
```

Rooms joined automatically:
- `user:<id>` — every authenticated socket
- `admins` — when role is `admin`

The server emits `alarm:new` to `user:<owner-id>` and `admins` on each new alarm.

## Architecture

```
[Mobile / Simulator] ──POST /telemetry──▶ ┐
                                          │
                                          ▼
                          ┌────────── Express ──────────┐
                          │  auth · devices · telemetry │
                          │  alarms · /docs             │
                          └──────┬──────────────────────┘
                                 │
                       analyzeBatch(samples)
                                 │
                                 ▼
                          ┌─── SQLite ───┐
                          │ users        │
                          │ devices      │
                          │ sensor_samples│
                          │ alarms       │
                          └──────────────┘
                                 │
                                 │ on each alarm:
                                 ▼
                       ┌── Socket.io io.to() ──┐
                       │  user:<id>, admins    │
                       └───────────────────────┘
                                 │
                                 ▼
                       [Dashboard subscribers]
```

## Project layout

```
src/
  index.js         # http server + socket.io bootstrap
  app.js           # express app factory (db + emit injected)
  db.js            # SQLite + schema init
  auth.js          # bcrypt, JWT, middleware
  analysis.js      # pure detection functions
  realtime.js      # socket.io auth + multi-room emit
  routes/
    auth.js
    devices.js
    telemetry.js
    alarms.js
scripts/
  simulator.js     # mobile stand-in
tests/             # node:test files
docs/
  openapi.js       # spec object
data/              # sqlite file (gitignored)
```

## License

MIT
