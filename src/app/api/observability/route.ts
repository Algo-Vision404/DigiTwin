import { NextResponse } from 'next/server';
import { getMetricsEngine } from '@/lib/observability/MetricsEngine';

// GET /api/observability - Get system metrics
export async function GET() {
  try {
    const metrics = getMetricsEngine();
    const systemMetrics = metrics.getSystemMetrics();
    const gpuStatus = metrics.getSimulatedGPUStatus();
    const kpis = metrics.getDashboardKPIs();
    const allMetrics = metrics.getAllMetricHistory();

    return NextResponse.json({
      success: true,
      systemMetrics,
      gpuStatus,
      kpis,
      metricsHistory: allMetrics,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
