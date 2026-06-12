const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';

const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

async function makeAppWithUser(role = 'user') {
  const db = createDb(':memory:');
  const app = createApp(db);
  const email = role === 'admin' ? 'admin@x.com' : 'u@x.com';
  await request(app).post('/auth/register').send({ email, password: 'pw', role });
  const login = await request(app).post('/auth/login').send({ email, password: 'pw' });
  return { app, token: login.body.token };
}

test('POST /devices requires auth', async () => {
  const { app } = await makeAppWithUser();
  const res = await request(app).post('/devices').send({ label: 'My phone' });
  assert.strictEqual(res.status, 401);
});

test('POST /devices creates a device for the authenticated user', async () => {
  const { app, token } = await makeAppWithUser();
  const res = await request(app)
    .post('/devices')
    .set('Authorization', `Bearer ${token}`)
    .send({ label: 'My phone' });
  assert.strictEqual(res.status, 201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.label, 'My phone');
});

test('POST /devices rejects empty label', async () => {
  const { app, token } = await makeAppWithUser();
  const res = await request(app)
    .post('/devices')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.strictEqual(res.status, 400);
});

test('GET /devices returns only the users own devices', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  await request(app).post('/auth/register').send({ email: 'a@x.com', password: 'pw' });
  await request(app).post('/auth/register').send({ email: 'b@x.com', password: 'pw' });
  const a = (await request(app).post('/auth/login').send({ email: 'a@x.com', password: 'pw' })).body.token;
  const b = (await request(app).post('/auth/login').send({ email: 'b@x.com', password: 'pw' })).body.token;

  await request(app).post('/devices').set('Authorization', `Bearer ${a}`).send({ label: 'A1' });
  await request(app).post('/devices').set('Authorization', `Bearer ${a}`).send({ label: 'A2' });
  await request(app).post('/devices').set('Authorization', `Bearer ${b}`).send({ label: 'B1' });

  const resA = await request(app).get('/devices').set('Authorization', `Bearer ${a}`);
  assert.strictEqual(resA.status, 200);
  assert.strictEqual(resA.body.length, 2);
  assert.ok(resA.body.every((d) => d.label.startsWith('A')));
});

test('GET /devices as admin returns all devices', async () => {
  const db = createDb(':memory:');
  const app = createApp(db);

  await request(app).post('/auth/register').send({ email: 'u@x.com', password: 'pw' });
  await request(app).post('/auth/register').send({ email: 'adm@x.com', password: 'pw', role: 'admin' });
  const u = (await request(app).post('/auth/login').send({ email: 'u@x.com', password: 'pw' })).body.token;
  const adm = (await request(app).post('/auth/login').send({ email: 'adm@x.com', password: 'pw' })).body.token;

  await request(app).post('/devices').set('Authorization', `Bearer ${u}`).send({ label: 'U1' });
  await request(app).post('/devices').set('Authorization', `Bearer ${adm}`).send({ label: 'ADM1' });

  const res = await request(app).get('/devices').set('Authorization', `Bearer ${adm}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.length, 2);
});
