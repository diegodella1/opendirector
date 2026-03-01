pub mod ops;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

/// SQLite database wrapper for offline cache.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Open (or create) the cache database in the given directory.
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir)
            .map_err(|e| format!("Failed to create data dir: {}", e))?;

        let db_path = data_dir.join("cache.db");
        log::info!("Opening SQLite cache at {:?}", db_path);

        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite: {}", e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    /// Run schema migrations.
    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| format!("Schema migration failed: {}", e))?;

        // Check/set schema version
        let version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if version < 1 {
            conn.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (1)", [])
                .map_err(|e| format!("Failed to set schema version: {}", e))?;
        }

        log::info!("SQLite cache schema version: {}", version.max(1));
        Ok(())
    }

    /// Get a reference to the connection (locked).
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().expect("DB mutex poisoned")
    }
}
