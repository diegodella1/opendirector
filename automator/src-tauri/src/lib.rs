pub mod commands;
pub mod db;
pub mod execution;
pub mod media;
pub mod vmix;
pub mod ws;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

/// Shared application state accessible from all Tauri commands.
pub struct AppState {
    pub vmix: Arc<vmix::pool::VmixPool>,
    pub ws: Arc<Mutex<ws::client::WsClient>>,
    pub server_url: Arc<Mutex<Option<String>>>,
    pub show_id: Arc<Mutex<Option<String>>>,
    pub media: Arc<Mutex<Option<media::downloader::MediaDownloader>>>,
    pub media_folder: Arc<Mutex<String>>,
    pub db: Arc<db::Database>,
    pub timecode_monitor: Arc<Mutex<execution::timecode::TimecodeMonitor>>,
}

impl AppState {
    pub fn new(db: db::Database) -> Self {
        Self {
            vmix: Arc::new(vmix::pool::VmixPool::new()),
            ws: Arc::new(Mutex::new(ws::client::WsClient::new())),
            server_url: Arc::new(Mutex::new(None)),
            show_id: Arc::new(Mutex::new(None)),
            media: Arc::new(Mutex::new(None)),
            media_folder: Arc::new(Mutex::new("C:\\OpenDirector\\Media".to_string())),
            db: Arc::new(db),
            timecode_monitor: Arc::new(Mutex::new(execution::timecode::TimecodeMonitor::new())),
        }
    }
}

pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize SQLite in the app data directory
            let data_dir = app.path().app_data_dir()?;
            let database = db::Database::open(&data_dir)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            app.manage(AppState::new(database));
            Ok(())
        })
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
            commands::set_active_show,
            commands::get_status,
            commands::set_media_folder,
            commands::sync_media,
            commands::get_media_sync_status,
            commands::load_cached_rundown,
            commands::run_preflight_check,
            commands::register_timecode_triggers,
            commands::clear_timecode_triggers,
            commands::check_timecode_triggers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
