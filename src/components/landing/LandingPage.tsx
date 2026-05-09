'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ═══════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════ */
interface SM {
  col: number; row: number;
  x: number; y: number; w: number; h: number;
  activation: number; targetActivation: number;
  phase: number; type: number; // 0=FP32 1=FP16 2=Tensor
  cores: { x: number; y: number; active: boolean }[];
}

interface L2Block {
  x: number; y: number; w: number; h: number;
  side: string; usage: number; phase: number;
}

interface MemController {
  x: number; y: number; w: number; h: number;
  side: string; throughput: number; phase: number;
}

interface Trace {
  points: { x: number; y: number }[];
  width: number;
  signals: { p: number; s: number }[];
}

interface HBMStack {
  x: number; y: number;
  layers: number;
  bandwidth: number;
  direction: number; // 0=left 1=right
  phase: number;
}

interface SignalPacket {
  traceIdx: number;
  p: number;
  s: number;
  size: number;
}

interface DataFlowParticle {
  x: number; y: number;
  tx: number; ty: number;
  p: number; s: number;
  fromHBM: number;
}

/* ═══════════════════════════════════════════════════════════════════
   GPU ARCHITECTURE LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function LandingPage({ onLaunch }: { onLaunch: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [stats, setStats] = useState({
    sms: 0, active: 0, interconnect: 0,
    bandwidth: 0, hbmLayers: 0, pcieLanes: 0,
  });
  const mouseRef = useRef({ x: -9999, y: -9999, on: false });
  const scrollRef = useRef(0);
  const animRef = useRef(0);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0, dpr = 1;
    let frame = 0;
    let computeWaveOrigin = 0;

    /* ── SM grid config ── */
    const SM_COLS = 10, SM_ROWS = 6;
    const smList: SM[] = [];
    const l2Blocks: L2Block[] = [];
    const memControllers: MemController[] = [];
    const interconnectTraces: Trace[] = [];
    const hbmStacks: HBMStack[] = [];
    const pcieLanes: Trace[] = [];
    const dataFlows: DataFlowParticle[] = [];

    /* ── Chip die rect (recalculated on resize) ── */
    let dieX = 0, dieY = 0, dieW = 0, dieH = 0;
    let smSize = 0, smGap = 0;

    const smoothstep = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };

    /* ── Resize ── */
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      recalcLayout();
    };

    /* ── Layout calculation ── */
    const recalcLayout = () => {
      // Die occupies center ~50% of screen
      const dieAspect = 1.55; // GPU dies are wider than tall
      dieW = Math.min(W * 0.52, 800);
      dieH = dieW / dieAspect;
      dieX = (W - dieW) / 2;
      dieY = (H - dieH) / 2 - H * 0.03;

      // SM sizing
      const padX = dieW * 0.08; // padding for L2 cache
      const padY = dieH * 0.08;
      const innerW = dieW - padX * 2;
      const innerH = dieH - padY * 2;
      smSize = Math.min(
        (innerW - (SM_COLS - 1) * 4) / SM_COLS,
        (innerH - (SM_ROWS - 1) * 4) / SM_ROWS
      );
      smSize = Math.max(smSize, 8);
      smGap = (innerW - SM_COLS * smSize) / (SM_COLS - 1);

      // Position SMs
      let idx = 0;
      for (let r = 0; r < SM_ROWS; r++) {
        for (let c = 0; c < SM_COLS; c++) {
          const x = dieX + padX + c * (smSize + smGap);
          const y = dieY + padY + r * (smSize + smGap);

          if (smList[idx]) {
            smList[idx].x = x; smList[idx].y = y;
            smList[idx].w = smSize; smList[idx].h = smSize;
            smList[idx].cores = buildCores(x, y, smSize, smSize);
          }
          idx++;
        }
      }

      // L2 cache blocks (ring around die perimeter)
      recalcL2();

      // Memory controllers (on die edges)
      recalcMemControllers();

      // Interconnect traces
      recalcInterconnect();

      // HBM stacks
      recalcHBM();

      // PCIe lanes
      recalcPCIe();
    };

    const buildCores = (sx: number, sy: number, sw: number, sh: number) => {
      const cores: SM['cores'] = [];
      const grid = 4;
      const cw = sw / grid, ch = sh / grid;
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          cores.push({
            x: sx + c * cw + cw * 0.15,
            y: sy + r * ch + ch * 0.15,
            active: false,
          });
        }
      }
      return cores;
    };

    /* ── L2 cache ring ── */
    const recalcL2 = () => {
      l2Blocks.length = 0;
      const thickness = Math.max(smSize * 0.35, 6);
      const blockW = smSize * 1.1;
      const blockH = thickness;

      // Top row
      const topY = dieY + 3;
      for (let i = 0; i < 8; i++) {
        const x = dieX + dieW * 0.1 + i * (blockW + 6);
        l2Blocks.push({
          x, y: topY, w: blockW, h: blockH,
          side: 'top', usage: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
      // Bottom row
      const botY = dieY + dieH - thickness - 3;
      for (let i = 0; i < 8; i++) {
        const x = dieX + dieW * 0.1 + i * (blockW + 6);
        l2Blocks.push({
          x, y: botY, w: blockW, h: blockH,
          side: 'bottom', usage: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
      // Left col
      const leftX = dieX + 3;
      const vBlockH = (dieH - thickness * 2 - 20) / 5;
      for (let i = 0; i < 5; i++) {
        const y = dieY + thickness + 10 + i * (vBlockH + 4);
        l2Blocks.push({
          x: leftX, y, w: thickness, h: vBlockH,
          side: 'left', usage: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
      // Right col
      const rightX = dieX + dieW - thickness - 3;
      for (let i = 0; i < 5; i++) {
        const y = dieY + thickness + 10 + i * (vBlockH + 4);
        l2Blocks.push({
          x: rightX, y, w: thickness, h: vBlockH,
          side: 'right', usage: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
    };

    /* ── Memory controllers ── */
    const recalcMemControllers = () => {
      memControllers.length = 0;
      const mcW = smSize * 0.9, mcH = Math.max(smSize * 0.3, 5);
      // Top edge
      for (let i = 0; i < 6; i++) {
        const x = dieX + dieW * 0.12 + i * (mcW + 8);
        memControllers.push({
          x, y: dieY - mcH - 5, w: mcW, h: mcH,
          side: 'top', throughput: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
      // Bottom edge
      for (let i = 0; i < 6; i++) {
        const x = dieX + dieW * 0.12 + i * (mcW + 8);
        memControllers.push({
          x, y: dieY + dieH + 5, w: mcW, h: mcH,
          side: 'bottom', throughput: Math.random(), phase: Math.random() * Math.PI * 2,
        });
      }
    };

    /* ── Interconnect mesh traces ── */
    const recalcInterconnect = () => {
      interconnectTraces.length = 0;
      // Horizontal traces between adjacent SM columns
      for (let r = 0; r < SM_ROWS; r++) {
        for (let c = 0; c < SM_COLS - 1; c++) {
          const a = smList[r * SM_COLS + c];
          const b = smList[r * SM_COLS + c + 1];
          if (!a || !b) continue;
          const midY = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
          interconnectTraces.push({
            points: [
              { x: a.x + a.w, y: a.y + a.h / 2 },
              { x: (a.x + a.w + b.x) / 2, y: midY + (Math.random() - 0.5) * 2 },
              { x: b.x, y: b.y + b.h / 2 },
            ],
            width: 0.5 + Math.random() * 0.5,
            signals: [],
          });
        }
      }
      // Vertical traces between adjacent SM rows
      for (let r = 0; r < SM_ROWS - 1; r++) {
        for (let c = 0; c < SM_COLS; c++) {
          const a = smList[r * SM_COLS + c];
          const b = smList[(r + 1) * SM_COLS + c];
          if (!a || !b) continue;
          const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
          interconnectTraces.push({
            points: [
              { x: a.x + a.w / 2, y: a.y + a.h },
              { x: midX + (Math.random() - 0.5) * 2, y: (a.y + a.h + b.y) / 2 },
              { x: b.x + b.w / 2, y: b.y },
            ],
            width: 0.5 + Math.random() * 0.5,
            signals: [],
          });
        }
      }
      // Crossbar diagonals (fewer)
      for (let r = 0; r < SM_ROWS - 1; r += 2) {
        for (let c = 0; c < SM_COLS - 1; c += 2) {
          const a = smList[r * SM_COLS + c];
          const b = smList[(r + 1) * SM_COLS + c + 1];
          if (!a || !b) continue;
          interconnectTraces.push({
            points: [
              { x: a.x + a.w, y: a.y + a.h },
              { x: b.x, y: b.y },
            ],
            width: 0.3,
            signals: [],
          });
        }
      }
    };

    /* ── HBM memory stacks ── */
    const recalcHBM = () => {
      hbmStacks.length = 0;
      const stackW = Math.max(smSize * 0.7, 12);
      const stackLayerH = Math.max(smSize * 0.12, 3);
      const numLayers = 8;
      const numStacks = 4;

      // Left side stacks
      for (let i = 0; i < numStacks; i++) {
        const y = dieY + dieH * (0.15 + i * 0.22);
        hbmStacks.push({
          x: dieX - stackW - 30 - Math.random() * 10,
          y, layers: numLayers,
          bandwidth: Math.random(), direction: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
      // Right side stacks
      for (let i = 0; i < numStacks; i++) {
        const y = dieY + dieH * (0.15 + i * 0.22);
        hbmStacks.push({
          x: dieX + dieW + 30 + Math.random() * 10,
          y, layers: numLayers,
          bandwidth: Math.random(), direction: 1,
          phase: Math.random() * Math.PI * 2,
        });
      }
    };

    /* ── PCIe lanes ── */
    const recalcPCIe = () => {
      pcieLanes.length = 0;
      const laneY = dieY + dieH + 50;
      const laneCount = 16;
      const laneW = dieW * 0.8;
      const startX = (W - laneW) / 2;
      const spacing = laneW / laneCount;

      for (let i = 0; i < laneCount; i++) {
        const x = startX + i * spacing;
        pcieLanes.push({
          points: [
            { x, y: dieY + dieH + 15 },
            { x: x + (Math.random() - 0.5) * 10, y: laneY },
            { x, y: laneY + 20 },
          ],
          width: 1,
          signals: [],
        });
      }
    };

    /* ── Initialize SMs ── */
    for (let r = 0; r < SM_ROWS; r++) {
      for (let c = 0; c < SM_COLS; c++) {
        smList.push({
          col: c, row: r,
          x: 0, y: 0, w: 0, h: 0,
          activation: 0, targetActivation: 0,
          phase: Math.random() * Math.PI * 2,
          type: (r * SM_COLS + c) % 3,
          cores: [],
        });
      }
    }

    resize();

    setStats({
      sms: smList.length,
      active: 0,
      interconnect: interconnectTraces.length,
      bandwidth: 0,
      hbmLayers: hbmStacks.length * hbmStacks[0]?.layers,
      pcieLanes: pcieLanes.length,
    });
    setTimeout(() => setReady(true), 300);

    /* ══════════════════════════════════════════════════════════════
       ANIMATION UPDATE
       ══════════════════════════════════════════════════════════════ */
    const update = () => {
      frame++;

      // Compute wavefront — sweeps diagonally across SM grid
      if (frame % 120 === 0) {
        computeWaveOrigin = Math.floor(Math.random() * (SM_COLS + SM_ROWS));
      }
      const wavePos = ((frame % 120) / 120) * (SM_COLS + SM_ROWS + 4);

      // Random compute dispatches
      for (const sm of smList) {
        const waveDist = Math.abs((sm.col + sm.row) - (computeWaveOrigin + wavePos * 0.5));
        const waveActive = waveDist < 3 ? (3 - waveDist) / 3 : 0;

        // Mouse proximity activation
        let mouseActive = 0;
        if (mouseRef.current.on) {
          const cx = sm.x + sm.w / 2, cy = sm.y + sm.h / 2;
          const dx = cx - mouseRef.current.x, dy = cy - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          mouseActive = Math.max(0, 1 - dist / 180);
        }

        // Random bursts
        let randomBurst = 0;
        if (Math.random() < 0.008) {
          sm.targetActivation = 0.5 + Math.random() * 0.5;
          randomBurst = sm.targetActivation;
        }

        sm.targetActivation = Math.max(
          waveActive * 0.7 + mouseActive * 0.9 + randomBurst * 0.5,
          sm.targetActivation * 0.97 // decay
        );
        sm.activation += (sm.targetActivation - sm.activation) * 0.08;

        // Update cores
        for (let i = 0; i < sm.cores.length; i++) {
          sm.cores[i].active = sm.activation > (i / sm.cores.length);
        }
      }

      // L2 cache usage fluctuation
      for (const l2 of l2Blocks) {
        if (frame % 80 === Math.floor(l2.phase * 10) % 80) {
          l2.usage = 0.2 + Math.random() * 0.7;
        }
        l2.usage += (Math.random() - 0.5) * 0.02;
        l2.usage = Math.max(0.05, Math.min(0.95, l2.usage));
      }

      // Memory controller throughput
      for (const mc of memControllers) {
        mc.throughput += (Math.random() - 0.5) * 0.04;
        mc.throughput = Math.max(0.1, Math.min(1, mc.throughput));
      }

      // Interconnect signals
      for (const trace of interconnectTraces) {
        if (Math.random() < 0.025 && trace.signals.length < 3) {
          trace.signals.push({ p: 0, s: 0.015 + Math.random() * 0.025 });
        }
        for (let i = trace.signals.length - 1; i >= 0; i--) {
          trace.signals[i].p += trace.signals[i].s;
          if (trace.signals[i].p > 1) trace.signals.splice(i, 1);
        }
      }

      // HBM bandwidth
      for (const hbm of hbmStacks) {
        hbm.bandwidth += (Math.random() - 0.5) * 0.03;
        hbm.bandwidth = Math.max(0.15, Math.min(1, hbm.bandwidth));
      }

      // PCIe signals
      for (const lane of pcieLanes) {
        if (Math.random() < 0.015 && lane.signals.length < 2) {
          lane.signals.push({ p: 0, s: 0.02 + Math.random() * 0.03 });
        }
        for (let i = lane.signals.length - 1; i >= 0; i--) {
          lane.signals[i].p += lane.signals[i].s;
          if (lane.signals[i].p > 1) lane.signals.splice(i, 1);
        }
      }

      // Data flow particles (HBM ↔ Die)
      if (frame % 12 === 0 && dataFlows.length < 15) {
        const hbm = hbmStacks[Math.floor(Math.random() * hbmStacks.length)];
        if (hbm) {
          const targetX = hbm.direction === 0 ? dieX + 5 : dieX + dieW - 5;
          const targetY = hbm.y + hbm.layers * 3;
          dataFlows.push({
            x: hbm.x + (hbm.direction === 0 ? Math.max(smSize * 0.7, 12) : 0),
            y: hbm.y + Math.random() * hbm.layers * 3,
            tx: targetX, ty: targetY,
            p: 0, s: 0.01 + Math.random() * 0.02,
            fromHBM: hbmStacks.indexOf(hbm),
          });
        }
      }
      for (let i = dataFlows.length - 1; i >= 0; i--) {
        const df = dataFlows[i];
        df.p += df.s;
        df.x = df.x + (df.tx - df.x) * df.s * 3;
        df.y = df.y + (df.ty - df.y) * df.s * 3;
        if (df.p >= 1) dataFlows.splice(i, 1);
      }
    };

    /* ══════════════════════════════════════════════════════════════
       RENDER
       ══════════════════════════════════════════════════════════════ */
    const draw = () => {
      const scroll = scrollRef.current;
      const phase = smoothstep(Math.max(0, Math.min(1, (scroll - 0.25) / 0.3)));

      ctx.clearRect(0, 0, W, H);

      // Background: subtle silicon grid
      drawSiliconGrid(phase);

      // Data flow particles (behind die)
      drawDataFlows();

      // HBM Stacks
      drawHBMStacks(phase);

      // HBM ↔ Die connection traces
      drawHBMConnections(phase);

      // Die package outline
      drawDiePackage();

      // L2 Cache ring
      drawL2Cache();

      // Interconnect mesh
      drawInterconnect();

      // SM grid
      drawSMGrid();

      // Memory controllers
      drawMemControllers();

      // PCIe lanes
      drawPCIe(phase);

      // Active count
      if (frame % 20 === 0) {
        const activeCount = smList.filter(s => s.activation > 0.3).length;
        const totalBW = hbmStacks.reduce((s, h) => s + h.bandwidth, 0);
        setStats(prev => ({
          ...prev,
          active: activeCount,
          bandwidth: Math.round(totalBW / hbmStacks.length * 100),
        }));
      }
    };

    const drawSiliconGrid = (phase: number) => {
      const gridSize = 20;
      ctx.strokeStyle = 'rgba(255,255,255,0.015)';
      ctx.lineWidth = 0.5;
      const offsetY = phase * -100;
      for (let x = 0; x < W; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = -gridSize + (offsetY % gridSize); y < H; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    };

    const drawDiePackage = () => {
      // Outer package (substrate)
      const pad = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, dieX - pad, dieY - pad, dieW + pad * 2, dieH + pad * 2, 4);
      ctx.fill();
      ctx.stroke();

      // Pin grid on substrate edges
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      const pinSize = 2, pinGap = 8;
      // Top & bottom pins
      for (let x = dieX; x < dieX + dieW; x += pinGap) {
        ctx.fillRect(x, dieY - pad - pinSize, pinSize, pinSize);
        ctx.fillRect(x, dieY + dieH + pad, pinSize, pinSize);
      }
      // Left & right pins
      for (let y = dieY; y < dieY + dieH; y += pinGap) {
        ctx.fillRect(dieX - pad - pinSize, y, pinSize, pinSize);
        ctx.fillRect(dieX + dieW + pad, y, pinSize, pinSize);
      }

      // Die itself
      ctx.fillStyle = 'rgba(255,255,255,0.015)';
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.fillRect(dieX, dieY, dieW, dieH);
      ctx.strokeRect(dieX, dieY, dieW, dieH);

      // Die label
      ctx.font = '7px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.textAlign = 'left';
      ctx.fillText('GF110-ARCH', dieX + 6, dieY + dieH - 6);
      ctx.textAlign = 'right';
      ctx.fillText(`${SM_COLS * SM_ROWS}SM · ${(SM_COLS * SM_ROWS * 128).toLocaleString()}CUDA`, dieX + dieW - 6, dieY + dieH - 6);
    };

    const drawSMGrid = () => {
      for (const sm of smList) {
        const a = sm.activation;
        const pulse = Math.sin(frame * 0.03 + sm.phase) * 0.1 + 0.9;

        // SM background
        ctx.fillStyle = `rgba(255,255,255,${0.015 + a * 0.08})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.08 + a * 0.2})`;
        ctx.lineWidth = 0.5;
        ctx.fillRect(sm.x, sm.y, sm.w, sm.h);
        ctx.strokeRect(sm.x, sm.y, sm.w, sm.h);

        // SM activation glow
        if (a > 0.2) {
          const grad = ctx.createRadialGradient(
            sm.x + sm.w / 2, sm.y + sm.h / 2, 0,
            sm.x + sm.w / 2, sm.y + sm.h / 2, sm.w * 1.2
          );
          grad.addColorStop(0, `rgba(255,255,255,${a * 0.06 * pulse})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = grad;
          ctx.fillRect(sm.x - sm.w * 0.2, sm.y - sm.h * 0.2, sm.w * 1.4, sm.h * 1.4);
        }

        // Internal cores
        const coreGrid = 4;
        const cw = sm.w / coreGrid, ch = sm.h / coreGrid;
        for (let r = 0; r < coreGrid; r++) {
          for (let c = 0; c < coreGrid; c++) {
            const cx = sm.x + c * cw + cw * 0.18;
            const cy = sm.y + r * ch + ch * 0.18;
            const coreW = cw * 0.64, coreH = ch * 0.64;
            const isActive = a > (r * coreGrid + c) / (coreGrid * coreGrid);

            ctx.fillStyle = `rgba(255,255,255,${isActive ? 0.15 + a * 0.35 : 0.03})`;
            ctx.fillRect(cx, cy, coreW, coreH);

            if (isActive && a > 0.5) {
              // Bright dot center
              ctx.fillStyle = `rgba(255,255,255,${a * 0.4 * pulse})`;
              ctx.fillRect(cx + coreW * 0.3, cy + coreH * 0.3, coreW * 0.4, coreH * 0.4);
            }
          }
        }

        // SM type indicator (tiny dot in corner)
        const typeColors = [
          `rgba(255,255,255,${0.1 + a * 0.2})`, // FP32
          `rgba(255,255,255,${0.07 + a * 0.15})`, // FP16
          `rgba(255,255,255,${0.05 + a * 0.12})`, // Tensor
        ];
        ctx.fillStyle = typeColors[sm.type];
        ctx.fillRect(sm.x + 1, sm.y + 1, 2, 2);
      }
    };

    const drawL2Cache = () => {
      for (const l2 of l2Blocks) {
        const u = l2.usage;
        const pulse = Math.sin(frame * 0.02 + l2.phase) * 0.05 + 0.95;

        ctx.fillStyle = `rgba(255,255,255,${0.02 + u * 0.06})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.04 + u * 0.08})`;
        ctx.lineWidth = 0.5;
        ctx.fillRect(l2.x, l2.y, l2.w, l2.h);
        ctx.strokeRect(l2.x, l2.y, l2.w, l2.h);

        // Usage fill
        if (u > 0.1) {
          ctx.fillStyle = `rgba(255,255,255,${u * 0.04 * pulse})`;
          if (l2.side === 'top' || l2.side === 'bottom') {
            ctx.fillRect(l2.x, l2.y, l2.w * u, l2.h);
          } else {
            ctx.fillRect(l2.x, l2.y + l2.h * (1 - u), l2.w, l2.h * u);
          }
        }

        // Label
        if (smSize > 15) {
          ctx.font = '5px monospace';
          ctx.fillStyle = `rgba(255,255,255,0.08)`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('L2', l2.x + l2.w / 2, l2.y + l2.h / 2);
        }
      }
    };

    const drawInterconnect = () => {
      for (const trace of interconnectTraces) {
        // Draw trace line
        ctx.beginPath();
        ctx.moveTo(trace.points[0].x, trace.points[0].y);
        for (let i = 1; i < trace.points.length; i++) {
          ctx.lineTo(trace.points[i].x, trace.points[i].y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.035)';
        ctx.lineWidth = trace.width;
        ctx.stroke();

        // Draw signal pulses
        for (const sig of trace.signals) {
          const pt = pointOnPolyline(trace.points, sig.p);
          if (!pt) continue;
          const alpha = Math.sin(sig.p * Math.PI) * 0.5;
          const grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 4);
          grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
          grad.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }
    };

    const drawMemControllers = () => {
      for (const mc of memControllers) {
        const t = mc.throughput;
        ctx.fillStyle = `rgba(255,255,255,${0.03 + t * 0.08})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.06 + t * 0.1})`;
        ctx.lineWidth = 0.5;
        ctx.fillRect(mc.x, mc.y, mc.w, mc.h);
        ctx.strokeRect(mc.x, mc.y, mc.w, mc.h);

        // Activity indicator
        if (t > 0.5) {
          const pulse = Math.sin(frame * 0.05 + mc.phase) * 0.3 + 0.7;
          ctx.fillStyle = `rgba(255,255,255,${t * 0.1 * pulse})`;
          ctx.fillRect(mc.x + 1, mc.y + 1, mc.w - 2, mc.h - 2);
        }

        // Label
        if (smSize > 15) {
          ctx.font = '4.5px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('MC', mc.x + mc.w / 2, mc.y + mc.h / 2);
        }
      }

      // MC ↔ Die traces
      for (const mc of memControllers) {
        ctx.beginPath();
        if (mc.side === 'top') {
          ctx.moveTo(mc.x + mc.w / 2, mc.y + mc.h);
          ctx.lineTo(mc.x + mc.w / 2, dieY);
        } else {
          ctx.moveTo(mc.x + mc.w / 2, mc.y);
          ctx.lineTo(mc.x + mc.w / 2, dieY + dieH);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + mc.throughput * 0.03})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    };

    const drawHBMStacks = (phase: number) => {
      for (const hbm of hbmStacks) {
        const stackW = Math.max(smSize * 0.7, 12);
        const layerH = Math.max(smSize * 0.12, 3);

        for (let i = 0; i < hbm.layers; i++) {
          const y = hbm.y + i * (layerH + 1);
          const bw = hbm.bandwidth;
          const layerActive = Math.sin(frame * 0.015 + hbm.phase + i * 0.5) * 0.5 + 0.5;
          const alpha = 0.03 + bw * 0.06 * layerActive;

          // Layer rectangle
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 0.5;

          if (hbm.direction === 0) {
            ctx.fillRect(hbm.x - stackW - (hbm.layers - 1 - i) * 2, y, stackW, layerH);
            ctx.strokeRect(hbm.x - stackW - (hbm.layers - 1 - i) * 2, y, stackW, layerH);
          } else {
            ctx.fillRect(hbm.x + (hbm.layers - 1 - i) * 2, y, stackW, layerH);
            ctx.strokeRect(hbm.x + (hbm.layers - 1 - i) * 2, y, stackW, layerH);
          }
        }

        // TSV dots (Through Silicon Vias) — small dots between layers
        for (let i = 0; i < hbm.layers - 1; i++) {
          const y = hbm.y + i * (layerH + 1) + layerH;
          ctx.fillStyle = `rgba(255,255,255,${0.04 + hbm.bandwidth * 0.06})`;
          for (let v = 0; v < 3; v++) {
            const vx = hbm.y + v * (stackW / 3);
            if (hbm.direction === 0) {
              ctx.fillRect(hbm.x - stackW / 2 - (hbm.layers - 1 - i) * 2 + v * 3, y, 1.5, 1.5);
            } else {
              ctx.fillRect(hbm.x + (hbm.layers - 1 - i) * 2 + v * 3, y, 1.5, 1.5);
            }
          }
        }

        // HBM label
        if (smSize > 18) {
          ctx.font = '5px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.textAlign = 'center';
          const labelX = hbm.direction === 0
            ? hbm.x - smSize * 0.35 - (hbm.layers - 1)
            : hbm.x + smSize * 0.35 + (hbm.layers - 1);
          ctx.fillText('HBM', labelX, hbm.y - 6);
          ctx.fillText(`${Math.round(hbm.bandwidth * 3.2)}TB/s`, labelX, hbm.y + hbm.layers * (layerH + 1) + 10);
        }
      }
    };

    const drawHBMConnections = (phase: number) => {
      // Wide bus traces from HBM stacks to die edge
      for (const hbm of hbmStacks) {
        const stackW = Math.max(smSize * 0.7, 12);
        const midY = hbm.y + hbm.layers * 1.5;

        const busWidth = hbm.layers * 0.4;
        ctx.fillStyle = `rgba(255,255,255,${0.01 + hbm.bandwidth * 0.02})`;

        if (hbm.direction === 0) {
          // Left stack → left die edge
          const fromX = hbm.x;
          ctx.fillRect(fromX, midY - busWidth / 2, dieX - fromX, busWidth);
          // Bus lines
          ctx.strokeStyle = `rgba(255,255,255,${0.02 + hbm.bandwidth * 0.03})`;
          ctx.lineWidth = 0.3;
          for (let i = 0; i < hbm.layers; i++) {
            const ly = midY - busWidth / 2 + i * (busWidth / hbm.layers);
            ctx.beginPath();
            ctx.moveTo(fromX, ly);
            ctx.lineTo(dieX, ly);
            ctx.stroke();
          }
        } else {
          // Right stack → right die edge
          const toX = hbm.x;
          ctx.fillRect(dieX + dieW, midY - busWidth / 2, toX - dieX - dieW, busWidth);
          ctx.strokeStyle = `rgba(255,255,255,${0.02 + hbm.bandwidth * 0.03})`;
          ctx.lineWidth = 0.3;
          for (let i = 0; i < hbm.layers; i++) {
            const ly = midY - busWidth / 2 + i * (busWidth / hbm.layers);
            ctx.beginPath();
            ctx.moveTo(dieX + dieW, ly);
            ctx.lineTo(toX, ly);
            ctx.stroke();
          }
        }
      }
    };

    const drawDataFlows = () => {
      for (const df of dataFlows) {
        const alpha = Math.sin(df.p * Math.PI) * 0.4;
        const grad = ctx.createRadialGradient(df.x, df.y, 0, df.x, df.y, 5);
        grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha * 0.2})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(df.x, df.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    const drawPCIe = (phase: number) => {
      const alpha = phase;

      // PCIe controller label
      if (alpha > 0) {
        const laneY = dieY + dieH + 50;
        ctx.font = '6px monospace';
        ctx.fillStyle = `rgba(255,255,255,${0.06 * alpha})`;
        ctx.textAlign = 'center';
        ctx.fillText('PCIe 5.0 x16', W / 2, laneY + 35);
      }

      for (const lane of pcieLanes) {
        // Draw lane
        ctx.beginPath();
        ctx.moveTo(lane.points[0].x, lane.points[0].y);
        for (let i = 1; i < lane.points.length; i++) {
          ctx.lineTo(lane.points[i].x, lane.points[i].y);
        }
        ctx.strokeStyle = `rgba(255,255,255,${0.03 * alpha})`;
        ctx.lineWidth = lane.width;
        ctx.stroke();

        // Signals
        for (const sig of lane.signals) {
          const pt = pointOnPolyline(lane.points, sig.p);
          if (!pt) continue;
          const sa = Math.sin(sig.p * Math.PI) * 0.5 * alpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${sa})`;
          ctx.fill();
        }
      }

      // PCIe pins on die bottom
      if (alpha > 0) {
        const pinY = dieY + dieH + 8;
        ctx.fillStyle = `rgba(255,255,255,${0.05 * alpha})`;
        for (let x = dieX + dieW * 0.1; x < dieX + dieW * 0.9; x += 6) {
          ctx.fillRect(x, pinY, 2, 3);
        }
      }
    };

    /* ── Utility: point on polyline ── */
    const pointOnPolyline = (pts: { x: number; y: number }[], t: number) => {
      if (pts.length < 2) return pts[0];
      const totalLen = pts.slice(0, -1).reduce((s, p, i) => {
        const dx = pts[i + 1].x - p.x, dy = pts[i + 1].y - p.y;
        return s + Math.sqrt(dx * dx + dy * dy);
      }, 0);
      let target = Math.max(0, Math.min(1, t)) * totalLen;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (acc + segLen >= target) {
          const lt = (target - acc) / (segLen || 1);
          return { x: pts[i].x + dx * lt, y: pts[i].y + dy * lt };
        }
        acc += segLen;
      }
      return pts[pts.length - 1];
    };

    /* ── Utility: rounded rect ── */
    const roundRect = (ctx2: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      ctx2.beginPath();
      ctx2.moveTo(x + r, y);
      ctx2.lineTo(x + w - r, y);
      ctx2.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx2.lineTo(x + w, y + h - r);
      ctx2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx2.lineTo(x + r, y + h);
      ctx2.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx2.lineTo(x, y + r);
      ctx2.quadraticCurveTo(x, y, x + r, y);
      ctx2.closePath();
    };

    /* ── Main loop ── */
    const loop = () => {
      update();
      draw();
      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animRef.current);
      removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  /* ── Scroll tracking ── */
  useEffect(() => {
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      scrollRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    };
    const el = containerRef.current;
    if (el) el.addEventListener('scroll', onScroll, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (el) el.removeEventListener('scroll', onScroll);
      removeEventListener('scroll', onScroll);
    };
  }, []);

  /* ── Mouse tracking ── */
  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY, on: true }; };
    const onLeave = () => { mouseRef.current.on = false; };
    addEventListener('mousemove', onMove);
    addEventListener('mouseleave', onLeave);
    return () => { removeEventListener('mousemove', onMove); removeEventListener('mouseleave', onLeave); };
  }, []);

  return (
    <div ref={containerRef} className="bg-black" style={{ height: '220vh', overflowY: 'auto', overflowX: 'hidden' }}>

      {/* Fixed canvas */}
      <canvas ref={canvasRef} className="fixed top-0 left-0" style={{ width: '100vw', height: '100vh', zIndex: 0 }} />

      {/* Fixed top bar */}
      <motion.header
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }}
        className="fixed top-0 inset-x-0 z-30 flex items-center justify-between px-6 sm:px-10 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center">
            <span className="text-xs font-black tracking-tight text-white/60">TF</span>
          </div>
          <span className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">TwinForge</span>
        </div>
        <Button
          size="sm" onClick={onLaunch}
          className="bg-white hover:bg-zinc-200 text-black border-0 font-semibold gap-2 text-xs px-4 h-8 rounded-lg"
        >
          Launch <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </motion.header>

      {/* Section 1: GPU Die View (0-100vh) */}
      <section className="relative z-10 pointer-events-none" style={{ height: '100vh' }}>
        <div className="h-full flex flex-col items-center justify-center px-6">
          <AnimatePresence>
            {ready && (
              <motion.div
                initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="text-center"
              >
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/25 mb-4 font-mono">Silicon Architecture</p>
                <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.05]">
                  GPU die in motion.<br />
                  <span className="text-white/30">Every core alive.</span>
                </h1>
                <p className="mt-4 text-sm text-white/20 max-w-md mx-auto">
                  Streaming multiprocessors fire in wavefronts. L2 cache thrums with data.
                  Interconnect signals propagate at nanosecond scale.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 1 }}
            className="mt-14 flex items-center gap-10 sm:gap-16 text-center"
          >
            {[
              { v: stats.sms, l: 'Stream Processors' },
              { v: stats.active, l: 'Active Cores' },
              { v: stats.interconnect, l: 'Interconnects' },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-xl font-bold font-mono text-white/60">{s.v}</div>
                <div className="text-[9px] text-white/15 uppercase tracking-[0.15em] mt-0.5">{s.l}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/15">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent animate-pulse" />
        </motion.div>
      </section>

      {/* Section 2: Transition zone */}
      <section className="relative z-10 pointer-events-none" style={{ height: '20vh' }}>
        <div className="h-full flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ duration: 0.8 }}
            className="text-center"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/20 font-mono">System Interconnect</p>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-white/30 animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Section 3: System View (120vh - 220vh) */}
      <section className="relative z-10 pointer-events-none" style={{ height: '100vh' }}>
        <div className="h-full flex flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-center"
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/25 mb-4 font-mono">Memory & I/O</p>
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.05]">
              HBM streaming.<br />
              <span className="text-white/30">PCIe lanes active.</span>
            </h1>
            <p className="mt-4 text-sm text-white/20 max-w-md mx-auto">
              High-bandwidth memory stacks pump tensors through wide buses.
              Memory controllers dispatch at full throughput. PCIe lanes hum with inference data.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
            viewport={{ once: true }} transition={{ delay: 0.5, duration: 1 }}
            className="mt-14 flex items-center gap-10 sm:gap-16 text-center"
          >
            {[
              { v: stats.hbmLayers, l: 'HBM Layers' },
              { v: `${stats.bandwidth}%`, l: 'Memory BW' },
              { v: stats.pcieLanes, l: 'PCIe Lanes' },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-xl font-bold font-mono text-white/60">{s.v}</div>
                <div className="text-[9px] text-white/15 uppercase tracking-[0.15em] mt-0.5">{s.l}</div>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: 0.8, duration: 0.8 }}
            className="mt-16 pointer-events-auto"
          >
            <Button
              size="lg" onClick={onLaunch}
              className="bg-white hover:bg-zinc-200 text-black border-0 font-bold gap-2.5 text-sm px-8 h-12 rounded-xl shadow-lg shadow-white/10"
            >
              Enter Platform <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
