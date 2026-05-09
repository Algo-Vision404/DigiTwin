import { EntityPosition, TwinEntity, WorldState, ZoneDefinition, ConnectionDefinition, EntityType } from '@/types';

interface StateDiff {
  added: string[];
  updated: string[];
  removed: string[];
  timestamp: number;
}

interface SpatialHashCell {
  entities: string[];
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

export class WorldStateEngine {
  private state: WorldState;
  private spatialHash: Map<string, SpatialHashCell> = new Map();
  private spatialCellSize: number;
  private eventLog: Array<{ type: string; data: unknown; timestamp: number }> = [];
  private stateHistory: Array<{ state: WorldState; version: number; timestamp: number }> = [];
  private maxHistorySize: number;
  private subscribers: Map<string, Set<(diff: StateDiff) => void>> = new Map();

  constructor(cellSize: number = 10, maxHistorySize: number = 1000) {
    this.spatialCellSize = cellSize;
    this.maxHistorySize = maxHistorySize;
    this.state = {
      version: 0,
      timestamp: Date.now(),
      entities: {},
      zones: [],
      connections: [],
    };
  }

  // Entity management
  addEntity(entity: TwinEntity): void {
    if (this.state.entities[entity.id]) {
      throw new Error(`Entity ${entity.id} already exists`);
    }
    this.state.entities[entity.id] = entity;
    this.updateSpatialHash(entity.id, entity.position);
    this.state.version++;
    this.recordEvent('entity:added', { entityId: entity.id });
    this.notifySubscribers({ added: [entity.id], updated: [], removed: [], timestamp: Date.now() });
  }

  updateEntity(entityId: string, updates: Partial<TwinEntity>): StateDiff {
    const existing = this.state.entities[entityId];
    if (!existing) throw new Error(`Entity ${entityId} not found`);

    if (updates.position && (updates.position.x !== existing.position.x || updates.position.z !== existing.position.z)) {
      this.removeSpatialHash(entityId, existing.position);
    }

    Object.assign(existing, updates, { lastUpdate: Date.now() });
    this.state.entities[entityId] = existing;

    if (updates.position) {
      this.updateSpatialHash(entityId, updates.position);
    }

    this.state.version++;
    this.recordEvent('entity:updated', { entityId, updates });
    const diff: StateDiff = { added: [], updated: [entityId], removed: [], timestamp: Date.now() };
    this.notifySubscribers(diff);
    return diff;
  }

  removeEntity(entityId: string): void {
    const entity = this.state.entities[entityId];
    if (!entity) throw new Error(`Entity ${entityId} not found`);
    this.removeSpatialHash(entityId, entity.position);
    delete this.state.entities[entityId];
    this.state.version++;
    this.recordEvent('entity:removed', { entityId });
    this.notifySubscribers({ added: [], updated: [], removed: [entityId], timestamp: Date.now() });
  }

  getEntity(entityId: string): TwinEntity | undefined {
    return this.state.entities[entityId];
  }

  getEntitiesByType(type: EntityType): TwinEntity[] {
    return Object.values(this.state.entities).filter(e => e.entityType === type);
  }

  getEntitiesByStatus(status: string): TwinEntity[] {
    return Object.values(this.state.entities).filter(e => e.status === status);
  }

  getAllEntities(): TwinEntity[] {
    return Object.values(this.state.entities);
  }

  // State management
  getState(): WorldState {
    return { ...this.state };
  }

  getStateVersion(): number { return this.state.version; }

  snapshot(): WorldState {
    const snapshot = JSON.parse(JSON.stringify(this.state));
    this.stateHistory.push({ state: snapshot, version: snapshot.version, timestamp: Date.now() });
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
    return snapshot;
  }

  rollback(targetVersion: number): WorldState | null {
    const historyEntry = this.stateHistory.find(h => h.version === targetVersion);
    if (!historyEntry) return null;
    this.state = JSON.parse(JSON.stringify(historyEntry.state));
    this.rebuildSpatialHash();
    this.recordEvent('state:rollback', { targetVersion });
    return this.state;
  }

  getStateAtVersion(version: number): WorldState | null {
    const entry = this.stateHistory.find(h => h.version === version);
    return entry ? JSON.parse(JSON.stringify(entry.state)) : null;
  }

  getHistoryRange(startVersion: number, endVersion: number): WorldState[] {
    return this.stateHistory
      .filter(h => h.version >= startVersion && h.version <= endVersion)
      .map(h => JSON.parse(JSON.stringify(h.state)));
  }

  // Spatial indexing
  private getCellKey(x: number, z: number): string {
    return `${Math.floor(x / this.spatialCellSize)},${Math.floor(z / this.spatialCellSize)}`;
  }

  private updateSpatialHash(entityId: string, pos: EntityPosition): void {
    const key = this.getCellKey(pos.x, pos.z);
    let cell = this.spatialHash.get(key);
    if (!cell) {
      cell = {
        entities: [],
        bounds: {
          minX: Math.floor(pos.x / this.spatialCellSize) * this.spatialCellSize,
          minZ: Math.floor(pos.z / this.spatialCellSize) * this.spatialCellSize,
          maxX: Math.floor(pos.x / this.spatialCellSize) * this.spatialCellSize + this.spatialCellSize,
          maxZ: Math.floor(pos.z / this.spatialCellSize) * this.spatialCellSize + this.spatialCellSize,
        },
      };
      this.spatialHash.set(key, cell);
    }
    if (!cell.entities.includes(entityId)) cell.entities.push(entityId);
  }

