# OpenDirector — Technical Specification

> **Estado**: Este documento refleja el estado actual de la implementacion.
> Features marcados con 🟢 estan implementados. Features con 🟡 estan parciales. Features con 🔴 estan planificados pero no implementados.

---

## 1. Producto

**OpenDirector** es un sistema open-source de produccion en vivo que reemplaza CuEZ. Tiene dos componentes: una webapp (editor de rundown) y un Automator (app desktop que controla vMix). Gratis, self-hosted, pensado para educacion y producciones chicas.

### Para quien

- Alumnos aprendiendo produccion de TV en un laboratorio
- Productoras chicas que no pueden pagar CuEZ (EUR 100+/mes)
- Iglesias, streamers, eventos corporativos
- Un aula, una instancia del servidor, multiples PCs con vMix

### Que problema resuelve

Hoy un alumno que quiere automatizar vMix tiene dos opciones: CuEZ pagando licencia mensual, o todo manual clickeando en vMix. OpenDirector es la tercera: software profesional, gratis, que pueden estudiar por dentro.

---

## 2. Roles y Vistas

| # | Rol | Vista | URL / App | Donde esta |
|---|-----|-------|-----------|------------|
| 1 | **Productor** | Editor + Go Live | `/shows/:id/edit` y `/shows/:id/live` | Cualquier lado (webapp) |
| 2 | **Operador/TD** | Automator | MSI Windows (Tauri) | Junto a vMix (mismo LAN) |
| 3 | **Host/Talento** | Prompter | `/shows/:id/prompter` | Frente a camara (browser) |

### Productor
Arma el show completo: rundown, bloques, scripts, zocalos, media, acciones. Durante el aire monitorea desde Go Live. Puede editar en caliente (scripts, zocalos) y enviar senales al talento (countdown, wrap, go).

### Operador/TD
Ejecuta el show desde el Automator. Keyboard-first (F1-F8, Space, arrows). Ve tally en tiempo real. Funciona autonomamente si se cae la conexion al servidor gracias al cache SQLite local.

### Host/Talento
Lee el script en el prompter. Controla su propio scroll (pedal bluetooth, teclado, auto-scroll, o touch). Ve senales del productor (countdown, wrap, stretch).

---

## 3. Arquitectura

```
                    WEBAPP (Next.js + Supabase/Postgres)
                    Servidor central del aula
                    ┌─────────────────────────────────────┐
                    │                                     │
                    │  REST API (CRUD shows, media)       │
                    │                                     │
                    │  WebSocket Server (relay)            │
                    │  ├── rundown-sync                   │
                    │  ├── execution (CUE/NEXT/ACK)       │
                    │  ├── prompter (scroll sync)         │
                    │  ├── tally (vMix state broadcast)   │
                    │  └── signals (productor → talento)  │
                    │                                     │
                    │  Media Storage (filesystem)         │
                    │  Media Transfer (HTTP + Range)      │
                    │                                     │
                    │  Supabase (PostgreSQL):             │
                    │  Todas las tablas en una sola DB    │
                    │                                     │
                    └──────────┬───────────────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              │ wss://         │ wss://           │ wss://
              ▼                ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
    │  Automator   │  │  Prompter    │  │  Prompter        │
    │  (Tauri MSI) │  │  Display 1   │  │  Display 2..N    │
    │              │  │  (Host)      │  │  (followers)     │
    │  SQLite local│  │  controla    │  │  siguen al       │
    │  vMix TCP ───│  │  scroll      │  │  host            │
    │  ejecucion   │  │              │  │                  │
    │  autonoma    │  │              │  │                  │
    └──────────────┘  └──────────────┘  └──────────────────┘
     PC del lab        frente a cam      otras camaras
     (junto a vMix)
```

### Principios de arquitectura

1. 🟢 **El Automator ejecuta localmente.** La WebSocket es para sync, NO para ejecucion. El Automator habla con vMix por TCP localhost (<1ms).

2. 🟢 **Una sola DB (Supabase/PostgreSQL).** Todas las tablas en una sola base de datos, particionadas por `show_id`.

3. 🟢 **Offline-first para el Automator.** Cache SQLite local del rundown completo. Si se cae el servidor, el show sigue.

4. 🟢 **Prompter offline-capable.** Al conectar, el prompter cachea scripts en IndexedDB. Si se cae el servidor, el talento sigue leyendo.

5. 🟢 **Contenido vs ejecucion: dominios separados.** Contenido: webapp gana. Estado de ejecucion: Automator gana.

6. 🟢 **Optimistic locking en el editor.** Cada edit incluye `expectedVersion`. Si no matchea, 409 Conflict.

### Arquitectura fisica

