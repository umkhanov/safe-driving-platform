const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret';

const { createDb } = require('../src/db');
const { createApp } = require('../src/app');

test('GET /openapi.json serves the OpenAPI document', async () => {
  const app = createApp(createDb(':memory:'));
  const res = await request(app).get('/openapi.json');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.openapi, '3.0.3');
  assert.ok(res.body.paths['/telemetry']);
  assert.ok(res.body.paths['/alarms']);
});

test('GET /docs serves the Swagger UI HTML', async () => {
  const app = createApp(createDb(':memory:'));
  const res = await request(app).get('/docs/').redirects(1);
  assert.strictEqual(res.status, 200);
  assert.ok(res.text.includes('swagger'));
});
