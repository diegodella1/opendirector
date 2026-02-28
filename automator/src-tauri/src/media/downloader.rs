use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Semaphore;

/// Maximum concurrent downloads.
const MAX_CONCURRENT_DOWNLOADS: usize = 2;

/// Emit progress events every this many bytes.
const PROGRESS_EMIT_INTERVAL: u64 = 256 * 1024; // 256 KB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    Pending,
    Downloading,
    Synced,
    Error,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaSyncState {
    pub id: String,
    pub original_name: String,
    pub size_bytes: u64,
    pub category: Option<String>,
    pub status: SyncStatus,
    pub progress: Option<f64>,
    pub local_path: Option<String>,
    pub error: Option<String>,
}

/// Payload emitted with the `media-progress` Tauri event.
#[derive(Debug, Clone, Serialize)]
struct MediaProgressEvent {
    id: String,
    progress: f64,
    downloaded: u64,
    total: u64,
}

/// Payload emitted with the `media-sync-complete` Tauri event.
#[derive(Debug, Clone, Serialize)]
struct MediaSyncCompleteEvent {
    id: String,
    local_path: String,
}

/// Payload emitted with the `media-sync-error` Tauri event.
#[derive(Debug, Clone, Serialize)]
struct MediaSyncErrorEvent {
    id: String,
    error: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Map a category string to a subfolder name.
fn category_folder(category: Option<&str>) -> &str {
    match category {
        Some("clip") => "clips",
        Some("stinger") => "stingers",
        Some("graphic") => "graphics",
        Some("lower_third") => "lower_thirds",
        Some("audio") => "audio",
        _ => "other",
    }
}

// ---------------------------------------------------------------------------
// MediaDownloader
// ---------------------------------------------------------------------------

pub struct MediaDownloader {
    pub files: HashMap<String, MediaSyncState>,
    pub media_folder: PathBuf,
    pub server_url: String,
    pub show_id: String,
}

impl MediaDownloader {
    /// Create a new `MediaDownloader`.
    pub fn new(media_folder: PathBuf, server_url: String, show_id: String) -> Self {
        Self {
            files: HashMap::new(),
            media_folder,
            server_url,
            show_id,
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /// Compare the server media list against local files and download anything
    /// that is missing or incomplete.  Downloads run concurrently (max 2).
    pub async fn sync_all(
        &mut self,
        media_list: Vec<serde_json::Value>,
        app_handle: AppHandle,
    ) {
        let semaphore = std::sync::Arc::new(Semaphore::new(MAX_CONCURRENT_DOWNLOADS));

        // Ensure show media folder exists.
        let show_folder = self.media_folder.join(&self.show_id);
        if let Err(e) = tokio::fs::create_dir_all(&show_folder).await {
            log::error!("Failed to create media folder {:?}: {}", show_folder, e);
            return;
        }

        let mut handles = Vec::new();

        for media in &media_list {
            let id = match media.get("id").and_then(|v| v.as_str()) {
                Some(id) => id.to_string(),
                None => continue,
            };
            let filename = match media.get("filename").and_then(|v| v.as_str()) {
                Some(f) => f.to_string(),
                None => continue,
            };
            let original_name = media
                .get("original_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let size_bytes = media
                .get("size_bytes")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let checksum = media
                .get("checksum")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let category = media
                .get("category")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            // Build target folder with category subfolder
            let subfolder = category_folder(category.as_deref());
            let target_folder = show_folder.join(subfolder);
            if let Err(e) = tokio::fs::create_dir_all(&target_folder).await {
                log::error!("Failed to create subfolder {:?}: {}", target_folder, e);
                continue;
            }

            let local_path = target_folder.join(&filename);

            // Check if already synced.
            if local_path.exists() {
                if let Ok(meta) = tokio::fs::metadata(&local_path).await {
                    if meta.len() == size_bytes {
                        self.files.insert(
                            id.clone(),
                            MediaSyncState {
                                id: id.clone(),
                                original_name: original_name.clone(),
                                size_bytes,
                                category: category.clone(),
                                status: SyncStatus::Synced,
                                progress: Some(1.0),
                                local_path: Some(local_path.to_string_lossy().to_string()),
                                error: None,
                            },
                        );
                        continue;
                    }
                }
            }

            // Mark as Pending.
            self.files.insert(
                id.clone(),
                MediaSyncState {
                    id: id.clone(),
                    original_name: original_name.clone(),
                    size_bytes,
                    category: category.clone(),
                    status: SyncStatus::Pending,
                    progress: Some(0.0),
                    local_path: None,
                    error: None,
                },
            );

            // Clone what the spawned task needs.
            let sem = semaphore.clone();
            let app = app_handle.clone();
            let server_url = self.server_url.clone();
            let target_folder_clone = target_folder.clone();

            let media_value = media.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.expect("semaphore closed");
                download_file(
                    media_value,
                    &server_url,
                    &target_folder_clone,
                    &filename,
                    size_bytes,
                    &checksum,
                    app,
                )
                .await
            }));
        }

        // Await all downloads and update state.
        for handle in handles {
            if let Ok(result) = handle.await {
                match result {
                    Ok((id, local_path)) => {
                        if let Some(state) = self.files.get_mut(&id) {
                            state.status = SyncStatus::Synced;
                            state.progress = Some(1.0);
                            state.local_path = Some(local_path);
                            state.error = None;
                        }
                    }
                    Err((id, error)) => {
                        if let Some(state) = self.files.get_mut(&id) {
                            state.status = SyncStatus::Error;
                            state.error = Some(error);
                        }
                    }
                }
            }
        }
    }

