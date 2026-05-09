'use client';

import React from 'react';
import {
  LayoutDashboard, Activity, Box, Radio, Brain, FlaskConical, Monitor,
  ChevronLeft, ChevronRight, Shield,
  Satellite, Cpu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSimulationStore } from '@/store/simulation-store';

interface ShellProps {
  children: React.ReactNode;
  activeView: string;
  onViewChange: (view: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'simulation', label: 'Simulation', icon: Activity },
  { id: 'entities', label: 'Entities', icon: Box },
  { id: 'telemetry', label: 'Telemetry', icon: Radio },
  { id: 'analytics', label: 'AI Analytics', icon: Brain },
  { id: 'scenarios', label: 'Scenarios', icon: FlaskConical },
  { id: 'observability', label: 'Observability', icon: Monitor },
];

export function CommandCenterShell({ children, activeView, onViewChange }: ShellProps) {
  const { sidebarCollapsed, toggleSidebar, simulationStatus, isSimulating, anomalies, notifications, currentTick, gpuStatus } = useSimulationStore();
  const unreadAlerts = anomalies.filter(a => !a.isResolved && a.severity === 'critical').length;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out shrink-0`}>
          {/* Brand */}
          <div className={`flex items-center gap-3 p-3 border-b border-border min-h-[64px] ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
            {!sidebarCollapsed && (
              <div className="overflow-hidden">
                <h1 className="text-base font-bold tracking-wider bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">TwinForge</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Digital Twin Platform</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-2">
            <nav className="space-y-1 px-2">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onViewChange(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 group
                          ${isActive 
                            ? 'bg-primary/15 text-primary font-medium' 
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        {item.id === 'analytics' && !sidebarCollapsed && (
                          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 text-primary border-primary/30">AI</Badge>
                        )}
                      </button>
                    </TooltipTrigger>
                    {sidebarCollapsed && (
                      <TooltipContent side="right" className="font-medium">
                        {item.label}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </nav>

            <Separator className="my-3 mx-2" />

            {/* System Status */}
            {!sidebarCollapsed && (
              <div className="px-3 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System Status</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Simulation</span>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${isSimulating ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                      <span className={`font-mono text-[11px] ${isSimulating ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {simulationStatus}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tick</span>
                    <span className="font-mono text-[11px] text-foreground">#{currentTick}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">GPU</span>
                    <span className="font-mono text-[11px] text-amber-500">{gpuStatus ? `${Math.round(gpuStatus.utilization)}%` : '--'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Alerts</span>
                    <span className={`font-mono text-[11px] ${unreadAlerts > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {unreadAlerts > 0 ? `${unreadAlerts} CRIT` : '0'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Bottom controls */}
          <div className="border-t border-border p-2 space-y-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="w-full justify-center"
                >
                  {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              {sidebarCollapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
            </Tooltip>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar */}
          <header className="h-12 border-b border-border bg-card/50 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-3">
              <Satellite className="w-4 h-4 text-primary animate-spin" style={{ animationDuration: '3s' }} />
              <span className="text-xs font-mono text-muted-foreground">
                TwinForge v2.0.0 | Real-Time Digital Twin Platform
              </span>
              <Separator orientation="vertical" className="h-4" />
              <Badge variant="outline" className="text-[10px] font-mono">
                <Cpu className="w-3 h-3 mr-1" />
                GPU-ACTIVE
              </Badge>
              {isSimulating && (
                <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 border-emerald-500/30 animate-pulse">
                  LIVE
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {notifications.length} events
                </Badge>
              )}
              <Separator orientation="vertical" className="h-4" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="w-3 h-3" />
                <span className="font-mono text-[11px]">SECURE</span>
              </div>
            </div>
          </header>

          {/* Content area */}
          <div className="flex-1 overflow-auto p-4">
            {children}
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
