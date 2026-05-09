import {
  SimulationConfig,
  SimulationState,
  SimulationEvent,
  SimulationMetrics,
  TwinEntity,
  EntityType,
  EntityPosition,
} from '@/types';
import { getWorldStateEngine, WorldStateEngine } from '../engine/WorldStateEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhysicsConfig {
  gravity: number;
  friction: number;
  collisionRadius: number;
}

interface EntityTarget {
  x: number;
  y: number;
  z: number;
}

interface TelemetryPoint {
  entityId: string;
  sensorType: string;
  value: number;
  unit: string;
  timestamp: number;
}

/** Per-entity runtime bookkeeping (not persisted to TwinEntity). */
interface EntityRuntime {
  targetPosition: EntityTarget;
  directionBias: number; // +1 = right, -1 = left (for vehicles)
  dronePhaseOffset: number; // radians offset for sinusoidal flight
}

/** Movement profile per entity type. */
interface MovementProfile {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  minSpeed: number;
  maxSpeed: number;
  stationary: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TELEMETRY_BUFFER_MAX = 2000;

const MOVEMENT_PROFILES: Record<string, MovementProfile> = {
  vehicle: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 100, maxZ: 150, minSpeed: 5, maxSpeed: 15, stationary: false },
  forklift: { minX: 0, maxX: 200, minY: 0, maxY: 0, minZ: 0, maxZ: 100, minSpeed: 2, maxSpeed: 8, stationary: false },
  robot: { minX: 100, maxX: 200, minY: 0, maxY: 0, minZ: 0, maxZ: 100, minSpeed: 1, maxSpeed: 4, stationary: false },
  drone: { minX: 0, maxX: 300, minY: 3, maxY: 15, minZ: 0, maxZ: 150, minSpeed: 5, maxSpeed: 20, stationary: false },
  sensor: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  camera: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  conveyor: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  dock: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  machine: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  person: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 1, maxSpeed: 3, stationary: false },
  zone: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  road: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
  shelf: { minX: 0, maxX: 300, minY: 0, maxY: 0, minZ: 0, maxZ: 150, minSpeed: 0, maxSpeed: 0, stationary: true },
};

/** Telemetry sensor definitions per movable entity type. */
const TELEMETRY_SPECS: Record<string, Array<{ sensorType: string; unit: string; min: number; max: number }>> = {
  vehicle: [
    { sensorType: 'speed', unit: 'm/s', min: 5, max: 15 },
    { sensorType: 'temperature', unit: '°C', min: 60, max: 120 },
    { sensorType: 'voltage', unit: 'V', min: 360, max: 420 },
  ],
  forklift: [
    { sensorType: 'weight', unit: 'kg', min: 0, max: 2500 },
    { sensorType: 'speed', unit: 'm/s', min: 2, max: 8 },
    { sensorType: 'occupancy', unit: '%', min: 0, max: 100 },
  ],
  robot: [
    { sensorType: 'proximity', unit: 'm', min: 0, max: 10 },
    { sensorType: 'accelerometer', unit: 'g', min: 0, max: 2 },
    { sensorType: 'voltage', unit: 'V', min: 20, max: 28 },
  ],
  drone: [
    { sensorType: 'gps', unit: 'm', min: 0, max: 300 },
    { sensorType: 'accelerometer', unit: 'g', min: 0, max: 3 },
    { sensorType: 'temperature', unit: '°C', min: -20, max: 60 },
  ],
  sensor: [
    { sensorType: 'temperature', unit: '°C', min: 15, max: 40 },
    { sensorType: 'humidity', unit: '%', min: 30, max: 90 },
    { sensorType: 'pressure', unit: 'hPa', min: 990, max: 1030 },
  ],
  camera: [
    { sensorType: 'temperature', unit: '°C', min: 25, max: 55 },
    { sensorType: 'voltage', unit: 'V', min: 4.8, max: 5.2 },
  ],
  conveyor: [
    { sensorType: 'speed', unit: 'm/s', min: 0.5, max: 3 },
    { sensorType: 'temperature', unit: '°C', min: 20, max: 60 },
  ],
  dock: [
    { sensorType: 'occupancy', unit: '%', min: 0, max: 100 },
    { sensorType: 'weight', unit: 'kg', min: 0, max: 10000 },
  ],
};