    /// Return the current sync state for every tracked file.
    pub fn get_status(&self) -> Vec<MediaSyncState> {
        self.files.values().cloned().collect()
    }

    /// Track a newly-uploaded media file and start downloading it.
    pub async fn on_media_uploaded(
        &mut self,
        media: serde_json::Value,
        app_handle: AppHandle,
    ) {
        let id = match media.get("id").and_then(|v| v.as_str()) {
            Some(id) => id.to_string(),
            None => return,
        };
        let filename = match media.get("filename").and_then(|v| v.as_str()) {
            Some(f) => f.to_string(),
            None => return,
        };
        let original_name = media
            .get("original_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let size_bytes = media
            .get("size_bytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let checksum = media
            .get("checksum")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let category = media
            .get("category")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        self.files.insert(
            id.clone(),
            MediaSyncState {
                id: id.clone(),
                original_name,
                size_bytes,
                category: category.clone(),
                status: SyncStatus::Pending,
                progress: Some(0.0),
                local_path: None,
                error: None,
            },
        );

        let show_folder = self.media_folder.join(&self.show_id);
        let subfolder = category_folder(category.as_deref());
        let target_folder = show_folder.join(subfolder);
        if let Err(e) = tokio::fs::create_dir_all(&target_folder).await {
            log::error!("Failed to create media folder {:?}: {}", target_folder, e);
            if let Some(state) = self.files.get_mut(&id) {
                state.status = SyncStatus::Error;
                state.error = Some(format!("Cannot create folder: {}", e));
            }
            return;
        }

        let server_url = self.server_url.clone();
        let target_folder_clone = target_folder.clone();
        let id_clone = id.clone();

        let result = download_file(
            media,
            &server_url,
            &target_folder_clone,
            &filename,
            size_bytes,
            &checksum,
            app_handle,
        )
        .await;

        match result {
            Ok((_id, local_path)) => {
                if let Some(state) = self.files.get_mut(&id_clone) {
                    state.status = SyncStatus::Synced;
                    state.progress = Some(1.0);
                    state.local_path = Some(local_path);
                    state.error = None;
                }
            }
            Err((_id, error)) => {
                if let Some(state) = self.files.get_mut(&id_clone) {
                    state.status = SyncStatus::Error;
                    state.error = Some(error);
                }
            }
        }
    }

    /// Stop tracking a deleted media file.
    pub fn on_media_deleted(&mut self, media_id: String) {
        self.files.remove(&media_id);
    }
}

// ---------------------------------------------------------------------------
// Free function: download a single file (called from spawned tasks)
// ---------------------------------------------------------------------------

/// Downloads a single media file with resume support (Range headers).
///
/// Returns `Ok((id, local_path))` on success or `Err((id, error_message))` on
/// failure.  The `.partial` file is kept on error so the next attempt can
/// resume.
async fn download_file(
    media: serde_json::Value,
    server_url: &str,
    target_folder: &PathBuf,
    filename: &str,
    size_bytes: u64,
    checksum: &str,
    app_handle: AppHandle,
) -> Result<(String, String), (String, String)> {
    let id = media
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let final_path = target_folder.join(filename);
    let partial_path = target_folder.join(format!("{}.partial", filename));

    // Determine how many bytes we already have (resume support).
    let existing_bytes: u64 = if partial_path.exists() {
        tokio::fs::metadata(&partial_path)
            .await
            .map(|m| m.len())
            .unwrap_or(0)
    } else {
        0
    };

    // Build the request — add Range header if resuming.
    let download_url = format!(
        "{}/api/media/{}",
        server_url.trim_end_matches('/'),
        id
    );

    let client = reqwest::Client::new();
    let mut request = client.get(&download_url);

    if existing_bytes > 0 {
        log::info!(
            "Resuming download for {} from byte {}",
            filename,
            existing_bytes
        );
        request = request.header("Range", format!("bytes={}-", existing_bytes));
    }

    let response = request.send().await.map_err(|e| {
        let err = format!("HTTP request failed: {}", e);
        let _ = app_handle.emit(
            "media-sync-error",
            MediaSyncErrorEvent {
                id: id.clone(),
                error: err.clone(),
            },
        );
        (id.clone(), err)
    })?;

    let status = response.status();
    if !status.is_success() && status.as_u16() != 206 {
        let err = format!("Server returned HTTP {}", status);
        let _ = app_handle.emit(
            "media-sync-error",
            MediaSyncErrorEvent {
                id: id.clone(),
                error: err.clone(),
            },
        );
        return Err((id, err));
    }

    // Open file for appending (or create).
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&partial_path)
        .await
        .map_err(|e| {
            let err = format!("Cannot open partial file: {}", e);
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            (id.clone(), err)
        })?;

    // Stream the body in chunks.
    let mut stream = response.bytes_stream();
    let mut downloaded = existing_bytes;
    let mut last_emit = downloaded;

    use futures_util::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| {
            let err = format!("Download stream error: {}", e);
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            (id.clone(), err)
        })?;

