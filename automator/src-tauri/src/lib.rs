pub mod commands;
pub mod execution;
pub mod vmix;
pub mod ws;

use std::sync::Arc;
use tokio::sync::Mutex;

/// Shared application state accessible from all Tauri commands.
pub struct AppState {
    pub vmix: Arc<Mutex<vmix::client::VmixClient>>,
    pub ws: Arc<Mutex<ws::client::WsClient>>,
    pub server_url: Arc<Mutex<Option<String>>>,
    pub show_id: Arc<Mutex<Option<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            vmix: Arc::new(Mutex::new(vmix::client::VmixClient::new())),
            ws: Arc::new(Mutex::new(ws::client::WsClient::new())),
            server_url: Arc::new(Mutex::new(None)),
            show_id: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::connect_server,
            commands::connect_vmix,
            commands::disconnect_vmix,
            commands::disconnect_all,
            commands::fetch_shows,
            commands::fetch_rundown,
            commands::execute_cue,
            commands::execute_step,
            commands::send_vmix_command,
            commands::get_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
