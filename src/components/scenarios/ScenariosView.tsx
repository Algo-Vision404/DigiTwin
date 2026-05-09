'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  FlaskConical, Play, AlertTriangle, Clock, DollarSign, Zap,
  Target, TrendingUp, BarChart3, ChevronDown, Loader2, Shield,
  GitBranch, Activity, XCircle, CheckCircle2
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';
import type { ScenarioResult } from '@/types';

const presetScenarios = [
  {
    type: 'road-closure',
    name: 'Road A Closure',
    description: 'Simulate the closure of the main road between Zone A and Loading Dock',
    parameters: { closureDuration: 120, affectedRoad: 'A', trafficDiversion: 0.6 },
  },
  {
    type: 'demand-surge',
    name: '40% Demand Increase',
    description: 'Simulate a sudden 40% increase in warehouse throughput demand',
    parameters: { demandIncrease: 0.4, duration: 240, zone: 'all' },
  },
  {
    type: 'equipment-failure',
    name: 'Machine 7 Failure',
    description: 'Simulate the failure of processing machine 7 in Zone B',
    parameters: { machineId: 'machine-7', repairTime: 180, capacityLoss: 0.25 },
  },
  {
    type: 'weather-event',
    name: 'Severe Storm',
    description: 'Simulate a severe weather event affecting outdoor operations',
    parameters: { severity: 0.8, duration: 360, outdoorCapacity: 0.3 },
  },
  {
    type: 'staff-shortage',
    name: '30% Staff Shortage',
    description: 'Simulate a 30% reduction in available operational staff',
    parameters: { staffReduction: 0.3, shiftAffected: 'all', overtimeAvailable: 0.15 },
  },
];

const typeLabels: Record<string, { label: string; color: string }> = {
  'road-closure': { label: 'Road Closure', color: 'bg-orange-500' },
  'demand-surge': { label: 'Demand Surge', color: 'bg-emerald-500' },
  'equipment-failure': { label: 'Equipment Failure', color: 'bg-red-500' },
  'weather-event': { label: 'Weather Event', color: 'bg-cyan-500' },
  'staff-shortage': { label: 'Staff Shortage', color: 'bg-purple-500' },
  'custom': { label: 'Custom', color: 'bg-slate-500' },
};

export function ScenariosView() {
  const { entities, addScenarioResult, scenarioHistory } = useSimulationStore();
  const [results, setResults] = useState<ScenarioResult[]>(scenarioHistory);
  const [running, setRunning] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState('road-closure');
  const [customParams, setCustomParams] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const runScenario = async (scenario: typeof presetScenarios[0]) => {
    const key = scenario.name;
    setRunning(key);
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: scenario.type,
          name: scenario.name,
          description: scenario.description,
          parameters: scenario.parameters,
          monteCarloRuns: 10,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          setResults(prev => [data.result, ...prev]);
          addScenarioResult(data.result);
        }
      }
    } catch { /* silent */ }
    setRunning(null);
  };

  const runCustomScenario = async () => {
    if (!customName) return;
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(customParams || '{}');
    } catch {
      params = { impact: 50 };
    }
    setRunning('custom');
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: customType,
          name: customName,
          parameters: params,
          monteCarloRuns: 10,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.result) {
          setResults(prev => [data.result, ...prev]);
          addScenarioResult(data.result);
        }
      }
    } catch { /* silent */ }
    setRunning(null);
    setCustomName('');
    setCustomParams('');
    setShowCustom(false);
  };

  const getRiskColor = (score: number) => {
    if (score > 70) return 'text-red-400';
    if (score > 40) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const getRiskBg = (score: number) => {
    if (score > 70) return 'bg-red-500/10 border-red-500/20';
    if (score > 40) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-emerald-500/10 border-emerald-500/20';
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-bold">Scenario Testing Engine</h2>
            <p className="text-[11px] text-muted-foreground">
              Monte Carlo simulations, branching analysis, and what-if modeling
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowCustom(!showCustom)}>
          {showCustom ? 'Hide Custom' : 'Custom Scenario'}
        </Button>
      </div>

      {/* Custom Scenario Form */}
      {showCustom && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Scenario Name</Label>
                <Input value={customName} onChange={e => setCustomName(e.target.value)} placeholder="e.g., Zone C Flood" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Type</Label>
                <select
                  value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  className="w-full h-8 bg-background border border-input rounded-md px-2 text-xs"
                >
                  {Object.entries(typeLabels).map(([key, val]) => (
                    <option key={key} value={key}>{val.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Parameters (JSON)</Label>
                <Input value={customParams} onChange={e => setCustomParams(e.target.value)} placeholder='{"impact": 50}' className="h-8 text-xs font-mono" />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={runCustomScenario} disabled={!customName || running === 'custom'} className="w-full">
                  {running === 'custom' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                  Run
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preset Scenarios */}
      <div>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preset Scenarios</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {presetScenarios.map(scenario => {
            const typeInfo = typeLabels[scenario.type] || typeLabels['custom'];
            const isRunning = running === scenario.name;
            return (
              <Card key={scenario.name} className="bg-card border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${typeInfo.color}`} />
                      <span className="text-xs font-semibold">{scenario.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px]">{typeInfo.label}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-3">{scenario.description}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-3">
                    <GitBranch className="w-3 h-3" />
                    <span>10 Monte Carlo branches</span>
                    <Separator orientation="vertical" className="h-3" />
                    <BarChart3 className="w-3 h-3" />
                    <span>Sensitivity analysis</span>
                  </div>
                  <Button size="sm" onClick={() => runScenario(scenario)} disabled={isRunning} className="w-full text-xs">
                    {isRunning ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Running...</> : <><Play className="w-3 h-3 mr-1" /> Execute Scenario</>}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Scenario Results ({results.length})
            </div>
          </div>
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-3">
              {results.map((result) => (
                <Card key={result.scenarioId} className={`bg-card border ${getRiskBg(result.riskScore)}`}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5" /> Risk Score
                        </div>
                        <div className={`text-xl font-bold font-mono ${getRiskColor(result.riskScore)}`}>
                          {result.riskScore}
                          <span className="text-xs text-muted-foreground">/100</span>
                        </div>
                        <Progress value={result.riskScore} className="h-1" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" /> Est. Delay
                        </div>
                        <div className="text-xl font-bold font-mono">
                          {result.estimatedDelay}
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                          <DollarSign className="w-2.5 h-2.5" /> Est. Cost
                        </div>
                        <div className="text-xl font-bold font-mono">
                          ${result.estimatedCost.toLocaleString()}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                          <Activity className="w-2.5 h-2.5" /> Affected
                        </div>
                        <div className="text-xl font-bold font-mono">
                          {result.affectedEntities.length}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-1">
                          <Target className="w-2.5 h-2.5" /> Confidence
                        </div>
                        <div className="text-xl font-bold font-mono">
                          {Math.round(result.confidence * 100)}%
                        </div>
                        <Progress value={result.confidence * 100} className="h-1" />
                      </div>
                    </div>

                    {/* Recommendations */}
                    {result.recommendations.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase">AI Recommendations</div>
                        {result.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <Zap className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{rec}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <GitBranch className="w-3 h-3" />
                      <span>{result.completedBranches}/{result.totalBranches} Monte Carlo branches completed</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {results.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-16 flex flex-col items-center justify-center text-muted-foreground">
            <FlaskConical className="w-10 h-10 mb-3 opacity-30" />
            <div className="text-sm font-medium">No scenarios executed yet</div>
            <div className="text-xs mt-1">Select a preset scenario above or create a custom one to begin analysis</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
