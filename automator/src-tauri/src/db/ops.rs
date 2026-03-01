use super::Database;
use serde_json::Value;

impl Database {
    /// Save a full rundown (show + blocks with elements + gt_templates) to cache.
    pub fn save_rundown(&self, rundown: &Value, server_url: &str) -> Result<(), String> {
        let conn = self.conn();

        let show = rundown
            .get("show")
            .ok_or("Missing 'show' in rundown")?;
        let show_id = show["id"].as_str().ok_or("Missing show.id")?;
        let show_name = show["name"].as_str().unwrap_or("");
        let show_status = show["status"].as_str().unwrap_or("draft");
        let show_version = show["version"].as_i64().unwrap_or(0);

        let config = rundown.get("config");
        let config_json = config
            .map(|c| serde_json::to_string(c).unwrap_or_default())
            .unwrap_or_default();

        let now = chrono::Utc::now().to_rfc3339();

        // Use a transaction for atomicity
        conn.execute_batch("BEGIN")
            .map_err(|e| format!("BEGIN failed: {}", e))?;

        // Clear old data for this show
        conn.execute("DELETE FROM cached_blocks WHERE show_id = ?1", [show_id])
            .map_err(|e| format!("Failed to clear blocks: {}", e))?;
        conn.execute(
            "DELETE FROM cached_gt_templates WHERE show_id = ?1",
            [show_id],
        )
        .map_err(|e| format!("Failed to clear GT templates: {}", e))?;

        // Upsert show
        conn.execute(
            "INSERT OR REPLACE INTO cached_show (id, name, status, version, config_json, server_url, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![show_id, show_name, show_status, show_version, config_json, server_url, now],
        )
        .map_err(|e| format!("Failed to save show: {}", e))?;

        // Save blocks (with elements serialized as JSON)
        if let Some(blocks) = rundown.get("blocks").and_then(|b| b.as_array()) {
            for block in blocks {
                let block_id = block["id"].as_str().unwrap_or_default();
                let name = block["name"].as_str().unwrap_or_default();
                let position = block["position"].as_i64().unwrap_or(0);
                let est_dur = block["estimated_duration_sec"].as_i64().unwrap_or(0);
                let script = block["script"].as_str();
                let notes = block["notes"].as_str();
                let status = block["status"].as_str().unwrap_or("pending");
                let cameras_json = block
                    .get("cameras")
                    .map(|c| serde_json::to_string(c).unwrap_or_default())
                    .unwrap_or_default();
                let elements_json = block
                    .get("elements")
                    .map(|e| serde_json::to_string(e).unwrap_or_default())
                    .unwrap_or_else(|| "[]".to_string());

                conn.execute(
                    "INSERT INTO cached_blocks (id, show_id, name, position, estimated_duration_sec, script, notes, status, cameras_json, elements_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    rusqlite::params![block_id, show_id, name, position, est_dur, script, notes, status, cameras_json, elements_json],
                )
                .map_err(|e| format!("Failed to save block: {}", e))?;
            }
        }

        // Save GT templates
        if let Some(gts) = rundown.get("gt_templates").and_then(|g| g.as_array()) {
            for gt in gts {
                let gt_id = gt["id"].as_str().unwrap_or_default();
                let gt_show_id = gt["show_id"].as_str().unwrap_or(show_id);
                let gt_name = gt["name"].as_str().unwrap_or_default();
                let vmix_input_key = gt["vmix_input_key"].as_str().unwrap_or_default();
                let overlay_number = gt["overlay_number"].as_i64().unwrap_or(1);
                let fields_json = gt
                    .get("fields")
                    .map(|f| serde_json::to_string(f).unwrap_or_default())
                    .unwrap_or_else(|| "[]".to_string());
                let position = gt["position"].as_i64().unwrap_or(0);

                conn.execute(
                    "INSERT INTO cached_gt_templates (id, show_id, name, vmix_input_key, overlay_number, fields_json, position)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![gt_id, gt_show_id, gt_name, vmix_input_key, overlay_number, fields_json, position],
                )
                .map_err(|e| format!("Failed to save GT template: {}", e))?;
            }
        }

        conn.execute_batch("COMMIT")
            .map_err(|e| format!("COMMIT failed: {}", e))?;

        log::info!("Cached rundown for show {} (version {})", show_id, show_version);
        Ok(())
    }

