import { NextRequest, NextResponse } from 'next/server';
import { getPredictiveAnalytics } from '@/lib/ai/AIEngine';
import { getOptimizationEngine } from '@/lib/ai/AIEngine';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';
import { getMetricsEngine } from '@/lib/observability/MetricsEngine';

// GET /api/analytics - Get all analytics
export async function GET() {
  try {
    const predictive = getPredictiveAnalytics();
    const optimization = getOptimizationEngine();
    const worldEngine = getWorldStateEngine();
    const metrics = getMetricsEngine();

    // Feed current data into prediction models
    const entities = worldEngine.getAllEntities();
    const congestionLevel = Math.min(100, (entities.length / 50) * 100 + Math.random() * 20);
    const throughput = 80 + Math.random() * 40;
    predictive.addCongestionData(congestionLevel);
    predictive.addThroughputData(throughput);

    // Generate predictions
    const congestionPrediction = predictive.predictCongestion(30);
    const throughputPrediction = predictive.predictThroughput(60);

    // Detect anomalies
    const systemMetrics = {
      memoryUsage: metrics.getLatestMetric('memory_heap_used') || 50,
      gpuUtilization: metrics.getSimulatedGPUStatus().utilization,
      eventLatency: Math.random() * 30 + 5,
      queuePressure: Math.random() * 40 + 10,
    };
    const anomalies = predictive.detectAnomalies(systemMetrics);

    // Generate recommendations
    const routingRec = optimization.generateRoutingOptimization(entities);
    const schedulingRec = optimization.generateSchedulingOptimization();
    const energyRec = optimization.generateEnergyRecommendation();
    const bottleneckRec = optimization.generateBottleneckAnalysis(entities);

    // RL agent stats
    const { getRLAgent } = await import('@/lib/ai/AIEngine');
    const rlAgent = getRLAgent();
    const rlStats = rlAgent.getPerformanceStats();

    return NextResponse.json({
      success: true,
      predictions: [congestionPrediction, throughputPrediction],
      anomalies,
      recommendations: [routingRec, schedulingRec, energyRec, bottleneckRec],
      rlAgent: rlStats,
      systemMetrics,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/analytics - Trigger specific analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'generate-recommendations') {
      const optimization = getOptimizationEngine();
      const worldEngine = getWorldStateEngine();
      const entities = worldEngine.getAllEntities();
      const recs = [
        optimization.generateRoutingOptimization(entities),
        optimization.generateSchedulingOptimization(),
        optimization.generateEnergyRecommendation(),
        optimization.generateBottleneckAnalysis(entities),
      ];
      recs.forEach(r => optimization.addRecommendation(r));
      return NextResponse.json({ success: true, recommendations: recs });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
