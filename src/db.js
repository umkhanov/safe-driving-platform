const Database = require('better-sqlite3');

function createDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function hasColumn(db, table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((c) => c.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'driver',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

    CREATE TABLE IF NOT EXISTS sensor_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      sensor_type TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_samples_device_ts ON sensor_samples(device_id, ts);

    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts TEXT NOT NULL,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL,
      details TEXT NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      acknowledged_at TEXT,
      acknowledged_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alarms_device_ts ON alarms(device_id, ts);

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Idle',
      current_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      last_lat REAL,
      last_lng REAL,
      last_seen_at TEXT,
      risk_level TEXT NOT NULL DEFAULT 'Low',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(current_driver_id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);

    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
      device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      distance REAL NOT NULL DEFAULT 0,
      risk_score TEXT NOT NULL DEFAULT 'Low',
      alerts_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      last_lat REAL,
      last_lng REAL,
      last_sample_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
    CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_trips_device ON trips(device_id);
    CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

    CREATE INDEX IF NOT EXISTS idx_alarms_vehicle ON alarms(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_alarms_driver ON alarms(driver_id);
    CREATE INDEX IF NOT EXISTS idx_alarms_trip ON alarms(trip_id);
  `);

  addColumnIfMissing(db, 'alarms', 'vehicle_id', 'INTEGER');
  addColumnIfMissing(db, 'alarms', 'driver_id', 'INTEGER');
  addColumnIfMissing(db, 'alarms', 'trip_id', 'INTEGER');
  addColumnIfMissing(db, 'trips', 'device_id', 'INTEGER REFERENCES devices(id) ON DELETE SET NULL');
  addColumnIfMissing(db, 'trips', 'last_lat', 'REAL');
  addColumnIfMissing(db, 'trips', 'last_lng', 'REAL');
  addColumnIfMissing(db, 'trips', 'last_sample_at', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_trips_device ON trips(device_id)');
}

module.exports = { createDb, initSchema };
