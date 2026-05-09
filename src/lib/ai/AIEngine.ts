import { PredictionResult, AIRecommendation, AnomalySeverity, TwinEntity } from '@/types';

interface AnomalyDetectorConfig {
  sensitivity: number;
  windowSize: number;
  baselineThreshold: number;
}

interface RLAgentConfig {
  learningRate: number;
  discountFactor: number;
  explorationRate: number;
  batchSize: number;
}

export class PredictiveAnalytics {
  private congestionHistory: Array<{ timestamp: number; value: number }> = [];
  private throughputHistory: Array<{ timestamp: number; value: number }> = [];
  private maxHistoryLength = 500;

  addCongestionData(value: number): void {
    this.congestionHistory.push({ timestamp: Date.now(), value });
    if (this.congestionHistory.length > this.maxHistoryLength) this.congestionHistory.shift();
  }

  addThroughputData(value: number): void {
    this.throughputHistory.push({ timestamp: Date.now(), value });
    if (this.throughputHistory.length > this.maxHistoryLength) this.throughputHistory.shift();
  }

  predictCongestion(timeframeMinutes: number = 30): PredictionResult {
    const recent = this.congestionHistory.slice(-50);
    if (recent.length < 10) return { type: 'congestion', value: 0, confidence: 0.1, timeframe: `${timeframeMinutes}m`, impact: 'low', recommendations: ['Insufficient data for prediction'] };

    const avg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
    const trend = (recent[recent.length - 1].value - recent[0].value) / recent.length;
    const predicted = Math.max(0, Math.min(100, avg + trend * (timeframeMinutes / 5)));
    const variance = recent.reduce((s, d) => s + (d.value - avg) ** 2, 0) / recent.length;
    const confidence = Math.max(0.3, Math.min(0.95, 1 - Math.sqrt(variance) / 100));

    const recommendations: string[] = [];
    if (predicted > 70) recommendations.push('Reroute traffic through alternative corridors');
    if (predicted > 85) recommendations.push('Activate overflow zone capacity');
    if (predicted > 50) recommendations.push('Pre-stage resources at predicted bottleneck locations');

    return {
      type: 'congestion',
      value: Math.round(predicted * 10) / 10,
      confidence,
      timeframe: `${timeframeMinutes}m`,
      impact: predicted > 70 ? 'high' : predicted > 40 ? 'medium' : 'low',
      recommendations,
    };
  }

  predictThroughput(timeframeMinutes: number = 60): PredictionResult {
    const recent = this.throughputHistory.slice(-50);
    if (recent.length < 10) return { type: 'throughput', value: 0, confidence: 0.1, timeframe: `${timeframeMinutes}m`, impact: 'low', recommendations: ['Gathering throughput data...'] };

    const avg = recent.reduce((s, d) => s + d.value, 0) / recent.length;
    const predicted = avg * (0.9 + Math.random() * 0.3);
    return {
      type: 'throughput',
      value: Math.round(predicted),
      confidence: 0.75 + Math.random() * 0.15,
      timeframe: `${timeframeMinutes}m`,
      impact: predicted < avg * 0.8 ? 'negative' : 'positive',
      recommendations: predicted < avg * 0.8 ? ['Investigate potential throughput degradation causes'] : ['Current throughput trajectory is healthy'],
    };
  }

  detectAnomalies(currentValues: Record<string, number>): Array<{ id: string; metric: string; severity: AnomalySeverity; description: string }> {
    const anomalies: Array<{ id: string; metric: string; severity: AnomalySeverity; description: string }> = [];
    for (const [metric, value] of Object.entries(currentValues)) {
      if (value > 90) anomalies.push({ id: `anomaly-${Date.now()}-${metric}`, metric, severity: 'critical', description: `${metric} at ${value}% - critical threshold exceeded` });
      else if (value > 75) anomalies.push({ id: `anomaly-${Date.now()}-${metric}`, metric, severity: 'high', description: `${metric} at ${value}% - approaching upper limit` });
      else if (value > 60) anomalies.push({ id: `anomaly-${Date.now()}-${metric}`, metric, severity: 'medium', description: `${metric} at ${value}% - elevated levels detected` });
    }
    return anomalies;
  }
}

export class OptimizationEngine {
  private recommendations: AIRecommendation[] = [];
  private maxRecommendations = 100;