    /// Load the cached rundown as a serde_json::Value matching the RundownFull shape.
    /// Returns None if no cache exists for the given show_id.
    pub fn load_rundown(&self, show_id: &str) -> Result<Option<Value>, String> {
        let conn = self.conn();

        // Load show
        let show_row: Option<(String, String, String, i64, String, String)> = conn
            .query_row(
                "SELECT id, name, status, version, config_json, cached_at FROM cached_show WHERE id = ?1",
                [show_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .ok();

        let (id, name, status, version, config_json, _cached_at) = match show_row {
            Some(row) => row,
            None => return Ok(None),
        };

        let config: Value = serde_json::from_str(&config_json).unwrap_or(Value::Null);

        // Load blocks
        let mut stmt = conn
            .prepare(
                "SELECT id, name, position, estimated_duration_sec, script, notes, status, cameras_json, elements_json
                 FROM cached_blocks WHERE show_id = ?1 ORDER BY position",
            )
            .map_err(|e| format!("Failed to prepare blocks query: {}", e))?;

        let blocks: Vec<Value> = stmt
            .query_map([show_id], |row| {
                let block_id: String = row.get(0)?;
                let name: String = row.get(1)?;
                let position: i64 = row.get(2)?;
                let est_dur: i64 = row.get(3)?;
                let script: Option<String> = row.get(4)?;
                let notes: Option<String> = row.get(5)?;
                let status: String = row.get(6)?;
                let cameras_json: String = row.get(7)?;
                let elements_json: String = row.get(8)?;

                let cameras: Value = serde_json::from_str(&cameras_json).unwrap_or(Value::Array(vec![]));
                let elements: Value = serde_json::from_str(&elements_json).unwrap_or(Value::Array(vec![]));

                Ok(serde_json::json!({
                    "id": block_id,
                    "show_id": show_id,
                    "name": name,
                    "position": position,
                    "estimated_duration_sec": est_dur,
                    "script": script,
                    "notes": notes,
                    "status": status,
                    "cameras": cameras,
                    "elements": elements,
                    "actual_duration_sec": null,
                }))
            })
            .map_err(|e| format!("Failed to query blocks: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        // Load GT templates
        let mut gt_stmt = conn
            .prepare(
                "SELECT id, show_id, name, vmix_input_key, overlay_number, fields_json, position
                 FROM cached_gt_templates WHERE show_id = ?1 ORDER BY position",
            )
            .map_err(|e| format!("Failed to prepare GT query: {}", e))?;

        let gt_templates: Vec<Value> = gt_stmt
            .query_map([show_id], |row| {
                let gt_id: String = row.get(0)?;
                let gt_show_id: String = row.get(1)?;
                let gt_name: String = row.get(2)?;
                let vmix_input_key: String = row.get(3)?;
                let overlay_number: i64 = row.get(4)?;
                let fields_json: String = row.get(5)?;
                let position: i64 = row.get(6)?;

                let fields: Value = serde_json::from_str(&fields_json).unwrap_or(Value::Array(vec![]));

                Ok(serde_json::json!({
                    "id": gt_id,
                    "show_id": gt_show_id,
                    "name": gt_name,
                    "vmix_input_key": vmix_input_key,
                    "overlay_number": overlay_number,
                    "fields": fields,
                    "position": position,
                }))
            })
            .map_err(|e| format!("Failed to query GT templates: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let rundown = serde_json::json!({
            "show": {
                "id": id,
                "name": name,
                "status": status,
                "version": version,
            },
            "config": config,
            "blocks": blocks,
            "gt_templates": gt_templates,
            "_cached": true,
        });

        Ok(Some(rundown))
    }

    /// Clear all cached data for a show.
    pub fn clear_show(&self, show_id: &str) -> Result<(), String> {
        let conn = self.conn();
        conn.execute("DELETE FROM cached_blocks WHERE show_id = ?1", [show_id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM cached_gt_templates WHERE show_id = ?1",
            [show_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM cached_show WHERE id = ?1", [show_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM cached_media WHERE show_id = ?1", [show_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Get the last show_id that was cached (for startup without server).
    pub fn last_cached_show_id(&self) -> Option<String> {
        let conn = self.conn();
        conn.query_row(
            "SELECT id FROM cached_show ORDER BY cached_at DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
    }
}
