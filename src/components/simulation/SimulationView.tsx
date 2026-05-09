'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Play, Pause, Square, RotateCcw, Crosshair,
  Box, Activity, Cpu, Gauge, Timer, Clock, HardDrive, Eye, MapPin,
  Layers, Radio, Thermometer, Zap, Truck, Bot, Navigation, Camera,
  Anchor, Wifi, Rows3, BarChart3, Info, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Move, Brain,
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';
import { ZONES, ENTITY_COLORS, ENTITY_ICONS, ENTITY_LABELS } from './constants';
import { DataLabPanel } from './DataLabPanel';

// ════════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════════
const MW = 300;
const MH = 150;

type SimEvent = { time: string; type: string; entityId: string; msg: string; color: string };

// ════════════════════════════════════════════════════════════════════════════════
// SPARKLINE COMPONENT (pure SVG polyline)
// ════════════════════════════════════════════════════════════════════════════════
function Sparkline({
  data,
  color = '#ffffff',
  width = 200,
  height = 40,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#52525b" strokeWidth="0.5" strokeDasharray="4 3" />
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fill="#52525b" fontSize="8" fontFamily="monospace">NO DATA</text>
      </svg>
    );
  }

  const values = data.slice(-20);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const effectiveH = height - pad * 2;
  const effectiveW = width - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * effectiveW;
    const y = pad + effectiveH - ((v - min) / range) * effectiveH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points.split(' ').pop()?.split(',')[0]} cy={points.split(' ').pop()?.split(',')[1]} r="2" fill={color} opacity="0.9" />
      <text x={width - 2} y={10} textAnchor="end" fill={color} fontSize="8" fontFamily="monospace" fontWeight="bold">
        {values[values.length - 1]?.toFixed(1)}
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
export function SimulationView() {
  const store = useSimulationStore();
  const {
    entities, isSimulating, simulationStatus, simulationMetrics,
    currentTick, selectedEntityId, selectEntity,
    setSimulating, setSimulationStatus, setEntities, addTelemetryPoint,
    telemetryStream,
  } = store;

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 400 });
  const [showLabels, setShowLabels] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0, z: 0 });
  const [eventLog, setEventLog] = useState<SimEvent[]>([]);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [trails, setTrails] = useState<Map<string, Array<{ x: number; z: number }>>>(new Map());
  const eventLogRef = useRef<HTMLDivElement>(null);

  // Pan/zoom refs for use in callbacks without stale closures
  const panZoomRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const containerSizeRef = useRef({ w: 800, h: 400 });

  useEffect(() => { panZoomRef.current = { zoom, panX, panY }; }, [zoom, panX, panY]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);

  // ── ResizeObserver: track container dimensions ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ w: width, h: height });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Dynamic viewBox: matches container aspect ratio so map always fills viewport ──
  const viewBox = useMemo(() => {
    const { w, h } = containerSize;
    const aspectRatio = w / h;
    // At zoom=1, show the full MW×MH map centered in the viewport
    // vbW/vbH always equals the container's aspect ratio → no letterboxing
    const baseH = MH / zoom;
    const baseW = baseH * aspectRatio;
    // At zoom=1, ensure we see at least the full map width
    const vbH = baseW >= MW ? baseH : (MW / aspectRatio) / zoom;
    const vbW = vbH * aspectRatio;
    return { x: panX, y: panY, w: vbW, h: vbH };
  }, [zoom, panX, panY, containerSize]);

  // ── Screen → SVG coordinate conversion ──
  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    const { zoom: z, panX: px, panY: py } = panZoomRef.current;
    const { w, h } = containerSizeRef.current;
    const aspectRatio = w / h;
    const baseH = MH / z;
    const baseW = baseH * aspectRatio;
    const vbH = baseW >= MW ? baseH : (MW / aspectRatio) / z;
    const vbW = vbH * aspectRatio;
    const x = px + ((clientX - rect.left) / rect.width) * vbW;
    const y = py + ((clientY - rect.top) / rect.height) * vbH;
    return { x, z: y };
  }, []);

  // ── Helper: compute current viewBox dimensions (mirrors useMemo above) ──
  const getVbDims = useCallback((z: number) => {
    const { w, h } = containerSizeRef.current;
    const aspectRatio = w / h;
    const baseH = MH / z;
    const baseW = baseH * aspectRatio;
    const vbH = baseW >= MW ? baseH : (MW / aspectRatio) / z;
    const vbW = vbH * aspectRatio;
    return { vbW, vbH };
  }, []);

  // ── Zoom to fit (show full map centered) ──
  const zoomToFit = useCallback(() => {
    const { vbW, vbH } = getVbDims(1);
    // Center the map in the viewport
    setZoom(1);
    setPanX((MW - vbW) / 2);
    setPanY((MH - vbH) / 2);
  }, [getVbDims]);

  // ── Zoom to a specific level (zoom toward cursor or center) ──
  const zoomTo = useCallback((newZoom: number, clientX?: number, clientY?: number) => {
    const clamped = Math.max(0.2, Math.min(12, newZoom));
    const oldVb = getVbDims(panZoomRef.current.zoom);
    const newVb = getVbDims(clamped);
    const { panX: px, panY: py } = panZoomRef.current;

    if (clientX !== undefined && clientY !== undefined) {
      const svg = svgRef.current;
      if (svg) {
        const rect = svg.getBoundingClientRect();
        // Point in SVG coords under cursor
        const svgX = px + ((clientX - rect.left) / rect.width) * oldVb.vbW;
        const svgY = py + ((clientY - rect.top) / rect.height) * oldVb.vbH;
        // Adjust pan so that point stays under cursor
        const newPx = svgX - ((clientX - rect.left) / rect.width) * newVb.vbW;
        const newPy = svgY - ((clientY - rect.top) / rect.height) * newVb.vbH;
        setZoom(clamped);
        setPanX(newPx);
        setPanY(newPy);
        return;
      }
    }
    // No cursor — zoom toward center of current view
    const cx = px + oldVb.vbW / 2;
    const cy = py + oldVb.vbH / 2;
    setZoom(clamped);
    setPanX(cx - newVb.vbW / 2);
    setPanY(cy - newVb.vbH / 2);
  }, [getVbDims]);

  // ── On first mount or container resize, fit the view ──
  useEffect(() => {
    if (containerSize.w > 0 && containerSize.h > 0 && zoom === 1 && panX === 0 && panY === 0) {
      const { vbW, vbH } = getVbDims(1);
      queueMicrotask(() => {
        setPanX((MW - vbW) / 2);
        setPanY((MH - vbH) / 2);
      });
    }
  }, [containerSize, zoom, panX, panY, getVbDims]);

  // ── Trail tracking ──
  useEffect(() => {
    if (!showTrails || !isSimulating) return;
    queueMicrotask(() => {
      setTrails(prev => {
        const next = new Map(prev);
        entities.forEach(e => {
          const existing = next.get(e.id) || [];
          const updated = [...existing, { x: e.position.x, z: e.position.z }];
          next.set(e.id, updated.length > 30 ? updated.slice(-30) : updated);
        });
        return next;
      });
    });
  }, [entities, showTrails, isSimulating]);

  // ── Start time tracking ──
  useEffect(() => {
    if (isSimulating && !startTime) {
      // Use a microtask to avoid calling setState synchronously during render-triggered effect
      queueMicrotask(() => setStartTime(Date.now()));
    }
    if (!isSimulating && startTime) {
      queueMicrotask(() => { setStartTime(null); setElapsedTime('00:00:00'); });
    }
  }, [isSimulating, startTime]);

  // ── Elapsed timer (HH:MM:SS) ──
  useEffect(() => {
    if (!isSimulating || !startTime) return;
    const iv = setInterval(() => {
      const totalSec = Math.floor((Date.now() - startTime) / 1000);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const s = String(totalSec % 60).padStart(2, '0');
      setElapsedTime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(iv);
  }, [isSimulating, startTime]);

  // ── API polling (800ms) ──
  useEffect(() => {
    if (!isSimulating) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch('/api/simulation');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        if (data.liveEntities?.length > 0) setEntities(data.liveEntities);
        if (data.simulation) {
          setSimulationStatus(data.simulation.status);
          store.setCurrentTick(data.simulation.currentTick || 0);
          if (data.simulation.metrics) store.setSimulationMetrics(data.simulation.metrics);
        }
        if (data.recentTelemetry?.length > 0) {
          data.recentTelemetry.forEach((t: { entityId: string; sensorType: string; value: number; timestamp: number }) => {
            addTelemetryPoint({ entityId: t.entityId, sensorType: t.sensorType, value: t.value, timestamp: t.timestamp });
          });
        }
      } catch { /* silent */ }
    }, 800);
    return () => clearInterval(iv);
  }, [isSimulating]);

  // ── Event log generation ──
  useEffect(() => {
    if (!isSimulating || entities.length === 0) return;
    const iv = setInterval(() => {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      const r = Math.random();
      const movingEntities = entities.filter(e => e.velocity.speed > 0.3);
      if (r < 0.2 && movingEntities.length > 1) {
        const e = movingEntities[Math.floor(Math.random() * movingEntities.length)];
        const zone = ZONES.find(zz => e.position.x >= zz.x && e.position.x < zz.x + zz.w && e.position.z >= zz.z && e.position.z < zz.z + zz.h);
        setEventLog(prev => [{ time: now, type: 'zone', entityId: e.id, msg: `${e.name} entered ${zone?.name || 'transit'}`, color: ENTITY_COLORS[e.entityType] || '#71717a' }, ...prev.slice(0, 49)]);
      } else if (r < 0.5 && movingEntities.length > 0) {
        const e = movingEntities[Math.floor(Math.random() * movingEntities.length)];
        const sensor = ['speed', 'temp', 'voltage'][Math.floor(Math.random() * 3)];
        const val = sensor === 'speed' ? e.velocity.speed.toFixed(1) : (20 + Math.random() * 60).toFixed(1);
        setEventLog(prev => [{ time: now, type: 'telemetry', entityId: e.id, msg: `[TELEMETRY] ${e.name} ${sensor}=${val}${sensor === 'temp' ? '°C' : sensor === 'speed' ? 'm/s' : 'V'}`, color: '#5c9e9e' }, ...prev.slice(0, 49)]);
      } else if (r < 0.7) {
        setEventLog(prev => [{ time: now, type: 'system', entityId: 'SYS', msg: `[TICK #${currentTick}] Processed ${entities.length} entities in ${((simulationMetrics?.averageTickDuration ?? 0)).toFixed(1)}ms`, color: '#52525b' }, ...prev.slice(0, 49)]);
      } else if (r < 0.85) {
        const e = entities[Math.floor(Math.random() * entities.length)];
        if (e) setEventLog(prev => [{ time: now, type: 'state', entityId: e.id, msg: `[STATE] ${e.name} → ${e.status.toUpperCase()} @ (${e.position.x.toFixed(1)}, ${e.position.z.toFixed(1)})`, color: ENTITY_COLORS[e.entityType] || '#71717a' }, ...prev.slice(0, 49)]);
      }
    }, 1500);
    return () => clearInterval(iv);
  }, [isSimulating, entities, currentTick, simulationMetrics]);

  // ── Auto-scroll event log ──
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = 0;
    }
  }, [eventLog]);

  // ── API Controls ──
  const handleAction = useCallback(async (action: string) => {
    try {
      const res = await fetch('/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (res.ok) { const d = await res.json(); if (d.success) { setSimulationStatus(d.status || action); setSimulating(d.status === 'running'); } }
    } catch { /* silent */ }
  }, [setSimulationStatus, setSimulating]);

  const handleInitAndStart = useCallback(async () => {
    try {
      setSimulationStatus('initializing');
      const r1 = await fetch('/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'init', config: { timeScale: simSpeed, physicsEnabled: true, collisionDetection: true, spatialPartitioning: true } }) });
      if (r1.ok) {
        const r2 = await fetch('/api/entities');
        if (r2.ok) { const d2 = await r2.json(); if (d2.success && d2.liveEntities?.length > 0) setEntities(d2.liveEntities); }
      }
      setTimeout(async () => {
        const r3 = await fetch('/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) });
        if (r3.ok) { const d3 = await r3.json(); if (d3.success) { setSimulationStatus('running'); setSimulating(true); } }
      }, 400);
    } catch { setSimulationStatus('idle'); }
  }, [simSpeed, setSimulationStatus, setSimulating, setEntities]);

  const handleStop = useCallback(async () => {
    await handleAction('stop');
    setTrails(new Map());
    setEventLog([]);
  }, [handleAction]);

  // ── Mouse: move (update coordinates) ──
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = screenToSvg(e.clientX, e.clientY);
    setMousePos({ x: Math.round(pt.x * 10) / 10, z: Math.round(pt.z * 10) / 10 });
  }, [screenToSvg]);

  // ── Click: select entity ──
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const pt = screenToSvg(e.clientX, e.clientY);
    const clicked = entities.find(ent => {
      const dx = ent.position.x - pt.x, dz = ent.position.z - pt.z;
      return Math.sqrt(dx * dx + dz * dz) < 5;
    });
    selectEntity(clicked ? clicked.id : null);
  }, [entities, selectEntity, screenToSvg]);

  // ── Wheel: zoom to cursor ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const { zoom: curZoom } = panZoomRef.current;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomTo(curZoom * factor, e.clientX, e.clientY);
  }, [zoomTo]);

  // ── Computed values ──
  const selectedEntity = useMemo(() => entities.find(e => e.id === selectedEntityId), [entities, selectedEntityId]);
  const entityByType = useMemo(() => {
    const m: Record<string, number> = {};
    entities.forEach(e => { m[e.entityType] = (m[e.entityType] || 0) + 1; });
    return m;
  }, [entities]);
  const zoneOccupancy = useMemo(() => ZONES.map(z => ({
    ...z,
    count: entities.filter(e => e.position.x >= z.x && e.position.x < z.x + z.w && e.position.z >= z.z && e.position.z < z.z + z.h).length,
  })), [entities]);

  // Telemetry grouped by entityId for sparklines
  const telemetryByEntity = useMemo(() => {
    const grouped: Record<string, { values: number[]; sensorType: string; color: string }> = {};
    if (!telemetryStream || telemetryStream.length === 0) return grouped;
    telemetryStream.forEach(t => {
      if (!grouped[t.entityId]) {
        const ent = entities.find(e => e.id === t.entityId);
        grouped[t.entityId] = { values: [], sensorType: t.sensorType, color: ent ? (ENTITY_COLORS[ent.entityType] || '#ffffff') : '#ffffff' };
      }
      grouped[t.entityId].values.push(t.value);
    });
    return grouped;
  }, [telemetryStream, entities]);

  const statusColor = simulationStatus === 'running' ? 'text-emerald-400' : simulationStatus === 'paused' ? 'text-amber-400' : 'text-zinc-500';
  const statusDotColor = simulationStatus === 'running' ? 'bg-emerald-400' : simulationStatus === 'paused' ? 'bg-amber-400' : 'bg-zinc-500';

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      <div className="h-full flex flex-col select-none overflow-hidden bg-zinc-950">

        {/* ═════════════════════════ TOOLBAR ═════════════════════════ */}
        <div className="shrink-0 border-b border-zinc-800 backdrop-blur-xl bg-zinc-900/80 px-4 py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">

            {/* Left: Logo + Controls */}
            <div className="flex items-center gap-3">
              {/* Brand */}
              <div className="flex items-center gap-2 mr-2">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#0f172a] to-[#1e1b4b] border border-zinc-700 flex items-center justify-center">
                  <span className="text-[9px] font-black tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">TF</span>
                </div>
                <div className="hidden sm:block">
                  <div className="text-[11px] font-bold tracking-[0.2em] text-white uppercase">TwinForge</div>
                  <div className="text-[8px] tracking-[0.15em] text-zinc-500 uppercase">Digital Twin Engine</div>
                </div>
              </div>

              <Separator orientation="vertical" className="h-8 bg-zinc-800" />

              {/* Start / Pause / Stop / Reset */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" onClick={handleInitAndStart} disabled={simulationStatus === 'running'}
                      className="bg-white hover:bg-zinc-200 text-black border-0 h-8 px-3 text-xs font-semibold gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Start
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">Initialize & Start Simulation</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" onClick={() => handleAction('pause')} disabled={simulationStatus !== 'running'}
                      className="h-8 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
                      <Pause className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">Pause Simulation</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" onClick={handleStop}
                      className="h-8 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
                      <Square className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">Stop & Clear</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" onClick={() => { handleAction('reset'); setTrails(new Map()); }}
                      className="h-8 px-2.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">Reset Simulation</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-6 bg-zinc-800" />

              {/* Speed pills */}
              <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
                {[0.5, 1, 2, 4].map(s => (
                  <Button key={s} size="sm"
                    variant={simSpeed === s ? 'default' : 'ghost'}
                    className={`h-6 px-2.5 text-[10px] font-mono rounded-md border-0 transition-all ${simSpeed === s ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    onClick={() => setSimSpeed(s)}>
                    {s}x
                  </Button>
                ))}
              </div>
            </div>

            {/* Right: Toggles + Status + Clock */}
            <div className="flex items-center gap-2">
              {/* Toggle buttons */}
              <div className="hidden md:flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
                {[
                  { key: 'labels', active: showLabels, toggle: () => setShowLabels(v => !v), icon: Eye },
                  { key: 'trails', active: showTrails, toggle: () => setShowTrails(v => !v), icon: Layers },
                  { key: 'heatmap', active: showHeatmap, toggle: () => setShowHeatmap(v => !v), icon: Thermometer },
                ].map(t => (
                  <Button key={t.key} size="sm" variant="ghost"
                    className={`h-7 px-2 text-[10px] gap-1 rounded-md border-0 capitalize transition-all ${t.active ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    onClick={t.toggle}>
                    <t.icon className="w-3 h-3" />
                    <span className="hidden lg:inline">{t.key}</span>
                  </Button>
                ))}
              </div>

              <Separator orientation="vertical" className="h-6 bg-zinc-800 hidden md:block" />

              {/* Status badge */}
              <Badge variant="outline"
                className={`text-[10px] font-mono px-3 py-1 rounded-full gap-1.5 border transition-colors ${
                  simulationStatus === 'running' ? 'border-emerald-500/30 bg-emerald-500/10' :
                  simulationStatus === 'paused' ? 'border-amber-500/30 bg-amber-500/10' :
                  'border-zinc-700 bg-zinc-800/50'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} ${simulationStatus === 'running' ? 'animate-pulse' : ''}`} />
                <span className={statusColor}>{(simulationStatus || 'idle').toUpperCase()}</span>
              </Badge>

              {/* Digital clock */}
              <div className="font-mono text-[11px] text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-md border border-zinc-700 tracking-wider tabular-nums">
                {elapsedTime}
              </div>
            </div>
          </div>
        </div>

        {/* ═════════════════════════ MAIN AREA ═════════════════════════ */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 min-h-0 overflow-hidden">

          {/* ── LEFT: Viewport + Event Log ── */}
          <div className="flex flex-col min-h-0 overflow-hidden">

            {/* SVG Viewport */}
            <Card className="flex-1 bg-zinc-950 border border-zinc-800 overflow-hidden relative rounded-none">
              <CardContent className="p-0 h-full relative">

                {/* SVG Viewport with Pan + Zoom */}
                <div ref={containerRef} className="absolute inset-0">
                  <svg ref={svgRef}
                    viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
                    className="w-full h-full"
                    style={{ cursor: 'pointer' }}
                    onWheel={handleWheel}
                    onMouseMove={handleMouseMove}
                    onClick={handleClick}
                    preserveAspectRatio="xMidYMid meet">

                  <defs>
                    {/* Minor grid */}
                    <pattern id="grid-minor" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1c1c1e" strokeWidth="0.12" />
                    </pattern>
                    {/* Major grid */}
                    <pattern id="grid-major" width="50" height="50" patternUnits="userSpaceOnUse">
                      <rect width="50" height="50" fill="url(#grid-minor)" />
                      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#27272a" strokeWidth="0.15" opacity="0.6" />
                    </pattern>
                  </defs>

                  {/* Background */}
                  <rect width={MW} height={MH} fill="#09090b" />
                  <rect width={MW} height={MH} fill="url(#grid-major)" />

                  {/* ── Zones ── */}
                  {ZONES.map(z => (
                    <g key={z.id}>
                      <rect x={z.x} y={z.z} width={z.w} height={z.h} fill={z.color} opacity={0.06} rx={1} />
                      <rect x={z.x} y={z.z} width={z.w} height={z.h} fill="none" stroke={z.color} strokeWidth="0.3" strokeDasharray="4 3" opacity={0.35} rx={1} />
                      {/* Road lane markings */}
                      {z.id === 'zone-road' && <>
                        <line x1={z.x} y1={z.z + z.h / 2} x2={z.x + z.w} y2={z.z + z.h / 2} stroke={z.color} strokeWidth="0.2" strokeDasharray="10 7" opacity="0.25" />
                      </>}
                      {/* Zone label */}
                      <text x={z.x + 3} y={z.z + 7} fontSize="3" fill={z.color} opacity="0.55" fontWeight="700" fontFamily="monospace" letterSpacing="0.5">{z.name.toUpperCase()}</text>
                      <text x={z.x + 3} y={z.z + 11.5} fontSize="2.2" fill={z.color} opacity="0.3" fontFamily="monospace">{zoneOccupancy.find(zo => zo.id === z.id)?.count || 0} ENTITIES</text>
                    </g>
                  ))}

                  {/* ── Heatmap overlay (thermal gradient) ── */}
                  {showHeatmap && entities.length > 0 && entities.map(e => {
                    const speed = e.velocity.speed;
                    // Map speed 0-5 to thermal: blue → cyan → yellow → orange → red
                    const t = Math.min(1, speed / 5);
                    const r = Math.round(t < 0.5 ? 0 : (t - 0.5) * 2 * 255);
                    const g = Math.round(t < 0.5 ? t * 2 * 200 : (1 - (t - 0.5) * 2) * 200);
                    const b = Math.round(t < 0.5 ? (1 - t * 2) * 255 : 0);
                    const heatColor = `rgb(${r},${g},${b})`;
                    return (
                      <circle key={`hm-${e.id}`} cx={e.position.x} cy={e.position.z} r="20" fill={heatColor} opacity="0.12" />
                    );
                  })}

                  {/* ── Entity trails (use entity type color) ── */}
                  {showTrails && entities.map(e => {
                    const trail = trails.get(e.id);
                    if (!trail || trail.length < 2) return null;
                    const color = ENTITY_COLORS[e.entityType] || '#71717a';
                    return (
                      <g key={`trail-${e.id}`}>
                        <polyline points={trail.map(p => `${p.x},${p.z}`).join(' ')}
                          fill="none" stroke={color} strokeWidth="0.6" opacity="0.25" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    );
                  })}

                  {/* ── Entities ── */}
                  {entities.map(entity => {
                    const color = ENTITY_COLORS[entity.entityType] || '#71717a';
                    const isSelected = entity.id === selectedEntityId;
                    const isActive = entity.status === 'active';
                    const { x, y, z } = entity.position;
                    const speed = entity.velocity.speed;

                    return (
                      <g key={entity.id} style={{ cursor: 'pointer' }}>
                        {/* Selection ring (entity's own color) */}
                        {isSelected && (
                          <circle cx={x} cy={z} r="8" fill="none" stroke={color} strokeWidth="0.6" opacity="0.7">
                            <animate attributeName="r" values="7;9;7" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2s" repeatCount="indefinite" />
                          </circle>
                        )}

                        {/* Entity shapes by type */}
                        {entity.entityType === 'vehicle' ? (
                          <g transform={`translate(${x},${z}) rotate(${Math.atan2(entity.velocity.z, entity.velocity.x) * 180 / Math.PI})`}>
                            <rect x="-3.5" y="-1.8" width="7" height="3.6" rx="1" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <circle cx="2.8" cy="-0.9" r="0.4" fill="#ffffff" opacity={isActive ? 0.5 : 0.08} />
                            <circle cx="2.8" cy="0.9" r="0.4" fill="#ffffff" opacity={isActive ? 0.5 : 0.08} />
                            <circle cx="-2.8" cy="-0.9" r="0.3" fill="#ff6b6b" opacity={isActive ? 0.5 : 0.08} />
                            <circle cx="-2.8" cy="0.9" r="0.3" fill="#ff6b6b" opacity={isActive ? 0.5 : 0.08} />
                          </g>
                        ) : entity.entityType === 'forklift' ? (
                          <g transform={`translate(${x},${z}) rotate(${Math.atan2(entity.velocity.z, entity.velocity.x) * 180 / Math.PI})`}>
                            <rect x="-2.2" y="-2.2" width="4.4" height="4.4" rx="0.5" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <line x1="2.2" y1="-1.2" x2="4.5" y2="-1.2" stroke={color} strokeWidth="0.6" opacity={isActive ? 0.6 : 0.1} strokeLinecap="round" />
                            <line x1="2.2" y1="1.2" x2="4.5" y2="1.2" stroke={color} strokeWidth="0.6" opacity={isActive ? 0.6 : 0.1} strokeLinecap="round" />
                          </g>
                        ) : entity.entityType === 'robot' ? (
                          <g transform={`translate(${x},${z})`}>
                            <polygon points="0,-3 3,0 0,3 -3,0" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <circle cx="0" cy="0" r="1" fill="#ffffff" opacity={isActive ? 0.3 : 0.05} />
                          </g>
                        ) : entity.entityType === 'drone' ? (
                          <g transform={`translate(${x},${z}) rotate(${Math.atan2(entity.velocity.z, entity.velocity.x) * 180 / Math.PI})`}>
                            <polygon points="0,-3.5 3,2.5 -3,2.5" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <line x1="-3.5" y1="-1" x2="3.5" y2="-1" stroke={color} strokeWidth="0.25" opacity={isActive ? 0.4 : 0.08} />
                            <line x1="0" y1="-5" x2="0" y2="0" stroke={color} strokeWidth="0.25" opacity={isActive ? 0.4 : 0.08} />
                            <circle cx="0" cy="0" r="0.5" fill="#ffffff" opacity={isActive ? 0.4 : 0.05} />
                          </g>
                        ) : entity.entityType === 'sensor' ? (
                          <g>
                            <circle cx={x} cy={z} r="2" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <circle cx={x} cy={z} r="0.8" fill="#ffffff" opacity={isActive ? 0.4 : 0.05} />
                          </g>
                        ) : entity.entityType === 'camera' ? (
                          <g transform={`translate(${x},${z}) rotate(${entity.rotation.y})`}>
                            <rect x="-1.8" y="-1.8" width="3.6" height="3.6" rx="0.5" fill={color} opacity={isActive ? 0.85 : 0.2} />
                            <circle cx="0" cy="0" r="0.8" fill="#09090b" opacity="0.5" />
                          </g>
                        ) : entity.entityType === 'conveyor' ? (
                          <rect x={x - 5} y={z - 1.2} width="10" height="2.4" rx="0.5" fill={color} opacity={isActive ? 0.5 : 0.12} stroke={color} strokeWidth="0.3" strokeDasharray="2 1" strokeOpacity={isActive ? 0.3 : 0.08}>
                            <animate attributeName="strokeDashoffset" values="0;-3" dur="1s" repeatCount="indefinite" />
                          </rect>
                        ) : entity.entityType === 'dock' ? (
                          <rect x={x - 4.5} y={z - 2.8} width="9" height="5.6" rx="1" fill={color} opacity={isActive ? 0.4 : 0.1} stroke={color} strokeWidth="0.25" strokeDasharray="2 1" strokeOpacity={isActive ? 0.2 : 0.06} />
                        ) : (
                          <circle cx={x} cy={z} r="2" fill={color} opacity={isActive ? 0.6 : 0.12} />
                        )}

                        {/* Direction arrow for moving entities */}
                        {speed > 0.3 && !['sensor', 'camera', 'conveyor', 'dock'].includes(entity.entityType) && (
                          <line x1={x} y1={z} x2={x + entity.velocity.x * 3} y2={z + entity.velocity.z * 3}
                            stroke={color} strokeWidth="0.5" opacity="0.3" strokeLinecap="round" />
                        )}

                        {/* Labels */}
                        {showLabels && zoom >= 0.6 && (
                          <g>
                            <text x={x + 4} y={z - 3} fontSize="2" fill={color} opacity={isActive ? 0.6 : 0.2} fontWeight="600" fontFamily="monospace">
                              {entity.name}
                            </text>
                            <text x={x + 4} y={z - 1} fontSize="1.6" fill="#a1a1aa" opacity="0.25" fontFamily="monospace">
                              {entity.velocity.speed.toFixed(1)}m/s
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
                </div>

                {/* ── Zoom Controls Widget (bottom-center) ── */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
                  <div className="flex items-center gap-0.5 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg p-0.5 shadow-lg">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => zoomTo(zoom * 1.3)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md border-0">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Zoom In</TooltipContent>
                    </Tooltip>

                    {/* Zoom percentage display */}
                    <button onClick={zoomToFit}
                      className="h-7 min-w-[52px] px-2 text-[10px] font-mono text-zinc-400 hover:text-white bg-zinc-800 rounded-md transition-colors tabular-nums">
                      {Math.round(zoom * 100)}%
                    </button>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => zoomTo(zoom / 1.3)}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md border-0">
                          <ZoomOut className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Zoom Out</TooltipContent>
                    </Tooltip>

                    <div className="w-px h-4 bg-zinc-700 mx-0.5" />

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={zoomToFit}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md border-0">
                          <Maximize2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Fit to View</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => { zoomTo(1); }}
                          className="h-7 w-7 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md border-0">
                          <Move className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[10px]">Reset View</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* ── HUD Overlays ── */}
                {/* Top-left: Branding */}
                <div className="absolute top-3 left-4 pointer-events-none z-10">
                  <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.25em] font-bold">Digital Twin Viewport</div>
                  <div className="text-[9px] font-mono text-zinc-600 mt-0.5 tracking-wider">TICK #{currentTick.toString().padStart(6, '0')} | {entities.length} ACTIVE</div>
                </div>

                {/* Top-right: View info */}
                <div className="absolute top-3 right-4 pointer-events-none z-10 text-right">
                  <div className="text-[9px] font-mono text-zinc-600">
                    <span className="text-zinc-500">GRID</span> {MW}×{MH}m
                  </div>
                  <div className="text-[9px] font-mono text-zinc-600 mt-0.5">
                    <span className="text-zinc-500">PAN</span> ({panX.toFixed(0)}, {panY.toFixed(0)})
                  </div>
                </div>

                {/* Bottom-left: Coordinates */}
                <div className="absolute bottom-3 left-4 pointer-events-none z-10">
                  <div className="text-[9px] font-mono text-zinc-600 tracking-wider">
                    X <span className="text-zinc-400">{mousePos.x.toFixed(1)}</span>{'  '}
                    Z <span className="text-zinc-400">{mousePos.z.toFixed(1)}</span>
                  </div>
                </div>

                {/* Bottom-right: Status */}
                <div className="absolute bottom-3 right-4 pointer-events-none z-10 text-right">
                  <div className={`text-[9px] font-mono tracking-[0.15em] font-bold ${statusColor}`}>
                    {(simulationStatus || 'idle').toUpperCase()}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ── EVENT LOG (Terminal) ── */}
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-1.5 border-b border-zinc-800">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                </div>
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em] ml-1">Event Stream</span>
                <Badge variant="outline" className="ml-auto text-[8px] font-mono text-zinc-600 px-1.5 py-0 h-4 border-zinc-700 bg-transparent">
                  {eventLog.length} EVENTS
                </Badge>
              </div>
              {/* Terminal body */}
              <div ref={eventLogRef} className="h-[120px] overflow-y-auto px-4 py-1.5 custom-scrollbar">
                {eventLog.length === 0 ? (
                  <div className="text-[10px] font-mono text-zinc-700 text-center py-6 tracking-wider">
                    ▸ Waiting for simulation events...
                  </div>
                ) : (
                  <div className="space-y-px">
                    {eventLog.map((ev, i) => (
                      <div key={`${ev.time}-${i}`} className="flex items-start gap-2 py-px hover:bg-white/[0.015] rounded-sm px-1 -mx-1 transition-colors">
                        <span className="text-[10px] font-mono text-zinc-600 w-[62px] shrink-0 tabular-nums">{ev.time}</span>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[3px]" style={{ backgroundColor: ev.color }} />
                        <span className="text-[10px] font-mono truncate tracking-wide text-zinc-400">{ev.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Side Panel (3 Tabs) ── */}
          <div className="border-l border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col">
            <Tabs defaultValue="inspector" className="flex flex-col h-full">
              {/* Tab header */}
              <div className="shrink-0 border-b border-zinc-800 px-3 pt-2">
                <TabsList className="bg-transparent h-9 gap-0.5 p-0">
                  <TabsTrigger value="inspector" className="text-[10px] font-mono uppercase tracking-wider data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-500 h-8 px-3 rounded-md gap-1.5">
                    <Crosshair className="w-3 h-3" /> Inspector
                  </TabsTrigger>
                  <TabsTrigger value="telemetry" className="text-[10px] font-mono uppercase tracking-wider data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-500 h-8 px-3 rounded-md gap-1.5">
                    <Activity className="w-3 h-3" /> Telemetry
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="text-[10px] font-mono uppercase tracking-wider data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-500 h-8 px-3 rounded-md gap-1.5">
                    <BarChart3 className="w-3 h-3" /> Metrics
                  </TabsTrigger>
                  <TabsTrigger value="datalab" className="text-[10px] font-mono uppercase tracking-wider data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-500 h-8 px-3 rounded-md gap-1.5">
                    <Brain className="w-3 h-3" /> Data Lab
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ═══ TAB 1: INSPECTOR ═══ */}
              <TabsContent value="inspector" className="flex-1 overflow-y-auto m-0 custom-scrollbar">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-3">
                    {/* Selected entity detail or placeholder */}
                    {selectedEntity ? (
                      <div className="space-y-3">
                        {/* Entity header */}
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ backgroundColor: `${ENTITY_COLORS[selectedEntity.entityType] || '#71717a'}18`, borderColor: `${ENTITY_COLORS[selectedEntity.entityType] || '#71717a'}40` }}>
                              {(() => {
                                const IconComp = ENTITY_ICONS[selectedEntity.entityType];
                                return IconComp ? <IconComp className="w-4 h-4" style={{ color: ENTITY_COLORS[selectedEntity.entityType] || '#71717a' }} /> : null;
                              })()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-zinc-200 truncate">{selectedEntity.name}</div>
                              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{ENTITY_LABELS[selectedEntity.entityType] || selectedEntity.entityType}</div>
                            </div>
                            <Badge variant="outline" className={`text-[9px] font-mono capitalize shrink-0 ${
                              selectedEntity.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                              selectedEntity.status === 'warning' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                              'border-zinc-700 bg-zinc-800/50 text-zinc-500'
                            }`}>
                              <span className={`w-1 h-1 rounded-full mr-1 ${
                                selectedEntity.status === 'active' ? 'bg-emerald-400' :
                                selectedEntity.status === 'warning' ? 'bg-amber-400' :
                                'bg-zinc-500'
                              }`} />
                              {selectedEntity.status}
                            </Badge>
                          </div>

                          {/* Data grid */}
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { label: 'Speed', value: `${selectedEntity.velocity.speed.toFixed(2)} m/s`, icon: Gauge },
                              { label: 'Position', value: `(${selectedEntity.position.x.toFixed(1)}, ${selectedEntity.position.z.toFixed(1)})`, icon: MapPin },
                              { label: 'Heading', value: `${selectedEntity.rotation.y.toFixed(0)}°`, icon: Navigation },
                              { label: 'Altitude', value: `${selectedEntity.position.y.toFixed(1)} m`, icon: ChevronRight },
                              { label: 'Vel X/Z', value: `${selectedEntity.velocity.x.toFixed(1)} / ${selectedEntity.velocity.z.toFixed(1)}`, icon: Activity },
                              { label: 'Entity ID', value: selectedEntity.id.split('-').slice(0, 3).join('-'), icon: Info },
                            ].map(item => (
                              <div key={item.label} className="rounded-md bg-zinc-800/50 border border-zinc-700/50 px-2 py-1.5">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <item.icon className="w-2.5 h-2.5 text-zinc-500" />
                                  <span className="text-[8px] text-zinc-500 uppercase tracking-wider font-medium">{item.label}</span>
                                </div>
                                <div className="text-[11px] font-mono text-zinc-300 font-medium">{item.value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Metadata */}
                        {selectedEntity.metadata && typeof selectedEntity.metadata === 'object' && Object.keys(selectedEntity.metadata as Record<string, unknown>).length > 0 && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em] mb-2 font-semibold">Metadata</div>
                            <div className="space-y-1">
                              {Object.entries(selectedEntity.metadata as Record<string, unknown>).slice(0, 6).map(([key, val]) => (
                                <div key={key} className="flex justify-between text-[10px]">
                                  <span className="text-zinc-500 capitalize">{key}</span>
                                  <span className="font-mono text-zinc-400">{String(val ?? '—')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
                          <Crosshair className="w-5 h-5 text-zinc-600" />
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium">No Entity Selected</div>
                        <div className="text-[10px] text-zinc-600 mt-1">Click an entity on the map to inspect its properties</div>
                      </div>
                    )}

                    {/* Entity Legend */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em] mb-2.5 font-semibold flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-zinc-600" /> Entity Legend
                      </div>
                      <div className="space-y-1.5">
                        {Object.entries(ENTITY_LABELS).map(([type, label]) => {
                          const count = entityByType[type] || 0;
                          const color = ENTITY_COLORS[type];
                          return (
                            <div key={type} className="flex items-center justify-between group">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-sm border transition-all" style={{
                                  backgroundColor: count > 0 ? `${color}30` : 'transparent',
                                  borderColor: count > 0 ? `${color}60` : `${color}20`,
                                }} />
                                <span className={`text-[11px] transition-colors ${count > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>{label}</span>
                              </div>
                              <span className={`text-[10px] font-mono tabular-nums ${count > 0 ? 'text-zinc-400' : 'text-zinc-700'}`}>{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Zone Occupancy */}
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em] mb-2.5 font-semibold flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-zinc-600" /> Zone Occupancy
                      </div>
                      <div className="space-y-2">
                        {zoneOccupancy.map(z => {
                          const pct = entities.length > 0 ? (z.count / entities.length) * 100 : 0;
                          return (
                            <div key={z.id}>
                              <div className="flex items-center justify-between text-[10px] mb-1">
                                <span className="text-zinc-400">{z.name}</span>
                                <span className="font-mono tabular-nums text-zinc-400">{z.count}</span>
                              </div>
                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-white/60 transition-all duration-700 ease-out" style={{
                                  width: `${Math.max(2, pct)}%`,
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ═══ TAB 2: TELEMETRY ═══ */}
              <TabsContent value="telemetry" className="flex-1 overflow-y-auto m-0 custom-scrollbar">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-3">
                    {telemetryStream && telemetryStream.length > 0 && Object.keys(telemetryByEntity).length > 0 ? (
                      Object.entries(telemetryByEntity).map(([entityId, data]) => {
                        const ent = entities.find(e => e.id === entityId);
                        const latest = data.values[data.values.length - 1];
                        const prev = data.values.length > 1 ? data.values[data.values.length - 2] : latest;
                        const delta = latest !== undefined && prev !== undefined ? latest - prev : 0;
                        return (
                          <div key={entityId} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
                                <span className="text-[11px] font-mono text-zinc-300 font-medium truncate max-w-[140px]">{ent?.name || entityId}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-mono text-zinc-500 uppercase">{data.sensorType}</span>
                                <span className="text-[11px] font-mono font-bold tabular-nums" style={{ color: data.color }}>
                                  {latest?.toFixed(1)}
                                </span>
                                <span className={`text-[9px] font-mono text-zinc-500`}>
                                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                                </span>
                              </div>
                            </div>
                            <Sparkline data={data.values} color={data.color} width={260} height={48} />
                            <div className="flex justify-between mt-1 text-[8px] font-mono text-zinc-600">
                              <span>{data.values.length} samples</span>
                              <span>min: {Math.min(...data.values).toFixed(1)} max: {Math.max(...data.values).toFixed(1)}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
                          <Activity className="w-5 h-5 text-zinc-600" />
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium">No Telemetry Data</div>
                        <div className="text-[10px] text-zinc-600 mt-1">Start simulation to stream live telemetry</div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ═══ TAB 3: METRICS ═══ */}
              <TabsContent value="metrics" className="flex-1 overflow-y-auto m-0 custom-scrollbar">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-3">
                    {simulationMetrics ? (
                      <>
                        {/* Summary header */}
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                          <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.2em] mb-2 font-bold">Engine Performance</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center">
                              <div className="text-lg font-mono font-bold text-white tabular-nums">{simulationMetrics.entitiesProcessed}</div>
                              <div className="text-[8px] text-zinc-500 uppercase tracking-wider">Entities</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-mono font-bold text-white tabular-nums">{simulationMetrics.eventsPerSecond}</div>
                              <div className="text-[8px] text-zinc-500 uppercase tracking-wider">Events/s</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-mono font-bold text-white tabular-nums">{simulationMetrics.averageTickDuration.toFixed(1)}<span className="text-[10px] text-zinc-500 ml-0.5">ms</span></div>
                              <div className="text-[8px] text-zinc-500 uppercase tracking-wider">Latency</div>
                            </div>
                          </div>
                        </div>

                        {/* Detailed metrics with progress bars */}
                        <div className="space-y-2.5">
                          {[
                            { icon: Box, label: 'Entities Processed', value: simulationMetrics.entitiesProcessed, display: String(simulationMetrics.entitiesProcessed), max: 50, unit: '' },
                            { icon: Activity, label: 'Events Per Second', value: simulationMetrics.eventsPerSecond, display: String(simulationMetrics.eventsPerSecond), max: 500, unit: 'evt/s' },
                            { icon: Clock, label: 'Avg Tick Duration', value: simulationMetrics.averageTickDuration, display: `${simulationMetrics.averageTickDuration.toFixed(2)}ms`, max: 50, unit: 'ms' },
                            { icon: Cpu, label: 'GPU Utilization', value: simulationMetrics.gpuUtilization, display: `${Math.round(simulationMetrics.gpuUtilization)}%`, max: 100, unit: '%' },
                            { icon: HardDrive, label: 'Memory Usage', value: simulationMetrics.memoryUsage, display: `${simulationMetrics.memoryUsage}MB`, max: 2000, unit: 'MB' },
                            { icon: Zap, label: 'Collision Checks', value: simulationMetrics.collisionChecks, display: String(simulationMetrics.collisionChecks), max: 200, unit: '' },
                            { icon: Layers, label: 'Spatial Queries', value: simulationMetrics.spatialQueries, display: String(simulationMetrics.spatialQueries), max: 300, unit: '' },
                          ].map(m => {
                            const pct = Math.min(100, (m.value / m.max) * 100);
                            const isHigh = pct > 80;
                            return (
                              <div key={m.label} className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <m.icon className="w-3 h-3 text-zinc-500" />
                                    <span className="text-[10px] text-zinc-400 font-medium">{m.label}</span>
                                  </div>
                                  <span className={`text-[11px] font-mono font-bold tabular-nums ${isHigh ? 'text-red-400' : 'text-white'}`}>
                                    {m.display}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-700 ease-out ${isHigh ? 'bg-red-500/80' : 'bg-white/40'}`} style={{
                                    width: `${Math.max(1, pct)}%`,
                                  }} />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-[8px] font-mono text-zinc-700">{m.unit}</span>
                                  <span className="text-[8px] font-mono" style={{ color: isHigh ? '#ef4444' : '#71717a' }}>{pct.toFixed(0)}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-3">
                          <Gauge className="w-5 h-5 text-zinc-600" />
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium">No Metrics Available</div>
                        <div className="text-[10px] text-zinc-600 mt-1">Start simulation to monitor engine performance</div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* ═══ TAB 4: DATA LAB ═══ */}
              <TabsContent value="datalab" className="flex-1 overflow-y-auto m-0 custom-scrollbar">
                <DataLabPanel
                  entities={entities as any}
                  telemetryStream={telemetryStream || []}
                  simulationMetrics={simulationMetrics}
                  isSimulating={isSimulating}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