| Maquina | OS | Instalar | Accede a |
|---------|----|----------|----------|
| **Servidor** | Cualquiera | Docker **o** Node.js 20 + ffmpeg | — |
| **PC Operador** | Windows | vMix + Automator (.msi) | vMix TCP `:8099` + Server `:3000` |
| **PC Productor** | Cualquiera | Nada (browser) | Server HTTP `:3000` |
| **Tablet Prompter** | Cualquiera | Nada (browser) | Server HTTP `:3000` |

Setup minimo: 1 sola PC con vMix + servidor + browser tabs.
Setup aula: 1 servidor + N PCs operador + N tablets prompter.

---

## 4. Stack Tecnico

### Webapp
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Framework | Next.js 14+ (App Router) | Server components, API routes, WebSocket via custom server |
| DB | Supabase (PostgreSQL) via `@supabase/supabase-js` | Concurrencia real, una sola DB |
| WebSocket | ws (Node.js) sobre custom server | Relay simple, control total |
| Media storage | Filesystem (`data/shows/{show_id}/media/`) | Simple, sin cloud dependency |
| Auth | 🔴 No implementado (acceso abierto) | PIN-based auth planificado |
| UI | React + Tailwind CSS | Dark mode default |
| Drag & drop | dnd-kit | Reordenamiento de bloques y elementos |
| State | Zustand | Lightweight, WebSocket-friendly |

### Automator
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Framework | Tauri v2 (Rust + WebView2) | MSI nativo, <10MB |
| DB local | SQLite (rusqlite) | Cache offline del rundown |
| vMix comms | 1 conexion TCP (tokio) | SUBSCRIBE TALLY + ACTS, FUNCTION commands |
| WebSocket | Browser WebSocket | Via webview (React side) |
| Frontend | React (Vite) en webview | Misma tech que webapp |
| Auto-update | API endpoint + GitHub Releases | Check al iniciar |

### Prompter
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Vista | Ruta de la webapp `/shows/:id/prompter` | Sin instalacion, cualquier browser |
| Offline cache | IndexedDB | Scripts persisten si cae el server |
| Fullscreen | Fullscreen API + Wake Lock API | Pantalla no se apaga |
| Mirror | CSS `transform: scaleX(-1)` | Para prompter de vidrio |

---

## 5. Modelo de Datos

Todas las tablas viven en PostgreSQL (Supabase). Prefijo `od_` para evitar colisiones.

### Tablas implementadas (6 migraciones)

