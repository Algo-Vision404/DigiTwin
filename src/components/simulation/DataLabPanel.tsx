'use client';

import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart3, Activity, Zap, Target, Layers, Hash, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { ENTITY_COLORS, ENTITY_LABELS } from './constants';

// ════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════
interface EntityData {
  id: string;
  name: string;
  entityType: string;
  status: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number; speed: number };
  health: number;
  battery: number;
  temperature: number;
  rotation: { x: number; y: number; z: number };
}

interface TelemetryPoint {
  entityId: string;
  sensorType: string;
  value: number;
  timestamp: number;
}

interface Insight {
  id: string;
  type: 'insight' | 'warning' | 'critical' | 'positive';
  icon: React.ElementType;
  title: string;
  description: string;
  metric?: string;
  value?: string;
}

// ════════════════════════════════════════════════════════════════════
// STATISTICAL HELPERS
// ════════════════════════════════════════════════════════════════════
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function stddev(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

function zScore(value: number, arr: number[]): number {
  const sd = stddev(arr);
  return sd === 0 ? 0 : (value - mean(arr)) / sd;
}

// ════════════════════════════════════════════════════════════════════
// MINI BAR CHART (pure SVG)
// ════════════════════════════════════════════════════════════════════
function MiniBarChart({
  data,
  colors,
  labels,
  height = 80,
}: {
  data: { label: string; value: number }[];
  colors?: string[];
  labels?: boolean;
  height?: number;
}) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = Math.min(28, Math.max(12, (240 - data.length * 4) / data.length));
  const gap = 4;
  const chartW = data.length * (barW + gap) - gap;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${chartW + 40} ${height}`} preserveAspectRatio="xMidYMid meet">
      {/* Y-axis reference lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = height - 16 - p * (height - 28);
        return <line key={p} x1="28" y1={y} x2={chartW + 36} y2={y} stroke="#27272a" strokeWidth="0.5" />;
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * (height - 28);
        const x = 30 + i * (barW + gap);
        const y = height - 16 - barH;
        const color = colors?.[i] || '#71717a';
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={barH} rx={2} fill={color} opacity={0.8} />
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" fill="#71717a" fontSize="7" fontFamily="monospace">
              {d.label.slice(0, 4)}
            </text>
            <text x={x + barW / 2} y={y - 3} textAnchor="middle" fill="#a1a1aa" fontSize="7" fontFamily="monospace">
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════
// HORIZONTAL STAT BAR
// ════════════════════════════════════════════════════════════════════
function StatBar({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-400">{label}</span>
        <span className="text-[10px] font-mono text-zinc-300 tabular-nums">{value.toFixed(1)}{unit || ''}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// DISTRIBUTION HISTOGRAM
// ════════════════════════════════════════════════════════════════════
function Histogram({ values, bins = 8, color = '#6b8cae', height = 60 }: { values: number[]; bins?: number; color?: string; height?: number }) {
  if (values.length === 0) {
    return <div className="text-[9px] font-mono text-zinc-600 text-center py-4">NO DATA</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binSize = range / bins;
  const bucketCounts = new Array(bins).fill(0);
  values.forEach(v => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binSize));
    bucketCounts[idx]++;
  });
  const maxCount = Math.max(...bucketCounts, 1);
  const barW = Math.max(8, Math.min(20, 200 / bins));

  return (
    <svg width="100%" height={height + 12} viewBox={`0 0 ${bins * (barW + 2) + 8} ${height + 12}`} preserveAspectRatio="xMidYMid meet">
      {bucketCounts.map((count, i) => {
        const barH = (count / maxCount) * height;
        const x = 4 + i * (barW + 2);
        const y = height - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={1} fill={color} opacity={0.7} />
            {count > 0 && (
              <text x={x + barW / 2} y={y - 2} textAnchor="middle" fill="#71717a" fontSize="6" fontFamily="monospace">{count}</text>
            )}
          </g>
        );
      })}
      {/* Axis labels */}
      <text x={4} y={height + 10} fill="#52525b" fontSize="6" fontFamily="monospace">{min.toFixed(1)}</text>
      <text x={bins * (barW + 2) + 4} y={height + 10} textAnchor="end" fill="#52525b" fontSize="6" fontFamily="monospace">{max.toFixed(1)}</text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════
// GAUGE RING
// ════════════════════════════════════════════════════════════════════
function GaugeRing({ value, max, label, color, size = 56 }: { value: number; max: number; label: string; color: string; size?: number }) {
  const pct = Math.min(1, value / max);
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#27272a" strokeWidth="3" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out' }} />
        <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="#e4e4e7" fontSize="11" fontWeight="700" fontFamily="monospace">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// INSIGHT CARD
// ════════════════════════════════════════════════════════════════════
function InsightCard({ insight }: { insight: Insight }) {
  const colorMap = {
    insight: { border: 'border-zinc-700', bg: 'bg-zinc-900', text: 'text-zinc-300' },
    positive: { border: 'border-emerald-500/20', bg: 'bg-emerald-500/5', text: 'text-emerald-300' },
    warning: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-300' },
    critical: { border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-300' },
  };
  const c = colorMap[insight.type];
  const Icon = insight.icon;

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-2.5 gap-2`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${c.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-200">{insight.title}</span>
            {insight.metric && (
              <Badge variant="outline" className="text-[8px] font-mono px-1 py-0 border-zinc-700 text-zinc-500 h-3.5">
                {insight.metric}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-zinc-400 mt-0.5 leading-relaxed">{insight.description}</p>
          {insight.value && (
            <span className="text-[10px] font-mono mt-1 inline-block text-zinc-300">{insight.value}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN DATA LAB PANEL
// ════════════════════════════════════════════════════════════════════
export function DataLabPanel({
  entities,
  telemetryStream,
  simulationMetrics,
  isSimulating,
}: {
  entities: EntityData[];
  telemetryStream: TelemetryPoint[];
  simulationMetrics: {
    totalEvents?: number;
    averageTickDuration?: number;
    physicsCollisions?: number;
    spatialQueries?: number;
    entitiesProcessed?: number;
  } | null;
  isSimulating: boolean;
}) {

  // ═══════════════════════════════════════════════════════════════
  // STATISTICAL ANALYSIS (all derived from live data)
  // ═══════════════════════════════════════════════════════════════
  const analysis = useMemo(() => {
    if (entities.length === 0) return null;

    const speeds = entities.map(e => e.velocity.speed);
    const activeCount = entities.filter(e => e.status === 'active').length;
    const movingCount = entities.filter(e => e.velocity.speed > 0.3).length;
    const idleCount = entities.filter(e => e.velocity.speed <= 0.3).length;

    // Entity type distribution
    const typeCounts: Record<string, number> = {};
    entities.forEach(e => { typeCounts[e.entityType] = (typeCounts[e.entityType] || 0) + 1; });

    // Status distribution
    const statusCounts: Record<string, number> = {};
    entities.forEach(e => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });

    // Zone occupancy (using the known zone definitions)
    const zones = [
      { id: 'zone-a', name: 'Storage A', x: 0, z: 0, w: 100, h: 100 },
      { id: 'zone-b', name: 'Processing B', x: 100, z: 0, w: 100, h: 100 },
      { id: 'zone-dock', name: 'Loading Dock', x: 200, z: 0, w: 100, h: 100 },
      { id: 'zone-road', name: 'Main Road', x: 0, z: 100, w: 300, h: 50 },
    ];
    const zoneOccupancy = zones.map(z => ({
      ...z,
      count: entities.filter(e => e.position.x >= z.x && e.position.x < z.x + z.w && e.position.z >= z.z && e.position.z < z.z + z.h).length,
      pct: entities.filter(e => e.position.x >= z.x && e.position.x < z.x + z.w && e.position.z >= z.z && e.position.z < z.z + z.h).length / entities.length * 100,
    }));

    // Speed statistics
    const speedStats = {
      mean: mean(speeds),
      median: median(speeds),
      stddev: stddev(speeds),
      p25: percentile(speeds, 25),
      p75: percentile(speeds, 75),
      p95: percentile(speeds, 95),
      min: Math.min(...speeds),
      max: Math.max(...speeds),
      iqr: percentile(speeds, 75) - percentile(speeds, 25),
    };

    // Outlier detection (speed > 2 std devs from mean)
    const speedOutliers = entities.filter(e => Math.abs(zScore(e.velocity.speed, speeds)) > 2);

    // Position clustering - find the densest area
    const posClusters = entities.reduce((acc, e) => {
      const cellX = Math.floor(e.position.x / 30) * 30;
      const cellZ = Math.floor(e.position.z / 30) * 30;
      const key = `${cellX},${cellZ}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const densestCell = Object.entries(posClusters).sort((a, b) => b[1] - a[1])[0];

    // Telemetry analysis
    const telByType: Record<string, number[]> = {};
    (telemetryStream || []).forEach(t => {
      if (!telByType[t.sensorType]) telByType[t.sensorType] = [];
      telByType[t.sensorType].push(t.value);
    });
    const telemetryStats = Object.entries(telByType).map(([type, vals]) => ({
      type,
      count: vals.length,
      mean: mean(vals),
      min: Math.min(...vals),
      max: Math.max(...vals),
      latest: vals[vals.length - 1],
      trend: vals.length >= 5 ? vals[vals.length - 1] - mean(vals.slice(-5)) : 0,
    }));

    return {
      totalEntities: entities.length,
      activeCount,
      movingCount,
      idleCount,
      activeRate: activeCount / entities.length * 100,
      movingRate: movingCount / entities.length * 100,
      typeCounts,
      statusCounts,
      zoneOccupancy,
      speedStats,
      speedOutliers,
      densestCell,
      telemetryStats,
      speeds,
    };
  }, [entities, telemetryStream]);

  // ═══════════════════════════════════════════════════════════════
  // AUTO-GENERATED INSIGHTS (data scientist observations)
  // ═══════════════════════════════════════════════════════════════
  const insights = useMemo<Insight[]>(() => {
    if (!analysis || !isSimulating) return [];
    const list: Insight[] = [];
    const ts = Date.now();

    // Fleet utilization
    if (analysis.activeRate > 85) {
      list.push({ id: `${ts}-1`, type: 'positive', icon: CheckCircle2, title: 'High Fleet Utilization',
        description: `${Math.round(analysis.activeRate)}% of all entities are actively operating. Resource allocation appears optimal.`, metric: 'UTILIZATION', value: `${Math.round(analysis.activeRate)}%` });
    } else if (analysis.activeRate < 50) {
      list.push({ id: `${ts}-1`, type: 'warning', icon: AlertTriangle, title: 'Low Fleet Activity',
        description: `Only ${Math.round(analysis.activeRate)}% of entities are active. Consider reviewing assignment schedules or checking for systemic issues.`, metric: 'UTILIZATION', value: `${Math.round(analysis.activeRate)}%` });
    }

    // Speed outliers
    if (analysis.speedOutliers.length > 0) {
      const outlier = analysis.speedOutliers[0];
      list.push({ id: `${ts}-2`, type: 'critical', icon: Zap, title: 'Speed Anomaly Detected',
        description: `${outlier.name} is traveling at ${outlier.velocity.speed.toFixed(2)} m/s, which is ${(zScore(outlier.velocity.speed, analysis.speeds)).toFixed(1)} standard deviations from the fleet mean of ${analysis.speedStats.mean.toFixed(2)} m/s. This may indicate a malfunction or unsafe condition.`, metric: 'ANOMALY', value: `${outlier.velocity.speed.toFixed(2)} m/s` });
    }

    // Zone congestion
    const maxZone = analysis.zoneOccupancy.reduce((a, b) => a.count > b.count ? a : b);
    if (maxZone.count > analysis.totalEntities * 0.5) {
      list.push({ id: `${ts}-3`, type: 'warning', icon: Layers, title: 'Zone Congestion Alert',
        description: `${maxZone.name} has ${maxZone.count} entities (${Math.round(maxZone.pct)}% of fleet), which may cause bottlenecking and reduced throughput. Consider redistributing traffic.`, metric: 'CONGESTION', value: `${maxZone.count} entities` });
    }

    // Speed variance
    if (analysis.speedStats.stddev > analysis.speedStats.mean * 0.5) {
      list.push({ id: `${ts}-4`, type: 'insight', icon: BarChart3, title: 'High Speed Variance',
        description: `Fleet speed has a standard deviation of ${analysis.speedStats.stddev.toFixed(2)} m/s (${(analysis.speedStats.stddev / Math.max(analysis.speedStats.mean, 0.01) * 100).toFixed(0)}% of mean). Heterogeneous speeds may indicate mixed operational modes or inconsistent routing.`, metric: 'STATISTICS' });
    }

    // Telemetry trends
    const telTrendUp = analysis.telemetryStats.filter(t => t.trend > 0);
    const telTrendDown = analysis.telemetryStats.filter(t => t.trend < 0);
    if (telTrendUp.length > 0) {
      list.push({ id: `${ts}-5`, type: telTrendUp.some(t => t.trend > t.mean * 0.3) ? 'warning' : 'insight', icon: TrendingUp, title: 'Rising Sensor Readings',
        description: `${telTrendUp.map(t => t.type).join(', ')} ${telTrendUp.length > 1 ? 'are' : 'is'} trending upward. ${telTrendUp.some(t => t.trend > t.mean * 0.3) ? 'Significant increase detected — monitoring recommended.' : 'Within normal operational range.'}`, metric: 'TELEMETRY' });
    }

    // Entity type imbalance
    const typeEntries = Object.entries(analysis.typeCounts).sort((a, b) => b[1] - a[1]);
    if (typeEntries.length > 1) {
      const ratio = typeEntries[0][1] / typeEntries[typeEntries.length - 1][1];
      if (ratio > 3) {
        list.push({ id: `${ts}-6`, type: 'insight', icon: Activity, title: 'Fleet Composition Imbalance',
        description: `${ENTITY_LABELS[typeEntries[0][0]] || typeEntries[0][0]} count (${typeEntries[0][1]}) is ${ratio.toFixed(1)}x higher than ${ENTITY_LABELS[typeEntries[typeEntries.length - 1][0]] || typeEntries[typeEntries.length - 1][0]} (${typeEntries[typeEntries.length - 1][1]}). Verify this matches operational requirements.`, metric: 'COMPOSITION' });
      }
    }

    // Dense clustering
    if (analysis.densestCell) {
      const [cellKey, count] = analysis.densestCell;
      if (count > 5) {
        list.push({ id: `${ts}-7`, type: count > 10 ? 'warning' : 'insight', icon: Target, title: 'Entity Clustering Detected',
        description: `${count} entities are concentrated in the 30x30m grid cell at (${cellKey}). ${count > 10 ? 'High density may indicate a gathering point or congestion.' : 'Moderate clustering observed near this area.'}`, metric: 'SPATIAL' });
      }
    }

    // Tick performance
    if (simulationMetrics?.averageTickDuration && simulationMetrics.averageTickDuration > 50) {
      list.push({ id: `${ts}-8`, type: 'warning', icon: Zap, title: 'Tick Processing Slow',
        description: `Average tick duration is ${simulationMetrics.averageTickDuration.toFixed(1)}ms, exceeding the 50ms threshold. Consider reducing entity count or simplifying physics calculations.`, metric: 'PERFORMANCE', value: `${simulationMetrics.averageTickDuration.toFixed(1)}ms` });
    }

    return list.slice(0, 8);
  }, [analysis, isSimulating, simulationMetrics]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  if (!isSimulating || entities.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
          <Brain className="w-6 h-6 text-zinc-600" />
        </div>
        <div className="text-sm font-semibold text-zinc-400">Data Lab</div>
        <div className="text-[11px] text-zinc-600 mt-1.5 leading-relaxed max-w-[220px]">
          Start the simulation to activate real-time statistical analysis, anomaly detection, and auto-generated insights.
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">

        {/* ═══ HEADER ═══ */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-zinc-300" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-200">Data Lab</div>
            <div className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider">Real-Time Analysis Engine</div>
          </div>
          <Badge variant="outline" className="ml-auto text-[8px] font-mono border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-1.5 py-0 h-4">
            <span className="w-1 h-1 rounded-full bg-emerald-400 mr-1 animate-pulse" />
            LIVE
          </Badge>
        </div>

        <Separator className="bg-zinc-800" />

        {/* ═══ GAUGE RINGS ═══ */}
        <div className="grid grid-cols-3 gap-2">
          <GaugeRing value={analysis.activeRate} max={100} label="Active" color="#10b981" />
          <GaugeRing value={analysis.movingRate} max={100} label="Moving" color="#6b8cae" />
          <GaugeRing value={analysis.speedStats.mean} max={5} label="Avg Spd" color="#b89a6b" />
        </div>

        <Separator className="bg-zinc-800" />

        {/* ═══ ENTITY TYPE DISTRIBUTION ═══ */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Hash className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Entity Distribution</span>
          </div>
          <MiniBarChart
            data={Object.entries(analysis.typeCounts).map(([type, count]) => ({
              label: ENTITY_LABELS[type] || type,
              value: count,
            }))}
            colors={Object.keys(analysis.typeCounts).map(t => ENTITY_COLORS[t] || '#71717a')}
          />
        </div>

        {/* ═══ SPEED STATISTICS ═══ */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Speed Analysis</span>
          </div>

          {/* Key stats row */}
          <div className="grid grid-cols-4 gap-2 mb-2.5">
            {[
              { label: 'Mean', value: analysis.speedStats.mean.toFixed(2), unit: 'm/s' },
              { label: 'Median', value: analysis.speedStats.median.toFixed(2), unit: 'm/s' },
              { label: 'Std Dev', value: analysis.speedStats.stddev.toFixed(2), unit: '' },
              { label: 'IQR', value: analysis.speedStats.iqr.toFixed(2), unit: '' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-[11px] font-bold font-mono text-zinc-200 tabular-nums">{s.value}</div>
                <div className="text-[8px] font-mono text-zinc-500 uppercase">{s.label} {s.unit}</div>
              </div>
            ))}
          </div>

          {/* Stat bars */}
          <div className="space-y-2 mb-2.5">
            <StatBar label="P95 Speed" value={analysis.speedStats.p95} max={8} color="#6b8cae" unit=" m/s" />
            <StatBar label="Max Speed" value={analysis.speedStats.max} max={8} color="#c48a6a" unit=" m/s" />
            <StatBar label="Min Speed" value={analysis.speedStats.min} max={8} color="#7ca37c" unit=" m/s" />
          </div>

          {/* Histogram */}
          <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Speed Distribution</div>
          <Histogram values={analysis.speeds} bins={8} color="#6b8cae" />
        </div>

        {/* ═══ ZONE UTILIZATION ═══ */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Layers className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Zone Utilization</span>
          </div>
          <div className="space-y-2">
            {analysis.zoneOccupancy.map(z => {
              const maxExpected = Math.ceil(analysis.totalEntities * 0.4);
              const isHot = z.pct > 50;
              return (
                <div key={z.id}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-mono text-zinc-400">{z.name}</span>
                    <span className="text-[10px] font-mono tabular-nums" style={{ color: isHot ? '#ef4444' : '#a1a1aa' }}>
                      {z.count} <span className="text-zinc-600">({Math.round(z.pct)}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, z.pct * 2)}%`, backgroundColor: isHot ? '#ef4444' : '#5c9e9e' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ TELEMETRY ANALYSIS ═══ */}
        {analysis.telemetryStats.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Sensor Analysis</span>
            </div>
            <div className="space-y-1.5">
              {analysis.telemetryStats.map(t => (
                <div key={t.type} className="flex items-center gap-2 py-1 px-1.5 rounded-md bg-zinc-800/50">
                  <span className="text-[9px] font-mono text-zinc-500 w-[52px] shrink-0 uppercase">{t.type}</span>
                  <div className="flex-1">
                    <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-500 rounded-full" style={{ width: `${Math.min(100, (t.latest / Math.max(t.max, 1)) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 tabular-nums w-[48px] text-right">{t.latest?.toFixed(1)}</span>
                  {t.trend !== 0 && (
                    <span className={`w-3 h-3 flex items-center justify-center ${t.trend > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {t.trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ OUTLIER DETECTION ═══ */}
        {analysis.speedOutliers.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider">Outlier Detection</span>
            </div>
            <div className="space-y-1">
              {analysis.speedOutliers.map(e => {
                const score = zScore(e.velocity.speed, analysis.speeds);
                return (
                  <div key={e.id} className="flex items-center justify-between py-1 px-1.5 rounded bg-red-500/5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      <span className="text-[10px] font-mono text-zinc-300">{e.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{e.velocity.speed.toFixed(2)} m/s</span>
                      <Badge variant="outline" className={`text-[8px] font-mono px-1 py-0 h-3.5 ${Math.abs(score) > 3 ? 'border-red-500/30 text-red-400' : 'border-amber-500/30 text-amber-400'}`}>
                        z={score.toFixed(1)}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Separator className="bg-zinc-800" />

        {/* ═══ AUTO INSIGHTS ═══ */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Auto Insights</span>
            <Badge variant="outline" className="ml-auto text-[8px] font-mono border-zinc-700 text-zinc-500 px-1.5 py-0 h-4">
              {insights.length}
            </Badge>
          </div>
          {insights.length > 0 ? (
            <div className="space-y-2">
              {insights.map(insight => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-zinc-600 text-center py-4">Analyzing patterns...</div>
          )}
        </div>

        {/* ═══ PERFORMANCE METRICS ═══ */}
        {simulationMetrics && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3 h-3 text-zinc-500" />
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Engine Performance</span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                { label: 'Tick Duration', value: `${(simulationMetrics.averageTickDuration ?? 0).toFixed(1)}ms` },
                { label: 'Total Events', value: String(simulationMetrics.totalEvents ?? 0) },
                { label: 'Collisions', value: String(simulationMetrics.physicsCollisions ?? 0) },
                { label: 'Spatial Queries', value: String(simulationMetrics.spatialQueries ?? 0) },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between py-0.5">
                  <span className="text-[9px] font-mono text-zinc-500">{m.label}</span>
                  <span className="text-[10px] font-mono text-zinc-300 tabular-nums">{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ DATA SUMMARY ═══ */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <div className="text-[8px] font-mono text-zinc-600 uppercase tracking-wider mb-1.5">Analysis Summary</div>
          <div className="space-y-0.5 text-[9px] font-mono text-zinc-500 leading-relaxed">
            <div>Samples: {entities.length} entities, {(telemetryStream || []).length} telemetry points</div>
            <div>Speed range: [{analysis.speedStats.min.toFixed(2)}, {analysis.speedStats.max.toFixed(2)}] m/s</div>
            <div>Outliers: {analysis.speedOutliers.length} detected (|z| {'>'} 2.0)</div>
            <div>Active zones: {analysis.zoneOccupancy.filter(z => z.count > 0).length}/{analysis.zoneOccupancy.length}</div>
          </div>
        </div>

      </div>
    </ScrollArea>
  );
}
