const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';

const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { authenticateSocket } = require('../src/realtime');
const jwt = require('jsonwebtoken');

async function setupUser(app, email, role = 'user') {
  await request(app).post('/auth/register').send({ email, password: 'pw', role });
  const r = await request(app).post('/auth/login').send({ email, password: 'pw' });
  return r.body.token;
}

async function setup() {
  const emitted = [];
  const emit = (...args) => emitted.push(args);
  const db = createDb(':memory:');
  const app = createApp(db, emit);
  const userToken = await setupUser(app, 'u@x.com');
  const otherToken = await setupUser(app, 'o@x.com');
  const adminToken = await setupUser(app, 'a@x.com', 'admin');
  const dev = await request(app)
    .post('/devices')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ label: 'phone' });
  return { db, app, emitted, userToken, otherToken, adminToken, deviceId: dev.body.id };
}

test('telemetry with hard brake creates alarm and emits alarm:new', async () => {
  const { app, emitted, userToken, deviceId } = await setup();
  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [{ ts: '2026-05-12T10:00:00Z', sensorType: 'accel', payload: { x: -6, y: 0.1, z: 0.2 } }],
    });

  const list = await request(app).get('/alarms').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.length, 1);
  assert.strictEqual(list.body[0].kind, 'HARD_BRAKE');
  assert.strictEqual(list.body[0].severity, 'medium');

  const emits = emitted.filter((e) => e[0] === 'alarm:new');
  assert.strictEqual(emits.length, 1);
  assert.strictEqual(emits[0][1].kind, 'HARD_BRAKE');
  assert.strictEqual(emits[0][1].deviceId, deviceId);
});

test('normal telemetry produces no alarms', async () => {
  const { app, emitted, userToken, deviceId } = await setup();
  await request(app)
    .post('/telemetry')
    .set('Authorization', `Bearer ${userToken}`)
    .send({
      deviceId,
      samples: [{ ts: '2026-05-12T10:00:00Z', sensorType: 'accel', payload: { x: 0.5 } }],
    });
  const list = await request(app).get('/alarms').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(list.body.length, 0);
  assert.strictEqual(emitted.filter((e) => e[0] === 'alarm:new').length, 0);
});

test('GET /alarms returns only own alarms for user, all for admin', async () => {
  const { app, userToken, otherToken, adminToken, deviceId } = await setup();
  const otherDev = await request(app)
    .post('/devices')
    .set('Authorization', `Bearer ${otherToken}`)
    .send({ label: 'phone2' });

  await request(app).post('/telemetry').set('Authorization', `Bearer ${userToken}`).send({
    deviceId,
    samples: [{ ts: 't1', sensorType: 'accel', payload: { x: -5, y: 0.1, z: 0.2 } }],
  });
  await request(app).post('/telemetry').set('Authorization', `Bearer ${otherToken}`).send({
    deviceId: otherDev.body.id,
    samples: [{ ts: 't2', sensorType: 'gyro', payload: { z: 2 } }],
  });

  const u = await request(app).get('/alarms').set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(u.body.length, 1);
  assert.strictEqual(u.body[0].kind, 'HARD_BRAKE');

  const adm = await request(app).get('/alarms').set('Authorization', `Bearer ${adminToken}`);
  assert.strictEqual(adm.body.length, 2);
});

test('PATCH /alarms/:id/ack marks alarm acknowledged', async () => {
  const { app, userToken, deviceId } = await setup();
  await request(app).post('/telemetry').set('Authorization', `Bearer ${userToken}`).send({
    deviceId,
    samples: [{ ts: 't1', sensorType: 'accel', payload: { x: -6, y: 0.1, z: 0.2 } }],
  });
  const list = await request(app).get('/alarms').set('Authorization', `Bearer ${userToken}`);
  const id = list.body[0].id;

  const ack = await request(app)
    .patch(`/alarms/${id}/ack`)
    .set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(ack.status, 200);
  assert.ok(ack.body.acknowledgedAt);
  assert.ok(ack.body.acknowledgedBy);
});

test('GET /alarms can filter by status=active', async () => {
  const { app, userToken, deviceId } = await setup();
  await request(app).post('/telemetry').set('Authorization', `Bearer ${userToken}`).send({
    deviceId,
    samples: [
      { ts: 't1', sensorType: 'accel', payload: { x: -6, y: 0.1, z: 0.2 } },
      { ts: 't2', sensorType: 'gyro', payload: { z: 2 } },
    ],
  });
  const all = await request(app).get('/alarms').set('Authorization', `Bearer ${userToken}`);
  await request(app)
    .patch(`/alarms/${all.body[0].id}/ack`)
    .set('Authorization', `Bearer ${userToken}`);

  const active = await request(app)
    .get('/alarms?status=active')
    .set('Authorization', `Bearer ${userToken}`);
  assert.strictEqual(active.body.length, 1);
});

test('WS auth middleware rejects missing token', () => {
  let err;
  authenticateSocket({ handshake: { auth: {} }, join: () => {} }, (e) => { err = e; });
  assert.ok(err instanceof Error);
});

test('WS auth middleware rejects invalid token', () => {
  let err;
  authenticateSocket(
    { handshake: { auth: { token: 'bad.token' } }, join: () => {} },
    (e) => { err = e; }
  );
  assert.ok(err instanceof Error);
});

test('WS auth middleware accepts valid token and joins user room', () => {
  const token = jwt.sign({ id: 42, role: 'user', email: 'x@x.com' }, process.env.JWT_SECRET);
  const joined = [];
  let err = 'sentinel';
  authenticateSocket(
    { handshake: { auth: { token } }, join: (r) => joined.push(r) },
    (e) => { err = e; }
  );
  assert.strictEqual(err, undefined);
  assert.ok(joined.includes('user:42'));
});

test('WS auth middleware joins admins room for admin role', () => {
  const token = jwt.sign({ id: 1, role: 'admin', email: 'a@x.com' }, process.env.JWT_SECRET);
  const joined = [];
  authenticateSocket(
    { handshake: { auth: { token } }, join: (r) => joined.push(r) },
    () => {}
  );
  assert.ok(joined.includes('admins'));
});
