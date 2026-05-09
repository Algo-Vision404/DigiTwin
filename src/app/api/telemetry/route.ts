import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';
import { getMetricsEngine } from '@/lib/observability/MetricsEngine';
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';

// POST /api/telemetry - Ingest telemetry data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityId, sensorType, source, value, unit, quality, metadata, batch } = body;

    const engine = getWorldStateEngine();
    const metrics = getMetricsEngine();
    const results: unknown[] = [];

    const processEvent = async (event: Record<string, unknown>) => {
      // Validate required fields
      if (!event.entityId || event.value === undefined || !event.sensorType) {
        return { status: 'rejected', reason: 'Missing required fields: entityId, sensorType, value' };
      }

      // Store in database
      await db.telemetryEvent.create({
        data: {
          entityId: event.entityId as string,
          sensorType: event.sensorType as string,
          source: (event.source as string) || 'api',
          value: Number(event.value),
          unit: event.unit as string || null,
          quality: Number(event.quality) || 100,
          metadata: JSON.stringify(event.metadata || {}),
          isProcessed: true,
          partitionKey: event.entityId as string,
        },
      });

      // Update entity state if it exists
      const entity = engine.getEntity(event.entityId as string);
      if (entity) {
        const updates: Record<string, unknown> = { lastUpdate: Date.now() };
        if (event.sensorType === 'gps') {
          const coords = (event.metadata as Record<string, unknown>)?.coordinates as { lat: number; lng: number } || null;
          if (coords) {
            updates.position = { x: coords.lng, y: 0, z: coords.lat };
          }
        }
        engine.updateEntity(event.entityId as string, updates);
      }

      // Record metrics
      metrics.recordMetric(`telemetry_${event.sensorType}`, Number(event.value), event.unit as string || '');
      metrics.recordMetric('event_throughput', 1, 'evt');

      return { status: 'ingested', entityId: event.entityId, sensorType: event.sensorType };
    };

    if (batch && Array.isArray(batch)) {
      // Batch processing
      for (const event of batch) {
        results.push(await processEvent(event));
      }
    } else {
      results.push(await processEvent(body));
    }

    return NextResponse.json({ success: true, processed: results.length, results }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// GET /api/telemetry - Query telemetry events (DB + live simulation buffer)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const sensorType = searchParams.get('sensorType');
    const limit = parseInt(searchParams.get('limit') || '100');
    const since = searchParams.get('since');

    // Query persisted events from DB
    const where: Record<string, unknown> = {};
    if (entityId) where.entityId = entityId;
    if (sensorType) where.sensorType = sensorType;
    if (since) where.timestamp = { gte: new Date(since) };

    const dbEvents = await db.telemetryEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 1000),
    });

    // Also pull recent live telemetry from the simulation engine buffer
    let liveTelemetry: Array<{ entityId: string; sensorType: string; value: number; unit: string; timestamp: number }> = [];
    try {
      const simEngine = getSimulationEngine();
      const buffer = simEngine.getTelemetryBuffer(Math.min(limit, 200));
      // Filter by query params if provided
      liveTelemetry = buffer.filter((t) => {
        if (entityId && t.entityId !== entityId) return false;
        if (sensorType && t.sensorType !== sensorType) return false;
        return true;
      });
    } catch {
      // Simulation engine not initialized – return only DB data
    }

    return NextResponse.json({
      success: true,
      count: dbEvents.length + liveTelemetry.length,
      events: dbEvents,
      liveTelemetry,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
