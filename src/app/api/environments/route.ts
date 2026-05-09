import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/environments
export async function GET() {
  try {
    const environments = await db.twinEnvironment.findMany({ orderBy: { updatedAt: 'desc' } });
    return NextResponse.json({ success: true, environments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/environments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, type, config } = body;
    const env = await db.twinEnvironment.create({
      data: {
        name,
        description: description || null,
        type: type || 'warehouse',
        config: JSON.stringify(config || {}),
      },
    });
    return NextResponse.json({ success: true, environment: env }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
