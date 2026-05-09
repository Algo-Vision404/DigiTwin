import { NextRequest, NextResponse } from 'next/server';
import { getScenarioEngine } from '@/lib/scenarios/ScenarioEngine';

// GET /api/scenarios - List scenarios
export async function GET() {
  try {
    const engine = getScenarioEngine();
    const branches = engine.getBranchResults('all');
    return NextResponse.json({ success: true, branches: branches.length, results: branches });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/scenarios - Execute scenario
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, description, parameters, monteCarloRuns } = body;

    if (!type || !name) {
      return NextResponse.json({ success: false, error: 'Missing required fields: type, name' }, { status: 400 });
    }

    const engine = getScenarioEngine();
    const result = await engine.executeScenario({
      type,
      name,
      description: description || '',
      parameters: parameters || {},
      monteCarloRuns: monteCarloRuns || 10,
      maxBranches: 20,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
