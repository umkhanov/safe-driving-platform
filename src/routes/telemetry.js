const express = require('express');
const { authMiddleware } = require('../auth');
const { analyzeBatch } = require('../analysis');

const tripCompletionTimers = new Map();
const TRIP_IDLE_TIMEOUT_SECONDS = Math.max(
  5,
  Number(process.env.TRIP_IDLE_TIMEOUT_SECONDS || 60)
);

function checkDeviceAccess(db, user, deviceId) {
  const device = db.prepare('SELECT id, user_id FROM devices WHERE id = ?').get(deviceId);
  if (!device) return { status: 404, error: 'device not found' };
  if (user.role !== 'admin' && device.user_id !== user.id) {
    return { status: 403, error: 'forbidden' };
  }
  return { device };
}

function riskRank(value) {
  if (value === 'High') return 3;
  if (value === 'Medium') return 2;
  return 1;
}

function normalizeRisk(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Low';
}

function mergeRiskLevel(current, incoming) {
  const currentRisk = normalizeRisk(current);
  const incomingRisk = normalizeRisk(incoming);
  return riskRank(incomingRisk) > riskRank(currentRisk) ? incomingRisk : currentRisk;
}

function deriveRiskLevel(alarms) {
  let highest = 'Low';
  for (const alarm of alarms) {
    const value = String(alarm.severity || '').toLowerCase();
    const mapped =
      value === 'critical' || value === 'high'
        ? 'High'
        : value === 'medium'
          ? 'Medium'
          : 'Low';
    if (riskRank(mapped) > riskRank(highest)) highest = mapped;
  }
  return highest;
}