```sql
-----------------------------------------------------------
-- SHOW
-----------------------------------------------------------
CREATE TABLE od_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',        -- draft | ready | rehearsal | live | archived
  version INTEGER DEFAULT 1,          -- se incrementa con cada edit
  media_size_bytes BIGINT DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE od_show_config (
  show_id UUID PRIMARY KEY REFERENCES od_shows(id) ON DELETE CASCADE,
  vmix_host TEXT DEFAULT '127.0.0.1',
  vmix_port INTEGER DEFAULT 8099,
  clip_pool_a_key TEXT DEFAULT 'CLIP_A',
  clip_pool_b_key TEXT DEFAULT 'CLIP_B',
  graphic_key TEXT DEFAULT 'GFX',
  graphic_overlay INTEGER DEFAULT 1,
  lower_third_key TEXT DEFAULT 'LT',
  lower_third_overlay INTEGER DEFAULT 2,
  action_delay_ms INTEGER DEFAULT 40,
  overrun_behavior TEXT DEFAULT 'hold_last',
  overrun_safe_input_key TEXT
);

-----------------------------------------------------------
-- PROMPTER CONFIG
-----------------------------------------------------------
CREATE TABLE od_prompter_config (
  show_id UUID PRIMARY KEY REFERENCES od_shows(id) ON DELETE CASCADE,
  font_size INTEGER DEFAULT 48,
  font_family TEXT DEFAULT 'Arial',
  line_height REAL DEFAULT 1.5,
  color_text TEXT DEFAULT '#FFFFFF',
  color_bg TEXT DEFAULT '#000000',
  color_marks TEXT DEFAULT '#FFFF00',
  color_past TEXT DEFAULT 'rgba(255,255,255,0.3)',
  margin_percent INTEGER DEFAULT 15,
  guide_enabled BOOLEAN DEFAULT TRUE,
  guide_position REAL DEFAULT 0.33,
  default_scroll_speed INTEGER DEFAULT 60
);

-----------------------------------------------------------
-- PERSONAS
-----------------------------------------------------------
CREATE TABLE od_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  vmix_input_key TEXT,
  audio_bus TEXT DEFAULT 'A',
  auto_lower_third BOOLEAN DEFAULT TRUE,
  lower_third_line1 TEXT,
  lower_third_line2 TEXT,
  photo_path TEXT,
  position INTEGER DEFAULT 0
);

-----------------------------------------------------------
-- BLOQUES
-----------------------------------------------------------
CREATE TABLE od_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  estimated_duration_sec INTEGER DEFAULT 0,
  actual_duration_sec INTEGER,          -- 🟢 migration 006
  cameras JSONB DEFAULT '[]',
  script TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending'          -- pending | on_air | done | skipped
);

-----------------------------------------------------------
-- ELEMENTOS
-----------------------------------------------------------
CREATE TABLE od_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES od_blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- clip | graphic | lower_third | audio | note
  position INTEGER NOT NULL,
  title TEXT,
  subtitle TEXT,
  media_id UUID REFERENCES od_media(id) ON DELETE SET NULL,
  duration_sec INTEGER,
  style TEXT DEFAULT 'standard',
  mode TEXT DEFAULT 'fullscreen',
  trigger_type TEXT DEFAULT 'manual',    -- manual | on_cue | on_block_start | timecode | on_keyword
  trigger_config JSONB,
  vmix_input_key TEXT,
  sync_status TEXT DEFAULT 'pending',
  status TEXT DEFAULT 'pending'
);

-----------------------------------------------------------
-- ACCIONES (por elemento)
-----------------------------------------------------------
CREATE TABLE od_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id UUID REFERENCES od_elements(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,                   -- on_cue | step | timecode | on_exit
  step_label TEXT,
  step_color TEXT,
  step_hotkey TEXT,
  position INTEGER NOT NULL,
  vmix_function TEXT NOT NULL,
  target TEXT,
  field TEXT,
  value TEXT,
  delay_ms INTEGER DEFAULT 0
);

-----------------------------------------------------------
-- MEDIA
-----------------------------------------------------------
CREATE TABLE od_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  duration_sec REAL,
  width INTEGER,
  height INTEGER,
  thumbnail_path TEXT,
  checksum TEXT,                          -- SHA256
  codec TEXT,
  container TEXT,
  vmix_compatible BOOLEAN DEFAULT TRUE,
  category TEXT,                          -- 🟢 migration 005: clip | stinger | graphic | lower_third | audio
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-----------------------------------------------------------
-- GT TEMPLATES (Lower Third / Graphics Templates)
-----------------------------------------------------------
CREATE TABLE od_gt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  vmix_input_key TEXT NOT NULL,
  overlay_number INTEGER DEFAULT 2,
  fields JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-----------------------------------------------------------
-- TEMPLATES (show templates, metadata — contenido en filesystem JSON)
-----------------------------------------------------------
CREATE TABLE od_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,
  thumbnail_path TEXT,
  is_builtin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-----------------------------------------------------------
-- EXECUTION LOG (event sourcing, inmutable)
-----------------------------------------------------------
CREATE TABLE od_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  block_id UUID,
  element_id UUID,
  timestamp TIMESTAMPTZ NOT NULL,
  seq INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  operator TEXT,
  vmix_command TEXT,
  vmix_response TEXT,
  latency_ms INTEGER,
  metadata JSONB
);

-----------------------------------------------------------
-- SENALES (productor → talento)
-----------------------------------------------------------
CREATE TABLE od_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                    -- countdown | wrap | stretch | standby | go | custom
  value TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT FALSE
);

-----------------------------------------------------------
-- UNDO HISTORY (para el editor)
-----------------------------------------------------------
CREATE TABLE od_undo_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  forward_data JSONB NOT NULL,
  reverse_data JSONB NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

### Estructura de `data/` (filesystem — solo binarios)

```
data/
├── templates/
│   └── custom-{id}.json         ← shows guardados como template
├── releases/                    ← MSI del Automator para auto-update
│   └── OpenDirector-X.Y.Z.msi
└── shows/
    ├── {show_id}/
    │   └── media/
    │       ├── {uuid}.ext
    │       └── thumbs/
    │           └── {uuid}.jpg
    └── ...
```

---

## 6. REST API

### Shows
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows` | Listar shows |
| POST | `/api/shows` | Crear show (con config default) |
| GET | `/api/shows/:id` | Obtener show |
| PUT | `/api/shows/:id` | Actualizar show (requiere `expectedVersion`) |
| DELETE | `/api/shows/:id` | Eliminar show (cascade) |
| PUT | `/api/shows/:id/status` | Cambiar estado (draft/ready/rehearsal/live/archived) |
| GET | `/api/shows/:id/config` | Obtener config |
| PUT | `/api/shows/:id/config` | Actualizar config |
| GET | `/api/shows/:id/rundown` | Rundown completo (show + blocks + elements + actions + GT templates + media) |

