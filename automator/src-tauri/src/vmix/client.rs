use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use super::tally;

/// Result of a vMix command execution.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VmixResult {
    pub ok: bool,
    pub function: String,
    pub message: String,
    pub latency_ms: u64,
}

/// TCP client for vMix API (port 8099).
pub struct VmixClient {
    writer: Option<Arc<Mutex<tokio::io::WriteHalf<TcpStream>>>>,
    connected: bool,
    host: String,
}

impl VmixClient {
    pub fn new() -> Self {
        Self {
            writer: None,
            connected: false,
            host: String::new(),
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    pub fn host(&self) -> &str {
        &self.host
    }

    /// Connect to vMix TCP API and start the reader loop.
    pub async fn connect(
        &mut self,
        host: &str,
        port: u16,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let addr = format!("{}:{}", host, port);
        log::info!("Connecting to vMix at {}", addr);

        let stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("Failed to connect to vMix at {}: {}", addr, e))?;

        let (reader, writer) = tokio::io::split(stream);
        let writer = Arc::new(Mutex::new(writer));

        self.writer = Some(writer.clone());
        self.connected = true;
        self.host = format!("{}:{}", host, port);

        // Subscribe to tally updates
        {
            let mut w = writer.lock().await;
            w.write_all(b"SUBSCRIBE TALLY\r\n")
                .await
                .map_err(|e| format!("Failed to subscribe to tally: {}", e))?;
        }

        // Spawn reader loop
        let app = app_handle.clone();
        tokio::spawn(async move {
            let mut buf_reader = BufReader::new(reader);
            let mut line = String::new();

            loop {
                line.clear();
                match buf_reader.read_line(&mut line).await {
                    Ok(0) => {
                        log::warn!("vMix TCP connection closed");
                        let _ = app.emit("vmix-disconnected", ());
                        break;
                    }
                    Ok(_) => {
                        let trimmed = line.trim();
                        log::debug!("vMix << {}", trimmed);

                        // Parse tally responses
                        if trimmed.starts_with("TALLY OK ") {
                            let tally_str = &trimmed["TALLY OK ".len()..];
                            let tally = tally::parse_tally(tally_str);
                            let _ = app.emit("vmix-tally", tally);
                        }
                        // Parse function responses
                        else if trimmed.starts_with("FUNCTION") {
                            let _ = app.emit("vmix-response", trimmed.to_string());
                        }
                    }
                    Err(e) => {
                        log::error!("vMix TCP read error: {}", e);
                        let _ = app.emit("vmix-disconnected", ());
                        break;
                    }
                }
            }
        });

        log::info!("Connected to vMix at {}", addr);
        Ok(())
    }

    /// Send a raw vMix TCP command (e.g., "FUNCTION CutDirect Input=Key\r\n").
    pub async fn send_command(&self, function: &str, params: &str) -> Result<VmixResult, String> {
        let writer = self
            .writer
            .as_ref()
            .ok_or_else(|| "Not connected to vMix".to_string())?;

        let cmd = if params.is_empty() {
            format!("FUNCTION {}\r\n", function)
        } else {
            format!("FUNCTION {} {}\r\n", function, params)
        };

        log::info!("vMix >> {}", cmd.trim());

        let start = std::time::Instant::now();
        let mut w = writer.lock().await;
        w.write_all(cmd.as_bytes())
            .await
            .map_err(|e| format!("Failed to send command to vMix: {}", e))?;
        let latency = start.elapsed().as_millis() as u64;

        Ok(VmixResult {
            ok: true, // We don't wait for response here; async reader handles it
            function: function.to_string(),
            message: format!("Sent: {}", cmd.trim()),
            latency_ms: latency,
        })
    }

    /// Disconnect from vMix.
    pub async fn disconnect(&mut self) {
        if let Some(writer) = self.writer.take() {
            let mut w = writer.lock().await;
            let _ = w.shutdown().await;
        }
        self.connected = false;
        self.host.clear();
        log::info!("Disconnected from vMix");
    }
}