function extractLatestLocation(samples) {
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const s = samples[i];
    if (s?.sensorType !== 'gps' || !s.payload) continue;
    const lat = Number(s.payload.lat ?? s.payload.latitude);
    const lng = Number(s.payload.lng ?? s.payload.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function extractGpsPoints(samples) {
  const points = [];
  for (const s of samples) {
    if (s?.sensorType !== 'gps' || !s.payload) continue;
    const lat = Number(s.payload.lat ?? s.payload.latitude);
    const lng = Number(s.payload.lng ?? s.payload.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    points.push({ lat, lng });
  }
  return points;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthKm * c;
}

function calculateDistanceIncrementKm(trip, samples) {
  const gpsPoints = extractGpsPoints(samples);
  if (gpsPoints.length === 0) {
    return {
      incrementKm: 0,
      lastLat: Number.isFinite(trip.last_lat) ? trip.last_lat : null,
      lastLng: Number.isFinite(trip.last_lng) ? trip.last_lng : null,
    };
  }

  let prev =
    Number.isFinite(trip.last_lat) && Number.isFinite(trip.last_lng)
      ? { lat: trip.last_lat, lng: trip.last_lng }
      : null;
  let incrementKm = 0;

  for (const point of gpsPoints) {
    if (prev) {
      incrementKm += haversineKm(prev.lat, prev.lng, point.lat, point.lng);
    }
    prev = point;
  }

  const lastPoint = gpsPoints[gpsPoints.length - 1];
  return {
    incrementKm: Number(incrementKm.toFixed(4)),
    lastLat: lastPoint.lat,
    lastLng: lastPoint.lng,
  };
}

function parseSampleTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function extractLatestSampleTimestamp(samples, fallbackIso) {
  let latestMs = null;
  for (const sample of samples) {
    const parsed = parseSampleTimestamp(sample?.ts);
    if (parsed === null) continue;
    if (latestMs === null || parsed > latestMs) latestMs = parsed;
  }
  return latestMs === null ? fallbackIso : new Date(latestMs).toISOString();
}

module.exports = (db, emit) => {
  const router = express.Router();
  router.use(authMiddleware);

  const insertSample = db.prepare(
    'INSERT INTO sensor_samples (device_id, ts, sensor_type, payload) VALUES (?, ?, ?, ?)'
  );
  const insertAlarm = db.prepare(
    `INSERT INTO alarms
      (device_id, ts, kind, severity, details, vehicle_id, driver_id, trip_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const findVehicleForDriver = db.prepare(
    `SELECT * FROM vehicles
     WHERE current_driver_id = ?
     ORDER BY
       CASE WHEN status = 'Active' THEN 0
            WHEN status = 'Warning' THEN 1
            WHEN status = 'Idle' THEN 2
            ELSE 3
       END,
       id
     LIMIT 1`
  );
  const completeStaleTrips = db.prepare(
    `UPDATE trips
     SET ended_at = ?, status = 'Completed', updated_at = datetime('now')
     WHERE driver_id = ?
       AND device_id = ?
       AND ended_at IS NULL
       AND status IN ('Active', 'Warning')
       AND strftime('%s', COALESCE(last_sample_at, updated_at, started_at))
           <= strftime('%s', ?) - ?`
  );
  const findActiveTrip = db.prepare(
    `SELECT * FROM trips
     WHERE driver_id = ?
       AND (device_id = ? OR device_id IS NULL)
       AND (? IS NULL OR vehicle_id = ?)
       AND ended_at IS NULL
       AND status IN ('Active', 'Warning')
     ORDER BY id DESC
     LIMIT 1`
  );
  const insertTrip = db.prepare(
    `INSERT INTO trips
      (driver_id, vehicle_id, device_id, started_at, distance, risk_score, alerts_count, status, last_lat, last_lng, last_sample_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 'Low', 0, 'Active', ?, ?, ?, datetime('now'))`
  );
  const findTripById = db.prepare('SELECT * FROM trips WHERE id = ?');
  const setTripDevice = db.prepare(
    `UPDATE trips
     SET device_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  const updateVehicle = db.prepare(
    `UPDATE vehicles
     SET last_lat = ?, last_lng = ?, last_seen_at = ?, risk_level = ?, updated_at = datetime('now')
     WHERE id = ?`
  );
  const updateTripActivity = db.prepare(
    `UPDATE trips
     SET distance = ?,
         alerts_count = ?,
         risk_score = ?,
         status = 'Active',
         ended_at = NULL,
         last_lat = ?,
         last_lng = ?,
         last_sample_at = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  );
  const completeTripById = db.prepare(
    `UPDATE trips
     SET ended_at = ?, status = 'Completed', updated_at = datetime('now')
     WHERE id = ? AND ended_at IS NULL AND status IN ('Active', 'Warning')`
  );

  const scheduleTripCompletion = (tripId) => {
    if (!tripId) return;

    const existing = tripCompletionTimers.get(tripId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeoutId = setTimeout(() => {
      try {
        completeTripById.run(new Date().toISOString(), tripId);
      } finally {
        tripCompletionTimers.delete(tripId);
      }
    }, TRIP_IDLE_TIMEOUT_SECONDS * 1000);

    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref();
    }

    tripCompletionTimers.set(tripId, timeoutId);
  };

  const ingest = db.transaction((deviceId, driverId, samples) => {
    const nowIso = new Date().toISOString();
    completeStaleTrips.run(nowIso, driverId, deviceId, nowIso, TRIP_IDLE_TIMEOUT_SECONDS);

    const vehicle = findVehicleForDriver.get(driverId) || null;
    let trip = findActiveTrip.get(driverId, deviceId, vehicle?.id ?? null, vehicle?.id ?? null) || null;

    const latestLocation = extractLatestLocation(samples);
    const latestSampleAt = extractLatestSampleTimestamp(samples, nowIso);

    if (!trip) {
      const firstSampleMs = parseSampleTimestamp(samples[0]?.ts);
      const startedAt =
        firstSampleMs !== null ? new Date(firstSampleMs).toISOString() : latestSampleAt;
      const created = insertTrip.run(
        driverId,
        vehicle?.id ?? null,
        deviceId,
        startedAt,
        latestLocation?.lat ?? null,
        latestLocation?.lng ?? null,
        latestSampleAt
      );
      trip = findTripById.get(created.lastInsertRowid);
    } else if (!trip.device_id) {
      setTripDevice.run(deviceId, trip.id);
      trip = findTripById.get(trip.id);
    }

    for (const s of samples) {
      insertSample.run(deviceId, s.ts, s.sensorType, JSON.stringify(s.payload));
    }

    const alarms = analyzeBatch(samples);
    const saved = [];
    for (const a of alarms) {
      const r = insertAlarm.run(
        deviceId,
        a.ts,
        a.kind,
        a.severity,
        JSON.stringify(a.details),
        vehicle?.id ?? null,
        driverId,
        trip?.id ?? null
      );
      saved.push({
        id: r.lastInsertRowid,
        deviceId,
        vehicleId: vehicle?.id ?? null,
        driverId,
        tripId: trip?.id ?? null,
        ...a,
      });
    }

    const distanceDelta = calculateDistanceIncrementKm(trip, samples);
    const nextDistance = Number((Number(trip.distance || 0) + distanceDelta.incrementKm).toFixed(4));
    const nextAlertsCount = Number(trip.alerts_count || 0) + alarms.length;
    const nextRiskScore = alarms.length
      ? mergeRiskLevel(trip.risk_score, deriveRiskLevel(alarms))
      : normalizeRisk(trip.risk_score || 'Low');
    const nextLat =
      distanceDelta.lastLat ??
      latestLocation?.lat ??
      (Number.isFinite(trip.last_lat) ? trip.last_lat : null);
    const nextLng =
      distanceDelta.lastLng ??
      latestLocation?.lng ??
      (Number.isFinite(trip.last_lng) ? trip.last_lng : null);

    updateTripActivity.run(
      nextDistance,
      nextAlertsCount,
      nextRiskScore,
      nextLat,
      nextLng,
      latestSampleAt,
      trip.id
    );

    if (vehicle) {
      const highestRisk = alarms.length
        ? mergeRiskLevel(vehicle.risk_level || 'Low', deriveRiskLevel(alarms))
        : normalizeRisk(vehicle.risk_level || 'Low');
      updateVehicle.run(
        latestLocation?.lat ?? vehicle.last_lat ?? null,
        latestLocation?.lng ?? vehicle.last_lng ?? null,
        latestSampleAt,
        highestRisk,
        vehicle.id
      );
    }

    return { tripId: trip.id, alarms: saved };
  });

  router.post('/', (req, res) => {
    const { deviceId, samples } = req.body || {};
    if (!deviceId || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'deviceId and non-empty samples array required' });
    }
    for (const s of samples) {
      if (!s.ts || !s.sensorType || s.payload === undefined) {
        return res.status(400).json({ error: 'each sample needs ts, sensorType, payload' });
      }
    }
    const access = checkDeviceAccess(db, req.user, deviceId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const result = ingest(deviceId, access.device.user_id, samples);
    for (const a of result.alarms) {
      emit('alarm:new', a, [`user:${access.device.user_id}`, 'admins']);
    }
    scheduleTripCompletion(result.tripId);
    return res.status(201).json({
      count: samples.length,
      alarms: result.alarms.length,
      tripId: result.tripId,
    });
  });

  router.get('/', (req, res) => {
    const deviceId = Number(req.query.deviceId);
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const access = checkDeviceAccess(db, req.user, deviceId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const clauses = ['device_id = ?'];
    const params = [deviceId];
    if (req.query.from) { clauses.push('ts >= ?'); params.push(req.query.from); }
    if (req.query.to) { clauses.push('ts <= ?'); params.push(req.query.to); }
    if (req.query.sensorType) { clauses.push('sensor_type = ?'); params.push(req.query.sensorType); }

    const rows = db
      .prepare(`SELECT id, device_id AS deviceId, ts, sensor_type AS sensorType, payload
                FROM sensor_samples WHERE ${clauses.join(' AND ')} ORDER BY ts`)
      .all(...params);
    return res.json(rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })));
  });

  return router;
};