### Blocks
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows/:id/blocks` | Listar bloques |
| POST | `/api/shows/:id/blocks` | Crear bloque |
| PUT | `/api/shows/:id/blocks/:blockId` | Actualizar bloque |
| DELETE | `/api/shows/:id/blocks/:blockId` | Eliminar bloque |
| POST | `/api/shows/:id/blocks/reorder` | Reordenar bloques |

### Elements
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows/:id/blocks/:blockId/elements` | Listar elementos |
| POST | `/api/shows/:id/blocks/:blockId/elements` | Crear elemento |
| PUT | `/api/shows/:id/blocks/:blockId/elements/:elementId` | Actualizar |
| DELETE | `/api/shows/:id/blocks/:blockId/elements/:elementId` | Eliminar |
| POST | `/api/shows/:id/blocks/:blockId/elements/reorder` | Reordenar |

### Actions
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows/:id/blocks/:blockId/elements/:elementId/actions` | Listar acciones |
| POST | `/api/shows/:id/blocks/:blockId/elements/:elementId/actions` | Crear accion |
| PUT | `.../actions/:actionId` | Actualizar accion |
| DELETE | `.../actions/:actionId` | Eliminar accion |

### GT Templates
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows/:id/gt-templates` | Listar GT templates |
| POST | `/api/shows/:id/gt-templates` | Crear GT template |
| PUT | `/api/shows/:id/gt-templates/:templateId` | Actualizar |
| DELETE | `/api/shows/:id/gt-templates/:templateId` | Eliminar |

### Media
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/shows/:id/media` | Listar media |
| POST | `/api/shows/:id/media` | Upload (multipart/form-data) |
| GET | `/api/media/:id/download` | Download con Range headers |
| DELETE | `/api/media/:id` | Eliminar media |

### Templates
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/templates` | Listar templates |
| POST | `/api/templates` | Guardar show como template |
| POST | `/api/shows/from-template/:templateId` | Crear show desde template |

### Signals
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/shows/:id/signals` | Enviar senal al talento |

### Undo/Redo
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/shows/:id/undo` | 🟡 Deshacer (backend existe, sin UI) |
| POST | `/api/shows/:id/redo` | 🟡 Rehacer (backend existe, sin UI) |

### Automator
| Method | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/api/automator/update-check?currentVersion=X.Y.Z` | Check de actualizaciones |

---

## 7. WebSocket Protocol

El servidor WebSocket es un relay simple. No tiene autenticacion — los clientes se unen a un show room y el servidor retransmite todos los mensajes al resto del room.

### Conexion

```
URL: ws://<server>:3000/ws

// Join a show room
{ type: "join", payload: { showId: "uuid" } }

// Respuesta
{ type: "welcome", payload: { showId: "uuid", clients: 3, serverTime: "..." } }
```

### Channels

Los mensajes usan un campo `channel` para clasificarse. El servidor los retransmite a todos los clientes en el mismo show (excepto el sender).

**Channels implementados:**

| Channel | Uso | Ejemplo |
|---------|-----|---------|
| `rundown` | Sync de contenido (block/element changes) | `{ channel: "rundown", type: "block_updated", payload: {...} }` |
| `execution` | Comandos de ejecucion (CUE, NEXT, ACK) | `{ channel: "execution", type: "cue_ack", payload: {...} }` |
| `tally` | Estado de vMix (PGM/PVW) | `{ channel: "tally", type: "update", payload: {...} }` |
| `signals` | Senales productor → talento | `{ channel: "signals", type: "signal", payload: {...} }` |
| `prompter` | Scroll sync entre displays | `{ channel: "prompter", type: "scroll", payload: {...} }` |

### Persistencia

El servidor persiste automaticamente los eventos de ejecucion en `od_execution_log` via Supabase REST. Tipos loggeados: `cue`, `next_block`, `prev_block`, `stop`, `reset_show`, `cue_ack`, `error`, `block_changed`, `state`.

### Heartbeat

Ping/pong nativo de WebSocket cada 3 segundos. Si 2 pings sin respuesta → termina la conexion.

---

## 8. Automator — Detalle Interno

### Componentes (Rust backend)

```
automator/src-tauri/src/
├── lib.rs              # AppState, Tauri setup
├── commands.rs         # Tauri commands (invocables desde frontend)
├── vmix/
│   ├── mod.rs
│   ├── client.rs       # TCP client legacy (VmixResult type)
│   ├── pool.rs         # TCP connection pool: 4 canales dedicados (Transitions/Graphics/Audio/State)
│   ├── tally.rs        # Parser de TALLY responses
│   ├── acts.rs         # Parser de ACTS (clip position/duration)
│   └── xml_parser.rs   # Parser de vMix XML state (pre-flight)
├── execution/
│   ├── mod.rs
│   ├── engine.rs       # CUE execution pipeline
│   └── timecode.rs     # TimecodeMonitor (timecode triggers)
├── media/
│   ├── mod.rs
│   └── downloader.rs   # HTTP download con Range headers + SHA256
├── db/
│   ├── mod.rs          # Database struct, migrations
│   ├── ops.rs          # CRUD operations
│   └── schema.sql      # SQLite schema (offline cache)
└── ws/
    ├── mod.rs
    └── client.rs       # WebSocket client (actualmente no usado — WS va por React side)