// Fallback specs for anything not explicitly listed.
const DEFAULT_TELEMETRY_SPEC = [
  { sensorType: 'temperature', unit: '°C', min: 15, max: 40 },
  { sensorType: 'voltage', unit: 'V', min: 3, max: 5 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function distance2D(a: EntityPosition, b: EntityPosition): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function getMovementProfile(type: EntityType): MovementProfile {
  return MOVEMENT_PROFILES[type] ?? MOVEMENT_PROFILES.sensor;
}

function getTelemetrySpecs(type: EntityType) {
  return TELEMETRY_SPECS[type] ?? DEFAULT_TELEMETRY_SPEC;
}

// ---------------------------------------------------------------------------
// SimulationEngine
// ---------------------------------------------------------------------------

export class SimulationEngine {
  private state: SimulationState | null = null;
  private worldEngine: WorldStateEngine;
  private physicsConfig: PhysicsConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private eventBuffer: SimulationEvent[] = [];
  private tickDurationSum: number = 0;
  private tickCount: number = 0;
  private collisionCount: number = 0;
  private tickCollisionChecks: number = 0;
  private telemetryBuffer: TelemetryPoint[] = [];
  /** Per-entity runtime state keyed by entity id. */
  private entityRuntimes: Map<string, EntityRuntime> = new Map();

  constructor() {
    this.worldEngine = getWorldStateEngine();
    this.physicsConfig = { gravity: 9.81, friction: 0.92, collisionRadius: 3 };
  }

  // -----------------------------------------------------------------------
  // Public API (original)
  // -----------------------------------------------------------------------

  initialize(config: Partial<SimulationConfig> = {}): SimulationState {
    const fullConfig: SimulationConfig = {
      physicsEnabled: config.physicsEnabled ?? true,
      gravity: config.gravity ?? 9.81,
      timeScale: config.timeScale ?? 1,
      maxTicks: config.maxTicks ?? Infinity,
      gpuAccelerated: config.gpuAccelerated ?? false,
      deterministic: config.deterministic ?? true,
      collisionDetection: config.collisionDetection ?? true,
      spatialPartitioning: config.spatialPartitioning ?? true,
    };

    this.state = {
      id: `sim-${Date.now()}`,
      status: 'pending',
      config: fullConfig,
      currentTick: 0,
      startTime: Date.now(),
      entities: new Map(),
      events: [],
      metrics: this.createEmptyMetrics(),
    };

    // Load current world state entities
    const worldState = this.worldEngine.getState();
    Object.entries(worldState.entities).forEach(([id, entity]) => {
      this.state.entities.set(id, { ...entity });
    });

    // Initialize runtimes for every entity
    this.entityRuntimes.clear();
    this.state.entities.forEach((entity) => {
      this.entityRuntimes.set(entity.id, this.createEntityRuntime(entity));
    });

    return this.state;
  }

  start(): void {
    if (!this.state) throw new Error('Simulation not initialized');
    this.state.status = 'running';
    this.state.startTime = Date.now();
    this.tickDurationSum = 0;
    this.tickCount = 0;
    this.scheduleTick();
  }

  pause(): void {
    if (!this.state || this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.clearTickInterval();
  }

  resume(): void {
    if (!this.state || this.state.status !== 'paused') return;
    this.state.status = 'running';
    this.scheduleTick();
  }

  stop(): void {
    if (!this.state) return;
    this.state.status = 'completed';
    this.clearTickInterval();
    this.worldEngine.snapshot();
  }

  reset(): void {
    this.stop();
    this.state = null;
    this.eventBuffer = [];
    this.telemetryBuffer = [];
    this.tickDurationSum = 0;
    this.tickCount = 0;
    this.collisionCount = 0;
    this.tickCollisionChecks = 0;
    this.entityRuntimes.clear();
  }

  getStatus(): string {
    return this.state?.status ?? 'not_initialized';
  }

  getState(): SimulationState | null {
    return this.state;
  }

  // -----------------------------------------------------------------------
  // New public API
  // -----------------------------------------------------------------------

  /**
   * Returns the most recent telemetry points (up to `limit`).
   */
  getTelemetryBuffer(limit: number = 100): TelemetryPoint[] {
    if (limit >= this.telemetryBuffer.length) {
      return [...this.telemetryBuffer];
    }
    return this.telemetryBuffer.slice(-limit);
  }

  /**
   * Dynamically change the simulation time scale.
   * Stops the current interval and restarts it with the new rate.
   */
  setTimeScale(scale: number): void {
    if (!this.state) return;
    const clampedScale = clamp(scale, 0.1, 10);
    this.state.config.timeScale = clampedScale;
    if (this.state.status === 'running') {
      this.clearTickInterval();
      this.scheduleTick();
    }
  }

  /**
   * Cumulative collision count since the simulation started.
   */
  getCollisionCount(): number {
    return this.collisionCount;
  }

  // -----------------------------------------------------------------------
  // Tick scheduling
  // -----------------------------------------------------------------------

  private scheduleTick(): void {
    if (!this.state) return;
    // Base 50 ms interval (≈ 20 tps), scaled by timeScale.
    const tickInterval = Math.max(16, Math.round(50 / this.state.config.timeScale));
    this.intervalId = setInterval(() => {
      try {
        this.tick();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SimulationEngine] Uncaught error in tick interval: ${message}`, error);
        // Do NOT re-throw – keep the interval alive so the simulation continues
      }
    }, tickInterval);
  }

  private clearTickInterval(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // -----------------------------------------------------------------------
  // Main tick
  // -----------------------------------------------------------------------

  private tick(): void {
    if (!this.state || this.state.status !== 'running') return;
    if (this.state.currentTick >= this.state.config.maxTicks) {
      this.stop();
      return;
    }

    try {
      const tickStart = performance.now();
      this.tickCollisionChecks = 0;
      const tickCollisionsBefore = this.collisionCount;

      const entityArray = Array.from(this.state.entities.values());

      // --- Movement phase ---
      if (this.state.config.physicsEnabled) {
        for (const entity of entityArray) {
          if (entity.status !== 'active') continue;
          this.applyZoneAwareMovement(entity);
        }
      }

      // --- Collision phase ---
      if (this.state.config.collisionDetection) {
        // Only check moving entities against each other
        const moving = entityArray.filter(
          (e) => e.status === 'active' && !getMovementProfile(e.entityType).stationary,
        );
        for (let i = 0; i < moving.length; i++) {
          this.checkCollisions(moving[i], moving, i);
        }
      }

      // --- Telemetry phase (every tick) ---
      this.emitTelemetry(entityArray);

      // --- Sync to world state ---
      this.syncToWorldState();

      // --- Metrics ---
      this.state.currentTick++;
      const tickDuration = performance.now() - tickStart;
      this.tickDurationSum += tickDuration;
      this.tickCount++;

      const tickCollisions = this.collisionCount - tickCollisionsBefore;
      this.state.metrics = {
        entitiesProcessed: entityArray.length,
        eventsPerSecond: this.eventBuffer.length,
        averageTickDuration: this.tickDurationSum / this.tickCount,
        gpuUtilization: this.state.config.gpuAccelerated ? 45 + Math.random() * 40 : 0,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        collisionChecks: this.tickCollisionChecks,
        spatialQueries: this.tickCollisionChecks > 0 ? Math.max(1, Math.floor(this.tickCollisionChecks * 0.4)) : 0,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SimulationEngine] Error during tick #${this.state?.currentTick ?? '?'}: ${message}`, error);
      // Increment tick counter so the simulation doesn't stall on the same tick forever
      if (this.state) {
        this.state.currentTick++;
      }
      // Do NOT re-throw – allow the next tick to proceed
    }
  }

  // -----------------------------------------------------------------------
  // Zone-aware movement
  // -----------------------------------------------------------------------

  private createEntityRuntime(entity: TwinEntity): EntityRuntime {
    const profile = getMovementProfile(entity.entityType);
    const target = this.randomTarget(entity, profile);
    return {
      targetPosition: target,
      directionBias: Math.random() < 0.5 ? -1 : 1,
      dronePhaseOffset: Math.random() * Math.PI * 2,
    };
  }

  private randomTarget(entity: TwinEntity, profile: MovementProfile): EntityTarget {
    return {
      x: randomInRange(profile.minX, profile.maxX),
      y: randomInRange(profile.minY, profile.maxY),
      z: randomInRange(profile.minZ, profile.maxZ),
    };
  }

  private applyZoneAwareMovement(entity: TwinEntity): void {
    const profile = getMovementProfile(entity.entityType);
    if (profile.stationary) {
      // Zero out velocity for stationary entities
      entity.velocity.x = 0;
      entity.velocity.y = 0;
      entity.velocity.z = 0;
      entity.velocity.speed = 0;
      entity.lastUpdate = Date.now();
      return;
    }

    let runtime = this.entityRuntimes.get(entity.id);
    if (!runtime) {
      runtime = this.createEntityRuntime(entity);
      this.entityRuntimes.set(entity.id, runtime);
    }

    const timeScale = this.state!.config.timeScale;
    const dt = timeScale / 20; // normalised time step

    // ---- Steering toward target ----
    const dx = runtime.targetPosition.x - entity.position.x;
    const dy = runtime.targetPosition.y - entity.position.y;
    const dz = runtime.targetPosition.z - entity.position.z;
    const distToTarget = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const arrivalThreshold = profile.maxSpeed * dt * 3;

    if (distToTarget < arrivalThreshold) {
      // Reached target – pick a new one
      runtime.targetPosition = this.randomTarget(entity, profile);

      // Vehicle bias: mostly keep same direction unless at edge
      if (entity.entityType === 'vehicle') {
        if (runtime.targetPosition.x < entity.position.x) {
          runtime.directionBias = -1;
        } else {
          runtime.directionBias = 1;
        }
      }

      // Forklift: occasionally target a different warehouse zone
      if (entity.entityType === 'forklift' && Math.random() < 0.4) {
        const zones = [
          { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },   // zone A
          { minX: 100, maxX: 200, minZ: 0, maxZ: 100 }, // zone B
          { minX: 200, maxX: 300, minZ: 0, maxZ: 100 }, // zone C
        ];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        runtime.targetPosition.x = randomInRange(zone.minX, zone.maxX);
        runtime.targetPosition.z = randomInRange(zone.minZ, zone.maxZ);
        runtime.targetPosition.y = 0;
      }
    }

    // Compute desired velocity toward target
    const desiredSpeed = randomInRange(profile.minSpeed, profile.maxSpeed);
    const steerX = distToTarget > 0 ? (dx / distToTarget) * desiredSpeed : 0;
    const steerZ = distToTarget > 0 ? (dz / distToTarget) * desiredSpeed : 0;
    const steerY = distToTarget > 0 ? (dy / distToTarget) * desiredSpeed : 0;

    // ---- Type-specific velocity modifications ----
    let vx = steerX;
    let vy = steerY;
    let vz = steerZ;

    switch (entity.entityType) {
      case 'vehicle': {
        // Strong x-axis bias (drive along road)
        vx = runtime.directionBias * desiredSpeed;
        vz *= 0.3; // only slight z corrections to stay in lane
        break;
      }
      case 'forklift': {
        // Smooth approach
        vx *= 0.8;
        vz *= 0.8;
        break;
      }
      case 'robot': {
        // Precise, slow movements
        vx *= 0.5;
        vz *= 0.5;
        break;
      }
      case 'drone': {
        // Sinusoidal overlay for natural flight
        const t = this.state!.currentTick * 0.05 + runtime.dronePhaseOffset;
        vx += Math.sin(t) * 2;
        vz += Math.cos(t * 0.7) * 1.5;
        vy += Math.sin(t * 0.3) * 0.5;
        break;
      }
      default: {
        // person or unknown – use straight steering
        break;
      }
    }

    // ---- Apply friction (smoothly blend) ----
    entity.velocity.x = entity.velocity.x * this.physicsConfig.friction + vx * (1 - this.physicsConfig.friction);
    entity.velocity.y = entity.velocity.y * this.physicsConfig.friction + vy * (1 - this.physicsConfig.friction);
    entity.velocity.z = entity.velocity.z * this.physicsConfig.friction + vz * (1 - this.physicsConfig.friction);

    // ---- Clamp speed ----
    const speed = Math.sqrt(
      entity.velocity.x ** 2 + entity.velocity.y ** 2 + entity.velocity.z ** 2,
    );
    if (speed > profile.maxSpeed) {
      const scale = profile.maxSpeed / speed;
      entity.velocity.x *= scale;
      entity.velocity.y *= scale;
      entity.velocity.z *= scale;
    }
    entity.velocity.speed = Math.sqrt(
      entity.velocity.x ** 2 + entity.velocity.y ** 2 + entity.velocity.z ** 2,
    );

    // ---- Update position ----
    entity.position.x += entity.velocity.x * dt;
    entity.position.y += entity.velocity.y * dt;
    entity.position.z += entity.velocity.z * dt;

    // ---- Enforce zone boundaries ----
    entity.position.x = clamp(entity.position.x, profile.minX, profile.maxX);
    entity.position.y = clamp(entity.position.y, profile.minY, profile.maxY);
    entity.position.z = clamp(entity.position.z, profile.minZ, profile.maxZ);

    // ---- Update rotation to face movement direction ----
    if (speed > 0.1) {
      entity.rotation.y = (Math.atan2(entity.velocity.x, entity.velocity.z) * 180) / Math.PI;
    }

    entity.lastUpdate = Date.now();
  }

  // -----------------------------------------------------------------------
  // Collision detection
  // -----------------------------------------------------------------------

  private checkCollisions(
    entity: TwinEntity,
    candidates: TwinEntity[],
    startIndex: number,
  ): void {
    for (let i = startIndex + 1; i < candidates.length; i++) {
      const other = candidates[i];
      this.tickCollisionChecks++;

      const dist = distance2D(entity.position, other.position);
      if (dist < this.physicsConfig.collisionRadius && dist > 0) {
        // Increment global collision counter once per collision pair
        this.collisionCount++;

        // Normal vector
        const nx = (entity.position.x - other.position.x) / dist;
        const nz = (entity.position.z - other.position.z) / dist;

        // Relative velocity along collision normal
        const dvx = entity.velocity.x - other.velocity.x;
        const dvz = entity.velocity.z - other.velocity.z;
        const relVelNormal = dvx * nx + dvz * nz;

        // Only resolve if entities are approaching each other
        if (relVelNormal > 0) continue;

        // Elastic collision with restitution (0.7)
        const restitution = 0.7;
        const impulse = -(1 + restitution) * relVelNormal * 0.5;

        entity.velocity.x += impulse * nx;
        entity.velocity.z += impulse * nz;
        other.velocity.x -= impulse * nx;
        other.velocity.z -= impulse * nz;

        // Separate entities to prevent overlap
        const overlap = this.physicsConfig.collisionRadius - dist;
        entity.position.x += (nx * overlap) * 0.5;
        entity.position.z += (nz * overlap) * 0.5;
        other.position.x -= (nx * overlap) * 0.5;
        other.position.z -= (nz * overlap) * 0.5;

        // Record events for both
        this.addEvent('collision', entity.id, {
          otherId: other.id,
          force: Math.abs(relVelNormal),
          position: { x: (entity.position.x + other.position.x) / 2, z: (entity.position.z + other.position.z) / 2 },
        });
        this.addEvent('collision', other.id, {
          otherId: entity.id,
          force: Math.abs(relVelNormal),
          position: { x: (entity.position.x + other.position.x) / 2, z: (entity.position.z + other.position.z) / 2 },
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Telemetry emission (every tick)
  // -----------------------------------------------------------------------

  private emitTelemetry(entities: TwinEntity[]): void {
    const now = Date.now();

    for (const entity of entities) {
      if (entity.status !== 'active') continue;

      const specs = getTelemetrySpecs(entity.entityType);
      // Generate 1–2 readings per entity per tick
      const count = Math.random() < 0.6 ? 1 : 2;

      for (let i = 0; i < count; i++) {
        const spec = specs[Math.floor(Math.random() * specs.length)];

        let value: number;
        if (spec.sensorType === 'gps') {
          // GPS reports the entity's actual position
          value = Math.random() < 0.5 ? entity.position.x : entity.position.z;
        } else if (spec.sensorType === 'speed') {
          value = entity.velocity.speed;
        } else if (spec.sensorType === 'accelerometer') {
          // Accelerometer based on velocity changes
          const speed = Math.sqrt(entity.velocity.x ** 2 + entity.velocity.z ** 2);
          value = speed * 0.2 + Math.random() * 0.3;
        } else {
          // Random within expected range with slight drift
          value = randomInRange(spec.min, spec.max);
        }

        const reading: TelemetryPoint = {
          entityId: entity.id,
          sensorType: spec.sensorType,
          value: Math.round(value * 100) / 100,
          unit: spec.unit,
          timestamp: now,
        };

        this.telemetryBuffer.push(reading);
      }
    }

    // Trim the buffer to avoid unbounded growth
    if (this.telemetryBuffer.length > TELEMETRY_BUFFER_MAX) {
      this.telemetryBuffer = this.telemetryBuffer.slice(-TELEMETRY_BUFFER_MAX);
    }
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  private syncToWorldState(): void {
    if (!this.state) return;
    this.state.entities.forEach((entity) => {
      try {
        const existing = this.worldEngine.getEntity(entity.id);
        if (existing) {
          this.worldEngine.updateEntity(entity.id, {
            position: { ...entity.position },
            velocity: { ...entity.velocity },
            rotation: { ...entity.rotation },
            status: entity.status,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SimulationEngine] Failed to sync entity ${entity.id} to world state: ${message}`);
      }
    });
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  private addEvent(type: string, entityId: string, data: Record<string, unknown>): void {
    if (!this.state) return;
    const event: SimulationEvent = {
      type,
      entityId,
      data,
      tick: this.state.currentTick,
      timestamp: Date.now(),
    };
    this.state.events.push(event);
    this.eventBuffer.push(event);
    if (this.state.events.length > 5000) {
      this.state.events = this.state.events.slice(-2000);
    }
    if (this.eventBuffer.length > 100) {
      this.eventBuffer = this.eventBuffer.slice(-50);
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private createEmptyMetrics(): SimulationMetrics {
    return {
      entitiesProcessed: 0,
      eventsPerSecond: 0,
      averageTickDuration: 0,
      gpuUtilization: 0,
      memoryUsage: 0,
      collisionChecks: 0,
      spatialQueries: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let simInstance: SimulationEngine | null = null;
export function getSimulationEngine(): SimulationEngine {
  if (!simInstance) simInstance = new SimulationEngine();
  return simInstance;
}
