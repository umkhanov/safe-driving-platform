const THRESHOLDS = {
  // Core thresholds used by baseline rules and tests.
  // Keep SHARP_TURN <= 2 so moderate yaw movement in live demos still triggers.

  HARD_BRAKE: -1.0,
  RAPID_ACCEL: 2.5,
  SHARP_TURN: 1.8,

  // Extra demo-sensitive rules (in normalized g units) for handheld iPhone motion.

  HARD_BRAKE_VECTOR_DELTA_G: 0.08,
  HARD_BRAKE_AXIS_DELTA_G: 0.10,
  HARD_BRAKE_DEMO_X_G: -0.22,
  HARD_BRAKE_X_DELTA_G: 0.12,
  RAPID_ACCEL_DEMO_X_G: 0.22,
  RAPID_ACCEL_X_DELTA_G: 0.12,
  SHARP_TURN_MIN_Y_G: 0.18,
  SHARP_TURN_Y_DELTA_G: 0.30,
};

// Fixed-mount orientation assumption (demo profile):
// - phone vertical in a vehicle holder
// - charging port points downward
// - screen faces the driver
//
// Axis mapping used by this file:
// - X: forward/backward vehicle motion
// - Y: left/right turning motion
// - Z: vertical axis (gravity-dominant)
//
// Note: if the physical mount orientation changes, thresholds may need re-tuning.

// Demo-only emergency crash detection flag.
// Set to false to skip CRASH_DETECTED logic completely.
// Safe to remove after demo without affecting core alarm rules.
const ENABLE_CRASH_DETECTION = true;

// Demo-only crash thresholds (normalized g units).
// These are intentionally extreme so CRASH_DETECTED appears only
// for violent motion / impact-style patterns.
const CRASH_THRESHOLDS = {
  // Large change from nominal gravity vector.
  IMPACT_VECTOR_DELTA_G: 1.7,
  // Large change between consecutive accel readings.
  IMPACT_VECTOR_CHANGE_G: 1.2,
  // Multi-axis violent movement in the same sample.
  VIOLENT_MULTI_AXIS_G: 1.1,
  // Strong single-axis spike.
  EXTREME_AXIS_G: 2.2,
};

function severityFromMagnitude(value, low, medium, high) {
  const m = Math.abs(value);
  if (m >= high) return 'high';
  if (m >= medium) return 'medium';
  if (m >= low) return 'low';
  return 'low';
}

function vectorMagnitude(x, y, z) {
  return Math.sqrt(x * x + y * y + z * z);
}

function normalizeAccelToG(x, y, z) {
  // Mobile apps may send accel in m/s² (around 9.8 at rest on one axis)
  // or directly in g units (around 1.0 at rest). Normalize to g.
  const magnitude = vectorMagnitude(x, y, z);
  if (magnitude > 3) {
    return { x: x / 9.81, y: y / 9.81, z: z / 9.81 };
  }
  return { x, y, z };
}

