import { Truck, Box, Bot, Navigation, Wifi, Camera, Rows3, Anchor } from 'lucide-react';

export const ZONES = [
  { id: 'zone-a', name: 'Storage Zone A', x: 0, z: 0, w: 100, h: 100, color: '#4a7a6a', icon: '📦' },
  { id: 'zone-b', name: 'Processing Zone B', x: 100, z: 0, w: 100, h: 100, color: '#8a7a4a', icon: '⚙️' },
  { id: 'zone-dock', name: 'Loading Dock', x: 200, z: 0, w: 100, h: 100, color: '#6a6a7a', icon: '🏗️' },
  { id: 'zone-road', name: 'Main Road', x: 0, z: 100, w: 300, h: 50, color: '#5a6a7a', icon: '🛣️' },
];

export const ENTITY_COLORS: Record<string, string> = {
  vehicle:  '#6b8cae',
  forklift: '#b89a6b',
  robot:    '#8b7bae',
  drone:    '#c48a6a',
  sensor:   '#5c9e9e',
  camera:   '#7ca37c',
  conveyor: '#9c8b78',
  dock:     '#7a7a7a',
};

export const ENTITY_ICONS: Record<string, React.ElementType> = {
  vehicle: Truck, forklift: Box, robot: Bot, drone: Navigation,
  sensor: Wifi, camera: Camera, conveyor: Rows3, dock: Anchor,
};

export const ENTITY_LABELS: Record<string, string> = {
  vehicle: 'Vehicle', forklift: 'Forklift', robot: 'Robot', drone: 'Drone',
  sensor: 'Sensor', camera: 'Camera', conveyor: 'Conveyor', dock: 'Dock',
};
