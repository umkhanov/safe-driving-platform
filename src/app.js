const express = require('express');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const vehicleRoutes = require('./routes/vehicles');
const tripRoutes = require('./routes/trips');
const telemetryRoutes = require('./routes/telemetry');
const alarmRoutes = require('./routes/alarms');
const openapi = require('../docs/openapi');
const cors = require('cors');

function createApp(db, emit = () => {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/auth', authRoutes(db));
  app.use('/devices', deviceRoutes(db));
  app.use('/vehicles', vehicleRoutes(db));
  app.use('/trips', tripRoutes(db));
  app.use('/telemetry', telemetryRoutes(db, emit));
  app.use('/alarms', alarmRoutes(db));

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.get('/openapi.json', (req, res) => res.json(openapi));

  return app;
}

module.exports = { createApp };
