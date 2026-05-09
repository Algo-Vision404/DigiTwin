'use client';

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Search,
  MapPin,
  Activity,
  Cpu,
  Wrench,
  Box,
  Radio,
  Camera,
  Truck,
  Bot,
  Plane,
  ChevronRight,
} from 'lucide-react';
import { useSimulationStore } from '@/store/simulation-store';

const typeIcons: Record<string, React.ElementType> = {
  vehicle: Truck,
  forklift: Box,
  robot: Bot,
  drone: Plane,
  sensor: Radio,
  camera: Camera,
  conveyor: Activity,
  dock: Wrench,
  machine: Cpu,
  zone: MapPin,
  road: MapPin,
  shelf: Box,
  person: Activity,
};

const typeColors: Record<string, string> = {
  vehicle: 'bg-emerald-500',
  forklift: 'bg-amber-500',
  robot: 'bg-violet-500',
  drone: 'bg-pink-500',
  sensor: 'bg-cyan-500',
  camera: 'bg-purple-500',
  conveyor: 'bg-orange-500',
  dock: 'bg-slate-500',
  machine: 'bg-violet-400',
  zone: 'bg-slate-400',
  road: 'bg-slate-400',
  shelf: 'bg-stone-500',
  person: 'bg-orange-400',
};

const typeTextColors: Record<string, string> = {
  vehicle: 'text-emerald-500',
  forklift: 'text-amber-500',
  robot: 'text-violet-500',
  drone: 'text-pink-500',
  sensor: 'text-cyan-500',
  camera: 'text-purple-500',
  conveyor: 'text-orange-500',
  dock: 'text-slate-500',
  machine: 'text-violet-400',
  zone: 'text-slate-400',
  road: 'text-slate-400',
  shelf: 'text-stone-500',
  person: 'text-orange-400',
};

