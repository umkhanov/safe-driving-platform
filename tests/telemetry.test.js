const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.TRIP_IDLE_TIMEOUT_SECONDS = '1';

const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

async function setupUser(app, email, role = 'user') {
  await request(app).post('/auth/register').send({ email, password: 'pw', role });
  const r = await request(app).post('/auth/login').send({ email, password: 'pw' });
  return r.body.token;
}

async function setup() {
  const db = createDb(':memory:');
  const app = createApp(db);
  const userToken = await setupUser(app, 'u@x.com');
  const otherToken = await setupUser(app, 'o@x.com');
  const adminToken = await setupUser(app, 'a@x.com', 'admin');

  const dev = await request(app)
    .post('/devices')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ label: 'phone' });

  return { app, userToken, otherToken, adminToken, deviceId: dev.body.id };
}

function sample(ts, sensorType, payload) {
  return { ts, sensorType, payload };
}

test('POST /telemetry requires auth', async () => {
  const { app, deviceId } = await setup();
  const res = await request(app).post('/telemetry').send({
    deviceId,
    samples: [sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 })],
  });
  assert.strictEqual(res.status, 401);
});

test('POST /telemetry rejects empty samples', async () => {
  const { app, userToken, deviceId } = await setup();
  const res = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ deviceId, samples: [] });
  assert.strictEqual(res.status, 400);
});

test('POST /telemetry rejects unknown device', async () => {
  const { app, userToken } = await setup();
  const res = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId: 9999,
      samples: [sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 })],
    });
  assert.strictEqual(res.status, 404);
});

test('POST /telemetry rejects device owned by another user', async () => {
  const { app, otherToken, deviceId } = await setup();
  const res = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${otherToken}`)
    .send({
      deviceId,
      samples: [sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 })],
    });
  assert.strictEqual(res.status, 403);
});

test('POST /telemetry accepts a batch and reports count', async () => {
  const { app, userToken, deviceId } = await setup();
  const res = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [
        sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 }),
        sample('2026-05-12T10:00:01Z', 'accel', { x: 0.1, y: 0, z: 9.8 }),
        sample('2026-05-12T10:00:02Z', 'gyro', { x: 0, y: 0, z: 0.05 }),
      ],
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.count, 3);
});

test('GET /telemetry returns samples for own device', async () => {
  const { app, userToken, deviceId } = await setup();
  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [
        sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 }),
        sample('2026-05-12T10:00:01Z', 'accel', { x: 0.1, y: 0, z: 9.8 }),
      ],
    });
  const res = await request(app)
    .get(`/telemetry?deviceId=${deviceId}`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
  assert.strictEqual(res.body[0].sensorType, 'accel');
  assert.deepStrictEqual(res.body[0].payload, { x: 0, y: 0, z: 9.8 });
});

test('GET /telemetry filters by time range', async () => {
  const { app, userToken, deviceId } = await setup();
  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [
        sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 }),
        sample('2026-05-12T10:05:00Z', 'accel', { x: 1, y: 0, z: 9.8 }),
        sample('2026-05-12T10:10:00Z', 'accel', { x: 2, y: 0, z: 9.8 }),
      ],
    });
  const res = await request(app)
    .get(`/telemetry?deviceId=${deviceId}&from=2026-05-12T10:02:00Z&to=2026-05-12T10:08:00Z`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].payload.x, 1);
});

test('GET /telemetry rejects access to another users device', async () => {
  const { app, otherToken, deviceId } = await setup();
  const res = await request(app)
    .get(`/telemetry?deviceId=${deviceId}`)
    .set('Authorization', `Bearer ${otherToken}`);
  assert.strictEqual(res.status, 403);
});

test('GET /telemetry as admin can read any device', async () => {
  const { app, adminToken, userToken, deviceId } = await setup();
  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [sample('2026-05-12T10:00:00Z', 'accel', { x: 0, y: 0, z: 9.8 })],
    });
  const res = await request(app)
    .get(`/telemetry?deviceId=${deviceId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 1);
});

test('telemetry auto-manages trip lifecycle for device driving sessions', async () => {
  const { app, userToken, deviceId } = await setup();

  const first = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [
        sample('2026-05-12T10:00:00Z', 'gps', { latitude: 40.182, longitude: 29.063 }),
        sample('2026-05-12T10:00:01Z', 'accel', { x: -6, y: 0.1, z: 0.2 }),
      ],
    });
  assert.strictEqual(first.status, 201);
  assert.ok(first.body.tripId);

  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [sample('2026-05-12T10:00:02Z', 'accel', { x: 0.4, y: 0, z: 9.8 })],
    });

  let trips = await request(app).get('/trips').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(trips.status, 200);
  assert.strictEqual(trips.body.length, 1);
  assert.strictEqual(trips.body[0].status, 'Active');
  assert.strictEqual(trips.body[0].deviceId, deviceId);
  assert.strictEqual(trips.body[0].endedAt, null);
  assert.ok(trips.body[0].alertsCount >= 1);

  await new Promise((resolve) => setTimeout(resolve, 1300));

  trips = await request(app).get('/trips').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(trips.body.length, 1);
  assert.strictEqual(trips.body[0].status, 'Completed');
  assert.ok(trips.body[0].endedAt);

  const resumed = await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [sample('2026-05-12T10:00:05Z', 'accel', { x: 0.2, y: 0, z: 9.8 })],
    });
  assert.strictEqual(resumed.status, 201);
  assert.notStrictEqual(resumed.body.tripId, first.body.tripId);

  trips = await request(app).get('/trips').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(trips.body.length, 2);
  assert.strictEqual(trips.body[0].status, 'Active');
  assert.strictEqual(trips.body[1].status, 'Completed');
});