```

### 🟢 vMix TCP Connection Pool

4 conexiones TCP dedicadas a vMix (default `127.0.0.1:8099`), clasificadas por tipo de funcion:

| Canal | Prioridad | Funciones | SUBSCRIBE |
|-------|-----------|-----------|-----------|
| **Transitions** | Máxima | CutDirect, Fade, Stinger, Merge, Wipe, FadeToBlack | No |
| **Graphics** | Alta | OverlayInput*, SetText*, SetImage*, SelectTitlePreset*, SetColor, SetCountdown | No |
| **Audio** | Media | AudioOn/Off, AudioBus*, SetVolume*, SetBalance, Solo*, MasterAudio* | No |
| **State** | Normal | Play, Pause, todo lo demás + fallback | TALLY, ACTS, RECORDING, STREAMING |

Cada canal tiene su propio `Mutex<WriteHalf>`, eliminando contención entre categorías. Beneficio principal: PANIC (F12 → CutDirect) se ejecuta inmediatamente por el canal Transitions sin esperar a que termine un cue de 8+ acciones en Graphics/Audio/State.

- **Reader loop**: solo en State (parsea TALLY, ACTS, RECORDING, STREAMING)
- **Drain tasks**: en Transitions, Graphics, Audio (leen y descartan para evitar backpressure TCP)
- **Fallback**: si un canal cae, se intenta enviar por cualquier otro slot conectado
- **XML fetch**: conexion separada short-lived para pre-flight check (sin cambios)
- **Clasificador**: `VmixChannel::classify(function)` — estático, basado en nombre de funcion

Inputs siempre referenciados por **Key** de vMix, nunca por numero.

### 🟢 Execution Engine

Pipeline de ejecucion:

1. Recibe comando (UI local via Tauri invoke)
2. Resuelve variables: `{{clip_pool}}` → `CLIP_A`/`CLIP_B`, `{{media_path}}`, `{{title}}`, `{{subtitle}}`
3. Ejecuta action chain secuencialmente con delays (`tokio::sleep`)
4. Envia cada accion a vMix via TCP
5. Retorna resultado (ok + latencyMs) al frontend
6. Frontend broadcast via WebSocket al server

**A/B Clip Pool**: alterna automaticamente entre `clip_pool_a_key` y `clip_pool_b_key` para playback seamless.

**Concurrencia**: cada canal TCP tiene su propio mutex interno. Dentro de un cue, las acciones se ejecutan en orden secuencial, pero operaciones diferentes (cue + PANIC, cue + preflight) pueden ejecutarse concurrentemente por canales distintos.

### 🟢 Back-Timing System

Timing profesional de TV, 100% client-side (tanto en webapp como Automator):

- **Block countdown**: tiempo restante del bloque actual (estimated - elapsed)
- **Back-time**: hora de reloj a la que deberia arrancar cada bloque futuro
- **Over/under badges**: `+0:32` rojo o `-0:15` verde en bloques completados
- **Show remaining**: tiempo total restante del show
- **Color coding**: verde (on time), amarillo (>80%), rojo (overrun)
- **Persist**: `actual_duration_sec` guardado en DB al completar bloque

Algoritmo de back-time:
1. `remaining_current = max(0, estimated - elapsed)`
2. Para bloque futuro `i`: `backTime[i] = now + remaining_current + sum(estimated[current+1..i-1])`
3. Resultado: hora de reloj (ej: "21:15") mostrada junto a cada bloque futuro

Archivos: `src/lib/timing.ts` (webapp), `automator/src/lib/timing.ts` (Automator)

### 🟢 SQLite Offline Cache

El Automator cachea el rundown completo en SQLite local (WAL mode):

- **Write-through**: cada fetch exitoso del server guarda en SQLite
- **Offline fallback**: si el server no responde, carga el ultimo rundown cacheado
- **Banner**: "OFFLINE — cached data" cuando opera desde cache
- **Reconnect**: al reconectar, re-fetch y compara

Schema SQLite (`automator/src-tauri/src/db/schema.sql`):
- `cached_show` — metadata del show
- `cached_blocks` — bloques con posicion, duracion, script, cameras
- `cached_gt_templates` — templates de graficos
- `cached_media` — estado de sync de media files

### 🟢 Pre-Flight Validator

Antes de ir live, valida que vMix tenga todos los inputs necesarios:

1. Fetch XML state de vMix (conexion TCP separada, `XML\r\n`)
2. Parsear inputs disponibles con `xml_parser.rs` (sin dependencias externas)
3. Comparar contra el rundown:
   - **Clip pools**: ¿existen los inputs `CLIP_A` y `CLIP_B`?
   - **GT Title inputs**: ¿existen los inputs referenciados por GT templates? ¿Son tipo GT Title?
   - **Element inputs**: ¿existen los inputs referenciados por elementos?

Niveles de resultado:
- **Error** (rojo): input requerido no existe
- **Warning** (amarillo): input no verificable
- **OK** (verde): input encontrado

Panel visual en `PreflightPanel.tsx`. Boton "Re-check" para re-validar.

### 🟢 Timecode Triggers

Acciones que se disparan automaticamente en un punto especifico de un clip:

- **ACTS subscription**: vMix envia posicion del clip activo cada ~100ms
- **Trigger config**: `{"at": "5000"}` (5s desde inicio) o `{"at": "-3000"}` (3s antes del final)
- **TimecodeMonitor**: compara posicion vs triggers registrados
- **Idempotente**: cada trigger se dispara una sola vez por bloque (flag `fired`)
- **Registration**: triggers se registran al entrar a un bloque, se limpian al salir

Archivos: `execution/timecode.rs` (Rust), `vmix/acts.rs` (parser)

### 🟢 Media Sync

1. Automator recibe rundown con media references
2. Para cada media no descargado: `GET /api/media/:id/download` con Range headers (resumible)
3. Max 2 descargas simultaneas
4. Verificacion SHA256 post-descarga (retry si falla)
5. Progress bar por archivo en `MediaSyncPanel.tsx`

### 🟢 Tally

Parseo del string TALLY de vMix: cada digito indica estado de un input (0=off, 1=program, 2=preview). Se emite al frontend como evento `vmix-tally`.

### 🟢 Auto/Manual Execution Mode

- **Manual** (default): operador ejecuta CUEs manualmente con teclado
- **Auto**: elementos con `trigger_type: on_block_start` se ejecutan automaticamente al entrar al bloque

### Hotkeys del Automator (implementados)

```
EJECUCION:
  Space         → NEXT block
  Enter         → CUE elemento seleccionado
  F1-F8         → Steps configurables por elemento
  Escape        → Deselect element
  Backspace     → PREV block

