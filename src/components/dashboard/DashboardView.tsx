'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Zap, Box, AlertTriangle, Cpu, Radio, Gauge, TrendingUp, TrendingDown, Minus, Brain } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';
import { MiniChart } from '@/components/common/MiniChart';

export function DashboardView() {
  const { kpis, entities, simulationMetrics, currentTick, anomalies, recommendations, simulationStatus } = useSimulationStore();

  const getTrendIcon = (direction: string) => {
    if (direction === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
    if (direction === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'normal') return 'text-emerald-500';
    if (status === 'warning') return 'text-amber-500';
    return 'text-red-500';
  };

  const activeEntities = entities.filter(e => e.status === 'active');
  const entityTypes = [...new Set(entities.map(e => e.entityType))];
  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' && !a.isResolved);
  const pendingRecs = recommendations.filter(r => r.status === 'pending');

  return (
    <div className="space-y-4 h-full">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card border-border">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
                {getTrendIcon(kpi.changeDirection)}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold font-mono">{typeof kpi.value === 'number' ? (kpi.value > 999 ? (kpi.value / 1000).toFixed(1) + 'k' : kpi.value) : kpi.value}</span>
                {kpi.unit && <span className="text-xs text-muted-foreground">{kpi.unit}</span>}
              </div>
              <div className={`text-[10px] font-mono mt-1 ${getStatusColor(kpi.status)}`}>
                {kpi.change > 0 ? '+' : ''}{kpi.change}% from baseline
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Simulation Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Simulation Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Status</div>
                <Badge variant={simulationStatus === 'running' ? 'default' : 'outline'} className="text-[10px]">
                  <div className={`w-1.5 h-1.5 rounded-full mr-1 ${simulationStatus === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
                  {simulationStatus}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase">Current Tick</div>
                <span className="text-sm font-mono font-bold">#{currentTick}</span>
              </div>
              {simulationMetrics && (
                <>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase">Entities</div>
                    <span className="text-sm font-mono">{simulationMetrics.entitiesProcessed}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase">Avg Tick</div>
                    <span className="text-sm font-mono">{simulationMetrics.averageTickDuration.toFixed(2)}ms</span>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase">GPU Util</div>
                    <div className="flex items-center gap-1.5">
                      <Cpu className="w-3 h-3 text-amber-500" />
                      <span className="text-sm font-mono text-amber-500">{Math.round(simulationMetrics.gpuUtilization)}%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase">Events/s</div>
                    <span className="text-sm font-mono">{simulationMetrics.eventsPerSecond}</span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Entity Overview */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Box className="w-3.5 h-3.5 text-primary" />
              Entity Overview
              <Badge variant="outline" className="ml-auto text-[10px] font-mono">{entities.length} total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {entityTypes.slice(0, 6).map(type => {
                const count = entities.filter(e => e.entityType === type).length;
                const active = entities.filter(e => e.entityType === type && e.status === 'active').length;
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs capitalize">{type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(count / entities.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">{active}/{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Alerts & Recommendations */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-primary" />
              AI Insights
              <Badge variant="outline" className="ml-auto text-[10px]">{pendingRecs.length} pending</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="max-h-[180px]">
              <div className="space-y-2">
                {criticalAnomalies.length > 0 && criticalAnomalies.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[11px] font-medium text-red-400">{a.type}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-2">{a.description}</div>
                    </div>
                  </div>
                ))}
                {pendingRecs.slice(0, 3).map(rec => (
                  <div key={rec.id} className="flex items-start gap-2 p-2 rounded-md bg-primary/5 border border-primary/10">
                    <Zap className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[11px] font-medium">{rec.title}</div>
                      <div className="text-[10px] text-muted-foreground">{Math.round(rec.confidence * 100)}% confidence</div>
                    </div>
                  </div>
                ))}
                {criticalAnomalies.length === 0 && pendingRecs.length === 0 && (
                  <div className="text-center py-4 text-xs text-muted-foreground">
                    All systems operating normally
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* System metrics charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Gauge className="w-3.5 h-3.5 text-primary" />
              Event Throughput
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <MiniChart dataKey="event_throughput" color="hsl(160, 72%, 45%)" height={120} />
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-amber-500" />
              GPU Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <MiniChart dataKey="gpu_utilization" color="hsl(45, 93%, 47%)" height={120} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
