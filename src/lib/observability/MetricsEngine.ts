import { SystemMetric, GPUStatus, KPIData } from '@/types';
import { getWorldStateEngine } from '@/lib/engine/WorldStateEngine';
import { getSimulationEngine } from '@/lib/simulation/SimulationEngine';

export class MetricsEngine {
  private metrics: Map<string, Array<{ value: number; timestamp: number }>> = new Map();
  private maxDataPoints = 200;
  private alertRules: Array<{ name: string; metric: string; threshold: number; severity: string; cooldown: number; lastTriggered: number }> = [];

  recordMetric(name: string, value: number, unit: string = '', labels: Record<string, string> = {}): SystemMetric {
    if (!this.metrics.has(name)) this.metrics.set(name, []);
    const data = this.metrics.get(name)!;
    data.push({ value, timestamp: Date.now() });
    if (data.length > this.maxDataPoints) data.shift();

    this.checkAlertRules(name, value);

    return { name, value, unit, labels, timestamp: Date.now() };
  }

  getMetric(name: string): Array<{ value: number; timestamp: number }> {
    return this.metrics.get(name) || [];
  }

  getLatestMetric(name: string): number | null {
    const data = this.metrics.get(name);
    return data && data.length > 0 ? data[data.length - 1].value : null;
  }

  addAlertRule(name: string, metric: string, threshold: number, severity: string = 'warning', cooldown: number = 300): void {
    this.alertRules.push({ name, metric, threshold, severity, cooldown, lastTriggered: 0 });
  }

  private checkAlertRules(metricName: string, value: number): void {
    const now = Date.now();
    this.alertRules.forEach(rule => {
      if (rule.metric === metricName && value > rule.threshold && (now - rule.lastTriggered) > rule.cooldown * 1000) {
        rule.lastTriggered = now;
        console.warn(`[ALERT] ${rule.name}: ${metricName} = ${value} (threshold: ${rule.threshold})`);
      }
    });
  }

  getSystemMetrics(): SystemMetric[] {
    const metrics: SystemMetric[] = [];
    const mem = process.memoryUsage();
    metrics.push({ name: 'memory_heap_used', value: Math.round(mem.heapUsed / 1024 / 1024), unit: 'MB', labels: {}, timestamp: Date.now() });
    metrics.push({ name: 'memory_heap_total', value: Math.round(mem.heapTotal / 1024 / 1024), unit: 'MB', labels: {}, timestamp: Date.now() });
    metrics.push({ name: 'memory_rss', value: Math.round(mem.rss / 1024 / 1024), unit: 'MB', labels: {}, timestamp: Date.now() });
    return metrics;
  }

  getSimulatedGPUStatus(): GPUStatus {
    return {
      utilization: 35 + Math.random() * 45,
      memoryUsed: 4000 + Math.random() * 6000,
      memoryTotal: 24576,
      temperature: 45 + Math.random() * 25,
      powerUsage: 120 + Math.random() * 200,
      activeTasks: ['physics_sim', 'pathfinding', 'inference'],
    };
  }

  getDashboardKPIs(): KPIData[] {
    const worldEngine = getWorldStateEngine();
    const simEngine = getSimulationEngine();
    const entities = worldEngine.getAllEntities();
    const simState = simEngine.getState();
    const activeEntities = entities.filter(e => e.status === 'active').length;
    const totalEntities = entities.length;

    // --- Simulation Tick Rate ---
    const avgTickDuration = simState?.metrics?.averageTickDuration ?? 0;
    const tickRate = avgTickDuration > 0 ? Math.round(1000 / avgTickDuration) : 0;

    // --- System Uptime (seconds since sim start) ---
    const uptimeSeconds = simState?.startTime
      ? Math.round((Date.now() - simState.startTime) / 1000)
      : 0;
    const uptimeFormatted = uptimeSeconds >= 3600
      ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
      : uptimeSeconds >= 60
        ? `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`
        : `${uptimeSeconds}s`;

    // --- Event Throughput ---
    const eventThroughputData = this.getMetric('event_throughput');
    const recentThroughput = eventThroughputData.length > 0
      ? Math.round(eventThroughputData.slice(-10).reduce((s, d) => s + d.value, 0) / Math.min(eventThroughputData.length, 10))
      : (simState?.metrics?.eventsPerSecond ?? 0);

    // --- Anomaly Count ---
    const anomalyData = this.getMetric('active_anomalies');
    const anomalyCount = anomalyData.length > 0 ? Math.round(anomalyData[anomalyData.length - 1].value) : 0;

    // --- Active Telemetry Streams ---
    const telemetryStreams = activeEntities; // Each active entity produces telemetry

    // --- Derived statuses ---
    const entityStatus = totalEntities === 0 ? 'warning' : 'normal';
    const tickRateStatus = tickRate > 0 && tickRate < 10 ? 'warning' : 'normal';
    const throughputStatus = recentThroughput < 5 ? 'warning' : 'normal';
    const anomalyStatus = anomalyCount > 3 ? 'warning' : anomalyCount > 0 ? 'normal' : 'normal';
    const telemetryStatus = telemetryStreams < 5 ? 'warning' : 'normal';

    return [
      {
        label: 'Total Entities',
        value: totalEntities,
        unit: '',
        change: activeEntities > 0 ? Math.round((activeEntities / Math.max(totalEntities, 1)) * 100) : 0,
        changeDirection: totalEntities > 0 ? 'up' : 'stable',
        status: entityStatus,
      },
      {
        label: 'Active Telemetry Streams',
        value: telemetryStreams,
        unit: 'streams',
        change: Math.round(Math.random() * 2),
        changeDirection: 'up',
        status: telemetryStatus,
      },
      {
        label: 'Simulation Tick Rate',
        value: tickRate,
        unit: 'tps',
        change: avgTickDuration > 0 ? -0.5 : 0,
        changeDirection: avgTickDuration > 0 ? 'down' : 'stable',
        status: tickRateStatus,
      },
      {
        label: 'System Uptime',
        value: uptimeSeconds,
        unit: 's',
        change: 0,
        changeDirection: 'up',
        status: 'normal',
      },
      {
        label: 'Event Throughput',
        value: recentThroughput,
        unit: 'evt/s',
        change: -1.2,
        changeDirection: 'down',
        status: throughputStatus,
      },
      {
        label: 'Anomaly Count',
        value: anomalyCount,
        unit: '',
        change: anomalyCount > 0 ? 1 : 0,
        changeDirection: anomalyCount > 0 ? 'up' : 'stable',
        status: anomalyStatus,
      },
    ];
  }

  getAllMetricHistory(): Record<string, Array<{ value: number; timestamp: number }>> {
    const result: Record<string, Array<{ value: number; timestamp: number }>> = {};
    this.metrics.forEach((data, name) => { result[name] = [...data]; });
    return result;
  }
}

let metricsInstance: MetricsEngine | null = null;
export function getMetricsEngine(): MetricsEngine {
  if (!metricsInstance) {
    metricsInstance = new MetricsEngine();
    metricsInstance.addAlertRule('High Memory Usage', 'memory_heap_used', 500, 'critical');
    metricsInstance.addAlertRule('High GPU Temp', 'gpu_temperature', 80, 'warning');
    metricsInstance.addAlertRule('High Event Latency', 'sim_latency', 50, 'warning');
  }
  return metricsInstance;
}