export function EntitiesView() {
  const { entities, selectedEntityId, selectEntity } = useSimulationStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const entityTypes = useMemo(
    () => [...new Set(entities.map((e) => e.entityType))],
    [entities],
  );

  const filteredEntities = useMemo(
    () =>
      entities.filter((e) => {
        const matchesSearch =
          e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || e.entityType === typeFilter;
        const matchesStatus =
          statusFilter === 'all' || e.status === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
      }),
    [entities, searchQuery, typeFilter, statusFilter],
  );

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active':
        return 'default' as const;
      case 'warning':
        return 'outline' as const;
      case 'error':
        return 'destructive' as const;
      case 'maintenance':
        return 'secondary' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="sm"
              variant={typeFilter === 'all' ? 'default' : 'ghost'}
              className="h-7 text-[11px]"
              onClick={() => setTypeFilter('all')}
            >
              All
            </Button>
            {entityTypes.slice(0, 5).map((type) => (
              <Button
                key={type}
                size="sm"
                variant={typeFilter === type ? 'default' : 'ghost'}
                className="h-7 text-[11px] capitalize"
                onClick={() => setTypeFilter(type)}
              >
                {type}
              </Button>
            ))}
          </div>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="sm"
              variant={statusFilter === 'all' ? 'default' : 'ghost'}
              className="h-7 text-[11px]"
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            {['active', 'inactive', 'warning', 'error', 'maintenance'].map(
              (status) => (
                <Button
                  key={status}
                  size="sm"
                  variant={statusFilter === status ? 'default' : 'ghost'}
                  className="h-7 text-[11px] capitalize"
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              ),
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
          {filteredEntities.length} / {entities.length}
        </Badge>
      </div>

      {entities.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <Box className="w-12 h-12 mb-3 opacity-20" />
            <div className="text-sm font-medium">No entities loaded yet</div>
            <div className="text-xs mt-1">Start the simulation to generate entity data</div>
          </CardContent>
        </Card>
      ) : (
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Entity List */}
        <div className="lg:col-span-2">
          <Card className="h-full bg-card border-border">
            <CardContent className="p-0 h-full">
              <ScrollArea className="h-[500px]">
                <div className="divide-y divide-border">
                  {filteredEntities.map((entity) => {
                    const Icon = typeIcons[entity.entityType] || Box;
                    const isSelected = entity.id === selectedEntityId;
                    const bgClass =
                      typeColors[entity.entityType] || 'bg-slate-500';
                    const textClass =
                      typeTextColors[entity.entityType] || 'text-slate-400';
                    return (
                      <button
                        key={entity.id}
                        onClick={() =>
                          selectEntity(
                            entity.id === selectedEntityId
                              ? null
                              : entity.id,
                          )
                        }
                        className={`w-full text-left px-4 py-3 transition-colors flex items-center gap-3 hover:bg-accent/50 ${
                          isSelected
                            ? 'bg-primary/10 border-l-2 border-l-primary'
                            : ''
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgClass}/20`}
                        >
                          <Icon className={`w-4 h-4 ${textClass}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {entity.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {entity.entityType} | ID: {entity.id.slice(-6)}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge
                            variant={statusBadgeVariant(entity.status)}
                            className="text-[9px]"
                          >
                            {entity.status}
                          </Badge>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            Speed: {entity.velocity.speed.toFixed(1)}
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                  {filteredEntities.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No entities match your filters
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Entity Detail Panel */}
        <div>
          <Card className="h-full bg-card border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-semibold">
                Entity Details
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {selectedEntity ? (
                <ScrollArea className="max-h-[480px]">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          typeColors[selectedEntity.entityType] || 'bg-slate-500'
                        }/20`}
                      >
                        {React.createElement(
                          typeIcons[selectedEntity.entityType] || Box,
                          {
                            className: `w-5 h-5 ${
                              typeTextColors[selectedEntity.entityType] ||
                              'text-slate-400'
                            }`,
                          },
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-bold">
                          {selectedEntity.name}
                        </div>
                        <Badge variant="outline" className="text-[9px] mt-0.5">
                          {selectedEntity.entityType}
                        </Badge>
                      </div>
                    </div>

                    <Separator />

                    {/* Position */}
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" /> Position
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            label: 'X',
                            value: selectedEntity.position.x.toFixed(2),
                          },
                          {
                            label: 'Y',
                            value: selectedEntity.position.y.toFixed(2),
                          },
                          {
                            label: 'Z',
                            value: selectedEntity.position.z.toFixed(2),
                          },
                        ].map((p) => (
                          <div
                            key={p.label}
                            className="bg-muted/50 rounded p-2 text-center"
                          >
                            <div className="text-[9px] text-muted-foreground">
                              {p.label}
                            </div>
                            <div className="text-sm font-mono font-bold">
                              {p.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Rotation */}
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Rotation
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          {
                            label: 'Pitch',
                            value: `${selectedEntity.rotation.x.toFixed(1)}°`,
                          },
                          {
                            label: 'Yaw',
                            value: `${selectedEntity.rotation.y.toFixed(1)}°`,
                          },
                          {
                            label: 'Roll',
                            value: `${selectedEntity.rotation.z.toFixed(1)}°`,
                          },
                        ].map((r) => (
                          <div
                            key={r.label}
                            className="bg-muted/50 rounded p-2 text-center"
                          >
                            <div className="text-[9px] text-muted-foreground">
                              {r.label}
                            </div>
                            <div className="text-sm font-mono font-bold">
                              {r.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Velocity */}
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Velocity
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/50 rounded p-2 text-center">
                          <div className="text-[9px] text-muted-foreground">
                            Speed
                          </div>
                          <div className="text-sm font-mono font-bold">
                            {selectedEntity.velocity.speed.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-muted/50 rounded p-2 text-center">
                          <div className="text-[9px] text-muted-foreground">
                            Heading
                          </div>
                          <div className="text-sm font-mono font-bold">
                            {Math.round(
                              (Math.atan2(
                                selectedEntity.velocity.z,
                                selectedEntity.velocity.x,
                              ) *
                                180) /
                                Math.PI,
                            )}
                            °
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Cpu className="w-3 h-3" /> Status
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            selectedEntity.status === 'active'
                              ? 'bg-emerald-500'
                              : selectedEntity.status === 'warning'
                                ? 'bg-amber-500'
                                : selectedEntity.status === 'error'
                                  ? 'bg-red-500'
                                  : 'bg-muted-foreground'
                          }`}
                        />
                        <span className="text-sm capitalize">
                          {selectedEntity.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                        Last update:{' '}
                        {new Date(
                          selectedEntity.lastUpdate,
                        ).toLocaleTimeString()}
                      </div>
                    </div>

                    {/* Metadata */}
                    {Object.keys(selectedEntity.metadata).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Metadata
                        </div>
                        <div className="space-y-1">
                          {Object.entries(selectedEntity.metadata).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-muted-foreground capitalize">
                                  {key}
                                </span>
                                <span className="font-mono text-[11px]">
                                  {String(value)}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                    {/* Properties */}
                    {Object.keys(selectedEntity.properties).length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                          Properties
                        </div>
                        <div className="space-y-1">
                          {Object.entries(selectedEntity.properties).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-muted-foreground capitalize">
                                  {key}
                                </span>
                                <span className="font-mono text-[11px]">
                                  {String(value)}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Select an entity to view details
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
