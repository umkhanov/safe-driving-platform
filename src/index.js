require('dotenv').config();
const http = require('http');

const { createApp } = require('./app');
const { ensureDefaultAdmin } = require('./auth');
const { ensureDefaultVehicleDevice } = require('./bootstrap');
const { createDb } = require('./db');
const { attachSocketServer } = require('./realtime');

const db = createDb(process.env.SQLITE_PATH || './data/app.db');
const defaultAdmin = ensureDefaultAdmin(db);
if (defaultAdmin) {
  console.log(`Default admin created: ${defaultAdmin.email}`);
}
const defaultDevice = ensureDefaultVehicleDevice(db);
if (defaultDevice) {
  console.log(`Default vehicle device created: #${defaultDevice.id} (${defaultDevice.label})`);
}
const server = http.createServer();
const { emit } = attachSocketServer(server);
const app = createApp(db, emit);
server.on('request', app);

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
