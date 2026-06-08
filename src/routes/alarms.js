const express = require('express');
const { authMiddleware } = require('../auth');

function mapRow(r) {
  return {
    id: r.id,
    deviceId: r.device_id,
    vehicleId: r.vehicle_id,
    driverId: r.driver_id,
    tripId: r.trip_id,
    ts: r.ts,
    kind: r.kind,
    severity: r.severity,
    details: JSON.parse(r.details),
    acknowledgedAt: r.acknowledged_at,
    acknowledgedBy: r.acknowledged_by,
    createdAt: r.created_at,
  };
}

module.exports = (db) => {
  const router = express.Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const clauses = [];
    const params = [];

    if (req.user.role !== 'admin') {
      clauses.push(
        `(
          driver_id = ?
          OR (driver_id IS NULL AND device_id IN (SELECT id FROM devices WHERE user_id = ?))
        )`
      );
      params.push(req.user.id, req.user.id);
    }

    if (req.query.status === 'active') clauses.push('acknowledged_at IS NULL');
    if (req.query.deviceId) { clauses.push('device_id = ?'); params.push(Number(req.query.deviceId)); }
    if (req.query.vehicleId || req.query.vehicle) {
      clauses.push('vehicle_id = ?');
      params.push(Number(req.query.vehicleId || req.query.vehicle));
    }
    if (req.query.driverId || req.query.driver) {
      clauses.push('driver_id = ?');
      params.push(Number(req.query.driverId || req.query.driver));
    }
    if (req.query.tripId || req.query.trip) {
      clauses.push('trip_id = ?');
      params.push(Number(req.query.tripId || req.query.trip));
    }
    if (req.query.severity) {
      clauses.push('severity = ?');
      params.push(String(req.query.severity).toLowerCase());
    }
    if (req.query.type || req.query.kind) {
      clauses.push('kind = ?');
      params.push(String(req.query.type || req.query.kind));
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM alarms ${where} ORDER BY id`).all(...params);
    return res.json(rows.map(mapRow));
  });

  router.patch('/:id/ack', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'alarm not found' });

    if (req.user.role !== 'admin') {
      const ownByDriver = row.driver_id === req.user.id;
      const dev = db.prepare('SELECT user_id FROM devices WHERE id = ?').get(row.device_id);
      const ownByDevice = dev && dev.user_id === req.user.id;
      if (!ownByDriver && !ownByDevice) return res.status(403).json({ error: 'forbidden' });
    }

    db.prepare('UPDATE alarms SET acknowledged_at = datetime(\'now\'), acknowledged_by = ? WHERE id = ?')
      .run(req.user.id, id);
    const updated = db.prepare('SELECT * FROM alarms WHERE id = ?').get(id);
    return res.json(mapRow(updated));
  });

  return router;
};
