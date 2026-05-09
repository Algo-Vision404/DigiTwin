import { ScenarioConfig, ScenarioResult, TwinEntity, WorldState } from '@/types';
import { WorldStateEngine, getWorldStateEngine } from '../engine/WorldStateEngine';

interface BranchResult {
  branchId: string;
  parameters: Record<string, unknown>;
  tickResults: Array<{ tick: number; metrics: Record<string, number> }>;
  finalState: Record<string, unknown>;
  riskScore: number;
  estimatedDelay: number;
  estimatedCost: number;
}

export class ScenarioEngine {
  private branches: Map<string, BranchResult> = new Map();
  private worldEngine: WorldStateEngine;

  constructor(worldEngine: WorldStateEngine) {
    this.worldEngine = worldEngine;
  }

  async executeScenario(config: ScenarioConfig): Promise<ScenarioResult> {
    const numBranches = config.monteCarloRuns || 5;
    const branches: BranchResult[] = [];

    for (let i = 0; i < numBranches; i++) {
      const branch = await this.runBranch(config, i);
      branches.push(branch);
      this.branches.set(branch.branchId, branch);
    }

    // Aggregate results
    const avgRisk = branches.reduce((s, b) => s + b.riskScore, 0) / branches.length;
    const avgDelay = branches.reduce((s, b) => s + b.estimatedDelay, 0) / branches.length;
    const avgCost = branches.reduce((s, b) => s + b.estimatedCost, 0) / branches.length;
    const affectedEntities = new Set<string>();

    branches.forEach(b => {
      const affected = b.finalState.affectedEntities as string[] || [];
      affected.forEach(e => affectedEntities.add(e));
    });

    const recommendations = this.generateRecommendations(config, avgRisk, avgDelay, avgCost);

    return {
      scenarioId: `scenario-${Date.now()}`,
      riskScore: Math.round(avgRisk * 10) / 10,
      estimatedDelay: Math.round(avgDelay * 10) / 10,
      estimatedCost: Math.round(avgCost),
      affectedEntities: Array.from(affectedEntities),
      recommendations,
      confidence: Math.min(0.95, 0.6 + (numBranches * 0.05)),
      completedBranches: branches.length,
      totalBranches: numBranches,
    };
  }

  private async runBranch(config: ScenarioConfig, branchIndex: number): Promise<BranchResult> {
    const branchId = `branch-${config.name}-${branchIndex}-${Date.now()}`;
    const baselineState = this.worldEngine.getState();

    // Simulate perturbed parameters with Monte Carlo variation
    const variation = 0.8 + Math.random() * 0.4; // 80% - 120%
    const perturbedParams: Record<string, unknown> = {};
    Object.entries(config.parameters).forEach(([key, value]) => {
      if (typeof value === 'number') {
        perturbedParams[key] = value * variation;
      } else {
        perturbedParams[key] = value;
      }
    });

    // Run simplified simulation ticks
    const tickResults: Array<{ tick: number; metrics: Record<string, number> }> = [];
    const numTicks = 100;

    let congestion = 30 + Math.random() * 20;
    let throughput = 80 + Math.random() * 20;
    let cost = 0;

    for (let tick = 0; tick < numTicks; tick++) {
      congestion += (Math.random() - 0.4) * 5 * (config.type === 'road-closure' ? 2 : 1);
      congestion = Math.max(0, Math.min(100, congestion));

      throughput -= (congestion - 50) * 0.1;
      throughput = Math.max(10, Math.min(100, throughput));

      cost += 10 + congestion * 0.5 + (throughput < 50 ? 20 : 0);

      if (tick % 10 === 0) {
        tickResults.push({
          tick,
          metrics: { congestion, throughput, cost, entities: Object.keys(baselineState.entities).length },
        });
      }
    }

    // Calculate final results
    const riskScore = Math.min(100, Math.max(0, (congestion - 30) * 2 + (throughput < 50 ? (50 - throughput) * 1.5 : 0)));

    return {
      branchId,
      parameters: perturbedParams,
      tickResults,
      finalState: {
        congestion: Math.round(congestion * 10) / 10,
        throughput: Math.round(throughput * 10) / 10,
        totalCost: Math.round(cost),
        affectedEntities: Object.keys(baselineState.entities).slice(0, Math.floor(Math.random() * 10) + 5),
      },
      riskScore: Math.round(riskScore * 10) / 10,
      estimatedDelay: Math.round(riskScore * 0.5 + Math.random() * 10),
      estimatedCost: Math.round(cost),
    };
  }

  private generateRecommendations(config: ScenarioConfig, risk: number, delay: number, cost: number): string[] {
    const recs: string[] = [];
    switch (config.type) {
      case 'road-closure':
        recs.push('Activate emergency rerouting through corridors B and C');
        recs.push('Increase signage and notification frequency on approach routes');
        if (risk > 50) recs.push('Consider temporary one-lane operation with traffic light control');
        break;
      case 'demand-surge':
        recs.push('Pre-position additional resources at high-demand zones');
        recs.push('Activate overflow capacity in secondary processing areas');
        recs.push('Extend shift hours by 2 hours to handle peak demand');
        break;
      case 'equipment-failure':
        recs.push('Redirect workload to redundant systems immediately');
        recs.push('Schedule emergency maintenance window within 4 hours');
        recs.push('Activate backup equipment from standby pool');
        break;
      case 'weather-event':
        recs.push('Reduce outdoor operations capacity by 40%');
        recs.push('Activate weather-resistant storage protocols');
        recs.push('Pre-position emergency supplies at indoor staging areas');
        break;
      default:
        recs.push('Monitor situation and adjust operational parameters dynamically');
        recs.push('Increase telemetry sampling frequency for affected areas');
    }
    return recs;
  }

  getBranchResults(scenarioId: string): BranchResult[] {
    const results: BranchResult[] = [];
    this.branches.forEach(b => results.push(b));
    return results;
  }
}

// Singleton
let scenarioInstance: ScenarioEngine | null = null;
export function getScenarioEngine(worldEngine?: WorldStateEngine): ScenarioEngine {
  if (!scenarioInstance) {
    scenarioInstance = new ScenarioEngine(worldEngine || getWorldStateEngine());
  }
  return scenarioInstance;
}
