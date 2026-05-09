// Core Entity Types
export interface EntityPosition { x: number; y: number; z: number; }
export interface EntityRotation { x: number; y: number; z: number; }
export interface EntityVelocity { x: number; y: number; z: number; speed: number; }

export type EntityType = 'vehicle' | 'robot' | 'drone' | 'sensor' | 'camera' | 'machine' | 'zone' | 'road' | 'shelf' | 'person' | 'forklift' | 'conveyor' | 'dock';
export type EntityStatus = 'active' | 'inactive' | 'warning' | 'error' | 'maintenance';
export type SensorType = 'gps' | 'temperature' | 'humidity' | 'speed' | 'occupancy' | 'rfid' | 'lidar' | 'camera' | 'accelerometer' | 'pressure' | 'voltage' | 'weight' | 'proximity';
export type TelemetrySource = 'iot' | 'mqtt' | 'kafka' | 'api' | 'csv' | 'websocket' | 'rfid' | 'drone' | 'robot';
export type EnvironmentType = 'smart-city' | 'warehouse' | 'robotics' | 'industrial' | 'logistics' | 'traffic' | 'autonomous';
export type SimulationStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
export type ScenarioType = 'road-closure' | 'demand-surge' | 'equipment-failure' | 'weather-event' | 'staff-shortage' | 'custom';
export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';
export type UserRole = 'admin' | 'operator' | 'analyst' | 'viewer';

export interface TwinEntity {
  id: string;
  environmentId: string;
  entityType: EntityType;
  name: string;
  description?: string;
  position: EntityPosition;
  rotation: EntityRotation;
  velocity: EntityVelocity;
  status: EntityStatus;
  metadata: Record<string, unknown>;
  properties: Record<string, unknown>;
  lastUpdate: number;
}

export interface TelemetryData {
  id?: string;
  entityId: string;
  sensorType: SensorType;
  source: TelemetrySource;
  value: number;
  unit?: string;
  quality: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface SimulationConfig {
  physicsEnabled: boolean;
  gravity: number;
  timeScale: number;
  maxTicks: number;
  gpuAccelerated: boolean;
  deterministic: boolean;
  collisionDetection: boolean;
  spatialPartitioning: boolean;
}

export interface SimulationState {
  id: string;
  status: SimulationStatus;
  config: SimulationConfig;
  currentTick: number;
  startTime: number;
  entities: Map<string, TwinEntity>;
  events: SimulationEvent[];
  metrics: SimulationMetrics;
}

export interface SimulationEvent {
  type: string;
  entityId: string;
  data: Record<string, unknown>;
  tick: number;
  timestamp: number;
}

export interface SimulationMetrics {
  entitiesProcessed: number;
  eventsPerSecond: number;
  averageTickDuration: number;
  gpuUtilization: number;
  memoryUsage: number;
  collisionChecks: number;
  spatialQueries: number;
}

export interface ScenarioConfig {
  type: ScenarioType;
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  baselineSnapshotId?: string;
  monteCarloRuns?: number;
  maxBranches?: number;
}

export interface ScenarioResult {
  scenarioId: string;
  riskScore: number;
  estimatedDelay: number;
  estimatedCost: number;
  affectedEntities: string[];
  recommendations: string[];
  confidence: number;
  completedBranches: number;
  totalBranches: number;
}

export interface PredictionResult {
  type: string;
  value: number;
  confidence: number;
  timeframe: string;
  impact: string;
  recommendations: string[];
}

export interface Anomaly {
  id: string;
  entityId?: string;
  type: string;
  severity: AnomalySeverity;
  description: string;
  metadata: Record<string, unknown>;
  isResolved: boolean;
  timestamp: number;
}

export interface AIRecommendation {
  id: string;
  type: string;
  priority: RecommendationPriority;
  title: string;
  description: string;
  impact: Record<string, number>;
  confidence: number;
  status: 'pending' | 'acknowledged' | 'implemented' | 'dismissed';
  timestamp: number;
}

export interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  labels: Record<string, string>;
  timestamp: number;
}

export interface GPUStatus {
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  temperature: number;
  powerUsage: number;
  activeTasks: string[];
}

export interface WorldState {
  version: number;
  timestamp: number;
  entities: Record<string, TwinEntity>;
  zones: ZoneDefinition[];
  connections: ConnectionDefinition[];
}

export interface ZoneDefinition {
  id: string;
  name: string;
  type: string;
  bounds: { min: EntityPosition; max: EntityPosition };
  capacity: number;
  currentOccupancy: number;
  properties: Record<string, unknown>;
}

export interface ConnectionDefinition {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  capacity: number;
  currentLoad: number;
}

export interface HeatmapData {
  id: string;
  name: string;
  type: 'density' | 'traffic' | 'temperature' | 'occupancy' | 'risk';
  data: Array<{ x: number; y: number; value: number }>;
  bounds: { width: number; height: number };
  timestamp: number;
}

// WebSocket event types
export interface WSMessage {
  type: 'telemetry:update' | 'entity:state-change' | 'simulation:tick' | 'simulation:complete' | 'simulation:status' | 'alert:triggered' | 'anomaly:detected' | 'ai:recommendation' | 'metric:update' | 'scenario:progress' | 'heatmap:update' | 'system:notification';
  payload: unknown;
  timestamp: number;
}

export interface ReplayState {
  isReplaying: boolean;
  currentTime: number;
  startRange: number;
  endRange: number;
  playbackSpeed: number;
  selectedEntities: string[];
}

// Dashboard KPI types
export interface KPIData {
  label: string;
  value: number;
  unit: string;
  change: number;
  changeDirection: 'up' | 'down' | 'stable';
  status: 'normal' | 'warning' | 'critical';
}
