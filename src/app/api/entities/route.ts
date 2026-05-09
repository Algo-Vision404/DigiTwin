import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';

// GET /api/entities - List all entities
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environmentId = searchParams.get('environmentId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (environmentId) where.environmentId = environmentId;
    if (type) where.entityType = type;
    if (status) where.status = status;

    const entities = await db.twinEntity.findMany({ where, orderBy: { updatedAt: 'desc' } });

    // Also get live state from engine
    const engine = getWorldStateEngine();
    const liveEntities = engine.getAllEntities();

    return NextResponse.json({ success: true, count: entities.length, entities, liveEntities });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/entities - Create entity
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { environmentId, entityType, name, description, position, rotation, velocity, status, metadata, properties } = body;

    // Create in database
    const entity = await db.twinEntity.create({
      data: {
        environmentId: environmentId || 'default',
        entityType: entityType || 'sensor',
        name,
        description: description || null,
        properties: JSON.stringify({
          position: position || { x: 0, y: 0, z: 0 },
          rotation: rotation || { x: 0, y: 0, z: 0 },
          velocity: velocity || { x: 0, y: 0, z: 0, speed: 0 },
          ...properties,
        }),
        status: status || 'active',
        metadata: JSON.stringify(metadata || {}),
      },
    });

    // Add to live engine
    const engine = getWorldStateEngine();
    try {
      engine.addEntity({
        id: entity.id,
        environmentId: entity.environmentId,
        entityType: entity.entityType as 'vehicle' | 'robot' | 'drone' | 'sensor' | 'camera' | 'machine' | 'zone' | 'road' | 'shelf' | 'person' | 'forklift' | 'conveyor' | 'dock',
        name: entity.name,
        description: entity.description || undefined,
        position: position || { x: Math.random() * 280 + 10, y: 0, z: Math.random() * 130 + 10 },
        rotation: rotation || { x: 0, y: 0, z: 0 },
        velocity: velocity || { x: 0, y: 0, z: 0, speed: 0 },
        status: entity.status as 'active' | 'inactive' | 'warning' | 'error' | 'maintenance',
        metadata: metadata || {},
        properties: properties || {},
        lastUpdate: Date.now(),
      });
    } catch {
      // Entity may already exist in engine
    }

    return NextResponse.json({ success: true, entity }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
