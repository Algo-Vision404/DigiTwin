'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimulationStore } from '@/store/simulation-store';
import { CommandCenterShell } from '@/components/dashboard/CommandCenterShell';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { SimulationView } from '@/components/simulation/SimulationView';
import { TelemetryView } from '@/components/telemetry/TelemetryView';
import { AnalyticsView } from '@/components/analytics/AnalyticsView';
import { ScenariosView } from '@/components/scenarios/ScenariosView';
import { ObservabilityView } from '@/components/observability/ObservabilityView';
import { EntitiesView } from '@/components/entities/EntitiesView';
import LandingPage from '@/components/landing/LandingPage';

export default function Home() {
  const [showLanding, setShowLanding] = useState(true);
  const store = useSimulationStore();
  const {
    activeView, setActiveView, setKPIs, setSimulating,
    setEntities, setSimulationStatus, setSimulationMetrics, setCurrentTick,
    setGPUStatus, updateSystemMetric, addTelemetryPoint, setRecommendations,
    addAnomaly, simulationStatus, isSimulating,
  } = store;

  const { sendSimulationControl } = useWebSocket();

  const handleLaunch = () => {
    setShowLanding(false);
    window.scrollTo(0, 0);
  };

  // ── Unified data fetching: KPIs + GPU + metrics (every 5s) ──
  useEffect(() => {
    if (showLanding) return;

    const fetchObservability = async () => {
      try {
        const res = await fetch('/api/observability');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        if (data.kpis) setKPIs(data.kpis);
        if (data.gpuStatus) setGPUStatus(data.gpuStatus);
        if (data.metricsHistory) {
          Object.entries(data.metricsHistory).forEach(([key, values]: [string, any]) => {
            updateSystemMetric(key, values.map((v: any) => v.value));
          });
        }
      } catch { /* silent */ }
    };
    fetchObservability();
    const iv = setInterval(fetchObservability, 5000);
    return () => clearInterval(iv);
  }, [showLanding, setKPIs, setGPUStatus, updateSystemMetric]);

  // ── Simulation state + entities + telemetry (every 800ms when running) ──
  useEffect(() => {
    if (showLanding) return;
    if (!isSimulating && simulationStatus !== 'running') return;

    const fetchSimState = async () => {
      try {
        const res = await fetch('/api/simulation');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        if (data.liveEntities?.length > 0) setEntities(data.liveEntities);

        if (data.simulation) {
          setSimulationStatus(data.simulation.status);
          setCurrentTick(data.simulation.currentTick || 0);
          if (data.simulation.metrics) setSimulationMetrics(data.simulation.metrics);
        }

        if (data.recentTelemetry?.length > 0) {
          data.recentTelemetry.forEach((t: { entityId: string; sensorType: string; value: number; timestamp: number }) => {
            addTelemetryPoint({
              entityId: t.entityId,
              sensorType: t.sensorType,
              value: t.value,
              timestamp: t.timestamp,
            });
          });
        }
      } catch { /* silent */ }
    };

    fetchSimState();
    const iv = setInterval(fetchSimState, 800);
    return () => clearInterval(iv);
  }, [showLanding, isSimulating, simulationStatus, setEntities, setSimulationStatus, setSimulationMetrics, setCurrentTick, addTelemetryPoint]);

  // ── Load entities on mount ──
  useEffect(() => {
    if (showLanding) return;

    const fetchEntities = async () => {
      try {
        const res = await fetch('/api/entities');
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && data.liveEntities?.length > 0) setEntities(data.liveEntities);
      } catch { /* silent */ }
    };
    fetchEntities();
    const iv = setInterval(fetchEntities, 15000);
    return () => clearInterval(iv);
  }, [showLanding, setEntities]);

  // ── AI analytics (every 15s) ──
  useEffect(() => {
    if (showLanding) return;

    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;
        if (data.recommendations) setRecommendations(data.recommendations);
        if (data.anomalies) {
          data.anomalies.forEach((a: any) => {
            addAnomaly({
              id: a.id || `anomaly-${Date.now()}-${a.metric || Math.random()}`,
              type: a.anomalyType || a.metric || 'unknown',
              severity: a.severity,
              description: a.description,
              metadata: {},
              isResolved: a.isResolved || false,
              timestamp: a.createdAt ? new Date(a.createdAt).getTime() : (a.timestamp || Date.now()),
            });
          });
        }
      } catch { /* silent */ }
    };
    fetchAnalytics();
    const iv = setInterval(fetchAnalytics, 15000);
    return () => clearInterval(iv);
  }, [showLanding, setRecommendations, addAnomaly]);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardView />;
      case 'simulation': return <SimulationView />;
      case 'entities': return <EntitiesView />;
      case 'telemetry': return <TelemetryView />;
      case 'analytics': return <AnalyticsView />;
      case 'scenarios': return <ScenariosView />;
      case 'observability': return <ObservabilityView />;
      default: return <DashboardView />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {showLanding ? (
        <motion.div
          key="landing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          <LandingPage onLaunch={handleLaunch} />
        </motion.div>
      ) : (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          <CommandCenterShell activeView={activeView} onViewChange={setActiveView}>
            {renderView()}
          </CommandCenterShell>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
