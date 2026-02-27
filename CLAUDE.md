# OpenDirector

Spec completa del proyecto: `SPEC.md` — leer antes de hacer cualquier cambio.

## Qué es

Sistema open-source de producción de TV en vivo. Reemplaza CuEZ. Dos componentes: webapp (editor de rundown) y Automator (app desktop que controla vMix). Gratis, self-hosted.

## Stack

- **Webapp**: Next.js 14+ (App Router), Supabase (PostgreSQL) via `@supabase/supabase-js`, ws (WebSocket custom), React + Tailwind, Zustand, dnd-kit
- **Automator**: Tauri v2, Rust (tokio, rusqlite para cache local, tokio-tungstenite), React (Vite) en webview
- **DB server**: Supabase (PostgreSQL) — una sola DB, todas las tablas con prefijo `od_`, particionadas por `show_id`
- **DB Automator**: SQLite local (rusqlite) — solo cache offline del rundown + event store
- **Media**: filesystem (`data/shows/{id}/media/`) + ffmpeg para thumbnails/metadata
- **Templates**: archivos JSON en `data/templates/`, metadata en tabla `od_templates`
- **Supabase**: solo como PostgreSQL. NO usar Supabase Realtime ni Supabase Auth — WebSocket custom y auth custom (PIN→token)

## Arquitectura

- Servidor (Next.js) es el hub central — REST API + WebSocket custom
- Supabase es solo la base de datos PostgreSQL (no Realtime, no Auth)
- Automator ejecuta localmente contra vMix por TCP (no depende del server para ejecución)
- Prompter es una ruta web con interpolación client-side a 60fps
- Todo offline-first: Automator y Prompter siguen funcionando si se cae el servidor

## Reglas de implementación

- Seguir la spec (`SPEC.md`) al pie de la letra
- Tablas con prefijo `od_` (od_shows, od_blocks, od_elements, etc.)
- IDs son UUID (gen_random_uuid()), timestamps son TIMESTAMPTZ
- Un Automator por show (enforced por el server)
- Auth: PIN hasheado (bcrypt) → session token UUID. Nunca PIN en URLs
- Optimistic locking: todo edit del rundown lleva `expectedVersion`, 409 si no matchea
- Show state machine: draft → ready → rehearsal/live → archived (ver transiciones en spec)
- Dark mode obligatorio en toda la UI
- Inputs de vMix referenciados por Key, nunca por número
- WebSocket: 5 channels (rundown, execution, prompter, tally, signals) con prioridades definidas
- Media: validar codec con ffprobe al upload, advertir si no es compatible con vMix (no bloquear)
- Errores de vMix deben ser visibles en UI del Automator Y en Go Live del productor

## Estructura de data/ (filesystem — solo binarios)

```
data/
├── templates/                   # JSON snapshots (portables)
├── releases/                    # MSI del Automator para auto-update
└── shows/{show_id}/
    └── media/
        ├── {uuid}.ext           # archivos de media
        └── thumbs/{uuid}.jpg    # thumbnails
```

La DB vive en Supabase (PostgreSQL), no en filesystem.

## Conexión a Supabase

- Host: Supabase self-hosted en Raspberry Pi 5 (192.168.1.14)
- API Gateway (Kong): http://192.168.1.14:54321
- REST API: http://192.168.1.14:54321/rest/v1/
- PostgreSQL directo: 192.168.1.14:5432
- Aplicar migrations: `sudo docker exec -i supabase-db psql -U supabase_admin -d postgres < archivo.sql`

## Escenario principal

1 show en vivo + 1 show editándose en paralelo, 24/7. ~6 conexiones WebSocket. Servidor corre en Raspberry Pi 5.
