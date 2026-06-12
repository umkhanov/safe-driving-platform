const express = require('express');
const { registerUser, loginUser } = require('../auth');

module.exports = (db) => {
  const router = express.Router();

  router.post('/register', (req, res) => {
    const { email, password, role } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    try {
      const user = registerUser(db, { email, password, role });
      return res.status(201).json(user);
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'email already exists' });
      }
      throw e;
    }
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const result = loginUser(db, { email, password });
    if (!result) return res.status(401).json({ error: 'invalid credentials' });
    return res.json(result);
  });

  return router;
};
