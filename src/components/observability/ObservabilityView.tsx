'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Monitor, Cpu, Activity, HardDrive, Clock, AlertTriangle,
  Zap, Wifi, Database, Thermometer, Gauge, Radio,
  RefreshCw, Server, Globe, Shield, TrendingDown, TrendingUp, Minus
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';
import { MiniChart } from '@/components/common/MiniChart';

const metricConfigs = [
  { key: 'event_throughput', label: 'Event Throughput', unit: 'evt/s', icon: Radio, color: 'text-emerald-400', chartColor: 'hsl(160, 72%, 45%)', maxExpected: 2000 },
  { key: 'sim_latency', label: 'Simulation Latency', unit: 'ms', icon: Clock, color: 'text-amber-400', chartColor: 'hsl(45, 93%, 47%)', maxExpected: 50 },
  { key: 'gpu_utilization', label: 'GPU Utilization', unit: '%', icon: Cpu, color: 'text-orange-400', chartColor: 'hsl(24, 95%, 53%)', maxExpected: 100 },
  { key: 'sync_lag', label: 'Sync Lag', unit: 'ms', icon: Wifi, color: 'text-cyan-400', chartColor: 'hsl(190, 72%, 45%)', maxExpected: 20 },
  { key: 'memory_usage', label: 'Memory Usage', unit: 'MB', icon: HardDrive, color: 'text-purple-400', chartColor: 'hsl(270, 50%, 55%)', maxExpected: 512 },
  { key: 'queue_pressure', label: 'Queue Pressure', unit: '%', icon: Database, color: 'text-red-400', chartColor: 'hsl(0, 72%, 50%)', maxExpected: 80 },
];

interface LogEntry {
  timestamp: string;
  level: string;
  source: string;
  message: string;
}