NAVEGACION:
  ↑ / ↓         → navegar elementos dentro del bloque
```

### Tauri Commands

```
connect_server(url, showId)       → conecta WS + fetch rundown + cache SQLite
connect_vmix(host, port)          → abre TCP, SUBSCRIBE TALLY/ACTS
disconnect_vmix()                 → cierra TCP
disconnect_all()                  → cierra todo
fetch_shows(serverUrl)            → lista de shows
fetch_rundown(serverUrl, showId)  → rundown completo + write-through cache
execute_cue(args)                 → ejecuta action chain contra vMix
execute_step(args)                → ejecuta step action especifico
send_vmix_command(function, params) → comando raw a vMix
get_status()                      → estado de conexiones
set_media_folder(folder)          → configura path de descarga
sync_media()                      → inicia descarga de media pendiente
get_media_sync_status()           → estado de cada media file
load_cached_rundown(showId?)      → carga rundown de SQLite (offline)
run_preflight_check(args)         → valida vMix vs rundown
register_timecode_triggers(triggers) → registra triggers para bloque actual
clear_timecode_triggers()         → limpia triggers registrados
check_timecode_triggers(pos, dur) → evalua triggers contra posicion actual
```

---

## 9. Webapp — Features

### 🟢 Show CRUD

- Crear, editar, eliminar shows
- Duplicar shows (via template)
- Show version incremental en cada edit
- Optimistic locking: PUT requiere `expectedVersion`, 409 si mismatch

### 🟢 Show State Machine

```
              ┌───────────┐
      ┌──────│   draft    │──────┐
      │      └───────────┘      │
      │            │            │
      │            ▼            │
      │      ┌───────────┐      │
      └──────│   ready    │◄─────────────┐
             └───────────┘               │
              │    │    │                 │
              ▼    │    ▼                 │
    ┌──────────┐  │  ┌──────────┐        │
    │ rehearsal │  │  │   live   │────────┘
    └──────────┘  │  └──────────┘
                  │
                  ▼
            ┌───────────┐
            │ archived  │
            └───────────┘
