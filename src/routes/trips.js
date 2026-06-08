const express = require('express');
const { authMiddleware } = require('../auth');

function mapTrip(row) {
  return {
    id: row.id,
    driverId: row.driver_id,
    vehicleId: row.vehicle_id,
    deviceId: row.device_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distance: row.distance,
    riskScore: row.risk_score,
    alertsCount: row.alerts_count,
    status: row.status,
    lastLat: row.last_lat,
    lastLng: row.last_lng,
    lastSampleAt: row.last_sample_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = (db) => {
  const router = express.Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const clauses = [];
    const params = [];

    if (req.user.role !== 'admin') {
      clauses.push('driver_id = ?');
      params.push(req.user.id);
    }

    if (req.query.driverId) {
      clauses.push('driver_id = ?');
      params.push(Number(req.query.driverId));
    }

    if (req.query.vehicleId) {
      clauses.push('vehicle_id = ?');
      params.push(Number(req.query.vehicleId));
    }

    if (req.query.deviceId) {
      clauses.push('device_id = ?');
      params.push(Number(req.query.deviceId));
    }

    if (req.query.status) {
      clauses.push('status = ?');
      params.push(String(req.query.status));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM trips ${where} ORDER BY id DESC`).all(...params);
    return res.json(rows.map(mapTrip));
  });

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'trip not found' });

    if (req.user.role !== 'admin' && row.driver_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.json(mapTrip(row));
  });

  router.post('/', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const {
      driverId,
      vehicleId,
      deviceId = null,
      startedAt,
      endedAt = null,
      distance = 0,
      riskScore = 'Low',
      alertsCount = 0,
      status = 'Active',
      lastLat = null,
      lastLng = null,
      lastSampleAt = null,
    } = req.body || {};

    if (!driverId || !vehicleId || !startedAt) {
      return res.status(400).json({ error: 'driverId, vehicleId and startedAt are required' });
    }

    const result = db.prepare(
      `INSERT INTO trips
       (driver_id, vehicle_id, device_id, started_at, ended_at, distance, risk_score, alerts_count, status, last_lat, last_lng, last_sample_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      driverId,
      vehicleId,
      deviceId,
      startedAt,
      endedAt,
      distance,
      riskScore,
      alertsCount,
      status,
      lastLat,
      lastLng,
      lastSampleAt
    );

    const created = db.prepare('SELECT * FROM trips WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(mapTrip(created));
  });

  router.patch('/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'trip not found' });

    const next = {
      driverId: req.body?.driverId !== undefined ? req.body.driverId : existing.driver_id,
      vehicleId: req.body?.vehicleId !== undefined ? req.body.vehicleId : existing.vehicle_id,
      deviceId: req.body?.deviceId !== undefined ? req.body.deviceId : existing.device_id,
      startedAt: req.body?.startedAt ?? existing.started_at,
      endedAt: req.body?.endedAt !== undefined ? req.body.endedAt : existing.ended_at,
      distance: req.body?.distance !== undefined ? req.body.distance : existing.distance,
      riskScore: req.body?.riskScore ?? existing.risk_score,
      alertsCount: req.body?.alertsCount !== undefined ? req.body.alertsCount : existing.alerts_count,
      status: req.body?.status ?? existing.status,
      lastLat: req.body?.lastLat !== undefined ? req.body.lastLat : existing.last_lat,
      lastLng: req.body?.lastLng !== undefined ? req.body.lastLng : existing.last_lng,
      lastSampleAt:
        req.body?.lastSampleAt !== undefined ? req.body.lastSampleAt : existing.last_sample_at,
    };

    db.prepare(
      `UPDATE trips SET
         driver_id = ?,
         vehicle_id = ?,
         device_id = ?,
         started_at = ?,
         ended_at = ?,
         distance = ?,
         risk_score = ?,
         alerts_count = ?,
         status = ?,
         last_lat = ?,
         last_lng = ?,
         last_sample_at = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      next.driverId,
      next.vehicleId,
      next.deviceId,
      next.startedAt,
      next.endedAt,
      next.distance,
      next.riskScore,
      next.alertsCount,
      next.status,
      next.lastLat,
      next.lastLng,
      next.lastSampleAt,
      id
    );

    const updated = db.prepare('SELECT * FROM trips WHERE id = ?').get(id);
    return res.json(mapTrip(updated));
  });

  router.delete('/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const id = Number(req.params.id);
    const result = db.prepare('DELETE FROM trips WHERE id = ?').run(id);
    if (!result.changes) return res.status(404).json({ error: 'trip not found' });
    return res.status(204).send();
  });

  return router;
};
