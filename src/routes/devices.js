const express = require('express');
const { authMiddleware } = require('../auth');

module.exports = (db) => {
  const router = express.Router();
  router.use(authMiddleware);

  router.post('/', (req, res) => {
    const { label } = req.body || {};
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'label is required' });
    }
    const result = db
      .prepare('INSERT INTO devices (user_id, label) VALUES (?, ?)')
      .run(req.user.id, label);
    return res.status(201).json({ id: result.lastInsertRowid, label, userId: req.user.id });
  });

  router.get('/', (req, res) => {
    const rows = req.user.role === 'admin'
      ? db.prepare('SELECT id, user_id AS userId, label, created_at AS createdAt FROM devices ORDER BY id').all()
      : db.prepare('SELECT id, user_id AS userId, label, created_at AS createdAt FROM devices WHERE user_id = ? ORDER BY id').all(req.user.id);
    return res.json(rows);
  });

  return router;
};