```

Transiciones validas: draft↔ready, ready↔rehearsal, ready↔live, ready→archived, archived→ready, rehearsal→live, live→ready.

**Live-mode protection**: en live solo se pueden editar scripts, notes, titles, y GT field values. No crear/eliminar bloques ni elementos.

### 🟢 Editor de Rundown

- Bloques con drag & drop (reordenar)
- Elementos por bloque con drag & drop
- 5 tipos de elementos: clip, graphic, lower_third, audio, note
- Inspector panel para editar propiedades del elemento seleccionado
- Script editor por bloque (para prompter)
- Action configurator por elemento
- Media panel con upload + thumbnails

### 🟢 GT Templates (Lower Thirds)

Mapea lower thirds del rundown a inputs GT Title de vMix:
1. Crear template: nombre + `vmix_input_key` + campos (ej: `Headline.Text`, `Description.Text`)
2. Asignar template a elemento lower_third
3. Llenar field values por elemento
4. Automator ejecuta: `SetText` para cada campo + `OverlayInputIn` para mostrar

### 🟢 Media Management

**Upload** (productor → servidor):
- Almacenamiento: `data/shows/{show_id}/media/{uuid}.{ext}`
- Thumbnail via ffmpeg (primer frame para video, resize para imagen)
- Metadata via ffprobe (codec, container, duracion, resolucion, fps)
- SHA256 checksum para verificacion en sync
- Codec check: advierte si no es compatible con vMix (no bloquea)
- Categorias: clip, stinger, graphic, lower_third, audio

**Codecs compatibles con vMix**: H.264, H.265/HEVC, MPEG-2, ProRes, DNxHD
**Containers compatibles**: .mp4, .mov, .avi, .mxf, .mpg

### 🟢 Go Live Panel (Productor)

Vista de monitoreo durante el show:
- **Header**: indicador LIVE, nombre del show, reloj, estado de conexiones
- **Rundown**: bloques con status (pending/on_air/done), elementos con checkmarks
- **4 Timers**: show elapsed, block elapsed, block remaining (con color), show remaining
- **Back-times**: hora de reloj estimada para bloques futuros
- **Over/under badges**: delta en bloques completados (verde si temprano, rojo si overrun)
- **Tally**: PGM/PVW inputs, overlays, recording/streaming
- **Execution log**: ultimos 200 eventos
- **Signal panel**: botones para enviar senales al talento
- **Script view**: script del bloque actual (read-only)

### 🟢 Signals al Talento

6 tipos de senales enviadas desde Go Live al prompter:
- **Countdown**: cuenta regresiva (30s, 60s)
- **Wrap**: terminar pronto (rojo, parpadea)
- **Stretch**: estirar/llenar tiempo (azul)
- **Standby**: prepararse (amarillo)
- **Go**: arrancar (verde, 3 segundos)
- **Custom**: mensaje de texto libre

Se envian via API POST y broadcast por WebSocket al prompter.

### 🟢 Prompter

Vista del talento frente a camara:
- Script de cada bloque con scroll
- Senales del productor como overlay semi-transparente
- Cache offline en IndexedDB
- **Configuracion**: font size, font family, line height, colores, margenes, guide line, scroll speed
- **Controles de scroll**: pedal bluetooth/teclado, auto-scroll (0-100), touch drag
- **Mirror mode**: `scaleX(-1)` para prompter de vidrio
- **Fullscreen**: Fullscreen API + Wake Lock API

**Que funciona offline**: scroll (auto/pedal/teclado/touch), navegacion entre bloques, mirror, wake lock, fullscreen
**Que NO funciona offline**: senales del productor, ediciones en caliente del script, sync de bloque actual

### 🟢 Templates (Show Templates)

- Guardar show como template (JSON snapshot sin media)
- Crear show desde template (genera nuevos IDs)
- Almacenamiento: `data/templates/custom-{id}.json` + metadata en `od_templates`

### 🟢 Dark Mode

Toda la UI es dark mode por default. Colores custom via CSS variables (`--od-bg`, `--od-surface`, `--od-accent`, `--od-text`, `--od-text-dim`). No hay toggle de light mode.

Colores de tally: Program = rojo, Preview = verde (con shapes distintas para daltonismo).

---

## 10. Automator — Pantalla

### Connection Screen

```
┌─────────────────────────────────────────┐
│  OPEN DIRECTOR Automator                │
│                                         │
│  Server URL: [http://192.168.1.14:3000] │
│  Show: [Noticiero 9PM ▾]               │
│                                         │
│  vMix Host: [127.0.0.1]                │
│  vMix Port: [8099]                      │
│                                         │
│  Media Folder: [C:\OpenDirector\Media]  │
│                                         │
│  [CONNECT]                              │
└─────────────────────────────────────────┘
```

### Main Screen

```
┌──────────────────────────────────────────────────────────────────┐
│  StatusBar: vMix ● | Server ● | Show: Noticiero 9PM | Mode     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✓ BLOQUE 1: Apertura        5:12  done  +0:12               │
│                                                                  │
│  ● BLOQUE 2: Economia       12:34  on_air                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  🔤 Inflacion LT   [CUE] [F1 IN] [F2 OUT]               │  │
│  │  🎬 informe.mp4    [CUE] [F3 PLAY]          2:34          │  │
│  │  🖼️ grafico.png    [CUE] [F4 IN] [F5 OUT]               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ○ BLOQUE 3: Politica       ~15:00  21:27                     │
│  ○ BLOQUE 4: Cierre          ~5:00  21:42                     │
│                                                                  │
├─────────────────────────────────┐                                │
│  PreflightPanel (collapsible)   │                                │
├─────────────────────┬───────────┴────────────────────────────────┤
│  TallyPanel         │  ExecutionLog                              │
│  PGM: cam_martin ■  │  21:12:31 SetText → OK (2ms)             │
│  PVW: cam_diego  □  │  21:12:30 CutDirect → OK (1ms)           │
├─────────────────────┴────────────────────────────────────────────┤
│  ControlBar: [◀ PREV] [NEXT ▶] | Block: 2:26 | Show: 17:46    │
│              Block remaining: 12:34 | Show remaining: 22:14     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 11. Deployment

### Docker Compose (recomendado)

```bash
git clone https://github.com/diegodella1/opendirector.git
cd opendirector
docker compose up -d
# → http://host-ip:3000
```

Servicios: PostgreSQL 16, PostgREST v12.2.3, Next.js webapp + server.js

### Automator

1. Descargar MSI desde `/download` en la webapp
2. Instalar: doble-click o `msiexec /i OpenDirector.msi /quiet`
3. Al abrir: configurar IP del servidor + vMix host/port
4. Auto-update: check contra `/api/automator/update-check` (GitHub Releases)

### GitHub Release Pipeline

`.github/workflows/automator-build.yml`:
1. Trigger: push a `automator/**` o manual dispatch
2. Build: Tauri → MSI
3. Release: GitHub Release con tag `automator-v{version}`

---

## 12. Features Planificados (No Implementados)

| Feature | Descripcion | Impacto |
|---------|-------------|---------|
| **🔴 Auth PIN-based** | PIN por show+rol → session token UUID, bcrypt hash, rate limiting, session expiry | Seguridad |
| **🔴 Undo/Redo UI** | Backend existe (routes + tabla), falta UI (Ctrl+Z/Y buttons) | Editor UX |
| **🔴 People/Personas CRUD UI** | Tabla `od_people` existe, falta UI para gestionar personas | Editor |
| **🔴 Companion Device** | Celular del host controla scroll del prompter via WebSocket relay | Prompter |
| **🔴 PANIC button** | F12 → cut a safe input (logo/barras). Config `overrun_safe_input_key` existe | Automator |
| **🔴 Reset Show** | R → resetear todos los bloques a pending, volver al inicio | Automator |
| **🔴 Rehearsal mode toggle** | Ctrl+R toggle en Automator. Todo funciona pero no envia a vMix | Automator |
| **🔴 As-run log export** | CSV/PDF del execution log post-show | Reporting |
| **🔴 Pre-built templates** | Templates incluidos (noticiero, magazine, deportivo, evento, streaming) | Onboarding |
| **🔴 OBS support** | Soporte para obs-websocket ademas de vMix | Alcance |
| **🔴 4 TCP connections** | Pool de 4 conexiones priorizadas (transitions/graphics/audio/state) | Performance |
| **🔴 WS auth + reconnect reconciliation** | Handshake con token, protocolo de reconciliacion offline | Robustez |
| **🔴 PWA manifest** | `manifest.json` para "Add to Home Screen" del prompter | Mobile UX |

---

## 13. Limitaciones Conocidas

- Single-server (no clustering/HA)
- Un Automator por show (multi-vMix requiere shows separados)
- Automator es Windows-only (por vMix)
- Sin autenticacion — todos los endpoints son publicos
- 1 conexion TCP a vMix (no pool priorizado de 4)
- Editor: optimistic locking con notificacion, no merge automatico
- Sin audio meters (vMix los tiene, no se replican)
- Sin NDI awareness (solo vMix TCP API)
- Sin tally lights fisicas (solo virtual en UI)
- Sin timecode SMPTE (usa timestamps internos + ACTS de vMix)
- Sin transcoding de media (valida codec, advierte, no transcodea)
- Sin companion device para prompter
- Prompter offline: pierde senales y sync de bloque actual

---

## 14. URLs de la Aplicacion

| URL | Descripcion |
|-----|-------------|
| `/` | Home — lista de shows |
| `/shows/:id/edit` | Editor de rundown |
| `/shows/:id/live` | Go Live panel (productor) |
| `/shows/:id/prompter` | Teleprompter (talento) |
| `/download` | Pagina de descarga del Automator |
| `/instructions.html` | Manual de usuario completo |
