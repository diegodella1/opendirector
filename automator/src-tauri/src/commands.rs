use serde::{Deserialize, Serialize};
use tauri::State;

use crate::execution::engine::{self, Action, ShowConfig};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct StatusInfo {
    pub vmix_connected: bool,
    pub vmix_host: String,
    pub ws_connected: bool,
    pub server_url: Option<String>,
    pub show_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConnectServerArgs {
    pub server_url: String,
    pub show_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ConnectVmixArgs {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteCueArgs {
    pub element_id: String,
    pub actions: Vec<Action>,
    pub config: ShowConfig,
}

#[derive(Debug, Deserialize)]
pub struct ExecuteStepArgs {
    pub element_id: String,
    pub step_label: String,
    pub actions: Vec<Action>,
    pub config: ShowConfig,
}

#[derive(Debug, Deserialize)]
pub struct SendVmixCommandArgs {
    pub function: String,
    pub params: String,
}

/// Fetch list of shows from the OpenDirector server.
#[tauri::command]
pub async fn fetch_shows(
    state: State<'_, AppState>,
    server_url: String,
) -> Result<serde_json::Value, String> {
    let url = format!("{}/api/shows", server_url.trim_end_matches('/'));
    log::info!("Fetching shows from {}", url);

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch shows: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse shows response: {}", e))?;

    // Store server URL
    let mut server = state.server_url.lock().await;
    *server = Some(server_url);

    Ok(data)
}

/// Fetch full rundown for a show.
#[tauri::command]
pub async fn fetch_rundown(
    state: State<'_, AppState>,
    show_id: String,
) -> Result<serde_json::Value, String> {
    let server = state.server_url.lock().await;
    let server_url = server
        .as_ref()
        .ok_or_else(|| "Server URL not set. Connect to server first.".to_string())?;

    let url = format!(
        "{}/api/shows/{}/rundown",
        server_url.trim_end_matches('/'),
        show_id
    );
    log::info!("Fetching rundown from {}", url);

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch rundown: {}", e))?;

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse rundown response: {}", e))?;

    // Write-through to SQLite cache
    let server_url_val = state.server_url.lock().await;
    if let Some(url) = server_url_val.as_ref() {
        if let Err(e) = state.db.save_rundown(&data, url) {
            log::warn!("Failed to update cache: {}", e);
        }
    }

    Ok(data)
}

/// Connect to vMix TCP API (opens 4 dedicated channels).
#[tauri::command]
pub async fn connect_vmix(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    args: ConnectVmixArgs,
) -> Result<(), String> {
    state.vmix.connect(&args.host, args.port, app_handle).await
}

/// Disconnect from vMix.
#[tauri::command]
pub async fn disconnect_vmix(state: State<'_, AppState>) -> Result<(), String> {
    state.vmix.disconnect().await;
    Ok(())
}

/// Connect to the OpenDirector WebSocket server.
#[tauri::command]
pub async fn connect_server(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    args: ConnectServerArgs,
) -> Result<serde_json::Value, String> {
    // Fetch rundown first
    let url = format!(
        "{}/api/shows/{}/rundown",
        args.server_url.trim_end_matches('/'),
        args.show_id
    );

    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch rundown: {}", e))?;

    let rundown: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse rundown: {}", e))?;

    // Cache rundown to SQLite
    if let Err(e) = state.db.save_rundown(&rundown, &args.server_url) {
        log::warn!("Failed to cache rundown: {}", e);
    }

    // Connect WebSocket
    let mut ws = state.ws.lock().await;
    ws.connect(&args.server_url, &args.show_id, app_handle)
        .await?;

    // Store connection info
    {
        let mut server = state.server_url.lock().await;
        *server = Some(args.server_url);
    }
    {
        let mut show = state.show_id.lock().await;
        *show = Some(args.show_id);
    }

    Ok(rundown)
}

/// Execute CUE for an element (run on_cue actions against vMix).
#[tauri::command]
pub async fn execute_cue(
    state: State<'_, AppState>,
    args: ExecuteCueArgs,
) -> Result<Vec<engine::ActionResult>, String> {
    let results = engine::execute_cue(&args.actions, &args.config, &state.vmix).await;

    // Send ACK via WebSocket
    let ws = state.ws.lock().await;
    if ws.is_connected() {
        let any_error = results.iter().any(|r| !r.ok);
        let ack = serde_json::json!({
            "channel": "execution",
            "type": "cue_ack",
            "elementId": args.element_id,
            "result": if any_error { "error" } else { "ok" },
            "results": results,
        });
        let _ = ws.send(&ack).await;
    }

    Ok(results)
}

/// Execute a named step for an element.
#[tauri::command]
pub async fn execute_step(
    state: State<'_, AppState>,
    args: ExecuteStepArgs,
) -> Result<Vec<engine::ActionResult>, String> {
    let results =
        engine::execute_step(&args.actions, &args.step_label, &args.config, &state.vmix).await;

    // Send ACK via WebSocket
    let ws = state.ws.lock().await;
    if ws.is_connected() {
        let any_error = results.iter().any(|r| !r.ok);
        let ack = serde_json::json!({
            "channel": "execution",
            "type": "step_ack",
            "elementId": args.element_id,
            "stepLabel": args.step_label,
            "result": if any_error { "error" } else { "ok" },
            "results": results,
        });
        let _ = ws.send(&ack).await;
    }

    Ok(results)
}

/// Send a raw vMix command (for testing/debugging).
/// Always routes through the Transitions channel (highest priority, used for PANIC).
#[tauri::command]
pub async fn send_vmix_command(
    state: State<'_, AppState>,
    args: SendVmixCommandArgs,
) -> Result<crate::vmix::client::VmixResult, String> {
    state
        .vmix
        .send_on_channel(
            crate::vmix::pool::VmixChannel::Transitions,
            &args.function,
            &args.params,
        )
        .await
}

/// Disconnect from both vMix and WebSocket.
#[tauri::command]
pub async fn disconnect_all(state: State<'_, AppState>) -> Result<(), String> {
    state.vmix.disconnect().await;
    {
        let mut ws = state.ws.lock().await;
        ws.disconnect().await;
    }
    {
        let mut server = state.server_url.lock().await;
        *server = None;
    }
    {
        let mut show = state.show_id.lock().await;
        *show = None;
    }
    Ok(())
}

/// Set the active show for multi-tab support.
/// Rust only needs to know which show is active for media sync context.
#[tauri::command]
pub async fn set_active_show(
    state: State<'_, AppState>,
    show_id: String,
) -> Result<(), String> {
    let mut current = state.show_id.lock().await;
    *current = Some(show_id.clone());
    log::info!("Active show set to {}", show_id);
    Ok(())
}

/// Get current connection status.
#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<StatusInfo, String> {
    let ws = state.ws.lock().await;
    let server = state.server_url.lock().await;
    let show = state.show_id.lock().await;

    Ok(StatusInfo {
        vmix_connected: state.vmix.is_connected(),
        vmix_host: state.vmix.host(),
        ws_connected: ws.is_connected(),
        server_url: server.clone(),
        show_id: show.clone(),
    })
}

/// Set local media folder path.
#[tauri::command]
pub async fn set_media_folder(
    state: State<'_, AppState>,
    folder: String,
) -> Result<(), String> {
    let mut mf = state.media_folder.lock().await;
    *mf = folder;
    Ok(())
}

/// Fetch media list from server and sync missing files.
#[tauri::command]
pub async fn sync_media(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let server_url = state.server_url.lock().await.clone()
        .ok_or("Server not connected")?;
    let show_id = state.show_id.lock().await.clone()
        .ok_or("No show selected")?;
    let media_folder = state.media_folder.lock().await.clone();

    // Fetch media list from server
    let url = format!(
        "{}/api/shows/{}/media",
        server_url.trim_end_matches('/'),
        show_id
    );
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch media list: {}", e))?;
    let media_list: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse media list: {}", e))?;

    // Create or update downloader
    let mut media_guard = state.media.lock().await;
    let downloader = media_guard.get_or_insert_with(|| {
        crate::media::downloader::MediaDownloader::new(
            std::path::PathBuf::from(&media_folder),
            server_url.clone(),
            show_id.clone(),
        )
    });
    // Update connection info in case it changed
    downloader.server_url = server_url;
    downloader.show_id = show_id;
    downloader.media_folder = std::path::PathBuf::from(&media_folder);

    downloader.sync_all(media_list, app_handle).await;
    Ok(())
}

/// Load cached rundown from SQLite (offline fallback).
/// Returns the cached rundown if available, or null.
#[tauri::command]
pub async fn load_cached_rundown(
    state: State<'_, AppState>,
    show_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let target_id = match show_id {
        Some(id) => id,
        None => state
            .db
            .last_cached_show_id()
            .ok_or("No cached shows found")?,
    };

    match state.db.load_rundown(&target_id)? {
        Some(rundown) => Ok(rundown),
        None => Err(format!("No cached data for show {}", target_id)),
    }
}

/// Preflight check arguments — passed from frontend with rundown data.
#[derive(Debug, Deserialize)]
pub struct PreflightArgs {
    pub config: Option<PreflightConfig>,
    pub gt_templates: Vec<PreflightGtTemplate>,
    pub element_input_keys: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PreflightConfig {
    pub clip_pool_a_key: Option<String>,
    pub clip_pool_b_key: Option<String>,
    pub graphic_key: Option<String>,
    pub lower_third_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PreflightGtTemplate {
    pub name: String,
    pub vmix_input_key: String,
    pub fields: Vec<String>,
}

/// Result of a single preflight check.
#[derive(Debug, Clone, Serialize)]
pub struct PreflightCheck {
    pub key: String,
    pub description: String,
    pub level: String, // "ok", "warning", "error"
    pub suggestion: String,
}

/// Run pre-flight validation: fetch vMix XML state, compare against rundown requirements.
#[tauri::command]
pub async fn run_preflight_check(
    state: State<'_, AppState>,
    args: PreflightArgs,
) -> Result<Vec<PreflightCheck>, String> {
    use crate::vmix::xml_parser;
    use std::collections::HashSet;

    let xml = state.vmix.fetch_xml().await?;

    let vmix_state = xml_parser::parse_vmix_xml(&xml)?;

    let input_keys: HashSet<String> = vmix_state.inputs.iter().map(|i| i.key.clone()).collect();
    let input_by_key: std::collections::HashMap<String, &xml_parser::VmixInput> = vmix_state
        .inputs
        .iter()
        .map(|i| (i.key.clone(), i))
        .collect();

    let mut checks: Vec<PreflightCheck> = Vec::new();
    let mut checked_keys: HashSet<String> = HashSet::new();

    // Check 1: Clip pools and config keys
    if let Some(ref config) = args.config {
        for (label, key_opt) in [
            ("Clip Pool A", &config.clip_pool_a_key),
            ("Clip Pool B", &config.clip_pool_b_key),
            ("Graphic Key", &config.graphic_key),
            ("Lower Third Key", &config.lower_third_key),
        ] {
            if let Some(key) = key_opt {
                if !key.is_empty() {
                    checked_keys.insert(key.clone());
                    if input_keys.contains(key) {
                        checks.push(PreflightCheck {
                            key: key.clone(),
                            description: format!("{} ({})", label, key),
                            level: "ok".to_string(),
                            suggestion: String::new(),
                        });
                    } else {
                        let level = if label.starts_with("Clip") { "error" } else { "warning" };
                        checks.push(PreflightCheck {
                            key: key.clone(),
                            description: format!("{} ({}) — not found in vMix", label, key),
                            level: level.to_string(),
                            suggestion: format!("Add an input with Key \"{}\" in vMix", key),
                        });
                    }
                }
            }
        }
    }

    // Check 2: GT Templates
    for gt in &args.gt_templates {
        checked_keys.insert(gt.vmix_input_key.clone());
        if let Some(input) = input_by_key.get(&gt.vmix_input_key) {
            if input.input_type == "GT" || input.input_type == "GTZip" {
                // Check fields
                let missing: Vec<&String> = gt.fields.iter()
                    .filter(|f| !input.fields.contains(f))
                    .collect();
                if missing.is_empty() {
                    checks.push(PreflightCheck {
                        key: gt.vmix_input_key.clone(),
                        description: format!("GT \"{}\" ({})", gt.name, gt.vmix_input_key),
                        level: "ok".to_string(),
                        suggestion: String::new(),
                    });
                } else {
                    checks.push(PreflightCheck {
                        key: gt.vmix_input_key.clone(),
                        description: format!("GT \"{}\" — missing fields: {}", gt.name, missing.iter().map(|f| f.as_str()).collect::<Vec<_>>().join(", ")),
                        level: "warning".to_string(),
                        suggestion: "Check that the GT Title template has all expected fields".to_string(),
                    });
                }
            } else {
                checks.push(PreflightCheck {
                    key: gt.vmix_input_key.clone(),
                    description: format!("GT \"{}\" ({}) — input is type {} (expected GT/GTZip)", gt.name, gt.vmix_input_key, input.input_type),
                    level: "error".to_string(),
                    suggestion: "Replace this input with a GT Title (.gtzip) file".to_string(),
                });
            }
        } else {
            checks.push(PreflightCheck {
                key: gt.vmix_input_key.clone(),
                description: format!("GT \"{}\" ({}) — not found in vMix", gt.name, gt.vmix_input_key),
                level: "error".to_string(),
                suggestion: format!("Add a GT Title input with Key \"{}\" in vMix", gt.vmix_input_key),
            });
        }
    }

    // Check 3: Element input keys
    for key in &args.element_input_keys {
        if checked_keys.contains(key) {
            continue;
        }
        checked_keys.insert(key.clone());
        if input_keys.contains(key) {
            checks.push(PreflightCheck {
                key: key.clone(),
                description: format!("Input \"{}\"", key),
                level: "ok".to_string(),
                suggestion: String::new(),
            });
        } else {
            checks.push(PreflightCheck {
                key: key.clone(),
                description: format!("Input \"{}\" — not found in vMix", key),
                level: "warning".to_string(),
                suggestion: format!("Add an input with Key \"{}\" in vMix", key),
            });
        }
    }

    log::info!("Pre-flight check: {} items ({} errors)", checks.len(), checks.iter().filter(|c| c.level == "error").count());
    Ok(checks)
}

/// A timecode trigger definition from the frontend.
#[derive(Debug, Deserialize)]
pub struct TimecodeTriggerDef {
    pub element_id: String,
    pub trigger_config: String,
    pub clip_duration_ms: u64,
}

/// Register timecode triggers for the current block's elements.
#[tauri::command]
pub async fn register_timecode_triggers(
    state: State<'_, AppState>,
    triggers: Vec<TimecodeTriggerDef>,
) -> Result<usize, String> {
    let mut monitor = state.timecode_monitor.lock().await;
    monitor.clear();
    for t in &triggers {
        monitor.register(t.element_id.clone(), &t.trigger_config, t.clip_duration_ms);
    }
    let count = monitor.trigger_count();
    log::info!("Registered {} timecode triggers", count);
    Ok(count)
}

/// Clear all timecode triggers.
#[tauri::command]
pub async fn clear_timecode_triggers(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut monitor = state.timecode_monitor.lock().await;
    monitor.clear();
    log::info!("Cleared timecode triggers");
    Ok(())
}

/// Check ACTS position against registered timecode triggers.
/// Returns element IDs that should fire.
#[tauri::command]
pub async fn check_timecode_triggers(
    state: State<'_, AppState>,
    position_ms: u64,
    duration_ms: u64,
) -> Result<Vec<String>, String> {
    let mut monitor = state.timecode_monitor.lock().await;
    let fired = monitor.check(position_ms, duration_ms);
    Ok(fired)
}

/// Get current media sync status.
#[tauri::command]
pub async fn get_media_sync_status(
    state: State<'_, AppState>,
) -> Result<Vec<crate::media::downloader::MediaSyncState>, String> {
    let media_guard = state.media.lock().await;
    match media_guard.as_ref() {
        Some(downloader) => Ok(downloader.get_status()),
        None => Ok(vec![]),
    }
}