function analyzeSample(sample, previousAccel) {
  if (!sample || !sample.payload) return [];
  const alarms = [];

  if (sample.sensorType === 'accel') {
    const x = Number(sample.payload.x);
    const y = Number(sample.payload.y);
    const z = Number(sample.payload.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [];

    const normalized = normalizeAccelToG(x, y, z);
    const xForward = normalized.x;
    const yLateral = normalized.y;
    const zVertical = normalized.z;
    const magnitude = vectorMagnitude(normalized.x, normalized.y, normalized.z);
    const magnitudeDeltaFromGravity = Math.abs(magnitude - 1);

    const xDelta = previousAccel ? Math.abs(normalized.x - previousAccel.x) : 0;
    const yDelta = previousAccel ? Math.abs(normalized.y - previousAccel.y) : 0;
    const zDelta = previousAccel ? Math.abs(normalized.z - previousAccel.z) : 0;
    const maxAxisDelta = Math.max(xDelta, yDelta, zDelta);
    const vectorDeltaFromPrevious = previousAccel
      ? vectorMagnitude(
        normalized.x - previousAccel.x,
        normalized.y - previousAccel.y,
        normalized.z - previousAccel.z
      )
      : 0;

    const hardBrakeDetected =
      x <= THRESHOLDS.HARD_BRAKE ||
      (
        xForward <= THRESHOLDS.HARD_BRAKE_DEMO_X_G &&
        (magnitudeDeltaFromGravity >= THRESHOLDS.HARD_BRAKE_VECTOR_DELTA_G ||
          maxAxisDelta >= THRESHOLDS.HARD_BRAKE_AXIS_DELTA_G ||
          xDelta >= THRESHOLDS.HARD_BRAKE_X_DELTA_G)
      );

    if (hardBrakeDetected) {
      alarms.push({
        ts: sample.ts,
        kind: 'HARD_BRAKE',
        severity: severityFromMagnitude(
          Math.max(Math.abs(x), magnitudeDeltaFromGravity * 8, maxAxisDelta * 8),
          4,
          6,
          8
        ),
        details: {
          x,
          y,
          z,
          xg: Number(normalized.x.toFixed(3)),
          yg: Number(normalized.y.toFixed(3)),
          zg: Number(normalized.z.toFixed(3)),
          magnitude: Number(magnitude.toFixed(3)),
          magnitudeDeltaFromGravity: Number(magnitudeDeltaFromGravity.toFixed(3)),
          maxAxisDelta: Number(maxAxisDelta.toFixed(3)),
        },
      });
    }

    const rapidAccelDetected =
      x >= THRESHOLDS.RAPID_ACCEL ||
      (
        xForward >= THRESHOLDS.RAPID_ACCEL_DEMO_X_G &&
        (xDelta >= THRESHOLDS.RAPID_ACCEL_X_DELTA_G ||
          magnitudeDeltaFromGravity >= THRESHOLDS.HARD_BRAKE_VECTOR_DELTA_G)
      );

    if (rapidAccelDetected) {
      alarms.push({
        ts: sample.ts,
        kind: 'RAPID_ACCEL',
        severity: severityFromMagnitude(x, 2, 4, 6),
        details: {
          x,
          xg: Number(xForward.toFixed(3)),
          xDelta: Number(xDelta.toFixed(3)),
        },
      });
    }

    const sharpTurnDetected =
      yDelta >= THRESHOLDS.SHARP_TURN_Y_DELTA_G ||
      (
        Math.abs(yLateral) >= THRESHOLDS.SHARP_TURN_MIN_Y_G &&
        yDelta >= THRESHOLDS.SHARP_TURN_Y_DELTA_G * 0.7
      );

    if (sharpTurnDetected) {
      alarms.push({
        ts: sample.ts,
        kind: 'SHARP_TURN',
        severity: severityFromMagnitude(yDelta, 0.14, 0.2, 0.3),
        details: {
          y,
          yg: Number(yLateral.toFixed(3)),
          yDelta: Number(yDelta.toFixed(3)),
        },
      });
    }

    // Demo-only crash/emergency detection block.
    // Isolated and fully bypassed when ENABLE_CRASH_DETECTION is false.
    if (ENABLE_CRASH_DETECTION) {
      const absX = Math.abs(normalized.x);
      const absY = Math.abs(normalized.y);
      const absZ = Math.abs(normalized.z);
      const violentAxesCount = [absX, absY, absZ].filter(
        (value) => value >= CRASH_THRESHOLDS.VIOLENT_MULTI_AXIS_G
      ).length;
      const extremeAxis = Math.max(absX, absY, absZ) >= CRASH_THRESHOLDS.EXTREME_AXIS_G;
      const impactLikeVector = magnitudeDeltaFromGravity >= CRASH_THRESHOLDS.IMPACT_VECTOR_DELTA_G;
      const suddenImpactChange = vectorDeltaFromPrevious >= CRASH_THRESHOLDS.IMPACT_VECTOR_CHANGE_G;

      if (
        impactLikeVector ||
        (violentAxesCount >= 2 && suddenImpactChange) ||
        (extremeAxis && suddenImpactChange)
      ) {
        alarms.push({
          ts: sample.ts,
          kind: 'CRASH_DETECTED',
          severity: 'critical',
          details: {
            x,
            y,
            z,
            xg: Number(normalized.x.toFixed(3)),
            yg: Number(normalized.y.toFixed(3)),
            zg: Number(zVertical.toFixed(3)),
            magnitude: Number(magnitude.toFixed(3)),
            magnitudeDeltaFromGravity: Number(magnitudeDeltaFromGravity.toFixed(3)),
            vectorDeltaFromPrevious: Number(vectorDeltaFromPrevious.toFixed(3)),
            violentAxesCount,
          },
        });
      }
    }
  } else if (sample.sensorType === 'gyro') {
    const z = Number(sample.payload.z);
    if (!Number.isFinite(z)) return [];
    if (Math.abs(z) >= THRESHOLDS.SHARP_TURN) {
      alarms.push({
        ts: sample.ts,
        kind: 'SHARP_TURN',
        severity: severityFromMagnitude(z, 1.2, 1.8, 2.5),
        details: { z },
      });
    }
  }

  return alarms;
}

function analyzeBatch(samples) {
  let previousAccel = null;
  const alarms = [];

  for (const sample of samples) {
    const currentAlarms = analyzeSample(sample, previousAccel);
    alarms.push(...currentAlarms);

    if (sample?.sensorType === 'accel' && sample.payload) {
      const x = Number(sample.payload.x);
      const y = Number(sample.payload.y);
      const z = Number(sample.payload.z);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        previousAccel = normalizeAccelToG(x, y, z);
      }
    }
  }

  return alarms;
}

module.exports = {
  analyzeSample,
  analyzeBatch,
  THRESHOLDS,
  ENABLE_CRASH_DETECTION,
  CRASH_THRESHOLDS,
};