  private removeSpatialHash(entityId: string, pos: EntityPosition): void {
    const key = this.getCellKey(pos.x, pos.z);
    const cell = this.spatialHash.get(key);
    if (cell) {
      cell.entities = cell.entities.filter(id => id !== entityId);
      if (cell.entities.length === 0) this.spatialHash.delete(key);
    }
  }

  private rebuildSpatialHash(): void {
    this.spatialHash.clear();
    Object.entries(this.state.entities).forEach(([id, entity]) => {
      this.updateSpatialHash(id, entity.position);
    });
  }

  queryNearby(position: EntityPosition, radius: number): TwinEntity[] {
    // Defensive: always return an array even if inputs are invalid
    if (!position || typeof radius !== 'number' || radius <= 0) {
      return [];
    }

    const resultEntities: TwinEntity[] = [];
    const seen = new Set<string>();
    const safeRadius = Math.max(0, radius);
    const minCellX = Math.floor((position.x - safeRadius) / this.spatialCellSize);
    const maxCellX = Math.floor((position.x + safeRadius) / this.spatialCellSize);
    const minCellZ = Math.floor((position.z - safeRadius) / this.spatialCellSize);
    const maxCellZ = Math.floor((position.z + safeRadius) / this.spatialCellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const cell = this.spatialHash.get(`${cx},${cz}`);
        if (cell && Array.isArray(cell.entities)) {
          for (const eid of cell.entities) {
            const entity = this.state.entities[eid];
            if (entity && !seen.has(eid)) {
              seen.add(eid);
              const dx = entity.position.x - position.x;
              const dz = entity.position.z - position.z;
              if (Math.sqrt(dx * dx + dz * dz) <= safeRadius) {
                resultEntities.push(entity);
              }
            }
          }
        }
      }
    }
    return resultEntities;
  }

  // Zone management
  addZone(zone: ZoneDefinition): void {
    this.state.zones.push(zone);
    this.state.version++;
  }

  getZone(id: string): ZoneDefinition | undefined {
    return this.state.zones.find(z => z.id === id);
  }

  getZones(): ZoneDefinition[] { return this.state.zones; }

  // Connection management
  addConnection(connection: ConnectionDefinition): void {
    this.state.connections.push(connection);
    this.state.version++;
  }

  // Event sourcing
  private recordEvent(type: string, data: unknown): void {
    this.eventLog.push({ type, data, timestamp: Date.now() });
    if (this.eventLog.length > 10000) this.eventLog.shift();
  }

  getEvents(limit: number = 100): typeof this.eventLog {
    return this.eventLog.slice(-limit);
  }

  // Pub/Sub
  subscribe(eventType: string, callback: (diff: StateDiff) => void): () => void {
    if (!this.subscribers.has(eventType)) this.subscribers.set(eventType, new Set());
    this.subscribers.get(eventType)!.add(callback);
    return () => { this.subscribers.get(eventType)?.delete(callback); };
  }

  private notifySubscribers(diff: StateDiff): void {
    this.subscribers.get('all')?.forEach(cb => cb(diff));
  }

  // Statistics
  getStats() {
    return {
      entityCount: Object.keys(this.state.entities).length,
      zoneCount: this.state.zones.length,
      connectionCount: this.state.connections.length,
      spatialCells: this.spatialHash.size,
      version: this.state.version,
      eventCount: this.eventLog.length,
      historySize: this.stateHistory.length,
    };
  }
}

// Singleton instance
let engineInstance: WorldStateEngine | null = null;
export function getWorldStateEngine(): WorldStateEngine {
  if (!engineInstance) {
    engineInstance = new WorldStateEngine(10, 2000);
    // Initialize with demo zones
    engineInstance.addZone({ id: 'zone-a', name: 'Warehouse Zone A', type: 'storage', bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 10, z: 100 } }, capacity: 500, currentOccupancy: 0, properties: {} });
    engineInstance.addZone({ id: 'zone-b', name: 'Warehouse Zone B', type: 'processing', bounds: { min: { x: 100, y: 0, z: 0 }, max: { x: 200, y: 10, z: 100 } }, capacity: 200, currentOccupancy: 0, properties: {} });
    engineInstance.addZone({ id: 'zone-c', name: 'Loading Dock', type: 'dock', bounds: { min: { x: 200, y: 0, z: 0 }, max: { x: 300, y: 10, z: 100 } }, capacity: 50, currentOccupancy: 0, properties: {} });
    engineInstance.addZone({ id: 'zone-road', name: 'Main Road', type: 'road', bounds: { min: { x: 0, y: 0, z: 100 }, max: { x: 300, y: 0, z: 150 } }, capacity: 100, currentOccupancy: 0, properties: { speedLimit: 30 } });
  }
  return engineInstance;
}
