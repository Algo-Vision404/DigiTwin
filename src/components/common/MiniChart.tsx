'use client';

import React from 'react';
import { useSimulationStore } from '@/store/simulation-store';

interface MiniChartProps {
  dataKey: string;
  color?: string;
  height?: number;
}

export function MiniChart({ dataKey, color = 'hsl(160, 72%, 45%)', height = 100 }: MiniChartProps) {
  const { systemMetrics } = useSimulationStore();
  const rawData = systemMetrics[dataKey];

  // Defensive: ensure we always have a valid number array
  const data = Array.isArray(rawData)
    ? rawData.filter((v: unknown): v is number => typeof v === 'number' && isFinite(v))
    : [];

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        Collecting data...
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const heightVal = height;
  const step = width / (data.length - 1);

  const points = data.map((val, i) => {
    const x = i * step;
    const y = heightVal - ((val - min) / range) * (heightVal - 10) - 5;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,${heightVal} ${points} ${width},${heightVal}`;

  return (
    <svg viewBox={`0 0 ${width} ${heightVal}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${dataKey})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) * step} cy={heightVal - ((data[data.length - 1] - min) / range) * (heightVal - 10) - 5} r="2" fill={color} />
    </svg>
  );
}
