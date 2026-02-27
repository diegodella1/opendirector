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

    Ok(data)
}

/// Connect to vMix TCP API.
#[tauri::command]
pub async fn connect_vmix(
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
    args: ConnectVmixArgs,
) -> Result<(), String> {
    let mut vmix = state.vmix.lock().await;
    vmix.connect(&args.host, args.port, app_handle).await
}

/// Disconnect from vMix.
#[tauri::command]
pub async fn disconnect_vmix(state: State<'_, AppState>) -> Result<(), String> {
    let mut vmix = state.vmix.lock().await;
    vmix.disconnect().await;
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
#[tauri::command]
pub async fn send_vmix_command(
    state: State<'_, AppState>,
    args: SendVmixCommandArgs,
) -> Result<crate::vmix::client::VmixResult, String> {
    let vmix = state.vmix.lock().await;
    vmix.send_command(&args.function, &args.params).await
}

/// Disconnect from both vMix and WebSocket.
#[tauri::command]
pub async fn disconnect_all(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut vmix = state.vmix.lock().await;
        vmix.disconnect().await;
    }
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

/// Get current connection status.
#[tauri::command]
pub async fn get_status(state: State<'_, AppState>) -> Result<StatusInfo, String> {
    let vmix = state.vmix.lock().await;
    let ws = state.ws.lock().await;
    let server = state.server_url.lock().await;
    let show = state.show_id.lock().await;

    Ok(StatusInfo {
        vmix_connected: vmix.is_connected(),
        vmix_host: vmix.host().to_string(),
        ws_connected: ws.is_connected(),
        server_url: server.clone(),
        show_id: show.clone(),
    })
}