export function ObservabilityView() {
  const { systemMetrics, gpuStatus } = useSimulationStore();
  const [systemData, setSystemData] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/observability');
      if (res.ok) {
        const data = await res.json();
        setSystemData(data);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Simulate log entries
  useEffect(() => {
    const logSources = ['sim-engine', 'ws-gateway', 'ai-engine', 'state-sync', 'gpu-scheduler', 'telemetry-ingest'];
    const logMessages = [
      'Tick processed in 4.2ms',
      'Entity state synchronized across 3 nodes',
      'GPU batch inference completed (128 tensors)',
      'Telemetry event batch ingested (45 events)',
      'Spatial index rebalanced (cell count: 142)',
      'AI recommendation generated (routing optimization)',
      'Anomaly detection scan completed (0 new)',
      'State snapshot saved (version 847)',
      'Websocket broadcast: entity update (35 entities)',
      'Collision detection pass completed (234 checks)',
      'RL agent Q-table updated (state: 127)',
      'Monte Carlo branch completed (risk: 42.3)',
    ];

    const interval = setInterval(() => {
      const newLog: LogEntry = {
        timestamp: new Date().toLocaleTimeString(),
        level: Math.random() > 0.85 ? 'WARN' : Math.random() > 0.95 ? 'ERROR' : 'INFO',
        source: logSources[Math.floor(Math.random() * logSources.length)],
        message: logMessages[Math.floor(Math.random() * logMessages.length)],
      };
      setLogs(prev => [newLog, ...prev].slice(0, 100));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const getMetricValue = (key: string): number => {
    const data = systemMetrics[key];
    return data && data.length > 0 ? data[data.length - 1] : 0;
  };

  const getTrend = (key: string): 'up' | 'down' | 'stable' => {
    const data = systemMetrics[key];
    if (!data || data.length < 5) return 'stable';
    const recent = data.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const older = data.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
    const diff = ((recent - older) / older) * 100;
    return diff > 3 ? 'up' : diff < -3 ? 'down' : 'stable';
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  const isHealthy = (key: string): boolean => {
    const val = getMetricValue(key);
    const config = metricConfigs.find(m => m.key === key);
    if (!config) return true;
    if (key === 'sim_latency' || key === 'sync_lag' || key === 'queue_pressure') {
      return val < config.maxExpected * 0.7;
    }
    return val > 0;
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-bold">System Observability</h2>
            <p className="text-[11px] text-muted-foreground">Metrics, logs, traces, and distributed monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 border-emerald-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            SYSTEM HEALTHY
          </Badge>
          <Button size="sm" variant="ghost" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* GPU Status */}
      {gpuStatus && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-orange-400" />
              GPU Acceleration Layer
              <Badge variant="outline" className="ml-auto text-[9px]">NVIDIA CUDA</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">Utilization</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold font-mono text-orange-400">{Math.round(gpuStatus.utilization)}%</span>
                  <Progress value={gpuStatus.utilization} className="h-1 flex-1" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">VRAM</div>
                <div className="text-sm font-mono">
                  <span className="font-bold">{(gpuStatus.memoryUsed / 1024).toFixed(1)}</span>
                  <span className="text-muted-foreground">/{(gpuStatus.memoryTotal / 1024).toFixed(0)} GB</span>
                </div>
                <Progress value={(gpuStatus.memoryUsed / gpuStatus.memoryTotal) * 100} className="h-1" />
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">Temperature</div>
                <div className="flex items-baseline gap-1">
                  <Thermometer className="w-3 h-3 text-red-400" />
                  <span className={`text-lg font-bold font-mono ${gpuStatus.temperature > 75 ? 'text-red-400' : 'text-amber-400'}`}>
                    {Math.round(gpuStatus.temperature)}°C
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">Memory Pressure</div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-lg font-bold font-mono ${(gpuStatus.memoryUsed / gpuStatus.memoryTotal) > 0.8 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {Math.round((gpuStatus.memoryUsed / gpuStatus.memoryTotal) * 100)}%
                  </span>
                  <Progress value={(gpuStatus.memoryUsed / gpuStatus.memoryTotal) * 100} className="h-1 flex-1" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-muted-foreground uppercase">VRAM Detail</div>
                <div className="text-sm font-mono">
                  <span className="font-bold">{(gpuStatus.memoryUsed / 1024).toFixed(1)}</span>
                  <span className="text-muted-foreground">/{(gpuStatus.memoryTotal / 1024).toFixed(0)} GB</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Metrics Grid */}
        <div className="lg:col-span-2 space-y-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">System Metrics</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {metricConfigs.map(config => {
              const Icon = config.icon;
              const value = getMetricValue(config.key);
              const trend = getTrend(config.key);
              const healthy = isHealthy(config.key);
              return (
                <Card key={config.key} className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium flex items-center gap-1.5">
                        <Icon className={`w-3 h-3 ${config.color}`} />
                        {config.label}
                        {!healthy && <AlertTriangle className="w-3 h-3 text-red-400" />}
                      </span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(trend)}
                        <span className="text-[10px] font-mono text-muted-foreground">{config.unit}</span>
                      </div>
                    </div>
                    <div className="text-xl font-bold font-mono mb-2">
                      {config.key === 'memory_usage' ? value : Math.round(value)}
                    </div>
                    <MiniChart dataKey={config.key} color={config.chartColor} height={40} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Logs & Services */}
        <div className="space-y-3">
          {/* Service Status */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
                <Server className="w-3 h-3 text-primary" />
                Microservices Health
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-2">
                {[
                  { name: 'Simulation Engine', port: 3000, status: 'healthy' },
                  { name: 'WebSocket Gateway', port: 3003, status: 'healthy' },
                  { name: 'Telemetry Ingest', port: 8080, status: 'healthy' },
                  { name: 'AI/ML Inference', port: 8501, status: 'healthy' },
                  { name: 'State Synchronizer', port: 8081, status: 'healthy' },
                  { name: 'Scenario Engine', port: 8082, status: 'healthy' },
                  { name: 'Metrics Collector', port: 9090, status: 'healthy' },
                  { name: 'GPU Scheduler', port: 8083, status: 'healthy' },
                ].map(service => (
                  <div key={service.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${service.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                      <span className="text-muted-foreground">{service.name}</span>
                    </span>
                    <span className="font-mono text-muted-foreground">:{service.port}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* System Logs */}
          <Card className="bg-card border-border flex-1">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[11px] font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-primary" />
                  System Logs
                </span>
                <Badge variant="outline" className="text-[9px]">{logs.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-0.5 font-mono text-[10px]">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex items-center gap-2 px-1.5 py-0.5 rounded ${
                      log.level === 'ERROR' ? 'bg-red-500/10' : log.level === 'WARN' ? 'bg-amber-500/10' : ''
                    }`}>
                      <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                      <Badge variant={log.level === 'ERROR' ? 'destructive' : log.level === 'WARN' ? 'outline' : 'secondary'} className="text-[7px] px-1 py-0 h-3.5">
                        {log.level}
                      </Badge>
                      <span className="text-primary/70 shrink-0">{log.source}</span>
                      <span className="text-muted-foreground truncate">{log.message}</span>
                    </div>
                  ))}
                  {logs.length === 0 && (
                    <div className="text-center py-4 text-muted-foreground">Collecting logs...</div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
