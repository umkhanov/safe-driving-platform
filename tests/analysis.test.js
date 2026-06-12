const test = require('node:test');
const assert = require('node:assert');

const {
  analyzeSample,
  analyzeBatch,
  THRESHOLDS,
  ENABLE_CRASH_DETECTION,
  CRASH_THRESHOLDS,
} = require('../src/analysis');

function accel(ts, x, y = 0, z = 9.8) {
  return { ts, sensorType: 'accel', payload: { x, y, z } };
}
function gyro(ts, x = 0, y = 0, z = 0) {
  return { ts, sensorType: 'gyro', payload: { x, y, z } };
}

test('exposes thresholds for HARD_BRAKE, RAPID_ACCEL, SHARP_TURN', () => {
  assert.ok(THRESHOLDS.HARD_BRAKE < 0);
  assert.ok(THRESHOLDS.RAPID_ACCEL > 0);
  assert.ok(THRESHOLDS.SHARP_TURN > 0);
});

test('exposes demo crash detection config', () => {
  assert.strictEqual(typeof ENABLE_CRASH_DETECTION, 'boolean');
  assert.ok(CRASH_THRESHOLDS.IMPACT_VECTOR_DELTA_G > 0);
  assert.ok(CRASH_THRESHOLDS.IMPACT_VECTOR_CHANGE_G > 0);
});

test('normal acceleration produces no alarms', () => {
  assert.deepStrictEqual(analyzeSample(accel('t', 0.5)), []);
});

test('strong deceleration produces HARD_BRAKE', () => {
  const alarms = analyzeSample(accel('t1', -5));
  assert.strictEqual(alarms.length, 1);
  assert.strictEqual(alarms[0].kind, 'HARD_BRAKE');
  assert.strictEqual(alarms[0].ts, 't1');
  assert.strictEqual(alarms[0].details.x, -5);
});

test('strong acceleration produces RAPID_ACCEL', () => {
  const alarms = analyzeSample(accel('t1', 5));
  assert.strictEqual(alarms.length, 1);
  assert.strictEqual(alarms[0].kind, 'RAPID_ACCEL');
});

test('right at threshold triggers the alarm', () => {
  assert.strictEqual(analyzeSample(accel('t', THRESHOLDS.HARD_BRAKE))[0].kind, 'HARD_BRAKE');
  assert.strictEqual(analyzeSample(accel('t', THRESHOLDS.RAPID_ACCEL))[0].kind, 'RAPID_ACCEL');
});

test('just under threshold produces no alarm', () => {
  assert.deepStrictEqual(analyzeSample(accel('t', THRESHOLDS.HARD_BRAKE + 0.01)), []);
  assert.deepStrictEqual(analyzeSample(accel('t', THRESHOLDS.RAPID_ACCEL - 0.01)), []);
});

test('severity scales with magnitude (low/medium/high)', () => {
  assert.strictEqual(analyzeSample(accel('t', -5))[0].severity, 'low');
  assert.strictEqual(analyzeSample(accel('t', -7))[0].severity, 'medium');
  assert.strictEqual(analyzeSample(accel('t', -9))[0].severity, 'high');
});

test('sharp yaw rotation produces SHARP_TURN regardless of sign', () => {
  const a1 = analyzeSample(gyro('t', 0, 0, 2));
  const a2 = analyzeSample(gyro('t', 0, 0, -2));
  assert.strictEqual(a1[0].kind, 'SHARP_TURN');
  assert.strictEqual(a2[0].kind, 'SHARP_TURN');
});

test('gentle gyro produces no alarm', () => {
  assert.deepStrictEqual(analyzeSample(gyro('t', 0, 0, 0.3)), []);
});

test('non-accel/gyro samples are ignored (e.g. gps)', () => {
  assert.deepStrictEqual(
    analyzeSample({ ts: 't', sensorType: 'gps', payload: { lat: 0, lng: 0 } }),
    []
  );
});

test('malformed payload does not throw, returns no alarms', () => {
  assert.deepStrictEqual(analyzeSample({ ts: 't', sensorType: 'accel', payload: {} }), []);
  assert.deepStrictEqual(analyzeSample({ ts: 't', sensorType: 'accel' }), []);
});

test('analyzeBatch aggregates alarms across multiple samples', () => {
  const samples = [
    accel('t1', 0.1),
    accel('t2', -6),
    gyro('t3', 0, 0, 2.5),
    accel('t4', 5.5),
  ];
  const alarms = analyzeBatch(samples);
  assert.strictEqual(alarms.length, 3);
  assert.deepStrictEqual(
    alarms.map((a) => a.kind),
    ['HARD_BRAKE', 'SHARP_TURN', 'RAPID_ACCEL']
  );
});

test('extreme impact-style motion can produce CRASH_DETECTED (demo mode)', () => {
  const alarms = analyzeSample(accel('t-crash', 30, 22, 5), { x: 0, y: 0, z: 1 });
  const crash = alarms.find((a) => a.kind === 'CRASH_DETECTED');

  if (!ENABLE_CRASH_DETECTION) {
    assert.strictEqual(crash, undefined);
    return;
  }

  assert.ok(crash);
  assert.strictEqual(crash.severity, 'critical');
});
