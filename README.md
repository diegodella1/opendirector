# OpenDirector

**Open-source live TV production system.** Build rundowns, control vMix, prompt your talent — all from a single self-hosted server.

OpenDirector replaces expensive automation software (CuEZ, etc.) with a free, hackable alternative designed for education labs, small productions, churches, and streamers.

---

## What It Does

| Role | Tool | Description |
|------|------|-------------|
| **Producer** | Webapp | Build rundowns, manage media, edit scripts, send signals to talent, monitor the live show |
| **Operator/TD** | Automator (desktop app) | Execute the show — cue graphics, roll clips, trigger transitions via vMix |
| **Host/Talent** | Prompter (browser) | Read scripts with auto-scroll, receive countdown/wrap/go signals from the producer |

## Architecture

```
                     Server (Next.js + PostgreSQL)
                     ┌─────────────────────────────────────┐
                     │  REST API + WebSocket relay          │
                     │  ├── rundown sync                   │
                     │  ├── execution (CUE/NEXT/ACK)       │
                     │  ├── prompter (scroll sync)         │
                     │  ├── tally (vMix state)             │
                     │  └── signals (producer → talent)    │
                     │                                     │
                     │  Media storage (filesystem + ffmpeg) │
                     │  PostgreSQL (all tables, one DB)     │
                     └──────────┬───────────────────────────┘
                                │
               ┌────────────────┼─────────────────┐
               │                │                  │
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  Automator   │  │  Prompter    │  │  Prompter N      │
    │  (Tauri/Win) │  │  (browser)   │  │  (follower)      │
    │              │  │              │  │                   │
    │  SQLite cache│  │  IndexedDB   │  │  scroll sync     │
    │  vMix TCP    │  │  offline     │  │  from master     │
    └──────────────┘  └──────────────┘  └──────────────────┘
```

**Key design decisions:**

- **Offline-first.** Automator caches the full rundown in SQLite. Prompter caches scripts in IndexedDB. If the server goes down, the show continues.
- **Automator executes locally.** vMix commands go over TCP on `localhost` (<1ms). WebSocket is only for sync, never for execution.
- **One database.** All tables prefixed with `od_` in a single PostgreSQL instance.

## Features

- Rundown editor with drag-and-drop blocks, elements, and actions
- Multi-show support (edit one show while another is live)
- vMix automation: clips, graphics, lower thirds, stingers, audio, transitions
- Live prompter with auto-scroll, mirror mode, fullscreen, offline cache
- Producer signals to talent: countdown (30s/60s), wrap, stretch, standby, go
- Media management with upload, thumbnails, vMix codec validation
- Template system (save/load rundowns as portable JSON)
- Undo/redo for all rundown operations
- Optimistic locking (version-based conflict detection)
- Show state machine: draft → ready → rehearsal → live → archived
- Tally lights and input status from vMix in real-time
- Back-timing and timecode display
- Execution log export
- People management per show
- GT (graphic template) field mapping for dynamic lower thirds

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Server** | Next.js 14 (App Router), custom WebSocket server (`ws`) |
| **Database** | PostgreSQL 16 (via PostgREST + `@supabase/supabase-js`) |
| **Frontend** | React 18, Tailwind CSS, Zustand, dnd-kit |
| **Automator** | Tauri v2 (Rust + React), SQLite (rusqlite), tokio TCP |
| **Media** | Filesystem storage, ffmpeg/ffprobe for metadata & thumbnails |
| **Deployment** | Docker Compose (server + PostgreSQL + PostgREST) |

## Quick Start

### Requirements

- Docker and Docker Compose
- That's it.

### Run

```bash
git clone https://github.com/diegodella1/opendirector.git
cd opendirector
docker compose up -d
```

OpenDirector is now running at **http://localhost:3000**.

### Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_PASSWORD` | `opendirector` | PostgreSQL password |
| `JWT_SECRET` | (built-in default) | JWT secret shared with PostgREST |

### Without Docker

```bash
# Requirements: Node.js 20+, PostgreSQL 16+, ffmpeg
npm install
npm run build
npm start
```

## Physical Setup

| Machine | OS | Install | Accesses |
|---------|----|---------|----------|
| **Server** | Any | Docker or Node.js 20 + ffmpeg | — |
| **Operator PC** | Windows | vMix + Automator (.msi) | vMix TCP `:8099` + Server `:3000` |
| **Producer PC** | Any | Nothing (browser) | Server `:3000` |
| **Prompter tablet** | Any | Nothing (browser) | Server `:3000` |

**Minimal setup:** 1 PC with vMix + server + browser tabs.
**Classroom setup:** 1 server + N operator PCs + N prompter tablets.

## Project Structure

```
opendirector/
├── src/
│   ├── app/                   # Next.js App Router (pages + API routes)
│   │   ├── api/               # REST API endpoints
│   │   └── shows/[id]/        # Editor, Live, Prompter views
│   ├── components/            # React components
│   ├── stores/                # Zustand state management
│   └── lib/                   # Shared utilities, types, DB client
├── automator/                 # Tauri v2 desktop app (Rust + React)
├── migrations/                # PostgreSQL migration files
├── server.js                  # Custom Next.js server with WebSocket
├── docker-compose.yml         # Full stack deployment
├── Dockerfile                 # Multi-stage build
└── data/                      # Media storage (filesystem)
    ├── templates/             # Rundown template JSON snapshots
    └── shows/{id}/media/      # Uploaded media + thumbnails
```

## Automator

The Automator is a standalone Windows desktop app built with [Tauri v2](https://v2.tauri.app/). It connects to the server for rundown sync and to vMix for execution.

- **Keyboard-first:** F1-F8 for presets, Space for cue, arrows for navigation
- **Offline execution:** Full rundown cached in local SQLite
- **vMix TCP:** Direct connection, <1ms latency
- **Auto-update:** Checks for new versions on startup

Source code is in `automator/`. Build with:

```bash
cd automator
cargo tauri build
```

## WebSocket Channels

| Channel | Purpose | Direction |
|---------|---------|-----------|
| `rundown` | Block/element/action CRUD sync | Server → All clients |
| `execution` | CUE, NEXT, ACK, show status | Automator ↔ Server |
| `prompter` | Scroll sync, config updates | Server → Prompter |
| `tally` | vMix input/tally state | Automator → Server → All |
| `signals` | Countdown, wrap, go, custom | Producer → Talent |

## License

MIT

## Contributing

OpenDirector is in active development. Issues and PRs are welcome.
