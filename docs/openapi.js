module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Safe Driving Backend',
    version: '0.1.0',
    description:
      'Backend service for the Safe Driving and Driver Behavior Analysis platform. ' +
      'Mobile clients POST sensor telemetry; dashboards subscribe to live alarms via Socket.io.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['driver', 'admin'] },
        },
      },
      Device: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          userId: { type: 'integer' },
          label: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Sample: {
        type: 'object',
        required: ['ts', 'sensorType', 'payload'],
        properties: {
          ts: { type: 'string', format: 'date-time' },
          sensorType: { type: 'string', enum: ['accel', 'gyro', 'gps'] },
          payload: { type: 'object', additionalProperties: true },
        },
      },
      Alarm: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          deviceId: { type: 'integer' },
          vehicleId: { type: 'integer', nullable: true },
          driverId: { type: 'integer', nullable: true },
          tripId: { type: 'integer', nullable: true },
          ts: { type: 'string', format: 'date-time' },
          kind: {
            type: 'string',
            enum: ['HARD_BRAKE', 'RAPID_ACCEL', 'SHARP_TURN', 'CRASH_DETECTED'],
          },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          details: { type: 'object', additionalProperties: true },
          acknowledgedAt: { type: 'string', format: 'date-time', nullable: true },
          acknowledgedBy: { type: 'integer', nullable: true },
        },
      },
      Vehicle: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['Active', 'Idle', 'Warning', 'Offline'] },
          currentDriverId: { type: 'integer', nullable: true },
          lastLat: { type: 'number', nullable: true },
          lastLng: { type: 'number', nullable: true },
          lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
          riskLevel: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Trip: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          driverId: { type: 'integer', nullable: true },
          vehicleId: { type: 'integer', nullable: true },
          deviceId: { type: 'integer', nullable: true },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          distance: { type: 'number' },
          riskScore: { type: 'string', enum: ['Low', 'Medium', 'High'] },
          alertsCount: { type: 'integer' },
          status: { type: 'string', enum: ['Active', 'Completed', 'Warning', 'Interrupted'] },
          lastLat: { type: 'number', nullable: true },
          lastLng: { type: 'number', nullable: true },
          lastSampleAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Liveness probe',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['driver', 'admin'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '400': { description: 'Validation error' },
          '409': { description: 'Email already exists' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Log in and receive a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/devices': {
      get: {
        summary: 'List devices (own for user, all for admin)',
        security: [{ bearer: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } } },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        summary: 'Register a device for the current user',
        security: [{ bearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Device' } } } },
        },
      },
    },
    '/vehicles': {
      get: {
        summary: 'List vehicles (all for admin, assigned only for driver)',
        security: [{ bearer: [] }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Vehicle' } } } } },
        },
      },
      post: {
        summary: 'Create a vehicle (admin)',
        security: [{ bearer: [] }],
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vehicle' } } } },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/vehicles/{id}': {
      get: {
        summary: 'Get vehicle by id',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Vehicle' } } } },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update vehicle (admin)',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'OK' }, '403': { description: 'Forbidden' } },
      },
      delete: {
        summary: 'Delete vehicle (admin)',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { '204': { description: 'Deleted' }, '403': { description: 'Forbidden' } },
      },
    },
    '/trips': {
      get: {
        summary: 'List trips (all for admin, own for driver)',
        security: [{ bearer: [] }],
        parameters: [
          { in: 'query', name: 'driverId', schema: { type: 'integer' } },
          { in: 'query', name: 'vehicleId', schema: { type: 'integer' } },
          { in: 'query', name: 'deviceId', schema: { type: 'integer' } },
          { in: 'query', name: 'status', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Trip' } } } } },
        },
      },
      post: {
        summary: 'Create trip (admin)',
        security: [{ bearer: [] }],
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } } },
          '403': { description: 'Forbidden' },
        },
      },
    },
    '/trips/{id}': {
      get: {
        summary: 'Get trip by id',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Trip' } } } },
          '403': { description: 'Forbidden' },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: 'Update trip (admin)',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'OK' }, '403': { description: 'Forbidden' } },
      },
      delete: {
        summary: 'Delete trip (admin)',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { '204': { description: 'Deleted' }, '403': { description: 'Forbidden' } },
      },
    },
    '/telemetry': {
      post: {
        summary: 'Ingest a batch of sensor samples',
        security: [{ bearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['deviceId', 'samples'],
                properties: {
                  deviceId: { type: 'integer' },
                  samples: { type: 'array', items: { $ref: '#/components/schemas/Sample' } },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Ingested. May also have produced alarms (emitted via Socket.io).',
            content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' }, alarms: { type: 'integer' } } } } },
          },
          '400': { description: 'Validation error' },
          '403': { description: 'Device not owned by user' },
          '404': { description: 'Device not found' },
        },
      },
      get: {
        summary: 'Query historical samples in a time range',
        security: [{ bearer: [] }],
        parameters: [
          { in: 'query', name: 'deviceId', required: true, schema: { type: 'integer' } },
          { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
          { in: 'query', name: 'sensorType', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Sample' } } } } },
        },
      },
    },
    '/alarms': {
      get: {
        summary: 'List alarms',
        security: [{ bearer: [] }],
        parameters: [
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['active'] } },
          { in: 'query', name: 'deviceId', schema: { type: 'integer' } },
          { in: 'query', name: 'vehicleId', schema: { type: 'integer' } },
          { in: 'query', name: 'driverId', schema: { type: 'integer' } },
          { in: 'query', name: 'tripId', schema: { type: 'integer' } },
          { in: 'query', name: 'severity', schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
          { in: 'query', name: 'type', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Alarm' } } } } },
        },
      },
    },
    '/alarms/{id}/ack': {
      patch: {
        summary: 'Acknowledge an alarm',
        security: [{ bearer: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Alarm' } } } },
          '403': { description: 'Forbidden' },
          '404': { description: 'Alarm not found' },
        },
      },
    },
  },
  'x-socketio': {
    description:
      'Connect to Socket.io with `auth: { token }` in the handshake. Server emits `alarm:new` to ' +
      '`user:<id>` and `admins` rooms when a new alarm is created.',
    events: {
      'alarm:new': {
        description: 'Fired when telemetry analysis produces an alarm.',
        payload: { $ref: '#/components/schemas/Alarm' },
      },
    },
  },
};
