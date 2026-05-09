'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
/* eslint-disable react-hooks/set-state-in-effect */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Radio, Activity, Thermometer, Zap, Weight, Gauge,
  Pause, Play, Trash2,
  Waves, Eye, Package
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';

type TelemetryPoint = { entityId: string; value: number; sensorType: string; timestamp: number };

const sensorIcons: Record<string, React.ElementType> = {
  temperature: Thermometer,
  speed: Gauge,
  voltage: Zap,
  weight: Weight,
  occupancy: Waves,
  pressure: Activity,
  humidity: Waves,
  proximity: Eye,
  rfid: Radio,
  accelerometer: Activity,
};

const sensorColors: Record<string, string> = {
  temperature: 'text-red-400',
  speed: 'text-emerald-400',
  voltage: 'text-amber-400',
  weight: 'text-purple-400',
  occupancy: 'text-cyan-400',
  pressure: 'text-orange-400',
  humidity: 'text-sky-400',
  proximity: 'text-pink-400',
  rfid: 'text-violet-400',
  accelerometer: 'text-yellow-400',
};

export function TelemetryView() {
  const { telemetryStream, clearTelemetryStream } = useSimulationStore();
  const [sensorFilter, setSensorFilter] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [clearedAt, setClearedAt] = useState(0);

  // Keep a frozen snapshot of the stream while paused
  const [frozenStream, setFrozenStream] = useState<TelemetryPoint[] | null>(null);

  // Freeze stream when pausing, unfreeze when resuming
  useEffect(() => {
    if (isPaused) {
      setFrozenStream(telemetryStream);
    } else {
      setFrozenStream(null);
    }
  }, [isPaused]);

  // Derive displayed stream: frozen while paused, live otherwise
  const displayedStream = useMemo(() => {
    if (isPaused && frozenStream) return frozenStream;
    if (clearedAt > 0) return [];
    return telemetryStream;
  }, [isPaused, frozenStream, telemetryStream, clearedAt]);

  // Auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedStream.length, isPaused]);

  const handleClear = useCallback(() => {
    clearTelemetryStream();
    setFrozenStream(null);
    setClearedAt(Date.now());
  }, [clearTelemetryStream]);

  const sensorTypes = useMemo(
    () => [...new Set(telemetryStream.map(t => t.sensorType))],
    [telemetryStream]
  );

  const filteredStream = sensorFilter === 'all'
    ? displayedStream
    : displayedStream.filter(t => t.sensorType === sensorFilter);

  // Compute sensor statistics
  const sensorStats = useMemo(() => {
    const stats: Record<string, { count: number; min: number; max: number; avg: number; last: number }> = {};
    telemetryStream.forEach(t => {
      if (!stats[t.sensorType]) {
        stats[t.sensorType] = { count: 0, min: Infinity, max: -Infinity, avg: 0, last: 0 };
      }
      const s = stats[t.sensorType];
      s.count++;
      s.min = Math.min(s.min, t.value);
      s.max = Math.max(s.max, t.value);
      s.avg += (t.value - s.avg) / s.count;
      s.last = t.value;
    });
    return stats;
  }, [telemetryStream]);

  // Distribution bars per sensor type
  const sensorDistribution = useMemo(() => {
    const total = telemetryStream.length || 1;
    return sensorTypes.map(type => ({
      type,
      count: telemetryStream.filter(t => t.sensorType === type).length,
      pct: Math.round((telemetryStream.filter(t => t.sensorType === type).length / total) * 100),
    }));
  }, [telemetryStream, sensorTypes]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isPaused ? 'default' : 'ghost'}
            className="h-7 text-[11px]"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
            {isPaused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={handleClear}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <Badge variant="outline" className="text-[10px] font-mono">
            {filteredStream.length} events
          </Badge>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            size="sm"
            variant={sensorFilter === 'all' ? 'default' : 'ghost'}
            className="h-7 text-[10px]"
            onClick={() => setSensorFilter('all')}
          >
            All
          </Button>
          {sensorTypes.slice(0, 6).map(type => (
            <Button
              key={type}
              size="sm"
              variant={sensorFilter === type ? 'default' : 'ghost'}
              className="h-7 text-[10px] capitalize"
              onClick={() => setSensorFilter(type)}
            >
              {type}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        {/* Stream */}
        <div className="lg:col-span-3">
          <Card className="h-full bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-primary" />
                Live Telemetry Stream
                {isPaused && <Badge variant="outline" className="text-[9px] text-amber-500">PAUSED</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div
                ref={scrollRef}
                className="h-[450px] overflow-y-auto space-y-0.5 font-mono text-[11px]"
              >
                {filteredStream.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Waiting for telemetry data...
                  </div>
                ) : (
                  filteredStream.map((event, i) => {
                    const Icon = sensorIcons[event.sensorType] || Radio;
                    const color = sensorColors[event.sensorType] || 'text-muted-foreground';
                    return (
                      <div
                        key={`${event.entityId}-${event.timestamp}-${i}`}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/30 transition-colors"
                      >
                        <span className="text-[9px] text-muted-foreground w-16 shrink-0">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <Icon className={`w-3 h-3 ${color} shrink-0`} />
                        <span className={`w-20 capitalize ${color} shrink-0`}>
                          {event.sensorType}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {event.entityId.slice(0, 12)}
                        </span>
                        <span className="flex-1" />
                        <span className="font-bold">{event.value.toFixed(1)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-primary" />
                Sensor Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ScrollArea className="max-h-[260px]">
                <div className="space-y-3">
                  {Object.entries(sensorStats).map(([type, stats]) => {
                    const Icon = sensorIcons[type] || Radio;
                    const color = sensorColors[type] || 'text-muted-foreground';
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs capitalize flex items-center gap-1.5">
                            <Icon className={`w-3 h-3 ${color}`} />
                            {type}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {stats.count}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div className="bg-muted/50 rounded p-1.5 text-center">
                            <div className="text-[8px] text-muted-foreground">MIN</div>
                            <div className="text-[11px] font-mono font-bold">
                              {stats.min === Infinity ? '—' : stats.min.toFixed(1)}
                            </div>
                          </div>
                          <div className="bg-muted/50 rounded p-1.5 text-center">
                            <div className="text-[8px] text-muted-foreground">AVG</div>
                            <div className="text-[11px] font-mono font-bold">
                              {stats.avg.toFixed(1)}
                            </div>
                          </div>
                          <div className="bg-muted/50 rounded p-1.5 text-center">
                            <div className="text-[8px] text-muted-foreground">MAX</div>
                            <div className="text-[11px] font-mono font-bold">
                              {stats.max === -Infinity ? '—' : stats.max.toFixed(1)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(sensorStats).length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      No sensor data yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Distribution */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[11px] font-semibold flex items-center gap-1.5">
                <Package className="w-3 h-3 text-primary" />
                Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ScrollArea className="max-h-[160px]">
                <div className="space-y-2">
                  {sensorDistribution.map(d => {
                    const color = sensorColors[d.type] || 'text-muted-foreground';
                    return (
                      <div key={d.type} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="capitalize">{d.type}</span>
                          <span className="font-mono text-muted-foreground">
                            {d.count} ({d.pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              d.type === 'temperature' ? 'bg-red-500' :
                              d.type === 'speed' ? 'bg-emerald-500' :
                              d.type === 'voltage' ? 'bg-amber-500' :
                              d.type === 'weight' ? 'bg-purple-500' :
                              d.type === 'occupancy' ? 'bg-cyan-500' :
                              d.type === 'pressure' ? 'bg-orange-500' :
                              d.type === 'humidity' ? 'bg-sky-500' :
                              d.type === 'proximity' ? 'bg-pink-500' :
                              d.type === 'rfid' ? 'bg-violet-500' :
                              'bg-primary'
                            }`}
                            style={{ width: `${Math.max(d.pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {sensorDistribution.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      No distribution data yet
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Throughput summary */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[11px] font-semibold">Stream Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Events</span>
                  <span className="font-mono">{telemetryStream.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sensor Types</span>
                  <span className="font-mono">{sensorTypes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active Filter</span>
                  <span className="font-mono">
                    {sensorFilter === 'all' ? 'none' : sensorFilter}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
