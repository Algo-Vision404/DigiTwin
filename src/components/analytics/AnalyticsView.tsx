'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Brain, Zap, AlertTriangle, TrendingUp, BarChart3, Shield,
  CheckCircle2, Target, Sparkles, RefreshCw,
  Route, Calendar, Battery, GitBranch
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';
import type { PredictionResult, AIRecommendation, Anomaly } from '@/types';

// Shape returned by the /api/analytics endpoint
interface RLAgentData {
  statesExplored: number;
  totalUpdates: number;
  averageReward: number;
  explorationRate: number;
  convergenceProgress: number;
}

interface AnalyticsResponse {
  predictions: PredictionResult[];
  rlAgent: RLAgentData | null;
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-500 text-black',
  low: 'bg-slate-500 text-white',
};

const recIcons: Record<string, React.ElementType> = {
  routing: Route,
  scheduling: Calendar,
  energy: Battery,
  bottleneck: GitBranch,
};

const severityVariant = (severity: string): 'destructive' | 'outline' => {
  return severity === 'critical' ? 'destructive' : 'outline';
};

export function AnalyticsView() {
  const { recommendations, anomalies, predictions } = useSimulationStore();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Manual refresh with loading feedback (called from button onClick)
  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data: AnalyticsResponse = await res.json();
        setAnalyticsData(data);
      }
    } catch {
      // silent — analytics endpoint may not be ready yet
    }
    setLoading(false);
  }, []);

  // Initial fetch on mount — setState only fires after await (async callbacks)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/analytics');
        if (cancelled || !res.ok) return;
        const data: AnalyticsResponse = await res.json();
        if (!cancelled) setAnalyticsData(data);
      } catch {
        // silent
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const pendingRecs = recommendations.filter(r => r.status === 'pending');
  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' && !a.isResolved);
  const unresolvedAnomalies = anomalies.filter(a => !a.isResolved);

  // Use store predictions if analytics API hasn't returned yet
  const displayPredictions = analyticsData?.predictions ?? predictions;

  // Average confidence across displayed predictions
  const avgConfidence = displayPredictions.length > 0
    ? displayPredictions.reduce((sum, p) => sum + p.confidence, 0) / displayPredictions.length
    : 0;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-bold">AI Decision &amp; Optimization Layer</h2>
            <p className="text-[11px] text-muted-foreground">
              Predictive analytics, reinforcement learning, and autonomous optimization
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={fetchAnalytics} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh Analysis
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Active Recommendations</div>
              <div className="text-lg font-bold font-mono">{pendingRecs.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Critical Anomalies</div>
              <div className="text-lg font-bold font-mono">{criticalAnomalies.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Avg Confidence</div>
              <div className="text-lg font-bold font-mono">
                {displayPredictions.length > 0 ? `${Math.round(avgConfidence * 100)}%` : '--'}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">RL States Explored</div>
              <div className="text-lg font-bold font-mono">
                {analyticsData?.rlAgent?.statesExplored ?? '--'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
        {/* Predictions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              Predictive Analytics
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="max-h-[440px]">
              {displayPredictions.length > 0 ? (
                <div className="space-y-3">
                  {displayPredictions.map((pred, i) => (
                    <div key={`${pred.type}-${i}`} className="p-3 rounded-md bg-muted/30 border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium capitalize">{pred.type} Forecast</span>
                        <Badge
                          variant={pred.impact === 'high' ? 'destructive' : pred.impact === 'medium' ? 'default' : 'outline'}
                          className="text-[9px]"
                        >
                          {pred.impact}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                          <div className="text-[9px] text-muted-foreground">Predicted</div>
                          <div className="text-sm font-mono font-bold">
                            {typeof pred.value === 'number' ? pred.value.toFixed(1) : pred.value}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground">Confidence</div>
                          <div className="text-sm font-mono font-bold">
                            {Math.round(pred.confidence * 100)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[9px] text-muted-foreground">Timeframe</div>
                          <div className="text-sm font-mono font-bold">{pred.timeframe}</div>
                        </div>
                      </div>
                      <Progress value={pred.confidence * 100} className="h-1 mb-2" />
                      {pred.recommendations && pred.recommendations.length > 0 && (
                        <div className="space-y-1">
                          {pred.recommendations.map((rec, j) => (
                            <div key={j} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                              <Zap className="w-2.5 h-2.5 text-amber-500 mt-0.5 shrink-0" />
                              {rec}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Loading predictions...
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recommendations */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                AI Recommendations
              </span>
              <Badge variant="outline" className="text-[9px]">
                {pendingRecs.length} pending
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="max-h-[440px]">
              <div className="space-y-2">
                {pendingRecs.map(rec => {
                  const Icon = recIcons[rec.type] || Zap;
                  return (
                    <div
                      key={rec.id}
                      className="p-3 rounded-md bg-muted/30 border border-border hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs font-medium">{rec.title}</span>
                        </div>
                        <Badge
                          className={`text-[8px] ${priorityColors[rec.priority] || priorityColors.low}`}
                        >
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2 line-clamp-2">
                        {rec.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Target className="w-2.5 h-2.5" />
                            {Math.round(rec.confidence * 100)}%
                          </span>
                          <span className="capitalize">{rec.type}</span>
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground">
                          {new Date(rec.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {pendingRecs.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    No pending recommendations
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Anomaly Detection */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-red-400" />
                Anomaly Detection
              </span>
              <Badge variant="outline" className="text-[9px]">
                {unresolvedAnomalies.length} active
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="max-h-[440px]">
              <div className="space-y-2">
                {unresolvedAnomalies.slice(0, 20).map((anomaly, idx) => (
                  <div
                    key={anomaly.id || `anomaly-${idx}`}
                    className={`p-2.5 rounded-md border ${
                      anomaly.severity === 'critical'
                        ? 'bg-red-500/10 border-red-500/20'
                        : anomaly.severity === 'high'
                          ? 'bg-orange-500/10 border-orange-500/20'
                          : anomaly.severity === 'medium'
                            ? 'bg-amber-500/10 border-amber-500/20'
                            : 'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize">{anomaly.type}</span>
                      <Badge
                        variant={severityVariant(anomaly.severity)}
                        className="text-[8px]"
                      >
                        {anomaly.severity}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{anomaly.description}</p>
                  </div>
                ))}
                {unresolvedAnomalies.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    No active anomalies
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* RL Agent */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
              Reinforcement Learning Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ScrollArea className="max-h-[440px]">
              {analyticsData?.rlAgent ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded p-2.5">
                      <div className="text-[9px] text-muted-foreground mb-0.5">States Explored</div>
                      <div className="text-sm font-mono font-bold">
                        {analyticsData.rlAgent.statesExplored.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded p-2.5">
                      <div className="text-[9px] text-muted-foreground mb-0.5">Total Updates</div>
                      <div className="text-sm font-mono font-bold">
                        {analyticsData.rlAgent.totalUpdates.toLocaleString()}
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded p-2.5">
                      <div className="text-[9px] text-muted-foreground mb-0.5">Avg Reward</div>
                      <div className="text-sm font-mono font-bold">
                        {analyticsData.rlAgent.averageReward.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded p-2.5">
                      <div className="text-[9px] text-muted-foreground mb-0.5">Exploration Rate</div>
                      <div className="text-sm font-mono font-bold">
                        {(analyticsData.rlAgent.explorationRate * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Convergence Progress</div>
                    <Progress
                      value={Math.round((analyticsData.rlAgent.convergenceProgress || 0) * 100)}
                      className="h-2"
                    />
                    <div className="text-[9px] text-muted-foreground mt-0.5 font-mono">
                      {Math.round((analyticsData.rlAgent.convergenceProgress || 0) * 100)}% converged
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Loading RL agent stats...
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
