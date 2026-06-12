const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';

const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

function makeApp() {
  const db = createDb(':memory:');
  return createApp(db);
}

test('POST /auth/register creates a user and hides the hash', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'a@a.com', password: 'pw' });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.email, 'a@a.com');
  assert.strictEqual(res.body.role, 'driver');
  assert.ok(res.body.id);
  assert.strictEqual(res.body.password_hash, undefined);
});

test('POST /auth/register rejects missing fields', async () => {
  const app = makeApp();
  const res = await request(app).post('/auth/register').send({ email: 'a@a.com' });
  assert.strictEqual(res.status, 400);
});

test('POST /auth/register rejects duplicate email', async () => {
  const app = makeApp();
  await request(app).post('/auth/register').send({ email: 'a@a.com', password: 'pw' });
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'a@a.com', password: 'pw' });
  assert.strictEqual(res.status, 409);
});

test('POST /auth/login returns a JWT for valid credentials', async () => {
  const app = makeApp();
  await request(app).post('/auth/register').send({ email: 'a@a.com', password: 'pw' });
  const res = await request(app).post('/auth/login').send({ email: 'a@a.com', password: 'pw' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.token, 'expected a token in body');
  assert.strictEqual(res.body.user.email, 'a@a.com');
});

test('POST /auth/login rejects wrong password', async () => {
  const app = makeApp();
  await request(app).post('/auth/register').send({ email: 'a@a.com', password: 'pw' });
  const res = await request(app).post('/auth/login').send({ email: 'a@a.com', password: 'wrong' });
  assert.strictEqual(res.status, 401);
});

test('GET /health is public', async () => {
  const app = makeApp();
  const res = await request(app).get('/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.ok, true);
});
