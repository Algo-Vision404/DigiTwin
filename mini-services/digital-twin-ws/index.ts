import { Server } from 'socket.io';

const io = new Server({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = 3003;

// Connected clients
const clients = new Set<string>();
let simulationActive = false;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// Entity simulation state
interface SimEntity {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number; speed: number };
  status: string;
}

const entities: Map<string, SimEntity> = new Map();
let tickCount = 0;

// Initialize demo entities
function initDemoEntities() {
  const types = [
    { type: 'vehicle', count: 8, yBase: 0, zRange: [100, 150] as const, xRange: [0, 300] as const },
    { type: 'forklift', count: 6, yBase: 0, zRange: [0, 100] as const, xRange: [0, 200] as const },
    { type: 'robot', count: 5, yBase: 0, zRange: [0, 100] as const, xRange: [100, 200] as const },
    { type: 'drone', count: 4, yBase: 8, zRange: [0, 150] as const, xRange: [0, 300] as const },
    { type: 'sensor', count: 12, yBase: 3, zRange: [0, 150] as const, xRange: [0, 300] as const },
  ];

  types.forEach(({ type, count, yBase, zRange, xRange }) => {
    for (let i = 0; i < count; i++) {
      const id = `${type}-${i + 1}`;
      entities.set(id, {
        id,
        type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`,
        position: {
          x: xRange[0] + Math.random() * (xRange[1] - xRange[0]),
          y: yBase + Math.random() * 2,
          z: zRange[0] + Math.random() * (zRange[1] - zRange[0]),
        },
        velocity: { x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2, speed: Math.random() * 3 },
        status: 'active',
      });
    }
  });
}

initDemoEntities();

// Simulation tick
function simulationTick() {
  tickCount++;

  // Update entities
  entities.forEach((entity) => {
    if (entity.status !== 'active') return;

    // Random direction changes
    if (Math.random() < 0.05) {
      const angle = Math.random() * Math.PI * 2;
      entity.velocity.x = Math.cos(angle) * (0.5 + Math.random() * 2);
      entity.velocity.z = Math.sin(angle) * (0.5 + Math.random() * 2);
    }

    // Apply friction
    entity.velocity.x *= 0.99;
    entity.velocity.z *= 0.99;

    // Update position
    entity.position.x += entity.velocity.x * 0.5;
    entity.position.z += entity.velocity.z * 0.5;

    // Keep in bounds
    entity.position.x = Math.max(0, Math.min(300, entity.position.x));
    entity.position.z = Math.max(0, Math.min(150, entity.position.z));
    entity.position.y = entity.type === 'drone' ? 5 + Math.sin(tickCount * 0.02 + entity.position.x * 0.1) * 3 : 0;
    entity.velocity.speed = Math.sqrt(entity.velocity.x ** 2 + entity.velocity.z ** 2);
  });

  // Broadcast entity updates
  const entityStates = Array.from(entities.values());
  io.emit('entity:state-change', {
    type: 'entity:state-change',
    payload: { entities: entityStates, tick: tickCount },
    timestamp: Date.now(),
  });

  // Simulate telemetry
  if (tickCount % 5 === 0) {
    const randomEntity = Array.from(entities.values())[Math.floor(Math.random() * entities.size)];
    const sensorTypes = ['temperature', 'speed', 'occupancy', 'voltage', 'weight'];
    const telemetry = {
      type: 'telemetry:update',
      payload: {
        entityId: randomEntity.id,
        sensorType: sensorTypes[Math.floor(Math.random() * sensorTypes.length)],
        value: Math.round((Math.random() * 100) * 10) / 10,
        unit: ['°C', 'm/s', '%', 'V', 'kg'][Math.floor(Math.random() * 5)],
        quality: 85 + Math.floor(Math.random() * 15),
      },
      timestamp: Date.now(),
    };
    io.emit('telemetry:update', telemetry);
  }

  // Simulation metrics
  if (tickCount % 10 === 0) {
    io.emit('simulation:tick', {
      type: 'simulation:tick',
      payload: {
        tick: tickCount,
        entityCount: entities.size,
        metrics: {
          entitiesProcessed: entities.size,
          eventsPerSecond: Math.round(20 + Math.random() * 30),
          averageTickDuration: Math.round((5 + Math.random() * 15) * 100) / 100,
          gpuUtilization: Math.round(30 + Math.random() * 50),
          memoryUsage: Math.round(80 + Math.random() * 120),
          collisionChecks: Math.floor(50 + Math.random() * 200),
          spatialQueries: Math.floor(20 + Math.random() * 100),
        },
      },
      timestamp: Date.now(),
    });
  }

  // Simulate heatmap updates
  if (tickCount % 20 === 0) {
    const heatmapData: Array<{ x: number; y: number; value: number }> = [];
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 15; y++) {
        heatmapData.push({
          x: x * 10,
          y: y * 10,
          value: Math.random() * 100,
        });
      }
    }
    io.emit('heatmap:update', {
      type: 'heatmap:update',
      payload: { id: 'density', name: 'Entity Density', type: 'density', data: heatmapData, bounds: { width: 300, height: 150 } },
      timestamp: Date.now(),
    });
  }

  // Simulate anomalies
  if (tickCount % 50 === 0 && Math.random() < 0.3) {
    const anomalyTypes = ['congestion', 'equipment_failure', 'throughput_drop', 'temperature_spike'];
    const severities = ['low', 'medium', 'high', 'critical'];
    io.emit('anomaly:detected', {
      type: 'anomaly:detected',
      payload: {
        id: `anomaly-${tickCount}`,
        type: anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
        description: `Anomaly detected in zone ${Math.floor(Math.random() * 4)} at tick ${tickCount}`,
        metadata: { tick: tickCount, zone: Math.floor(Math.random() * 4) },
        isResolved: false,
      },
      timestamp: Date.now(),
    });
  }

  // AI recommendations
  if (tickCount % 80 === 0 && Math.random() < 0.4) {
    const recTypes = ['routing', 'scheduling', 'energy', 'bottleneck'];
    const priorities = ['critical', 'high', 'medium', 'low'];
    const titles = [
      'Dynamic Route Optimization Available',
      'Shift Schedule Adjustment Recommended',
      'Energy Efficiency Improvement Detected',
      'Bottleneck Detected in Processing Zone',
    ];
    const idx = Math.floor(Math.random() * recTypes.length);
    io.emit('ai:recommendation', {
      type: 'ai:recommendation',
      payload: {
        id: `rec-${tickCount}`,
        type: recTypes[idx],
        priority: priorities[Math.floor(Math.random() * priorities.length)],
        title: titles[idx],
        description: `AI analysis recommends optimization based on current operational patterns at tick ${tickCount}.`,
        impact: { timeSaved: Math.round(5 + Math.random() * 30), costReduction: Math.round(2 + Math.random() * 20) },
        confidence: Math.round((70 + Math.random() * 25) * 100) / 100,
        status: 'pending',
      },
      timestamp: Date.now(),
    });
  }

  // Metric updates
  if (tickCount % 15 === 0) {
    io.emit('metric:update', {
      type: 'metric:update',
      payload: {
        metrics: {
          event_throughput: Math.round(800 + Math.random() * 1200),
          sim_latency: Math.round(5 + Math.random() * 20),
          gpu_utilization: Math.round(30 + Math.random() * 55),
          sync_lag: Math.round(1 + Math.random() * 8),
          memory_usage: Math.round(80 + Math.random() * 150),
          queue_pressure: Math.round(10 + Math.random() * 40),
        },
        gpuStatus: {
          utilization: Math.round(35 + Math.random() * 50),
          memoryUsed: Math.round(4000 + Math.random() * 8000),
          memoryTotal: 24576,
          temperature: Math.round(45 + Math.random() * 30),
          powerUsage: Math.round(120 + Math.random() * 250),
        },
      },
      timestamp: Date.now(),
    });
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  const clientId = socket.id;
  clients.add(clientId);
  console.log(`[WS] Client connected: ${clientId} (${clients.size} total)`);

  // Send initial state
  socket.emit('system:notification', {
    type: 'system:notification',
    payload: { message: 'Connected to Digital Twin Platform', connectionId: clientId },
    timestamp: Date.now(),
  });

  socket.emit('entity:state-change', {
    type: 'entity:state-change',
    payload: { entities: Array.from(entities.values()), tick: tickCount },
    timestamp: Date.now(),
  });

  // Start simulation if first client
  if (clients.size === 1 && !simulationActive) {
    simulationActive = true;
    tickInterval = setInterval(simulationTick, 50); // 20 ticks/second
    console.log('[WS] Simulation started');
    io.emit('simulation:status', {
      type: 'simulation:status',
      payload: { status: 'running', tickRate: 20 },
      timestamp: Date.now(),
    });
  }

  // Handle incoming telemetry
  socket.on('telemetry:ingest', (data) => {
    console.log(`[WS] Telemetry ingested from ${clientId}:`, data.sensorType);
    // Broadcast to all other clients
    socket.broadcast.emit('telemetry:update', {
      type: 'telemetry:update',
      payload: data,
      timestamp: Date.now(),
    });
  });

  // Handle entity control
  socket.on('entity:control', (data) => {
    const { entityId, action, params } = data;
    const entity = entities.get(entityId);
    if (entity) {
      if (action === 'move-to') {
        entity.velocity.x = (params.x - entity.position.x) * 0.1;
        entity.velocity.z = (params.z - entity.position.z) * 0.1;
      } else if (action === 'stop') {
        entity.velocity.x = 0;
        entity.velocity.z = 0;
        entity.velocity.speed = 0;
      } else if (action === 'set-status') {
        entity.status = params.status;
      }
    }
  });

  // Handle simulation control
  socket.on('simulation:control', (data) => {
    const { action } = data;
    if (action === 'pause' && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
      simulationActive = false;
      io.emit('simulation:status', { type: 'simulation:status', payload: { status: 'paused' }, timestamp: Date.now() });
    } else if (action === 'resume' && !tickInterval) {
      simulationActive = true;
      tickInterval = setInterval(simulationTick, 50);
      io.emit('simulation:status', { type: 'simulation:status', payload: { status: 'running' }, timestamp: Date.now() });
    } else if (action === 'speed') {
      // Change speed by adjusting interval
      if (tickInterval) {
        clearInterval(tickInterval);
        const newInterval = Math.max(16, Math.round(50 / (data.speed || 1)));
        tickInterval = setInterval(simulationTick, newInterval);
      }
      io.emit('simulation:status', { type: 'simulation:status', payload: { status: simulationActive ? 'running' : 'paused', speed: data.speed }, timestamp: Date.now() });
    }
  });

  socket.on('disconnect', () => {
    clients.delete(clientId);
    console.log(`[WS] Client disconnected: ${clientId} (${clients.size} total)`);
    if (clients.size === 0 && tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
      simulationActive = false;
      console.log('[WS] Simulation paused - no clients');
    }
  });
});

io.listen(PORT);
console.log(`[Digital Twin WS] WebSocket server running on port ${PORT}`);
