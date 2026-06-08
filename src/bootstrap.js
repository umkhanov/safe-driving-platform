function ensureDefaultVehicleDevice(db) {
  const deviceCount = db.prepare('SELECT COUNT(*) AS count FROM devices').get();
  if (Number(deviceCount?.count || 0) > 0) return null;

  const adminUser = db
    .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    .get();

  if (!adminUser) return null;

  db.prepare('INSERT INTO devices (id, user_id, label) VALUES (?, ?, ?)').run(
    1,
    adminUser.id,
    'Vehicle Device'
  );

  const vehicleCount = db.prepare('SELECT COUNT(*) AS count FROM vehicles').get();
  if (Number(vehicleCount?.count || 0) === 0) {
    db.prepare(
      `INSERT INTO vehicles
        (id, name, status, current_driver_id, last_lat, last_lng, last_seen_at, risk_level, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, datetime('now'))`
    ).run(1, 'Vehicle Device', 'active', adminUser.id, null, null, 'Low');
  }

  return {
    id: 1,
    label: 'Vehicle Device',
    userId: adminUser.id,
  };
}

module.exports = { ensureDefaultVehicleDevice };
