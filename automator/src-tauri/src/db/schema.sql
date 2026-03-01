-- SQLite schema for Automator offline cache
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS cached_show (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL,
    config_json TEXT,
    server_url TEXT NOT NULL,
    cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cached_blocks (
    id TEXT PRIMARY KEY,
    show_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    estimated_duration_sec INTEGER NOT NULL DEFAULT 0,
    script TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    cameras_json TEXT,
    elements_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS cached_gt_templates (
    id TEXT PRIMARY KEY,
    show_id TEXT NOT NULL,
    name TEXT NOT NULL,
    vmix_input_key TEXT NOT NULL,
    overlay_number INTEGER NOT NULL DEFAULT 1,
    fields_json TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cached_media (
    id TEXT PRIMARY KEY,
    show_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    local_path TEXT,
    sha256 TEXT,
    synced INTEGER NOT NULL DEFAULT 0
);
