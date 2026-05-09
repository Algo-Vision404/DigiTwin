import { create } from 'zustand';
import { TwinEntity, SimulationMetrics, HeatmapData, ReplayState, KPIData, AIRecommendation, Anomaly, PredictionResult, ScenarioConfig, ScenarioResult } from '@/types';

interface SimulationStore {
  // World state
  entities: TwinEntity[];
  selectedEntityId: string | null;

  // Simulation
  isSimulating: boolean;
  simulationStatus: string;
  simulationSpeed: number;
  simulationMetrics: SimulationMetrics | null;
  currentTick: number;

  // Telemetry
  telemetryStream: Array<{ entityId: string; value: number; sensorType: string; timestamp: number }>;

  // Analytics
  recommendations: AIRecommendation[];
  anomalies: Anomaly[];
  predictions: PredictionResult[];

  // Observability
  kpis: KPIData[];
  systemMetrics: Record<string, number[]>;
  gpuStatus: { utilization: number; memoryUsed: number; memoryTotal: number; temperature: number } | null;

  // Scenario
  activeScenario: ScenarioResult | null;
  scenarioHistory: ScenarioResult[];

  // Replay
  replayState: ReplayState;

  // Heatmap
  heatmaps: HeatmapData[];

  // UI state
  activeView: string;
  sidebarCollapsed: boolean;
  notifications: Array<{ id: string; type: string; message: string; timestamp: number }>;

  // Actions
  setEntities: (entities: TwinEntity[]) => void;
  updateEntity: (id: string, updates: Partial<TwinEntity>) => void;
  selectEntity: (id: string | null) => void;
  setSimulating: (isSimulating: boolean) => void;
  setSimulationStatus: (status: string) => void;
  setSimulationSpeed: (speed: number) => void;
  setSimulationMetrics: (metrics: SimulationMetrics | null) => void;
  setCurrentTick: (tick: number) => void;
  addTelemetryPoint: (point: { entityId: string; value: number; sensorType: string; timestamp: number }) => void;
  clearTelemetryStream: () => void;
  setRecommendations: (recs: AIRecommendation[]) => void;
  addAnomaly: (anomaly: Anomaly) => void;
  setPredictions: (predictions: PredictionResult[]) => void;
  setKPIs: (kpis: KPIData[]) => void;
  updateSystemMetric: (name: string, values: number[]) => void;
  setGPUStatus: (status: { utilization: number; memoryUsed: number; memoryTotal: number; temperature: number } | null) => void;
  setActiveScenario: (scenario: ScenarioResult | null) => void;
  addScenarioResult: (result: ScenarioResult) => void;
  setReplayState: (state: Partial<ReplayState>) => void;
  setHeatmaps: (heatmaps: HeatmapData[]) => void;
  setActiveView: (view: string) => void;
  toggleSidebar: () => void;
  addNotification: (notification: { type: string; message: string }) => void;
  removeNotification: (id: string) => void;
}

export const useSimulationStore = create<SimulationStore>((set) => ({
  entities: [],
  selectedEntityId: null,
  isSimulating: false,
  simulationStatus: 'idle',
  simulationSpeed: 1,
  simulationMetrics: null,
  currentTick: 0,
  telemetryStream: [],
  recommendations: [],
  anomalies: [],
  predictions: [],
  kpis: [],
  systemMetrics: {},
  gpuStatus: null,
  activeScenario: null,
  scenarioHistory: [],
  replayState: { isReplaying: false, currentTime: 0, startRange: 0, endRange: 0, playbackSpeed: 1, selectedEntities: [] },
  heatmaps: [],
  activeView: 'dashboard',
  sidebarCollapsed: false,
  notifications: [],

  setEntities: (entities) => set({ entities }),
  updateEntity: (id, updates) => set((state) => ({
    entities: state.entities.map(e => e.id === id ? { ...e, ...updates } : e),
  })),
  selectEntity: (id) => set({ selectedEntityId: id }),
  setSimulating: (isSimulating) => set({ isSimulating }),
  setSimulationStatus: (status) => set({ simulationStatus: status }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
  setSimulationMetrics: (metrics) => set({ simulationMetrics: metrics }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  addTelemetryPoint: (point) => set((state) => ({
    telemetryStream: [...state.telemetryStream.slice(-500), point],
  })),
  clearTelemetryStream: () => set({ telemetryStream: [] }),
  setRecommendations: (recs) => set({ recommendations: recs }),
  addAnomaly: (anomaly) => set((state) => ({
    anomalies: [anomaly, ...state.anomalies.slice(0, 50)],
  })),
  setPredictions: (predictions) => set({ predictions }),
  setKPIs: (kpis) => set({ kpis }),
  updateSystemMetric: (name, values) => set((state) => ({
    systemMetrics: { ...state.systemMetrics, [name]: values },
  })),
  setGPUStatus: (status) => set({ gpuStatus: status }),
  setActiveScenario: (scenario) => set({ activeScenario: scenario }),
  addScenarioResult: (result) => set((state) => ({
    scenarioHistory: [result, ...state.scenarioHistory.slice(0, 20)],
  })),
  setReplayState: (partial) => set((state) => ({
    replayState: { ...state.replayState, ...partial },
  })),
  setHeatmaps: (heatmaps) => set({ heatmaps }),
  setActiveView: (view) => set({ activeView: view }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  addNotification: (notification) => set((state) => ({
    notifications: [...state.notifications, { ...notification, id: `notif-${Date.now()}-${Math.random()}`, timestamp: Date.now() }].slice(-20),
  })),
  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),
}));
