import { NextRequest, NextResponse } from 'next/server';
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';
import { getMetricsEngine } from '@/lib/observability/MetricsEngine';
import { db } from '@/lib/db';

// GET /api/simulation - Get simulation status + live entities + metrics
export async function GET() {
  try {
    const sim = getSimulationEngine();
    const state = sim.getState();
    const worldEngine = getWorldStateEngine();
    const worldStats = worldEngine.getStats();
    const metrics = getMetricsEngine();

    // Get live entities from the world state engine for the frontend to render
    const liveEntities = worldEngine.getAllEntities().map(e => ({
      id: e.id,
      environmentId: e.environmentId,
      entityType: e.entityType,
      name: e.name,
      description: e.description,
      position: e.position,
      rotation: e.rotation,
      velocity: e.velocity,
      status: e.status,
      metadata: e.metadata,
      properties: e.properties,
      lastUpdate: e.lastUpdate,
    }));

    return NextResponse.json({
      success: true,
      simulation: state ? {
        id: state.id,
        status: state.status,
        currentTick: state.currentTick,
        config: state.config,
        metrics: state.metrics,
        entityCount: state.entities.size,
        eventCount: state.events.length,
        startTime: state.startTime,
      } : { status: 'not_initialized' },
      worldState: worldStats,
      liveEntities,
      recentTelemetry: sim.getTelemetryBuffer(100),
      systemMetrics: {
        memory: metrics.getLatestMetric('memory_heap_used'),
        eventThroughput: metrics.getLatestMetric('event_throughput'),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/simulation - Control simulation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;
    const sim = getSimulationEngine();
    const worldEngine = getWorldStateEngine();
    const metrics = getMetricsEngine();

    switch (action) {
      case 'init': {
        // Ensure TwinEnvironment exists
        const existingEnv = await db.twinEnvironment.findUnique({ where: { id: 'demo-env' } });
        if (!existingEnv) {
          await db.twinEnvironment.create({
            data: {
              id: 'demo-env',
              name: 'Demo Warehouse',
              description: 'Default demo warehouse environment with zones, vehicles, robots, and sensors',
              type: 'warehouse',
              config: JSON.stringify({ gridSize: 300, bounds: { width: 300, height: 150 }, zones: ['zone-a', 'zone-b', 'zone-c', 'zone-road'] }),
              isActive: true,
            },
          });
        }

        // Seed demo entities if world state is empty
        const entities = worldEngine.getAllEntities();
        if (entities.length === 0) {
          const demoEntities = generateDemoEntities();
          for (const e of demoEntities) {
            try { worldEngine.addEntity(e); } catch { /* already exists in engine */ }
          }
          // Persist to DB
          for (const e of demoEntities) {
            try {
              await db.twinEntity.create({
                data: {
                  id: e.id,
                  environmentId: 'demo-env',
                  entityType: e.entityType,
                  name: e.name,
                  description: e.description,
                  properties: JSON.stringify({ position: e.position, velocity: e.velocity, rotation: e.rotation }),
                  status: e.status,
                  metadata: JSON.stringify(e.metadata),
                },
              });
            } catch { /* already exists in db */ }
          }

          // Seed some initial telemetry events
          for (const e of demoEntities.slice(0, 20)) {
            const sensorTypes = ['temperature', 'speed', 'voltage', 'occupancy', 'humidity'];
            const units = ['C', 'm/s', 'V', '%', '%'];
            const idx = Math.floor(Math.random() * sensorTypes.length);
            try {
              await db.telemetryEvent.create({
                data: {
                  entityId: e.id,
                  sensorType: sensorTypes[idx],
                  source: 'simulation',
                  value: Math.round((20 + Math.random() * 80) * 100) / 100,
                  unit: units[idx],
                  quality: Math.round(85 + Math.random() * 15),
                  metadata: JSON.stringify({ simulated: true }),
                  isProcessed: true,
                  partitionKey: e.id,
                },
              });
            } catch { /* ignore */ }
          }
        }

        const state = sim.initialize(config);
        return NextResponse.json({ success: true, simulation: { id: state.id, status: state.status, entityCount: state.entities.size } });
      }
      case 'start': {
        if (!sim.getState()) sim.initialize(config);
        sim.start();
        metrics.recordMetric('simulation_status', 1);
        return NextResponse.json({ success: true, status: sim.getStatus() });
      }
      case 'pause': {
        sim.pause();
        return NextResponse.json({ success: true, status: sim.getStatus() });
      }
      case 'resume': {
        sim.resume();
        return NextResponse.json({ success: true, status: sim.getStatus() });
      }
      case 'stop': {
        sim.stop();
        metrics.recordMetric('simulation_status', 0);
        return NextResponse.json({ success: true, status: sim.getStatus() });
      }
      case 'reset': {
        sim.reset();
        return NextResponse.json({ success: true, status: 'not_initialized' });
      }
      case 'snapshot': {
        const snapshot = worldEngine.snapshot();
        return NextResponse.json({ success: true, version: snapshot.version, entityCount: Object.keys(snapshot.entities).length });
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function generateDemoEntities() {
  const entityDefs = [
    { type: 'vehicle' as const, count: 8, zone: [0, 300], zoneZ: [100, 150] },
    { type: 'forklift' as const, count: 6, zone: [0, 200], zoneZ: [0, 100] },
    { type: 'robot' as const, count: 5, zone: [100, 200], zoneZ: [0, 100] },
    { type: 'drone' as const, count: 4, zone: [0, 300], zoneZ: [0, 150] },
    { type: 'sensor' as const, count: 12, zone: [0, 300], zoneZ: [0, 150] },
    { type: 'camera' as const, count: 6, zone: [0, 300], zoneZ: [0, 150] },
    { type: 'conveyor' as const, count: 4, zone: [100, 200], zoneZ: [20, 80] },
    { type: 'dock' as const, count: 3, zone: [250, 290], zoneZ: [10, 90] },
  ];

  return entityDefs.flatMap(def =>
    Array.from({ length: def.count }, (_, i) => ({
      id: `${def.type}-${i + 1}`,
      environmentId: 'demo-env',
      entityType: def.type,
      name: `${def.type.charAt(0).toUpperCase() + def.type.slice(1)} ${i + 1}`,
      description: `Demo ${def.type} unit`,
      position: {
        x: def.zone[0] + Math.random() * (def.zone[1] - def.zone[0]),
        y: def.type === 'drone' ? 5 + Math.random() * 10 : 0,
        z: def.zoneZ[0] + Math.random() * (def.zoneZ[1] - def.zoneZ[0]),
      },
      rotation: { x: 0, y: Math.random() * 360, z: 0 },
      velocity: { x: (Math.random() - 0.5) * 3, y: 0, z: (Math.random() - 0.5) * 3, speed: Math.random() * 5 },
      status: 'active' as const,
      metadata: { manufacturer: 'DemoCorp', model: `${def.type}-v1`, serial: `SN-${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
      properties: {},
      lastUpdate: Date.now(),
    }))
  );
}
