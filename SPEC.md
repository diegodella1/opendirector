# OpenDirector — Spec Completa

## 1. Producto

**OpenDirector** es un sistema open-source de produccion en vivo que reemplaza CuEZ. Tiene dos componentes: una webapp (editor de rundown) y un Automator (app desktop que controla vMix). Gratis, self-hosted, pensado para educacion y producciones chicas.

### Para quien

- Alumnos aprendiendo produccion de TV en un laboratorio
- Productoras chicas que no pueden pagar CuEZ (EUR100+/mes)
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
Ejecuta el show desde el Automator. Botones CUE, PLAY, IN, OUT. Keyboard-first (F1-F5, Space, arrows). Ve tally en tiempo real. Controla audio. Funciona autonomamente si se cae la conexion al servidor.

### Host/Talento
Lee el script en el prompter y controla su propio scroll (pedal bluetooth, teclado, companion device en celular, o auto-scroll). Ve senales del productor (countdown, wrap, stretch).

---

## 3. Arquitectura

```
                    WEBAPP (Next.js + Supabase/Postgres)
                    Servidor central del aula
                    ┌─────────────────────────────────────┐
                    │                                     │
                    │  REST API (CRUD shows, media)       │
                    │                                     │
                    │  WebSocket Server                   │
                    │  ├── rundown-sync                   │
                    │  ├── execution (CUE/NEXT/ACK)       │
                    │  ├── prompter (pos+velocity sync)   │
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
    │  ejecucion   │  │  companion   │  │                  │
    │  autonoma    │  │  o pedal     │  │                  │
    └──────────────┘  └──────────────┘  └──────────────────┘
     PC del lab        frente a cam      otras camaras
     (junto a vMix)
```

### Principios de arquitectura

1. **El Automator ejecuta localmente.** La WebSocket es para sync, NO para ejecucion. El Automator habla con vMix por TCP localhost (<1ms). El WAN solo transporta cambios de estado.

2. **Una sola DB (Supabase/PostgreSQL).** Todas las tablas en una sola base de datos, particionadas por `show_id`. Mejor concurrencia que SQLite. Portabilidad via export JSON.

3. **Offline-first para el Automator.** El Automator tiene copia local completa del rundown. Si se cae el servidor, el show sigue.

4. **Client-side interpolation para el prompter.** El servidor manda posicion + velocidad cada 200ms. Los clientes interpolan a 60fps. Scroll suave siempre, sin importar latencia.

5. **Prompter offline-capable.** Al conectar, el prompter cachea todos los scripts en IndexedDB. Si se cae el servidor, el talento sigue leyendo y scrolleando. Pierde señales y companion, pero el texto sigue.

6. **Contenido vs ejecucion: dominios separados de autoridad.**
   - Contenido (scripts, bloques, elementos): **webapp gana** en conflictos
   - Estado de ejecucion (bloque actual, que se ejecuto): **Automator gana**
   - Execution log: **merge** (ambos append, dedup por idempotencyKey)

7. **Un Automator por show.** El server enforce que solo un Automator este conectado a un show a la vez. Si se necesitan multiples vMix, se modelan como shows separados.

8. **Optimistic locking en el editor.** Cada edit incluye `expectedVersion`. Si no matchea, 409 Conflict. El cliente re-fetchea y muestra el cambio del otro usuario.

### Arquitectura fisica — Que va en cada maquina

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RED LAN DEL AULA                                 │
│                     (ej: 192.168.1.0/24)                                │
│                                                                         │
│  ┌─────────────────────────────────────┐                                │
│  │  PC SERVIDOR (1 por aula)           │                                │
│  │                                     │                                │
│  │  Instalar:                          │                                │
│  │  • Docker (recomendado)             │                                │
│  │    └─ container opendirector/server │                                │
│  │  O:                                 │                                │
│  │  • Node.js 20+                      │                                │
│  │  • ffmpeg (thumbnails/metadata)     │                                │
│  │                                     │                                │
│  │  Corre:                             │                                │
│  │  • Next.js (REST API + SSR)  :3000  │                                │
│  │  • WebSocket server (ws)     :3000  │                                │
│  │  • Supabase (PostgreSQL)             │                                │
│  │  • Media storage (filesystem)       │                                │
│  │                                     │                                │
│  │  OS: Linux, macOS o Windows         │                                │
│  │  Puede ser la misma PC de vMix      │                                │
│  │  en setup minimo                    │                                │
│  └──────────┬──────────────────────────┘                                │
│             │                                                           │
│     ┌───────┼──────────┬──────────────┬────────────────┐                │
│     │ HTTP+WS          │ HTTP+WS      │ HTTP+WS        │ HTTP+WS       │
│     ▼                  ▼              ▼                ▼                │
│  ┌──────────────┐ ┌─────────┐ ┌────────────┐ ┌──────────────────┐      │
│  │ PC OPERADOR  │ │ PC/MAC  │ │ TABLET/PC  │ │ CELULAR HOST     │      │
│  │ (con vMix)   │ │PRODUCTOR│ │ PROMPTER   │ │ COMPANION        │      │
│  │              │ │         │ │            │ │                  │      │
│  │ Instalar:    │ │Instalar:│ │ Instalar:  │ │ Instalar:        │      │
│  │ • vMix       │ │ • Nada  │ │ • Nada     │ │ • Nada           │      │
│  │ • Automator  │ │         │ │            │ │                  │      │
│  │   (.msi)     │ │ Abrir:  │ │ Abrir:     │ │ Abrir:           │      │
│  │              │ │ Chrome/ │ │ Chrome/    │ │ Chrome/Safari    │      │
│  │ Automator    │ │ Firefox │ │ Safari     │ │                  │      │
│  │ habla con    │ │         │ │            │ │ URL:             │      │
│  │ vMix por TCP │ │ URL:    │ │ URL:       │ │ server:3000/     │      │
│  │ localhost    │ │ server  │ │ server     │ │ shows/:id/       │      │
│  │ :8099        │ │ :3000/  │ │ :3000/     │ │ prompter?        │      │
│  │              │ │ shows/  │ │ shows/:id/ │ │ mode=control     │      │
│  │ OS: Windows  │ │ :id/edit│ │ prompter   │ │                  │      │
│  │ (obligatorio │ │         │ │            │ │ OS: cualquiera   │      │
│  │ por vMix)    │ │OS: cual.│ │ PWA ready  │ │                  │      │
│  └──────────────┘ └─────────┘ └────────────┘ └──────────────────┘      │
│                                                                         │
│  SETUP MINIMO: 1 sola PC con vMix + servidor + browser tabs            │
│  SETUP AULA:   1 servidor + N PCs operador + N tablets prompter         │
└─────────────────────────────────────────────────────────────────────────┘
```

| Maquina | OS | Instalar | Accede a |
|---------|----|----------|----------|
| **Servidor** | Cualquiera | Docker **o** Node.js 20 + ffmpeg | — |
| **PC Operador** | Windows | vMix + Automator (.msi, ~10MB) | vMix TCP `:8099` + Server `:3000` |
| **PC Productor** | Cualquiera | Nada (browser) | Server HTTP `:3000` |
| **Tablet Prompter** | Cualquiera | Nada (browser, PWA opcional) | Server HTTP `:3000` |
| **Celular Companion** | Cualquiera | Nada (browser) | Server HTTP `:3000` |

---

## 4. Stack Tecnico

### Webapp
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Framework | Next.js 14+ (App Router) | Server components, API routes, WebSocket via custom server |
| DB | Supabase (PostgreSQL) via @supabase/supabase-js | Concurrencia real, una sola DB, ya corriendo en el Pi |
| ORM/Client | Supabase JS client (REST API via PostgREST) | Type-safe, sin SQL crudo en el app code |
| WebSocket | ws (Node.js) sobre custom server | No depende de third-party, control total |
| Media storage | Filesystem (`data/shows/{show_id}/media/`) | Simple, sin cloud dependency |
| Media upload | tus protocol (resumible) o multer disk | NO buffering en RAM |
| Auth | PIN por show + rol | Minimo viable para un aula |
| UI | React + Tailwind CSS | Dark mode default, responsive |
| Drag & drop | dnd-kit | Reordenamiento de bloques y elementos |
| State | Zustand | Lightweight, WebSocket-friendly |

### Automator
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Framework | Tauri v2 (Rust + WebView2) | MSI nativo, <10MB, cross-platform |
| Bundler | WiX via tauri-bundler | .msi para Windows, incluye WebView2 bootstrapper |
| DB local | SQLite (rusqlite) | Cache del rundown + event store |
| vMix comms | TCP pool (tokio) | 4 conexiones persistentes, async |
| WebSocket | tokio-tungstenite | Async reconnect con backoff |
| Frontend | React (Vite) en webview | Misma tech que webapp |
| Auto-update | tauri-plugin-updater | Check al iniciar |
| Install silencioso | `msiexec /i OpenDirector.msi /quiet` | Para IT de la escuela |

### Prompter
| Componente | Tecnologia | Por que |
|------------|------------|---------|
| Vista | Ruta de la webapp `/shows/:id/prompter` | Sin instalacion, cualquier browser |
| Render | requestAnimationFrame a 60fps | Interpolacion local, scroll suave |
| Fullscreen | Fullscreen API + Wake Lock API | Pantalla no se apaga, sin chrome del browser |
| Mirror | CSS `transform: scaleX(-1)` en container (no afecta touch) | Para prompter de vidrio |
| PWA | manifest.json + service worker basico | "Add to Home Screen" en tablets iOS |

---

## 5. Modelo de Datos

Todas las tablas viven en una sola base de datos PostgreSQL (Supabase). Cada tabla que pertenece a un show tiene `show_id` como FK. Prefijo `od_` para evitar colisiones con tablas internas de Supabase.

Conexion: via Supabase JS client (`@supabase/supabase-js`) contra el REST API de PostgREST.

```sql

