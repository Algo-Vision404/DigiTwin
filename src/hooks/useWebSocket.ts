'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSimulationStore } from '@/store/simulation-store';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);
  const store = useSimulationStore();

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const socket = io("/?XTransformPort=3003", {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected to Digital Twin service');
      store.addNotification({ type: 'success', message: 'Connected to real-time simulation stream' });
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
    });

    socket.on('entity:state-change', (data: any) => {
      const { entities, tick } = data.payload;
      store.setEntities(entities.map((e: any) => ({
        id: e.id,
        environmentId: 'demo-env',
        entityType: e.type,
        name: e.name,
        position: e.position,
        rotation: { x: 0, y: 0, z: 0 },
        velocity: e.velocity,
        status: e.status,
        metadata: {},
        properties: {},
        lastUpdate: data.timestamp,
      })));
      store.setCurrentTick(tick);
    });

    socket.on('telemetry:update', (data: any) => {
      store.addTelemetryPoint({
        entityId: data.payload.entityId,
        value: data.payload.value,
        sensorType: data.payload.sensorType,
        timestamp: data.timestamp,
      });
    });

    socket.on('simulation:tick', (data: any) => {
      store.setSimulationMetrics(data.payload.metrics);
      store.setSimulating(true);
    });

    socket.on('simulation:status', (data: any) => {
      store.setSimulationStatus(data.payload.status);
      store.setSimulating(data.payload.status === 'running');
    });

    socket.on('heatmap:update', (data: any) => {
      store.setHeatmaps([data.payload]);
    });

    socket.on('anomaly:detected', (data: any) => {
      const anomaly = data.payload;
      store.addAnomaly({
        id: anomaly.id,
        type: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        metadata: anomaly.metadata,
        isResolved: anomaly.isResolved,
        timestamp: data.timestamp,
      });
      store.addNotification({ type: 'warning', message: anomaly.description });
    });

    socket.on('ai:recommendation', (data: any) => {
      const rec = data.payload;
      const current = store.recommendations;
      store.setRecommendations([{
        id: rec.id,
        type: rec.type,
        priority: rec.priority,
        title: rec.title,
        description: rec.description,
        impact: rec.impact,
        confidence: rec.confidence,
        status: rec.status,
        timestamp: data.timestamp,
      }, ...current.slice(0, 19)]);
    });

    socket.on('metric:update', (data: any) => {
      const { metrics, gpuStatus } = data.payload;
      Object.entries(metrics).forEach(([key, value]) => {
        const existing = store.systemMetrics[key] || [];
        store.updateSystemMetric(key, [...existing.slice(-199), value as number]);
      });
      if (gpuStatus) {
        store.setGPUStatus(gpuStatus);
      }
    });

    socket.on('system:notification', (data: any) => {
      store.addNotification({ type: 'info', message: data.payload.message });
    });

    socketRef.current = socket;
  }, [store]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const sendEntityControl = useCallback((entityId: string, action: string, params: Record<string, unknown>) => {
    socketRef.current?.emit('entity:control', { entityId, action, params });
  }, []);

  const sendSimulationControl = useCallback((action: string, speed?: number) => {
    socketRef.current?.emit('simulation:control', { action, speed });
  }, []);

  useEffect(() => {
    connect();
    return () => { disconnect(); };
  }, [connect, disconnect]);

  return { connect, disconnect, sendEntityControl, sendSimulationControl };
}
