# TwinForge

> **Real-Time Digital Twin Simulation Platform**
> v0.2.0 · Next.js 16.1 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui

---

## Overview

TwinForge is a production-grade digital twin simulation platform that models physical environments in real time. It combines AI-driven optimization, predictive analytics, Monte Carlo scenario testing, and hardware-accurate GPU visualization into a single monolithic Next.js application backed by a full containerized infrastructure stack.

The platform simulates entities (vehicles, robots, drones, sensors) moving through a 300×150m warehouse with zone-aware physics, collision detection, and per-tick telemetry generation. An AI engine provides congestion forecasting, routing optimization, and reinforcement learning-based decision support. A separate WebSocket service delivers real-time updates via Socket.IO.

---

## Table of Contents

- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Application Views](#application-views)
- [Engine Layer](#engine-layer)
- [API Reference](#api-reference)
- [WebSocket Service](#websocket-service)
- [Database Schema](#database-schema)
- [Infrastructure & Deployment](#infrastructure--deployment)
- [Access Control](#access-control)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Design Decisions](#design-decisions)

---

## Architecture

```
                         ┌────────────────────────────────────────────┐
                         │              BROWSER (SPA)                  │
                         │  Landing (GPU Canvas) → Command Center      │
                         │  Zustand Store · Socket.IO · Framer Motion  │
                         └──────────┬────────────────┬────────────────┘
                                    │  HTTP (Polling) │  WebSocket
                                    ▼                ▼
                         ┌──────────────────┐  ┌─────────────────────┐
                         │  Next.js API     │  │  Digital Twin WS    │
                         │  8 REST routes   │  │  Socket.IO :3003    │
                         │  Port :3000      │  │  35 demo entities   │
                         └────────┬─────────┘  └─────────────────────┘
                                  │
                    ┌─────────┬───┴───┬──────────┬──────────┐
                    ▼         ▼       ▼          ▼          ▼
              WorldState  SimEngine  AIEngine  Scenario  Metrics
              Engine                 (3 agents) Engine    Engine
                    │
                    ▼
              ┌───────────┐
              │  SQLite   │
              │  (Prisma) │
              └───────────┘
```

The application uses a **single-page architecture**. All 7 dashboard views are navigated via Zustand state (`activeView`) — no client-side routing between views. The API layer exposes 8 REST endpoints, and the frontend polls at intervals from 800ms (simulation) to 15s (analytics).

---

## Project Structure

```
├── package.json                     # Project manifest
├── bun.lock                         # Bun lockfile
├── tsconfig.json                    # TypeScript config
├── next.config.ts                   # Next.js (standalone output)
├── tailwind.config.ts               # Tailwind CSS
├── components.json                  # shadcn/ui config
├── postcss.config.mjs               # PostCSS
├── eslint.config.mjs                # ESLint (relaxed)
├── Dockerfile                       # Multi-stage production build
├── docker-compose.yml               # 10-service stack
├── Caddyfile                        # Port-transform proxy
│
├── prisma/
│   ├── schema.prisma                # 12 database models
│   └── migrations/
│
├── db/
│   └── custom.db                    # SQLite database
│
├── public/
│   └── robots.txt
│
├── infrastructure/
│   ├── prometheus.yml               # Prometheus scrape config
│   ├── alert_rules.yml              # Alert definitions
│   ├── k8s/
│   │   └── twinforge-deployment.yml # Kubernetes manifest
│   └── grafana/
│       ├── dashboards/
│       └── datasources/
│
├── mini-services/
│   └── digital-twin-ws/
│       ├── package.json
│       ├── Dockerfile
│       └── index.ts                 # Standalone Socket.IO server
│
└── src/
    ├── app/
    │   ├── layout.tsx               # Root layout (dark theme, fonts)
    │   ├── page.tsx                 # SPA entry (landing ↔ dashboard)
    │   ├── globals.css              # CSS variables, themes
    │   ├── icon.tsx                 # App icon (text-based)
    │   ├── apple-icon.tsx           # Apple touch icon
    │   ├── opengraph-image.tsx      # OG image
    │   ├── favicon.ico/route.tsx    # Dynamic favicon
    │   └── api/
    │       ├── route.ts             # Health check
    │       ├── analytics/route.ts
    │       ├── environments/route.ts
    │       ├── entities/route.ts
    │       ├── entities/[id]/route.ts
    │       ├── telemetry/route.ts
    │       ├── simulation/route.ts
    │       ├── scenarios/route.ts
    │       └── observability/route.ts
    │
    ├── components/
    │   ├── landing/
    │   │   └── LandingPage.tsx      # GPU die canvas animation
    │   ├── dashboard/
    │   │   ├── CommandCenterShell.tsx  # Sidebar + top bar shell
    │   │   └── DashboardView.tsx       # KPIs, entity overview
    │   ├── simulation/
    │   │   ├── SimulationView.tsx      # SVG 2D viewport, pan/zoom
    │   │   ├── DataLabPanel.tsx        # Statistical analysis
    │   │   └── constants.ts            # Zone defs, colors, icons
    │   ├── telemetry/
    │   │   └── TelemetryView.tsx       # Live sensor stream
    │   ├── analytics/
    │   │   └── AnalyticsView.tsx       # AI predictions
    │   ├── scenarios/
    │   │   └── ScenariosView.tsx       # Monte Carlo testing
    │   ├── observability/
    │   │   └── ObservabilityView.tsx   # System metrics, GPU, logs
    │   ├── entities/
    │   │   └── EntitiesView.tsx        # Entity registry
    │   ├── common/
    │   │   └── MiniChart.tsx           # SVG sparkline
    │   └── ui/                         # 47 shadcn/ui components
    │
    ├── hooks/
    │   ├── useWebSocket.ts            # Socket.IO client
    │   ├── use-mobile.ts              # Mobile breakpoint
    │   └── use-toast.ts               # Toast notifications
    │
    ├── store/
    │   └── simulation-store.ts        # Zustand global state
    │
    ├── lib/
    │   ├── db.ts                      # Prisma client singleton
    │   ├── utils.ts                   # cn() utility
    │   ├── engine/
    │   │   └── WorldStateEngine.ts    # Entity store, spatial hash
    │   ├── simulation/
    │   │   └── SimulationEngine.ts    # Physics, collision, telemetry
    │   ├── ai/
    │   │   └── AIEngine.ts           # Predictive, optimization, RL
    │   ├── observability/
    │   │   └── MetricsEngine.ts       # Metrics, KPIs, alerts
    │   └── scenarios/
    │       └── ScenarioEngine.ts      # Monte Carlo simulation
    │
    └── types/
        └── index.ts                   # TypeScript interfaces
```

---

## Tech Stack

### Core

| Technology | Version | Role |
|---|---|---|
| Next.js | 16.1 | React framework (App Router) |
| React | 19 | UI library |
| TypeScript | 5 | Static types |
| Tailwind CSS | 4 | Styling (dark-first) |
| shadcn/ui | new-york | 47 headless UI components |
| Prisma | 6 | ORM (SQLite) |
| Zustand | 5 | Global state management |

### Data & Visualization

| Technology | Role |
|---|---|
| Recharts | Time-series charts |
| Framer Motion | Page transitions, UI animations |
| Canvas 2D API | Landing page GPU visualization |
| SVG | Simulation viewport with viewBox zoom |

### Real-Time

| Technology | Role |
|---|---|
| Socket.IO | WebSocket server (standalone) |
| Socket.IO Client | Frontend real-time hook |

### AI & Utilities

| Technology | Role |
|---|---|
| z-ai-web-dev-sdk | AI capabilities (LLM, image gen) |
| next-auth | Authentication (imported) |
| react-hook-form + Zod | Forms & validation |
| three.js + R3F | 3D rendering (available, not primary) |
| date-fns | Date formatting |

---

## Quick Start

### Prerequisites
- **Bun** (recommended) or Node.js 20+
- **Git**

### Install & Run

```bash
# Clone
git clone <repository-url>
cd my-project

# Install dependencies
bun install

# Set up database
bun run db:push

# Start development server
bun run dev
```

Open **http://localhost:3000**. You'll see the GPU architecture landing page — click **Launch** to enter the command center.

### First Simulation

From the command center:

1. Navigate to **Simulation** in the sidebar
2. Click **Init & Start** to seed 48 demo entities
3. Watch entities move through the warehouse zones in real time
4. Use the **Data Lab** tab for statistical analysis

### Production Build

```bash
bun run build
bun run start
```

### Docker Deployment

```bash
# Full stack (10 services)
docker compose up -d

# Logs
docker compose logs -f digital-twin-api

# Teardown
docker compose down
```

---

## Application Views

### Landing Page
A full-screen, hardware-accurate GPU die visualization rendered on HTML5 Canvas:
- **60 Streaming Multiprocessors** in a 10×6 grid, each with 4×4 internal cores (FP32, FP16, Tensor)
- **L2 Cache Ring** — 26 cache blocks surrounding the die perimeter with live usage bars
- **12 Memory Controllers** on top/bottom edges with throughput pulsing
- **Network-on-Chip Interconnect** — mesh traces with signal pulses propagating between SMs
- **8 HBM Stacks** (4 per side) with 8 layers each, TSV vias, and wide data buses
- **PCIe 5.0 x16 Lanes** at the bottom with signal propagation
- **Compute Wavefronts** — diagonal activation waves sweep across the SM grid
- **Mouse Interaction** — hovering activates nearby SM cores
- Scroll transitions from die architecture view to system I/O view

### Dashboard
Central operations overview:
- 6 KPI cards (Total Entities, Active, Avg Speed, Sensor Accuracy, Throughput, Alerts)
- Simulation engine status with tick counter
- Entity breakdown by type with status indicators
- AI insights feed (anomalies + recommendations)
- Event throughput and GPU utilization charts

### Simulation
The core view — a 2D SVG warehouse map (300×150m):
- Pan/zoom via scroll wheel
- 4 zones (Loading Dock, Storage A, Assembly Line, Storage B)
- 8 entity types: vehicles, robots, drones, sensors, cameras, conveyors, docks, gateways
- Zone-aware physics (vehicles on roads, drones sinusoidal, robots precise)
- Elastic collision detection
- Entity trails, heatmap overlay, speed controls (0.5x–4x)
- **Data Lab** — gauge rings, distribution charts, speed analysis (mean/median/stddev/IQR), zone utilization, z-score outlier detection, auto-generated insights

### Telemetry
Live sensor stream with pause/resume, sensor filtering, per-sensor stats, value distribution.

### Analytics
AI Decision Layer — predictive forecasts, recommendations (routing, scheduling, energy, safety), anomaly feed, reinforcement learning agent stats.

### Scenarios
Monte Carlo testing — 5 presets (Road Closure, Demand Surge, Equipment Failure, Weather Event, Staff Shortage) plus custom scenario creation with risk scoring.

### Observability
System monitoring — GPU metrics (utilization, VRAM, temp, power), 6 system metric charts, 8-service health panel, simulated log stream.

### Entities
Entity registry with search, type/status filters, and detail panels showing position, velocity, rotation, metadata.

---

## Engine Layer

All engines are **singleton instances** with in-memory state persisted across the server process.

### WorldStateEngine
In-memory entity store with spatial hashing (10m grid cells), version tracking, state snapshots, rollback, zone management, and pub/sub events.

### SimulationEngine
Tick-based physics at 20 TPS (50ms interval). Zone-aware movement profiles, elastic collision detection, per-tick telemetry generation with type-specific sensors. Configurable time scale (0.5x–4x).

### AIEngine
Three systems:
- **PredictiveAnalytics** — congestion/throughput forecasting, anomaly detection
- **OptimizationEngine** — routing, scheduling, energy, bottleneck, safety recommendations
- **RLSimulationAgent** — Q-learning with configurable hyperparameters

### MetricsEngine
Time-series recording (ring buffer, 200 points), alert rules with cooldown, system metrics, simulated GPU status, dashboard KPI computation.

### ScenarioEngine
Monte Carlo execution with ±20% parameter perturbation, tick-by-tick simulation, risk scoring, and auto-generated recommendations per scenario type.

---

## API Reference

Base URL: `http://localhost:3000`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api` | Health check |
| `GET/POST` | `/api/analytics` | Predictions, anomalies, recommendations |
| `GET/POST` | `/api/environments` | List/create twin environments |
| `GET/POST` | `/api/entities` | List/create entities |
| `GET/PUT/DELETE` | `/api/entities/:id` | Single entity CRUD |
| `GET/POST` | `/api/telemetry` | Query/ingest telemetry |
| `GET/POST` | `/api/simulation` | Simulation control (`init/start/pause/stop/reset/snapshot/tick`) |
| `GET/POST` | `/api/scenarios` | List/execute Monte Carlo scenarios |
| `GET` | `/api/observability` | System metrics, GPU status, KPIs |

---

## WebSocket Service

Standalone Bun-based Socket.IO server at `mini-services/digital-twin-ws/`:

- **Port:** 3003
- **Tick Rate:** 20 TPS
- **35 demo entities** with real-time physics

**Emitted Events:** `entity:state-change`, `telemetry:update`, `simulation:tick`, `simulation:status`, `heatmap:update`, `anomaly:detected`, `ai:recommendation`, `metric:update`, `system:notification`

**Handled Events:** `entity:control`, `simulation:control`

---

## Database Schema

**SQLite** via Prisma — 12 models:

| Model | Purpose |
|---|---|
| `User` | Accounts with RBAC (admin/operator/analyst/viewer) |
| `ApiToken` | Scoped API keys with expiry |
| `AuditLog` | Action audit trail |
| `TwinEnvironment` | Simulation environments (warehouse, smart-city, robotics, etc.) |
| `TwinEntity` | Entities with position/velocity/rotation, 8 types |
| `TelemetryEvent` | Sensor readings (12 sensor types), quality scores |
| `SimulationRun` | Run tracking with status, config, tick count |
| `StateSnapshot` | World state captures per tick |
| `Scenario` | What-if results with risk scores, delay/cost estimates |
| `AIRecommendation` | 6 recommendation types with confidence |
| `AnomalyEvent` | 6 anomaly types with severity levels |
| `SystemMetric` | Time-series metrics with labels |
| `AlertRule` | Configurable alert conditions with cooldown |

---

## Infrastructure & Deployment

### Docker Compose (10 Services)

| Service | Port | Technology |
|---|---|---|
| `digital-twin-api` | 3000 | Next.js (Node 20) |
| `digital-twin-ws` | 3003 | Socket.IO (Bun) |
| `kafka` | 9092 | Apache Kafka |
| `zookeeper` | 2181 | Kafka dependency |
| `redis` | 6379 | Cache (512MB, LRU) |
| `prometheus` | 9090 | Metrics (72h retention) |
| `grafana` | 3100 | Dashboards |
| `jaeger` | 16686 | Distributed tracing |
| `emqx` | 1883, 18083 | MQTT broker |
| `flink-jobmanager` | 8081 | Stream processing |

### Dockerfile
Multi-stage: `node:20-alpine` → bun install → next build → minimal production image (non-root).

### Kubernetes
Manifest at `infrastructure/k8s/twinforge-deployment.yml`.

### Monitoring
Prometheus + Grafana + Jaeger. Alert rules at `infrastructure/alert_rules.yml`.

---

## Access Control

### Roles

| Role | Access |
|---|---|
| **Admin** | Full access — users, environments, entities, simulation, scenarios, config, audit logs, API tokens |
| **Operator** | Create/edit entities, control simulations, run scenarios, view analytics |
| **Analyst** | Read dashboards, run queries, read-only scenarios, export data |
| **Viewer** | Read-only dashboards and KPIs |

### Authentication
- **API Tokens** — scoped, with expiry (`ApiToken` model)
- **NextAuth** — imported, foundation for OAuth/credentials (not fully wired)
- **Audit Logging** — all actions logged with user, action, resource, IP

### Service Credentials

| Service | Credentials |
|---|---|
| Grafana | `admin` / `admin` |
| EMQX MQTT | `admin` / `public` |
| SQLite | No auth (file-based) |
| Redis, Kafka, Prometheus, Jaeger | No auth (dev) |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite connection |
| `NODE_ENV` | `development` | Environment mode |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3003` | WebSocket URL |
| `GRAFANA_PASSWORD` | `admin` | Grafana password |
| `PORT` | `3000` | API server port |

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `next dev -p 3000` | Development server |
| `build` | `next build` | Production build |
| `start` | `NODE_ENV=production bun .next/standalone/server.js` | Production server |
| `lint` | `eslint .` | Lint check |
| `db:push` | `prisma db push` | Push schema to DB |
| `db:generate` | `prisma generate` | Generate Prisma client |
| `db:migrate` | `prisma migrate dev` | Run migrations |
| `db:reset` | `prisma migrate reset` | Reset database |

---

## Design Decisions

1. **Single-Page Architecture** — View navigation via Zustand `activeView`, no client-side routing. Keeps SPA feel while leveraging Next.js SSR and API routes.

2. **Dark-First Monochrome** — Default dark mode with black/white palette and cyan accents. Matches the industrial aesthetic of a digital twin control center.

3. **SQLite for Development** — Portable Prisma schema, easily switched to PostgreSQL for production.

4. **SVG 2D Viewport** — Crisp vector rendering at any zoom level with simple DOM-based entity selection. Three.js available but not primary.

5. **Dual Simulation Paths** — Server-side (Next.js API + engine singletons) for polling, standalone Socket.IO service for push-based realtime.

6. **Demo-First** — `POST /api/simulation` with `action: init` seeds 48 entities immediately.

7. **Monolithic Frontend** — All components, engines, and state in one Next.js project. Docker Compose handles service scaling.

8. **Bun Dev / Node Production** — Bun for fast dev, Node 20 for Docker compatibility.

---

## License

Private — All rights reserved.
