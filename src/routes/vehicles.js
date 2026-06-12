const express = require('express');
const { authMiddleware } = require('../auth');

function mapVehicle(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentDriverId: row.current_driver_id,
    lastLat: row.last_lat,
    lastLng: row.last_lng,
    lastSeenAt: row.last_seen_at,
    riskLevel: row.risk_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = (db) => {
  const router = express.Router();
  router.use(authMiddleware);

  router.get('/', (req, res) => {
    const rows = req.user.role === 'admin'
      ? db.prepare('SELECT * FROM vehicles ORDER BY id').all()
      : db.prepare('SELECT * FROM vehicles WHERE current_driver_id = ? ORDER BY id').all(req.user.id);
    return res.json(rows.map(mapVehicle));
  });

  router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'vehicle not found' });

    if (req.user.role !== 'admin' && row.current_driver_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return res.json(mapVehicle(row));
  });

  router.post('/', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const {
      name,
      status = 'Idle',
      currentDriverId = null,
      lastLat = null,
      lastLng = null,
      lastSeenAt = null,
      riskLevel = 'Low',
    } = req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = db.prepare(
      `INSERT INTO vehicles
       (name, status, current_driver_id, last_lat, last_lng, last_seen_at, risk_level, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(name, status, currentDriverId, lastLat, lastLng, lastSeenAt, riskLevel);

    const created = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json(mapVehicle(created));
  });

  router.patch('/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'vehicle not found' });

    const next = {
      name: req.body?.name ?? existing.name,
      status: req.body?.status ?? existing.status,
      currentDriverId:
        req.body?.currentDriverId !== undefined ? req.body.currentDriverId : existing.current_driver_id,
      lastLat: req.body?.lastLat !== undefined ? req.body.lastLat : existing.last_lat,
      lastLng: req.body?.lastLng !== undefined ? req.body.lastLng : existing.last_lng,
      lastSeenAt: req.body?.lastSeenAt !== undefined ? req.body.lastSeenAt : existing.last_seen_at,
      riskLevel: req.body?.riskLevel ?? existing.risk_level,
    };

    db.prepare(
      `UPDATE vehicles SET
        name = ?,
        status = ?,
        current_driver_id = ?,
        last_lat = ?,
        last_lng = ?,
        last_seen_at = ?,
        risk_level = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    ).run(
      next.name,
      next.status,
      next.currentDriverId,
      next.lastLat,
      next.lastLng,
      next.lastSeenAt,
      next.riskLevel,
      id
    );

    const updated = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id);
    return res.json(mapVehicle(updated));
  });

  router.delete('/:id', (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const id = Number(req.params.id);
    const result = db.prepare('DELETE FROM vehicles WHERE id = ?').run(id);
    if (!result.changes) return res.status(404).json({ error: 'vehicle not found' });
    return res.status(204).send();
  });

  return router;
};
