require('dotenv').config();

const API = process.env.API_URL || 'http://localhost:3000';
const EMAIL = process.env.SIM_EMAIL || 'driver@example.com';
const PASSWORD = process.env.SIM_PASSWORD || 'demo123';
const INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS || 1000);

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function ensureUser() {
  await post('/auth/register', { email: EMAIL, password: PASSWORD });
  const r = await post('/auth/login', { email: EMAIL, password: PASSWORD });
  if (!r.body.token) throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function ensureDevice(token) {
  const r = await post('/devices', { label: `simulator-${Date.now()}` }, token);
  if (!r.body.id) throw new Error(`device create failed: ${JSON.stringify(r.body)}`);
  return r.body.id;
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function generateSamples() {
  const ts = new Date().toISOString();
  const samples = [
    { ts, sensorType: 'accel', payload: { x: rand(-1, 1), y: rand(-1, 1), z: 9.8 + rand(-0.5, 0.5) } },
    { ts, sensorType: 'gyro',  payload: { x: rand(-0.3, 0.3), y: rand(-0.3, 0.3), z: rand(-0.3, 0.3) } },
    { ts, sensorType: 'gps',   payload: { lat: 40.18 + rand(-0.01, 0.01), lng: 29.13 + rand(-0.01, 0.01), speedKmh: rand(20, 80) } },
  ];

  const dice = Math.random();
  if (dice < 0.03) {
    samples[0].payload.x = -rand(5, 9);
    console.log('  -> injecting HARD_BRAKE');
  } else if (dice < 0.06) {
    samples[0].payload.x = rand(5, 9);
    console.log('  -> injecting RAPID_ACCEL');
  } else if (dice < 0.09) {
    samples[1].payload.z = (Math.random() < 0.5 ? -1 : 1) * rand(2, 3.5);
    console.log('  -> injecting SHARP_TURN');
  }

  return samples;
}

async function main() {
  console.log(`[simulator] target: ${API}, interval: ${INTERVAL_MS}ms`);
  const token = await ensureUser();
  const deviceId = await ensureDevice(token);
  console.log(`[simulator] authenticated, deviceId=${deviceId}`);

  setInterval(async () => {
    const samples = generateSamples();
    try {
      const r = await post('/telemetry', { deviceId, samples }, token);
      const flag = r.body.alarms ? ` ALARMS=${r.body.alarms}` : '';
      console.log(`[${new Date().toISOString()}] POST /telemetry ${r.status} count=${r.body.count}${flag}`);
    } catch (e) {
      console.error('[simulator] error:', e.message);
    }
  }, INTERVAL_MS);
}

main().catch((e) => {
  console.error('[simulator] fatal:', e);
  process.exit(1);
});