-----------------------------------------------------------
-- SHOW
-----------------------------------------------------------
CREATE TABLE od_shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',        -- draft | ready | rehearsal | live | archived
  version INTEGER DEFAULT 1,          -- se incrementa con cada edit
  media_size_bytes BIGINT DEFAULT 0,  -- tamano total de media
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE od_show_config (
  show_id UUID PRIMARY KEY REFERENCES od_shows(id) ON DELETE CASCADE,
  -- vMix connection
  vmix_host TEXT DEFAULT '127.0.0.1',
  vmix_port INTEGER DEFAULT 8099,     -- TCP API port
  -- Input mapping (por Key de vMix, no por numero)
  clip_pool_a_key TEXT DEFAULT 'CLIP_A',
  clip_pool_b_key TEXT DEFAULT 'CLIP_B',
  graphic_key TEXT DEFAULT 'GFX',
  graphic_overlay INTEGER DEFAULT 1,
  lower_third_key TEXT DEFAULT 'LT',
  lower_third_overlay INTEGER DEFAULT 2,
  -- Timing
  action_delay_ms INTEGER DEFAULT 40, -- delay entre acciones encadenadas
  -- Overrun
  overrun_behavior TEXT DEFAULT 'hold_last', -- hold_last | safe_input
  overrun_safe_input_key TEXT                -- Key del input de seguridad
);

CREATE TABLE od_show_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                  -- producer | operator | host
  pin_hash TEXT NOT NULL,             -- bcrypt hash del PIN (4-6 digitos)
  label TEXT,                          -- "Operador Lab A", etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE od_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- usado como Bearer token
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                  -- producer | operator | host
  client_type TEXT NOT NULL,           -- webapp | automator | prompter
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,     -- 24h webapp, 7d automator, 12h prompter
  last_seen TIMESTAMPTZ
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
  guide_position REAL DEFAULT 0.33,   -- a 1/3 de pantalla
  default_scroll_speed INTEGER DEFAULT 60  -- 0-100
);

-----------------------------------------------------------
-- PERSONAS
-----------------------------------------------------------
CREATE TABLE od_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,                           -- "Conductor", "Panelista", etc.
  vmix_input_key TEXT,                 -- Key del input de camara en vMix
  audio_bus TEXT DEFAULT 'A',
  auto_lower_third BOOLEAN DEFAULT TRUE,
  lower_third_line1 TEXT,              -- Nombre
  lower_third_line2 TEXT,              -- Cargo
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
  cameras JSONB DEFAULT '[]',          -- ["cam_diego","cam_martin"]
  script TEXT,                         -- texto del teleprompter (con marcas)
  notes TEXT,                          -- notas de produccion (no salen al aire)
  status TEXT DEFAULT 'pending'        -- pending | on_air | done | skipped
);

-- Script markup convention:
-- [PAUSA]              → pausa visual para el talento
-- [VTR: nombre]        → va un video
-- [CORTE A CAM X]      → nota de corte
-- [SOT]                → sound on tape
-- [VO]                 → voice over
-- ---                  → separador visual
-- **texto**            → bold/enfasis
-- (instruccion)        → nota en gris, no se lee

-----------------------------------------------------------
-- ELEMENTOS
-----------------------------------------------------------
CREATE TABLE od_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES od_blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- clip | graphic | lower_third | audio | note
  position INTEGER NOT NULL,
  -- Contenido (segun tipo)
  title TEXT,                          -- linea 1 / nombre del clip
  subtitle TEXT,                       -- linea 2
  media_id UUID REFERENCES od_media(id) ON DELETE SET NULL,
  duration_sec INTEGER,
  style TEXT DEFAULT 'standard',       -- standard | breaking | data | highlight
  mode TEXT DEFAULT 'fullscreen',      -- fullscreen | overlay | pip
  -- Trigger
  trigger_type TEXT DEFAULT 'manual',  -- manual | on_cue | on_block_start | timecode | on_keyword
  trigger_config JSONB,                -- {"at":"-100ms"} o {"keywords":["informe","tape"]}
  -- Estado sync con vMix
  vmix_input_key TEXT,                 -- asignado por Automator post-sync
  sync_status TEXT DEFAULT 'pending',  -- pending | downloading | synced | error
  -- Estado de ejecucion
  status TEXT DEFAULT 'pending'        -- pending | ready | triggered | done
);

-----------------------------------------------------------
-- ACCIONES (por elemento)
-----------------------------------------------------------
CREATE TABLE od_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id UUID REFERENCES od_elements(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,                 -- on_cue | step | timecode | on_exit
  -- Solo para steps:
  step_label TEXT,                     -- "PLAY", "IN", "OUT"
  step_color TEXT,                     -- green | red | blue | yellow
  step_hotkey TEXT,                    -- F1, F2, etc.
  -- Ejecucion:
  position INTEGER NOT NULL,           -- orden en la cadena
  vmix_function TEXT NOT NULL,         -- CutDirect, SetText, OverlayInput1In, etc.
  target TEXT,                         -- input key o {{variable}} (clip_pool, graphic, lt)
  field TEXT,                          -- Headline.Text, Image.Source, etc.
  value TEXT,                          -- valor a setear (puede usar {{title}}, {{media_path}})
  delay_ms INTEGER DEFAULT 0          -- delay antes de ejecutar esta accion
);

-----------------------------------------------------------
-- MEDIA
-----------------------------------------------------------
CREATE TABLE od_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID REFERENCES od_shows(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,              -- nombre en disco (UUID.ext)
  original_name TEXT NOT NULL,         -- nombre original del upload
  mime_type TEXT,
  size_bytes BIGINT,
  duration_sec REAL,                   -- si es video
  width INTEGER,                       -- resolucion
  height INTEGER,
  thumbnail_path TEXT,                 -- generado al subir
  checksum TEXT,                       -- SHA256 para verificar integridad en sync
  codec TEXT,                          -- codec detectado por ffprobe (h264, hevc, etc.)
  container TEXT,                      -- extension (.mp4, .mov, etc.)
  vmix_compatible BOOLEAN DEFAULT TRUE,-- false si codec/container no es compatible con vMix
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-----------------------------------------------------------
-- TEMPLATES (metadata en DB, contenido en filesystem JSON)
-----------------------------------------------------------
CREATE TABLE od_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filename TEXT NOT NULL,              -- 'noticiero.json' (en data/templates/)
  thumbnail_path TEXT,
  is_builtin BOOLEAN DEFAULT FALSE,   -- true para templates pre-incluidos
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
  seq INTEGER NOT NULL,                -- monotonic per source
  idempotency_key TEXT NOT NULL UNIQUE,-- para deduplicacion
  type TEXT NOT NULL,                  -- cue | next | stop | skip | reset |
                                       -- vmix_cmd | vmix_error | vmix_timeout |
                                       -- signal | override | rehearsal
  source TEXT DEFAULT 'manual',        -- webapp | automator | hotkey | timecode | auto
  operator TEXT,                       -- label del operador
  vmix_command TEXT,                   -- comando enviado
  vmix_response TEXT,                  -- respuesta de vMix
  latency_ms INTEGER,                 -- tiempo de ejecucion
  metadata JSONB                       -- datos adicionales
);

CREATE INDEX idx_exec_show_time ON od_execution_log(show_id, timestamp);
CREATE INDEX idx_exec_idemp ON od_execution_log(idempotency_key);

-----------------------------------------------------------
-- SENALES (productor → talento)
-----------------------------------------------------------
CREATE TABLE od_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- countdown | wrap | stretch | standby | go | custom
  value TEXT,                          -- "30" (segundos), mensaje custom
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,             -- cuando dejar de mostrarlo
  acknowledged BOOLEAN DEFAULT FALSE
);