        file.write_all(&chunk).await.map_err(|e| {
            let err = format!("Failed to write to partial file: {}", e);
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            (id.clone(), err)
        })?;

        downloaded += chunk.len() as u64;

        // Emit progress every PROGRESS_EMIT_INTERVAL bytes.
        if downloaded - last_emit >= PROGRESS_EMIT_INTERVAL || downloaded >= size_bytes {
            let progress = if size_bytes > 0 {
                downloaded as f64 / size_bytes as f64
            } else {
                1.0
            };
            let _ = app_handle.emit(
                "media-progress",
                MediaProgressEvent {
                    id: id.clone(),
                    progress,
                    downloaded,
                    total: size_bytes,
                },
            );
            last_emit = downloaded;
        }
    }

    // Flush and close the file.
    file.flush().await.map_err(|e| {
        let err = format!("Failed to flush partial file: {}", e);
        (id.clone(), err)
    })?;
    drop(file);

    // Verify SHA-256 checksum if provided.
    if !checksum.is_empty() {
        let computed = sha256_file(&partial_path).await.map_err(|e| {
            let err = format!("Checksum computation failed: {}", e);
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            (id.clone(), err)
        })?;

        if computed != checksum {
            // Checksum mismatch — delete the partial and report error.
            let _ = tokio::fs::remove_file(&partial_path).await;
            let err = format!(
                "Checksum mismatch: expected {} but got {}",
                checksum, computed
            );
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            return Err((id, err));
        }
    }

    // Rename .partial → final.
    tokio::fs::rename(&partial_path, &final_path)
        .await
        .map_err(|e| {
            let err = format!("Failed to rename partial to final: {}", e);
            let _ = app_handle.emit(
                "media-sync-error",
                MediaSyncErrorEvent {
                    id: id.clone(),
                    error: err.clone(),
                },
            );
            (id.clone(), err)
        })?;

    let local_path_str = final_path.to_string_lossy().to_string();

    // Emit completion event.
    let _ = app_handle.emit(
        "media-sync-complete",
        MediaSyncCompleteEvent {
            id: id.clone(),
            local_path: local_path_str.clone(),
        },
    );

    log::info!("Downloaded media {} -> {:?}", id, final_path);
    Ok((id, local_path_str))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Compute the SHA-256 hex digest of a file.
async fn sha256_file(path: &PathBuf) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Cannot open file for hashing: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024]; // 64 KB read buffer

    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Read error during hashing: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}