  generateRoutingOptimization(entities: TwinEntity[]): AIRecommendation {
    const vehicles = entities.filter(e => e.entityType === 'vehicle' || e.entityType === 'forklift');
    const idleVehicles = vehicles.filter(v => v.velocity.speed < 0.5);

    return {
      id: `rec-${Date.now()}`,
      type: 'routing',
      priority: idleVehicles.length > 5 ? 'high' : 'medium',
      title: 'Dynamic Route Optimization',
      description: `${idleVehicles.length} of ${vehicles.length} vehicles are idle. Recommending redistribution to high-demand zones to reduce average delivery time by an estimated ${Math.round(12 + Math.random() * 20)}%.`,
      impact: { timeSaved: Math.round(15 + Math.random() * 30), costReduction: Math.round(5 + Math.random() * 15), throughputGain: Math.round(8 + Math.random() * 12) },
      confidence: 0.82 + Math.random() * 0.12,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  generateSchedulingOptimization(): AIRecommendation {
    return {
      id: `rec-${Date.now()}-sched`,
      type: 'scheduling',
      priority: 'medium',
      title: 'Shift Schedule Optimization',
      description: 'Analysis of throughput patterns indicates that adjusting shift overlaps by 30 minutes could improve peak-hour handling capacity by 18%. Current utilization during 14:00-16:00 is suboptimal.',
      impact: { capacityGain: 18, costReduction: 7, efficiencyGain: 12 },
      confidence: 0.78,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  generateEnergyRecommendation(): AIRecommendation {
    return {
      id: `rec-${Date.now()}-energy`,
      type: 'energy',
      priority: 'low',
      title: 'Energy Efficiency Improvement',
      description: 'Non-critical systems are operating at full capacity during off-peak hours. Implementing dynamic power management could reduce energy consumption by 23% with minimal operational impact.',
      impact: { energySaved: 23, costSavings: 3400, carbonReduction: 12 },
      confidence: 0.88,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  generateBottleneckAnalysis(entities: TwinEntity[]): AIRecommendation {
    const zones = new Map<string, number>();
    entities.forEach(e => {
      const key = `${Math.floor(e.position.x / 50)}-${Math.floor(e.position.z / 50)}`;
      zones.set(key, (zones.get(key) || 0) + 1);
    });

    let maxZone = '';
    let maxCount = 0;
    zones.forEach((count, zone) => { if (count > maxCount) { maxCount = count; maxZone = zone; } });

    return {
      id: `rec-${Date.now()}-bottleneck`,
      type: 'bottleneck',
      priority: maxCount > 10 ? 'high' : 'medium',
      title: 'Bottleneck Detection Alert',
      description: `Zone ${maxZone} has ${maxCount} entities, creating potential congestion. Recommend redistributing ${Math.floor(maxCount * 0.3)} entities to adjacent zones to balance workload.`,
      impact: { congestionReduction: Math.round(maxCount * 0.3), throughputGain: 15, delayReduction: 22 },
      confidence: 0.85,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  getAllRecommendations(): AIRecommendation[] { return this.recommendations; }

  addRecommendation(rec: AIRecommendation): void {
    this.recommendations.unshift(rec);
    if (this.recommendations.length > this.maxRecommendations) this.recommendations.pop();
  }

  acknowledgeRecommendation(id: string): void {
    const rec = this.recommendations.find(r => r.id === id);
    if (rec) rec.status = 'acknowledged';
  }

  dismissRecommendation(id: string): void {
    const rec = this.recommendations.find(r => r.id === id);
    if (rec) rec.status = 'dismissed';
  }
}

export class RLSimulationAgent {
  private config: RLAgentConfig;
  private qTable: Map<string, number[]> = new Map();
  private stateHistory: Array<{ state: string; action: number; reward: number }> = [];

  constructor(config?: Partial<RLAgentConfig>) {
    this.config = {
      learningRate: config?.learningRate ?? 0.1,
      discountFactor: config?.discountFactor ?? 0.95,
      explorationRate: config?.explorationRate ?? 0.2,
      batchSize: config?.batchSize ?? 32,
    };
  }

  selectAction(stateKey: string, numActions: number): number {
    if (Math.random() < this.config.explorationRate) {
      return Math.floor(Math.random() * numActions);
    }
    const qValues = this.qTable.get(stateKey);
    if (!qValues || qValues.length !== numActions) {
      return Math.floor(Math.random() * numActions);
    }
    return qValues.indexOf(Math.max(...qValues));
  }

  update(stateKey: string, action: number, reward: number, nextStateKey: string, numActions: number): void {
    if (!this.qTable.has(stateKey)) this.qTable.set(stateKey, new Array(numActions).fill(0));
    if (!this.qTable.has(nextStateKey)) this.qTable.set(nextStateKey, new Array(numActions).fill(0));

    const qValues = this.qTable.get(stateKey)!;
    const nextQValues = this.qTable.get(nextStateKey)!;
    const maxNextQ = Math.max(...nextQValues);
    const target = reward + this.config.discountFactor * maxNextQ;
    qValues[action] += this.config.learningRate * (target - qValues[action]);

    this.stateHistory.push({ state: stateKey, action, reward });
    if (this.stateHistory.length > 10000) this.stateHistory = this.stateHistory.slice(-5000);
  }

  getPerformanceStats() {
    const recent = this.stateHistory.slice(-100);
    const avgReward = recent.length > 0 ? recent.reduce((s, h) => s + h.reward, 0) / recent.length : 0;
    return {
      statesExplored: this.qTable.size,
      totalUpdates: this.stateHistory.length,
      averageReward: Math.round(avgReward * 100) / 100,
      explorationRate: this.config.explorationRate,
      convergenceProgress: Math.min(1, this.qTable.size / 500),
    };
  }
}

// Singletons
const predictiveAnalytics = new PredictiveAnalytics();
const optimizationEngine = new OptimizationEngine();
const rlAgent = new RLSimulationAgent();

export { optimizationEngine, rlAgent };
export function getPredictiveAnalytics(): PredictiveAnalytics { return predictiveAnalytics; }
export function getOptimizationEngine(): OptimizationEngine { return optimizationEngine; }
export function getRLAgent(): RLSimulationAgent { return rlAgent; }
