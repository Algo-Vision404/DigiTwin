import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';

// GET /api/entities/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entity = await db.twinEntity.findUnique({ where: { id } });
  if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const engine = getWorldStateEngine();
  const liveState = engine.getEntity(id);

  return NextResponse.json({ success: true, entity, liveState });
}

// PUT /api/entities/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const entity = await db.twinEntity.findUnique({ where: { id } });
  if (!entity) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentProps = JSON.parse(entity.properties);
  const updated = await db.twinEntity.update({
    where: { id },
    data: {
      name: body.name ?? entity.name,
      status: body.status ?? entity.status,
      properties: JSON.stringify({ ...currentProps, ...body.properties }),
      metadata: body.metadata ? JSON.stringify(body.metadata) : entity.metadata,
    },
  });

  // Update live engine
  const engine = getWorldStateEngine();
  if (body.position || body.velocity || body.status) {
    try {
      engine.updateEntity(id, {
        position: body.position,
        velocity: body.velocity,
        status: body.status,
      });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ success: true, entity: updated });
}

// DELETE /api/entities/[id]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.twinEntity.delete({ where: { id } });

  const engine = getWorldStateEngine();
  try { engine.removeEntity(id); } catch { /* ignore */ }

  return NextResponse.json({ success: true });
}