-----------------------------------------------------------
-- UNDO HISTORY (para el editor)
-----------------------------------------------------------
CREATE TABLE od_undo_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  show_id UUID NOT NULL REFERENCES od_shows(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,           -- create_block | delete_block | update_block |
                                       -- create_element | delete_element | move_block | etc.
  forward_data JSONB NOT NULL,         -- datos para redo
  reverse_data JSONB NOT NULL,         -- datos para undo
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
-- Mantener ultimas 100 entradas por show, limpiar las mas viejas
```

### Estructura de `data/` (filesystem — solo media y templates)

La DB vive en Supabase (PostgreSQL). El filesystem solo guarda archivos binarios:

```
data/
├── templates/
│   ├── noticiero.json           ← pre-built (incluidos en el repo)
│   ├── magazine.json
│   ├── deportivo.json
│   ├── evento.json
│   ├── streaming.json
│   └── custom-{id}.json        ← creados por el usuario ("Save as template")
├── releases/                    ← MSI del Automator para auto-update
│   └── OpenDirector-1.0.0.msi
└── shows/
    ├── {show_id}/
    │   └── media/
    │       ├── {uuid}.mp4
    │       ├── {uuid}.png
    │       └── thumbs/
    │           └── {uuid}.jpg
    └── ...
```

### Lifecycle de shows

- Shows `archived` hace >90 dias: la webapp sugiere exportar + eliminar
- Al archivar: marcar `archived_at` en `od_shows`, media queda en disco
- `DELETE /api/shows/:id`: borra `data/shows/{id}/` (media) + CASCADE en Postgres (borra todas las rows relacionadas)
- Export: `GET /api/shows/:id/export` → JSON con todo el show (bloques, elementos, acciones, personas) para portabilidad
- Backup DB: `pg_dump` del schema de Supabase. Backup media: `cp -r data/ backup/`

---

## 6. Protocolo WebSocket

### Formato de mensajes

```typescript
interface WSMessage {
  channel: 'rundown' | 'execution' | 'prompter' | 'tally' | 'signals';
  seq: number;                    // monotonic per sender
  idempotencyKey?: string;        // UUID, para commands
  timestamp: string;              // ISO 8601
  type: string;                   // tipo especifico por channel
  payload: any;
}
```

### Autenticacion (token-based)

El cliente primero obtiene un session token via REST, luego lo usa para el WebSocket.

```typescript
// Paso 1: REST — obtener token
// POST /api/auth { showId: 'abc123', pin: '4521', role: 'operator', clientType: 'automator' }
// → 200 { sessionToken: 'uuid-token', expiresAt: '...', showName: 'Noticiero 9PM' }
// → 401 { error: 'invalid_pin' }
// → 429 { error: 'too_many_attempts', retryAfter: 60 }
//
// Rate limiting: 5 intentos fallidos por showId+IP → lockout 60s
// PINs hasheados con bcrypt en la DB (ver show_access.pin_hash)

// Paso 2: WebSocket handshake con token
{
  channel: 'auth',
  type: 'authenticate',
  payload: {
    sessionToken: 'uuid-token',   // obtenido en paso 1
    clientType: 'automator'       // webapp | automator | prompter
  }
}

// Respuesta exitosa
{
  channel: 'auth',
  type: 'authenticated',
  payload: {
    sessionId: 'xyz',
    showName: 'Noticiero 9PM',
    role: 'operator',
    serverVersion: '1.0.0'       // para compatibility check del Automator
  }
}

// Error: token invalido o expirado
{
  channel: 'auth',
  type: 'auth_error',
  payload: { code: 'INVALID_TOKEN', message: 'Token expirado. Re-autenticar.' }
}

// Error: ya hay un Automator conectado a este show
// (el server enforce 1 Automator por show)
{
  channel: 'auth',
  type: 'auth_error',
  payload: { code: 'AUTOMATOR_ALREADY_CONNECTED', message: 'Ya hay un Automator conectado desde 192.168.1.5' }
}
// Excepcion: si el Automator anterior se desconecto hace <30s, se permite (probable reconnect)
```

**Nota para prompter URLs:** el QR code y la URL compartida usan el session token, no el PIN:
`/shows/:id/prompter?token=<session-token>` (el token expira en 12h, renovable).

### Channel: rundown (sync de contenido)

```typescript
// Webapp → Automator: sync completo al conectar
{ channel: 'rundown', type: 'full_sync', payload: { version: 8, blocks: [...], elements: [...], ... } }

// Webapp → Automator: cambio incremental
{ channel: 'rundown', type: 'block_updated', payload: { blockId: 'x', changes: { script: '...' }, version: 9 } }
{ channel: 'rundown', type: 'block_created', payload: { block: {...}, version: 10 } }
{ channel: 'rundown', type: 'block_deleted', payload: { blockId: 'x', version: 11 } }
{ channel: 'rundown', type: 'blocks_reordered', payload: { order: ['a','b','c'], version: 12 } }
{ channel: 'rundown', type: 'element_updated', payload: { elementId: 'x', changes: {...}, version: 13 } }

// Automator → Webapp: ack de version recibida
{ channel: 'rundown', type: 'version_ack', payload: { version: 13 } }
```

### Channel: execution (comandos de ejecucion)

```typescript
// Webapp o Automator → ejecucion
{ channel: 'execution', type: 'cue', idempotencyKey: 'uuid', payload: { elementId: 'x' } }
{ channel: 'execution', type: 'next_block', idempotencyKey: 'uuid', payload: {} }
{ channel: 'execution', type: 'prev_block', idempotencyKey: 'uuid', payload: {} }
{ channel: 'execution', type: 'stop', idempotencyKey: 'uuid', payload: {} }
{ channel: 'execution', type: 'reset_show', idempotencyKey: 'uuid', payload: {} }

// Automator → Webapp: ACK de ejecucion
{ channel: 'execution', type: 'cue_ack', payload: { elementId: 'x', idempotencyKey: 'uuid', vmixResult: 'OK', latencyMs: 3 } }
{ channel: 'execution', type: 'block_changed', payload: { blockId: 'new', previousBlockId: 'old' } }

// Automator → Webapp: estado actual
{ channel: 'execution', type: 'state', payload: { currentBlockId: 'x', mode: 'live', clipPoolState: 'A' } }

// Automator → Server → Go Live: ERROR de ejecucion
// Estos errores se muestran prominentemente en la UI del productor (Go Live)
{ channel: 'execution', type: 'error', payload: {
  elementId: 'x',
  elementTitle: 'informe.mp4',
  action: 'CutDirect',
  error: 'vMix timeout after 5000ms',
  severity: 'critical',          // critical: banner rojo persistente + sonido
                                  // warning: badge amarillo, 10s auto-dismiss
  idempotencyKey: 'uuid',
  timestamp: '...'
} }
```

### Channel: prompter (scroll sync)

```typescript
// Host (primary display) → Server
{ channel: 'prompter', type: 'scroll', payload: { position: 0.45, velocity: 0.002 } }
{ channel: 'prompter', type: 'auto_scroll', payload: { active: true, speed: 65 } }
{ channel: 'prompter', type: 'pause', payload: {} }

// Server → Todos los displays (cada 200ms durante auto-scroll)
{ channel: 'prompter', type: 'state', payload: { position: 0.452, velocity: 0.002, blockId: 'x', autoScroll: true, speed: 65 } }

// Cuando cambia de bloque (via execution channel)
{ channel: 'prompter', type: 'goto_block', payload: { blockId: 'next', position: 0 } }
```

### Channel: tally (estado de vMix)

```typescript
// Automator → Server → Todos los clientes
{ channel: 'tally', type: 'update', payload: {
  program: 'cam_diego',              // Key del input al aire
  preview: 'cam_martin',             // Key del input en preview
  overlays: {
    1: { active: true, input: 'GFX' },
    2: { active: false }
  },
  recording: false,
  streaming: false
} }
```

### Channel: signals (productor → talento)

```typescript
// Productor → Server → Prompter displays
{ channel: 'signals', type: 'signal', payload: { type: 'countdown', value: '30' } }
{ channel: 'signals', type: 'signal', payload: { type: 'wrap', value: null } }
{ channel: 'signals', type: 'signal', payload: { type: 'go', value: null } }
{ channel: 'signals', type: 'signal', payload: { type: 'custom', value: 'Menciona el sponsor' } }
{ channel: 'signals', type: 'clear', payload: {} }
```

### Heartbeat

```typescript
// Bidireccional, cada 3 segundos
{ channel: 'system', type: 'ping', payload: { timestamp: '...' } }
{ channel: 'system', type: 'pong', payload: { timestamp: '...' } }

// Si 2 pings consecutivos sin pong → considerar desconectado (6 seg)
```

### Reconnect del Automator (offline reconciliation)

Cuando el Automator reconecta despues de estar offline, se ejecuta un protocolo de reconciliacion explicito:

```typescript
// 1. Automator → Server: estado actual + acciones ejecutadas offline
{ channel: 'system', type: 'reconnect', payload: {
  lastVersion: 13,                          // ultima version de rundown recibida
  lastExecSeq: 47,                          // ultimo seq de execution log
  executedWhileOffline: [                   // acciones que ejecuto sin server
    { idempotencyKey: 'uuid1', type: 'cue', elementId: 'x', timestamp: '...' },
    { idempotencyKey: 'uuid2', type: 'next_block', timestamp: '...' }
  ],
  currentBlockId: 'block_3',
  clipPoolState: 'B'
} }

// 2. Server → Automator: reconciliacion
{ channel: 'system', type: 'reconnect_ack', payload: {
  // Contenido: si version cambio, full_sync viene inmediatamente despues
  rundownSync: 'full',                      // 'full' | 'none' | 'incremental'
  // Ejecucion: merge de eventos offline (dedup por idempotencyKey)
  eventsAccepted: ['uuid1', 'uuid2'],       // aceptados en el log del server
  eventsRejected: [],                       // rechazados (conflicto)
  // Estado: server acepta el estado del Automator (Automator gana ejecucion)
  stateAccepted: true
} }

// 3. Si rundownSync === 'full', server envia full_sync inmediatamente despues
// 4. Automator confirma sync completo
{ channel: 'system', type: 'reconnect_complete', payload: {} }
```

**Reglas de reconciliacion:**
- Contenido (scripts, bloques, elementos): **webapp gana** — si cambio la version, full_sync
- Estado de ejecucion (bloque actual, overlays): **Automator gana** — el show siguio corriendo offline
- Execution log: **merge** — dedup por idempotencyKey, ambos append

### Prioridad de mensajes

Cuando hay backpressure en el WebSocket:

| Prioridad | Channel | Comportamiento |
|-----------|---------|----------------|
| 0 (max) | execution | Nunca descartar, nunca demorar |
| 1 | signals | Nunca descartar |
| 2 | tally | Descartar mensajes viejos, solo enviar ultimo |
| 3 | rundown | Queue, enviar cuando hay ancho de banda |
| 4 | prompter | Descartar mensajes viejos, solo enviar ultimo |

---

## 7. Automator — Detalle interno

### Componentes

```
┌─ Automator (Tauri + Rust) ───────────────────────────────┐
│                                                          │
│  ┌─ Sync Engine ──────────────────────────────────────┐  │
│  │  WebSocket client (tokio-tungstenite)              │  │
│  │  ├── Reconnect: backoff 500ms→1s→2s→4s→8s→15s     │  │
│  │  ├── Heartbeat: ping cada 3s, timeout 6s           │  │
│  │  ├── Auth: PIN + role en handshake                 │  │
│  │  ├── Offline queue: commands pendientes            │  │
│  │  └── State reconciliation al reconectar            │  │
│  │                                                    │  │
│  │  Media Downloader                                  │  │
│  │  ├── HTTP GET con Range headers (resumible)        │  │
│  │  ├── 3 descargas simultaneas                       │  │
│  │  ├── Verificacion SHA256 post-descarga             │  │
│  │  ├── Progreso visible en UI                        │  │
│  │  └── Destino: config.media_folder (local)          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ State Manager ────────────────────────────────────┐  │
│  │  SQLite local (rusqlite)                           │  │
│  │  ├── Rundown completo (cache sincronizado)         │  │
│  │  ├── Media manifest (path local + vmix key)        │  │
│  │  ├── Execution log (event store local)             │  │
│  │  └── Config local (vmix host, media folder)        │  │
│  │                                                    │  │
│  │  In-memory state:                                  │  │
│  │  ├── current_block_id                              │  │
│  │  ├── clip_pool_state (A | B)                       │  │
│  │  ├── active_overlays[]                             │  │
│  │  ├── show_mode (rehearsal | live)                  │  │
│  │  └── connection_status (online | reconnecting | offline) │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Pre-flight Validator ─────────────────────────────┐  │
│  │  Al conectar a vMix (XMLTEXT):                     │  │
│  │  ├── Parsea todos los inputs disponibles           │  │
│  │  ├── Compara vs rundown (keys referenciados)       │  │
│  │  ├── Muestra warnings: "CAM_3 no encontrado"      │  │
│  │  ├── Muestra sugerencias: "Disponibles: CAM_1..." │  │
│  │  └── Bloquea GO LIVE si hay errores criticos       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Execution Engine ─────────────────────────────────┐  │
│  │                                                    │  │
│  │  Command Processor:                                │  │
│  │  1. Recibe comando (UI local o WebSocket remoto)   │  │
│  │  2. Deduplica (idempotencyKey → HashMap, TTL 30s)  │  │
│  │  3. Valida (input existe? media synced? mode ok?)  │  │
│  │  4. Resuelve variables:                            │  │
│  │     {{clip_pool}} → clip_pool_a_key o _b_key       │  │
│  │     {{media_path}} → path local del media          │  │
│  │     {{title}} → element.title                      │  │
│  │     {{subtitle}} → element.subtitle                │  │
│  │  5. Ejecuta action chain con delays (tokio::sleep) │  │
│  │  6. Si mode=rehearsal: log pero NO enviar a vMix   │  │
│  │  7. Actualiza estado (current_block, overlays)     │  │
│  │  8. Emite evento al execution log                  │  │
│  │  9. Notifica WebSocket (ACK + state update)        │  │
│  │                                                    │  │
│  │  Timecode Monitor:                                 │  │
│  │  ├── Escucha posicion de clips via SUBSCRIBE ACTS  │  │
│  │  ├── Dispara acciones timecoded (ej: -100ms)       │  │
│  │  └── Auto-advance al terminar clip                 │  │
│  │                                                    │  │
│  │  AB Alternator:                                    │  │
│  │  ├── Pool A y Pool B para clips                    │  │
│  │  ├── Alterna automaticamente                       │  │
│  │  └── Pre-carga siguiente clip en pool inactivo     │  │
│  │                                                    │  │
│  │  Execution Lock:                                   │  │
│  │  ├── Mutex para un comando a la vez                │  │
│  │  ├── Si llegan dos CUE simultaneos, segundo espera │  │
│  │  └── Timeout: 5s max por action chain              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ vMix TCP Pool ───────────────────────────────────┐   │
│  │                                                    │   │
│  │  Conn 1: Transitions (prioridad maxima)            │   │
│  │    CutDirect, Cut, Fade, FadeToBlack, Stinger      │   │
│  │                                                    │   │
│  │  Conn 2: Graphics                                  │   │
│  │    SetText, SetImage, OverlayInput1In/Out,         │   │
│  │    OverlayInput2In/Out                             │   │
│  │                                                    │   │
│  │  Conn 3: Audio                                     │   │
│  │    AudioOn, AudioOff, SetVolume, SetBusVolume      │   │
│  │                                                    │   │
│  │  Conn 4: State (read-only, dedicada)               │   │
│  │    SUBSCRIBE TALLY, SUBSCRIBE ACTS                 │   │
│  │    Heartbeat: XML cada 5s como ping                │   │
│  │    Si no hay response en 3s → reconectar           │   │
│  │                                                    │   │
│  │  Todas las conexiones:                             │   │
│  │  ├── Reconnect automatico: 1s, 2s, 4s, 8s (max)   │   │
│  │  ├── NO reenviar commands post-reconexion          │   │
│  │  ├── Inputs referenciados por Key, no por numero   │   │
│  │  └── Async reader loop (response vs event parsing) │   │
│  └────────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ UI (React en webview) ────────────────────────────┐  │
│  │                                                    │  │
│  │  Dark mode obligatorio                             │  │
│  │  Keyboard-first (ver seccion hotkeys)              │  │
│  │  Panel principal: rundown con botones por elemento │  │
│  │  Panel inferior: log + prompter control            │  │
│  │  Status bar: vMix status + server status + tally   │  │
│  │  Preview panel: muestra que acciones dispara CUE   │  │
│  │                                                    │  │
│  │  Error handling visible:                           │  │
│  │  ├── Elemento con error: fondo rojo + tooltip      │  │
│  │  │   "vMix timeout — CutDirect no respondio"       │  │
│  │  │   Botones: [RETRY] [SKIP]                       │  │
│  │  ├── Error critical: banner rojo top + sonido      │  │
│  │  ├── Error warning: badge amarillo, 10s dismiss    │  │
│  │  └── Errores se propagan a Go Live via WS          │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Hotkeys del Automator

```
EJECUCION:
  Space         → NEXT block
  Enter         → CUE elemento seleccionado (on_cue + primer step)
  F1-F8         → Steps configurables por elemento
  Escape        → STOP / cancelar action chain en curso
  Backspace     → PREV block
  F12           → PANIC: safe input (logo/barras)
  R             → RESET show (pide confirmacion)

NAVEGACION:
  ↑ / ↓         → navegar elementos dentro del bloque
  Tab           → siguiente bloque
  Shift+Tab     → bloque anterior
  Home          → ir al primer bloque
  End           → ir al ultimo bloque

AUDIO:
  M             → mute/unmute input al aire
  + / -         → volume up/down

MODO:
  Ctrl+R        → toggle Rehearsal / Live
  Ctrl+L        → abrir log expandido
```

### Preview de acciones

Antes de ejecutar CUE, el operador ve que va a pasar:

```
┌─ PREVIEW: CUE "Informe Economia" ─────────────────┐
│                                                     │
│  ON CUE (automatico):                               │
│  1. ListRemoveAll → CLIP_A               +0ms      │
│  2. ListAdd → CLIP_A (informe.mp4)       +40ms     │
│  3. PreviewInput → CLIP_A                +300ms     │
│                                                     │
│  STEP 1 [F1] "PLAY" (manual):                      │
│  1. SetPosition → CLIP_A (0)             +0ms      │
│  2. Play → CLIP_A                        +40ms     │
│  3. CutDirect → CLIP_A                   +40ms     │
│                                                     │
│  ON EXIT (automatico al salir):                     │
│  1. Pause → CLIP_A                       +0ms      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 8. Prompter — Detalle interno

### Client-side interpolation

```typescript
// El server manda estado cada 200ms
interface PrompterState {
  position: number;       // 0.0 - 1.0 (progreso en el script)
  velocity: number;       // delta por ms (para interpolacion)
  blockId: string;
  autoScroll: boolean;
  speed: number;          // 0-100
}

// El cliente interpola localmente a 60fps
class PrompterRenderer {
  private serverPos = 0;
  private serverVelocity = 0;
  private lastServerUpdate = 0;
  private localPos = 0;

  onServerUpdate(state: PrompterState) {
    this.serverPos = state.position;
    this.serverVelocity = state.velocity;
    this.lastServerUpdate = performance.now();
    // Smooth correction: no saltar, interpolar hacia la posicion del server
  }

  render() {
    const elapsed = performance.now() - this.lastServerUpdate;
    const targetPos = this.serverPos + (this.serverVelocity * elapsed);

    // Smooth lerp hacia target (evita saltos)
    this.localPos += (targetPos - this.localPos) * 0.1;

    this.setScrollPosition(this.localPos);
    requestAnimationFrame(() => this.render());
  }
}
```

### Modos de control del host

```
1. PEDAL BLUETOOTH / TECLADO REMOTO
   - El pedal envia keyboard events (PageDown, Space, arrows)
   - El prompter los captura y ajusta scroll
   - Ideal para prompter de camara (host no toca la pantalla)
   - Setup: parear pedal bluetooth a la PC del prompter

2. COMPANION DEVICE (celular del host)
   - Host abre /shows/:id/prompter?mode=control en su celular
   - Display principal abre /shows/:id/prompter?mode=display
   - El celular manda scroll commands, el display sigue
   - Ideal para prompter de vidrio donde no se puede tocar

3. AUTO-SCROLL
   - Velocidad configurable (0-100)
   - Tap para pausar/resumir (cualquier tecla o touch)
   - Ideal para monologos o lecturas largas

4. TOUCH DIRECTO (solo para tablet en escritorio)
   - Drag en la pantalla = scroll
   - Solo si el prompter esta en un tablet accesible
   - NO funciona para prompter de camara (inaccesible)
```

### Senales del productor en el prompter

```
Las senales aparecen como overlay semi-transparente:

┌──────────────────────────────────────────────────────┐
│                                                      │
│       La inflacion de enero fue la mas               │
│       baja en 18 meses...                            │
│                                                      │
│    ┌──────────────────────────────────────┐          │
│    │         ⏱ 30 SEGUNDOS              │          │
│    └──────────────────────────────────────┘          │
│                                                      │
│       ...ubicandose en el 3.2 por ciento             │
│                                                      │
└──────────────────────────────────────────────────────┘

Tipos de senal y como se muestran:
  countdown  → "⏱ 30 SEGUNDOS" (cuenta regresiva, amarillo)
  wrap       → "✋ WRAP" (terminar pronto, rojo, parpadea)
  stretch    → "↔ STRETCH" (estirar, azul)
  standby    → "⏳ STANDBY" (prepararse, amarillo)
  go         → "▶ GO" (arrancar, verde, 3 seg)
  custom     → texto libre del productor
```

### Mirror mode

```css
/* Container del prompter (no afecta touch ni input) */
.prompter-display.mirror {
  transform: scaleX(-1);
}

/* Los overlays de senales NO se espejan (deben ser legibles) */
.prompter-display.mirror .signal-overlay {
  transform: scaleX(-1); /* doble espejo = normal */
}
```

### PWA para tablets

```json
// manifest.json
{
  "name": "OpenDirector Prompter",
  "short_name": "Prompter",
  "display": "fullscreen",
  "orientation": "landscape",
  "background_color": "#000000",
  "theme_color": "#000000"
}
```

Con Wake Lock API para que la pantalla no se apague:

```typescript
if ('wakeLock' in navigator) {
  await navigator.wakeLock.request('screen');
}
```

### Offline resilience (si se cae el servidor)

El prompter DEBE seguir funcionando si el servidor se cae durante el show. El talento no puede quedarse sin texto al aire.

**Estrategia: cache local completo + scroll autonomo**

```
Flujo normal (online):
  1. Prompter conecta → recibe full_sync con TODOS los scripts de todos los bloques
  2. Guarda en IndexedDB: { showId, blocks[], scripts[], prompterConfig, version }
  3. WebSocket recibe updates incrementales → actualiza cache
  4. Scroll controlado por host (companion/pedal) via WebSocket

Flujo offline (servidor se cae):
  1. WebSocket se desconecta → banner discreto: "● OFFLINE" (amarillo, esquina superior)
  2. El prompter sigue mostrando el script desde IndexedDB
  3. El scroll local sigue funcionando:
     - Auto-scroll: sigue corriendo (es local, requestAnimationFrame)
     - Pedal/teclado: sigue funcionando (son eventos locales del browser)
     - Companion device: SE PIERDE (necesita WebSocket para relay)
  4. Navegacion entre bloques: PREV/NEXT siguen funcionando (datos en cache)
  5. Senales del productor: SE PIERDEN (no hay canal)
  6. Reconexion: automática con backoff (1s, 2s, 4s, 8s, 15s max)
     - Al reconectar: compara version local vs servidor
     - Si version cambio: re-sync completo (scripts pudieron editarse)
     - Si version igual: resume normal
```

**Implementacion:**

```typescript
// Al conectar: cachear todo en IndexedDB
async function cacheShowData(data: FullSync) {
  const db = await openDB('prompter-cache', 1, {
    upgrade(db) {
      db.createObjectStore('shows', { keyPath: 'showId' });
    }
  });
  await db.put('shows', {
    showId: data.showId,
    blocks: data.blocks,
    prompterConfig: data.prompterConfig,
    version: data.version,
    cachedAt: new Date().toISOString()
  });
}

// Al perder conexion: leer desde cache
async function loadFromCache(showId: string): Promise<CachedShow | null> {
  const db = await openDB('prompter-cache', 1);
  return db.get('shows', showId);
}

// Estado del prompter
type ConnectionState = 'online' | 'reconnecting' | 'offline';

class PrompterOfflineManager {
  private state: ConnectionState = 'online';
  private cachedShow: CachedShow | null = null;

  onDisconnect() {
    this.state = 'reconnecting';
    // Los datos ya estan en memoria + IndexedDB
    // El renderer sigue funcionando con los datos locales
    // Solo se pierde: signals, companion relay, live edits
  }

  onReconnect(serverVersion: number) {
    if (serverVersion !== this.cachedShow?.version) {
      // Scripts cambiaron mientras estabamos offline
      // Pedir full_sync y re-cachear
      this.requestFullSync();
    }
    this.state = 'online';
  }
}
```

**Que funciona offline:**
- Scroll del texto (auto-scroll, pedal, teclado, touch)
- Navegacion entre bloques (PREV/NEXT)
- Mirror mode
- Wake Lock
- Fullscreen

**Que NO funciona offline:**
- Companion device (celular del host) — necesita WebSocket relay
- Senales del productor (countdown, wrap, go)
- Ediciones en caliente del script
- Sync de bloque actual desde el Automator (goto_block)

**Mitigacion para companion offline y micro-desconexiones:**

El companion device es especialmente sensible a WiFi inestable (comun en aulas). Estrategia de resilience:

```
1. BUFFERING DE GESTOS
   - Mientras esta desconectado, el companion bufferea los ultimos 5s de gestos
   - Al reconectar: envia solo el ultimo gesto (posicion actual, no replay)
   - Reconnect agresivo: 500ms, 1s, 2s (no esperar a 15s como el Automator)

2. FALLBACK AUTOMATICO A AUTO-SCROLL
   - Si companion pierde conexion por >5 segundos:
     → El display activa auto-scroll automaticamente
     → Banner en el display: "Companion desconectado — auto-scroll activado"
     → Velocidad: la configurada en prompter_config.default_scroll_speed
   - Al reconectar el companion: desactiva auto-scroll y devuelve control

3. DESCONEXION TOTAL DEL SERVIDOR
   - Companion pierde control (necesita WebSocket relay)
   - Display sigue con auto-scroll o controles locales (teclado/touch)
   - Banner: "● OFFLINE" en esquina superior (amarillo, discreto)
```

---

## 9. Pantallas de la Webapp

### 9.1 Home — Lista de shows

```
┌─────────────────────────────────────────────────────────┐
│  OPEN DIRECTOR                              [+ NEW SHOW]│
│                                    [FROM TEMPLATE ▾]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ ● Noticiero 9PM                        LIVE     │    │
│  │   5 bloques · 12 elementos · 3 personas          │    │
│  │   Duracion: ~40 min    Automator: ● Conectado    │    │
│  │   [OPEN]  [GO LIVE]                              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │   Magazine Manana                      DRAFT    │    │
│  │   8 bloques · 24 elementos · 5 personas          │    │
│  │   Duracion: ~60 min                              │    │
│  │   [OPEN]  [DUPLICATE]  [ARCHIVE]  [DELETE]       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  TEMPLATES                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐           │
│  │Notici. │ │Magazin.│ │Deport. │ │Evento  │           │
│  │4 bloq. │ │6 bloq. │ │5 bloq. │ │2 bloq. │           │
│  └────────┘ └────────┘ └────────┘ └────────┘           │
└─────────────────────────────────────────────────────────┘
```

### 9.2 Editor de Rundown

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Noticiero 9PM               ~40min total    [SETTINGS] [▶ GO LIVE]    │
│  5 blocks · 12 elements · 3 people           [UNDO] [REDO]            │
├────────┬──────────────────────────────────────────────────┬─────────────┤
│ MEDIA  │              RUNDOWN                             │ INSPECTOR   │
│        │                                                  │             │
│ ┌────┐ │  ▼ BLOQUE 1: Apertura                ~5min     │ Element:    │
│ │ 🎬 │ │    🔤 Diego Della - Conductor [auto]            │ informe.mp4 │
│ │inf.│ │    📝 "Abre con titulares"                      │             │
│ └────┘ │                                                  │ Duration:   │
│ ┌────┐ │  ▼ BLOQUE 2: Economia               ~15min     │ 2:34        │
│ │ 🎬 │ │    🔤 Martin - Analista [on_cam_switch]         │             │
│ │ent.│ │    🔤 "INFLACION: 3.2%" [on_cue]               │ Mode:       │
│ └────┘ │    🎬 informe.mp4 [keyword: "informe"]  ← sel  │ ● Fullscreen│
│ ┌────┐ │    🖼️ grafico.png [manual]                      │ ○ PiP       │
│ │ 🖼️ │ │                                                  │             │
│ │gra.│ │  ▼ BLOQUE 3: Politica               ~15min     │ Trigger:    │
│ └────┘ │    🔤 Laura - Panelista [on_cam_switch]         │ ○ Manual    │
│        │    🎬 entrevista.mp4 [manual]                   │ ○ On Cue    │
│ drag   │    🔤 "Min. Garcia: 'No hay...'" [on_cue]      │ ● Keyword   │
│ to add │                                                  │   "informe" │
│        │  ▼ BLOQUE 4: Cierre                  ~5min     │   "tape"    │
│        │    📝 "Despedida + promo manana"                │   "video"   │
│        │                                                  │             │
│ Drag   │  [+ BLOQUE]  [+ DESDE TEMPLATE]                │ Actions:    │
│ & Drop │                                                  │ [CONFIGURE] │
│        │                                                  │             │
│[UPLOAD]│  SCRIPT (bloque seleccionado):                  │ Sync:       │
│        │  ┌──────────────────────────────────────────┐   │ ● Synced    │
│        │  │ La inflacion de enero fue la mas baja    │   │             │
│        │  │ en 18 meses, ubicandose en el 3.2%.     │   │             │
│        │  │                                          │   │             │
│        │  │ [PAUSA -- corte a Martin]                │   │             │
│        │  │                                          │   │             │
│        │  │ Pasamos ahora con Martin Rodriguez...    │   │             │
│        │  └──────────────────────────────────────────┘   │             │
├────────┴──────────────────────────────────────────────────┴─────────────┤
│  PERSONAS: [Diego - Cam 1 ✓] [Martin - Cam 3 ✓] [Laura - Cam 2 ✓]    │
│  [+ PERSONA]  [EDIT PERSONAS]                                          │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Go Live (productor)

```
┌────────────────────────────────────────────────────────────────────────┐
│  🔴 LIVE — Noticiero 9PM              21:12:34         [⏹ END SHOW]  │
│  Automator: ● Online    Prompter: 2 displays                         │
├─────────────────────────────┬──────────────────────────────────────────┤
│  RUNDOWN                    │  MONITOR                                │
│                             │                                        │
│  ✓ Apertura        5:12    │  Tally:                                 │
│                             │  PGM: cam_martin (Cam 3)               │
│  ● Economia       12:34    │  PVW: cam_diego (Cam 1)                │
│    ✓ Martin LT             │  OVL1: OFF                             │
│    ✓ Inflacion LT          │  OVL2: "MARTIN RODRIGUEZ" ON           │
│    ○ informe.mp4           │                                        │
│    ○ grafico.png           │  Timing:                                │
│                             │  Block: 12:34 / ~15:00 (83%)          │
│  ○ Politica       ~15:00   │  Show:  17:46 / ~40:00 (44%)          │
│  ○ Cierre          ~5:00   │                                        │
│                             │  ──────────────────────────────────────│
│  Progreso show:             │  EXECUTION LOG                        │
│  ██████████░░░░░░ 44%      │                                        │
│  17:46 / ~40:00             │  21:12:31 CUE lower_third "Martin"    │
│                             │  21:12:30 CutDirect → cam_martin      │
│                             │  21:12:28 NEXT block → Economia       │
│                             │  21:12:01 CUE lower_third "Diego"     │
│                             │                                        │
├─────────────────────────────┼──────────────────────────────────────────┤
│  SIGNALS TO TALENT          │  SCRIPT (current block, read-only)     │
│                             │                                        │
│  [⏱ 30s] [✋ WRAP]          │  La inflacion de enero fue la mas      │
│  [↔ STRETCH] [▶ GO]        │  baja en 18 meses, ubicandose en       │
│  [💬 Custom message...]     │  el 3.2%...                            │
│                             │                                        │
└─────────────────────────────┴──────────────────────────────────────────┘
```

### 9.4 Settings del show

```
┌────────────────────────────────────────────────────────────┐
│  SETTINGS — Noticiero 9PM                                  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  GENERAL                                                   │
│  Name: [Noticiero 9PM                              ]       │
│  Status: ● Draft  ○ Ready                                  │
│                                                            │
│  VMIX CONNECTION (para el Automator)                       │
│  Host: [127.0.0.1    ]  Port: [8099]                       │
│                                                            │
│  VMIX INPUT MAPPING                                        │
│  Clip Pool A: [CLIP_A        ]  (Key name in vMix)         │
│  Clip Pool B: [CLIP_B        ]  (Key name in vMix)         │
│  Graphics:    [GFX           ]  Overlay: [1]               │
│  Lower Third: [LT            ]  Overlay: [2]               │
│                                                            │
│  TIMING                                                    │
│  Action delay: [40] ms (between chained actions)           │
│  Overrun: ○ Hold last block  ○ Go to safe input            │
│  Safe input key: [BARS       ]                             │
│                                                            │
│  ACCESS (PINs)                                             │
│  Producer: [4521]  Operator: [7890]  Host: [1234]          │
│                                                            │
│  PROMPTER                                                  │
│  Font size: [48] px    Font: [Arial    ▾]                  │
│  Speed default: [60]   Guide line: [ON] at [33]%           │
│                                                            │
│                                          [SAVE] [CANCEL]   │
└────────────────────────────────────────────────────────────┘
```

---

## 10. Automator — Pantalla

```
┌──────────────────────────────────────────────────────────────────────────┐
│  OPEN DIRECTOR Automator                                    [_][□][✕]  │
│  Noticiero 9PM    Mode: ● LIVE / ○ REHEARSAL                          │
│  vMix: ● Online (localhost:8099)    Server: ● Connected               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ✓ BLOQUE 1: Apertura (5:12)                                  DONE    │
│                                                                        │
│  ● BLOQUE 2: Economia (12:34 / ~15:00)                     ON AIR    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                                                                  │  │
│  │  🔤 Martin - Analista            TRIGGERED (auto)    00:32 ago  │  │
│  │                                                                  │  │
│  │  🔤 "INFLACION: 3.2%"    [CUE]  [F1 ▶ IN]  [F2 🔴 OUT]  READY │  │
│  │     → SetText "INFLACION: 3.2%" + OverlayInput2In               │  │
│  │                                                                  │  │
│  │  🎬 informe.mp4          [CUE]  [F3 ▶ PLAY]          READY     │  │
│  │     Pool A → CLIP_A ✓   2:34                                    │  │
│  │     → ListAdd + PreviewInput / Play + CutDirect                  │  │
│  │                                                                  │  │
│  │  🖼️ grafico.png          [CUE]  [F4 ▶ IN]  [F5 🔴 OUT]  READY │  │
│  │     → SetImage + OverlayInput1In                                │  │
│  │                                                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ○ BLOQUE 3: Politica (~15:00)                               NEXT    │
│  ○ BLOQUE 4: Cierre (~5:00)                                PENDING   │
│                                                                        │
├────────────────────────────────┬───────────────────────────────────────┤
│  TALLY                         │  LOG                                  │
│  PGM: cam_martin ■             │  21:12:31 SetText "MARTIN.." → OK   │
│  PVW: cam_diego  □             │  21:12:31 Overlay2In → OK           │
│  OVL1: OFF  OVL2: ON          │  21:12:30 CutDirect cam_martin → OK │
│                                │  21:12:28 NEXT → Economia           │
│  Media: 8/8 ✓                  │  21:12:01 Overlay2In → OK           │
│  Inputs: 12/12 ✓               │  21:12:01 SetText "DIEGO.." → OK   │
├────────────────────────────────┴───────────────────────────────────────┤
│  [◀ PREV]  [NEXT ▶ Space]  [⏹ STOP Esc]  [F12 PANIC]  [R RESET]    │
│  Show: 17:46 / ~40:00   Block: 12:34 / ~15:00                        │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Prompter — Pantalla

### Display mode (lo que ve el talento)

```
┌──────────────────────────────────────────────────────┐
│                                                      │  ← negro total
│                                                      │
│                                                      │
│       La inflacion de enero fue la mas               │  ← texto pasado:
│       baja en 18 meses, ubicandose en                │    opacity 30%
│                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← linea guia
│       el 3.2 por ciento segun datos                  │    (a 1/3 de
│       del INDEC publicados esta manana.              │     pantalla)
│                                                      │
│       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                  │  ← [PAUSA]
│       (corte a Martin)                               │    amarillo
│       ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                  │
│                                                      │
│       Pasamos ahora con Martin                       │  ← texto por
│       Rodriguez, que nos trae el                     │    venir: 100%
│       analisis del mercado cambiario.                │
│                                                      │
│    ┌──────────────────────────────────┐              │  ← senal del
│    │         ✋ WRAP                   │              │    productor
│    └──────────────────────────────────┘              │    (overlay)
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Companion control mode (celular del host)

```
┌────────────────────────┐
│  PROMPTER CONTROL      │
│                        │
│  Block: Economia (2/4) │
│                        │
│  ┌──────────────────┐  │
│  │                  │  │
│  │  ...el 3.2 por   │  │  ← preview del texto
│  │  ciento segun... │  │
│  │                  │  │
│  │    SCROLL ZONE   │  │  ← area touch
│  │    (drag up/down)│  │
│  │                  │  │
│  └──────────────────┘  │
│                        │
│  Auto: [OFF] [●MED]   │
│  Speed: [━━━●━━━] 60  │
│                        │
│  [◀ PREV]  [NEXT ▶]   │
└────────────────────────┘
```

---

## 12. Media Pipeline

### Upload (productor → servidor)

```
1. Productor drag & drops archivo en media pool
2. Webapp inicia upload via tus protocol (resumible)
   - Chunked upload (1MB chunks)
   - Si se corta, retoma desde ultimo chunk
   - Progress bar visible
3. Al completar:
   - Guardar en data/shows/{show_id}/media/{uuid}.{ext}
   - Generar thumbnail (ffmpeg: primer frame para video, resize para imagen)
   - Extraer metadata (duracion, resolucion, codec via ffprobe)
   - Calcular SHA256 checksum
   - **Codec check**: detectar codec y container con ffprobe
     - Codecs safe para vMix: h264, hevc/h265, mpeg2video, prores, dnxhd
     - Containers safe: .mp4, .mov, .avi, .mxf, .mpg
     - Si no es compatible: marcar vmix_compatible=0, NO bloquear upload
     - Warning visible en la UI: "⚠ .webm con codec vp9 podria no funcionar en vMix. Recomendado: MP4 H.264/H.265."
   - Insertar en tabla media (incluyendo codec, container, vmix_compatible)
4. Validacion:
   - Mime types permitidos: video/*, image/*, audio/*
   - Tamano maximo configurable (default 4GB)
   - Nombres sanitizados (no path traversal)
```

### Download (servidor → Automator)

```
1. Automator recibe rundown con media references
2. Para cada media no descargado localmente:
   a. GET /api/media/{id}/download con Range headers
   b. Descarga a config.media_folder/{filename}
   c. 3 descargas simultaneas max
   d. Verificar SHA256 post-descarga
   e. Si falla checksum: re-descargar
   f. Progress bar por archivo en UI
3. Post-descarga:
   - Registrar path local en SQLite del Automator
   - Intentar cargar en vMix: FUNCTION AddInput Value={path}
   - Mapear: media_id → vmix_input_key
   - Actualizar sync_status en el rundown
```

### Pre-flight validation de media

```
Al hacer pre-flight check:
  - Verificar que todos los media referenciados estan descargados
  - Verificar que estan cargados como inputs en vMix
  - Verificar que los keys matchean
  - Si falta algo: warning con accion sugerida

  ⚠ informe.mp4 — descargado pero no cargado en vMix
    [CARGAR AHORA]

  ✗ entrevista.mp4 — no descargado (2.1 GB)
    [DESCARGAR] estimado: 3 min

  ⚠ clip_redes.webm — codec VP9 puede no ser compatible con vMix
    Recomendado: re-exportar como MP4 H.264

  ✓ grafico.png — synced, vMix Input: GFX
```

---

## 13. Seguridad

### Autenticacion (PIN + session token)

```
Nivel: PIN por show + rol → session token

Flujo:
  1. POST /api/auth { showId, pin, role, clientType }
  2. Server compara bcrypt hash del PIN (show_access.pin_hash)
  3. Si OK: crea session en tabla sessions, devuelve token UUID
  4. Si FAIL: incrementa contador de intentos fallidos (in-memory)
  5. El token se usa para REST (Bearer header) y WebSocket (handshake)

Rate limiting en login:
  - 5 intentos fallidos por showId+IP → lockout 60 segundos
  - Devuelve 429 con retryAfter

PINs:
  - Hasheados con bcrypt en la DB (show_access.pin_hash)
  - El PIN plano NUNCA se guarda ni se loguea
  - 4-6 digitos (suficiente para un aula)

Sessions:
  - Token UUID como Bearer
  - Expiracion: 24h webapp, 7d automator, 12h prompter
  - Renovable: el Automator renueva automaticamente antes de expirar

Prompter URLs:
  - URL usa session token, NO el PIN: /shows/:id/prompter?token=<uuid>
  - QR code generado por webapp incluye el token
  - Token expira en 12h (el talento re-escanea el QR si necesita)

Para un aula es suficiente:
  - Instructor crea el show y comparte PINs con los alumnos
  - Cada alumno accede con su rol
  - No se necesitan cuentas de usuario
```

### Transporte

```
LAN (mismo aula): HTTP + WS (sin TLS, localhost o red interna)
WAN: wss:// obligatorio (TLS) + token

Para el caso de un aula, todo es LAN. TLS es optional pero documentado.
```

### Validacion

```
- Login REST: rate limiting 5 intentos / 60s lockout por showId+IP
- WebSocket: autenticacion por session token (no PIN directo)
- WebSocket: rate limiting 10 msg/sec por conexion
- WebSocket: tamano maximo de mensaje 1MB
- WebSocket: JSON schema validation en todos los mensajes
- REST: input sanitization (no SQL injection via Prisma/parameterized)
- Media: path traversal prevention (uuid filenames, no user-supplied paths)
- Media: mime type validation + codec compatibility check
- Media: tamano maximo configurable
```

---

## 14. Deployment

### Servidor (para el aula)

```bash
# Opcion 1: directo en una PC del lab
git clone https://github.com/xxx/opendirector.git
cd opendirector
npm install
npm run build
npm start
# → http://localhost:3000

# Opcion 2: Docker (recomendado)
docker run -d -p 3000:3000 -v opendirector-data:/app/data opendirector/server
# → http://host-ip:3000

# La IP del servidor se comparte a los alumnos
# Todos acceden via browser a http://IP:3000
```

### Automator (en cada PC con vMix)

```
1. IT de la escuela instala OpenDirector.msi en las PCs del lab
   - msiexec /i OpenDirector.msi /quiet (silencioso)
   - O doble-click para instalacion guiada
   - Incluye WebView2 bootstrapper

2. Al abrir por primera vez:
   - Pedir IP del servidor: [192.168.1.100:3000]
   - Pedir PIN de operador: [7890]
   - Conecta y sincroniza

3. Auto-update desde el propio servidor:
   - Al iniciar, GET /api/automator/update-check?currentVersion=1.0.0
   - Server responde: { updateAvailable, version, downloadUrl, releaseNotes, mandatory }
   - Si hay update: notificacion con opcion de instalar
   - El .msi se sirve desde data/releases/ del servidor
   - IT sube la nueva version al servidor → todos los Automators la detectan

4. Compatibility check:
   - El server incluye X-OpenDirector-Server-Version en el WS handshake
   - Si major version difiere: warning de incompatibilidad
   - Si minor version difiere: info (features nuevos disponibles)
```

### Prompter (sin instalacion)

```
El talento abre en cualquier browser:
  http://IP:3000/shows/{id}/prompter?token=<session-token>

O escanea QR code generado por la webapp (incluye session token, no PIN).

Para tablet como prompter dedicado:
  1. Abrir URL
  2. "Add to Home Screen" (PWA)
  3. Abrir desde el icono → fullscreen automatico
```

### Todo en una PC (desarrollo/demo)

```
1. vMix corriendo
2. npm start (servidor)
3. Abrir Automator (localhost:3000)
4. Abrir browser tabs: editor, prompter
5. Todo en localhost, 0 latencia
```

---

## 15. Features adicionales

### Show state machine

Transiciones de estado validas y quien puede ejecutarlas:

```
                    ┌───────────┐
            ┌──────│   draft    │──────┐
            │      └───────────┘      │
            │            │            │
            │      [producer]         │
            │            ▼            │
            │      ┌───────────┐      │
            └──────│   ready    │◄─────────────────┐
          [producer]└───────────┘   [producer]      │
                    │    │    │                      │
         [prod/op]  │    │    │ [producer]           │
                    ▼    │    ▼                      │
          ┌──────────┐  │  ┌──────────┐             │
          │ rehearsal │  │  │   live   │─────────────┘
          └──────────┘  │  └──────────┘  [producer]
           [producer] ──┘
                     directo a live

              [producer]
  ready ──────────────────► archived
  archived ───────────────► ready
              [producer]
```

| Transicion | Roles permitidos |
|------------|-----------------|
| draft → ready | producer |
| ready → draft | producer |
| ready → rehearsal | producer, operator |
| ready → live | producer |
| rehearsal → ready | producer, operator |
| rehearsal → live | producer |
| live → ready | producer |
| ready → archived | producer |
| archived → ready | producer |

**Reglas:**
- No se puede ir de `live` a `draft` directamente (pasar por `ready`)
- No se puede archivar un show en `live`
- Solo el producer puede poner un show en `live`
- El Automator valida el estado del show: solo ejecuta en `rehearsal` o `live`

### Optimistic locking en el editor

```
Cada edit del rundown incluye expectedVersion.
Si no matchea la version actual en el server → 409 Conflict.

PUT /api/shows/:id/blocks/:blockId
Body: { changes: {...}, expectedVersion: 13 }

Respuesta exitosa: 200 { version: 14 }
Respuesta conflicto: 409 {
  error: 'conflict',
  serverVersion: 15,
  currentBlock: { ... }   // para que el cliente muestre el estado actual
}

En el frontend:
  - Si 409: toast "Este bloque fue editado. Recargando..."
  - Re-fetch del bloque y mostrar estado actual
  - No se hace merge automatico (v1 — last-write-wins con notificacion)

Cambios incrementales via WebSocket incluyen version:
  { channel: 'rundown', type: 'block_updated',
    payload: { blockId: 'x', changes: {...}, version: 14 } }
```

### Rehearsal mode

```
Automator tiene toggle: LIVE / REHEARSAL

En REHEARSAL:
  - Todo funciona igual (CUE, NEXT, acciones)
  - PERO no se envian comandos a vMix
  - Se loguean como type: 'rehearsal' en execution_log
  - Se mide timing (para que el instructor revise)
  - RESET vuelve todo a Block 1

Ideal para que los alumnos practiquen sin vMix,
o para probar el rundown antes de salir al aire.
```

### Undo / Redo en el editor

```
Command pattern:
  - Cada edicion crea un entry en undo_history
  - forward_data: JSON para redo
  - reverse_data: JSON para undo
  - Ctrl+Z: aplicar reverse_data del ultimo entry
  - Ctrl+Y: aplicar forward_data
  - Mantener ultimas 100 acciones

Ejemplo:
  Accion: delete_block
  forward_data: { blockId: 'x' }
  reverse_data: { block: {id:'x', name:'...', ...}, elements: [...], actions: [...] }
```

### Templates

```
Guardar show como template:
  - Snapshot JSON del show completo (bloques, elementos, acciones, personas)
  - Sin media (solo referencias)
  - Se guarda como archivo JSON en data/templates/custom-{id}.json
  - Metadata (nombre, descripcion) se registra en od_templates (Postgres)
  - Portabilidad: copiar el .json a otra instancia

Crear show desde template:
  - Lee el JSON, copia la estructura
  - Genera nuevos IDs
  - El productor edita contenido

Templates pre-incluidos (incluidos en el repo, is_builtin=1):
  - noticiero.json (4 bloques, 2 personas)
  - magazine.json (6 bloques, 3 personas)
  - deportivo.json (5 bloques, comentarista + analista)
  - evento.json (2 bloques, 1 camara)
  - streaming.json (bloques flexibles)
```

### Duplicate block / element

```
Click derecho en bloque → Duplicate
  - Copia bloque + todos sus elementos + todas sus acciones
  - Genera nuevos IDs
  - Inserta despues del bloque original
  - Nombre: "Economia (copy)"

Mismo para elementos dentro de un bloque.
```

### Timing y progreso

```
Cada bloque: estimated_duration_sec
Rundown muestra:
  - Duracion estimada total
  - Tiempo acumulado por bloque
  - Barra de progreso del show
  - Barra de progreso del bloque actual
  - Delta: +2:30 overtime o -1:00 undertime

Al aire:
  - Timer real vs estimado
  - Color: verde (on time), amarillo (+10%), rojo (+20%)
```

### As-run log export

```
POST /api/shows/{id}/export-asrun

Genera CSV:
  timestamp, block, element, action, source, latency_ms, detail
  21:00:01, Apertura, Diego LT, cue, automator, 2, SetText + Overlay2In
  21:00:01, Apertura, -, next_block, automator, 1, → Economia
  ...

O PDF con resumen:
  - Show: Noticiero 9PM
  - Date: 2026-02-26
  - Duration: 38:42 (estimated 40:00)
  - Blocks executed: 4/4
  - Total cues: 23
  - Avg action latency: 3ms
  - Overrides: 2
  - Errors: 0
```

### Dark mode

```
Toda la UI es dark mode por default.
  - Editor: fondo #1a1a2e, texto #e0e0e0
  - Automator: fondo #0d0d0d, texto #f0f0f0
  - Prompter: fondo #000000, texto #FFFFFF (configurable)
  - Go Live: fondo #0d0d0d, tally colors resaltados

Colores de tally:
  - Program: rojo (#ff3333) con shape ■
  - Preview: verde (#33ff33) con shape □
  - (shapes ademas de color para daltonismo)
```

---

## 16. Roadmap

| Fase | Que | Componente | Prioridad |
|------|-----|------------|-----------|
| **1** | Automator core: SQLite local + vMix TCP pool (4 conn) + execution engine + dedup + pre-flight validation | Automator | P0 |
| **2** | Webapp core: CRUD shows + bloques + elementos + acciones + personas + Supabase (Postgres) | Webapp | P0 |
| **3** | WebSocket server + sync protocol + auth (PIN→token) + reconnect reconciliation | Webapp + Automator | P0 |
| **4** | Media upload (tus) + download (resumible) + thumbnails + checksum + codec validation | Webapp + Automator | P0 |
| **5** | Editor UI: rundown drag&drop + script editor + action configurator + inspector | Webapp | P0 |
| **6** | Automator UI: live panel + botones CUE/PLAY/IN/OUT + hotkeys + tally + log | Automator | P0 |
| **7** | Go Live panel (productor): monitoring + signals + timing | Webapp | P0 |
| **8** | Prompter: display + companion control + client interpolation + signals overlay + PWA + mirror | Webapp | P0 |
| **9** | Rehearsal mode + reset show | Automator | P0 |
| **10** | Undo/redo + duplicate block/element + templates | Webapp | P1 |
| **11** | As-run log export (CSV/PDF) + timing analysis | Webapp | P1 |
| **12** | MSI installer + auto-update + IT deployment docs | Automator | P1 |
| **13** | Pre-included templates (noticiero, magazine, etc.) | Webapp | P2 |
| **14** | OBS support (obs-websocket) | Automator | P2 |
| **15** | Accessibility: keyboard nav completa, alto contraste, screen reader | Todo | P2 |

---

## 17. Limitaciones conocidas (v1)

- Single-aula (un servidor, multiples PCs)
- Editor: optimistic locking con notificacion, no merge automatico de conflictos (el segundo editor ve "bloque editado por otro" y re-fetchea)
- Un Automator por show (enforced por el server). Multi-vMix requiere shows separados
- Sin audio meters (vMix los tiene, no se replican en la UI)
- Sin NDI awareness (solo vMix TCP API)
- Sin tally lights fisicas (solo virtual en UI)
- Sin timecode SMPTE (usa timestamps internos)
- Sin transcoding de media (se valida codec y se advierte si no es compatible con vMix, pero no se transcodea)
- Windows-only para el Automator (por vMix)
- Sin grading/assessment integrado (usar as-run log + review manual)
- Prompter offline: scroll y texto siguen; companion se desconecta >5s → fallback a auto-scroll; senales del productor se pierden hasta reconexion
