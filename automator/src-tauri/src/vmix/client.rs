use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use super::acts;
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

        // Subscribe to tally and ACTS updates
        {
            let mut w = writer.lock().await;
            w.write_all(b"SUBSCRIBE TALLY\r\n")
                .await
                .map_err(|e| format!("Failed to subscribe to tally: {}", e))?;
            w.write_all(b"SUBSCRIBE ACTS\r\n")
                .await
                .map_err(|e| format!("Failed to subscribe to ACTS: {}", e))?;
            w.write_all(b"SUBSCRIBE RECORDING\r\n")
                .await
                .map_err(|e| format!("Failed to subscribe to RECORDING: {}", e))?;
            w.write_all(b"SUBSCRIBE STREAMING\r\n")
                .await
                .map_err(|e| format!("Failed to subscribe to STREAMING: {}", e))?;
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
                        // Parse ACTS (activator/timecode) responses
                        else if trimmed.starts_with("ACTS") {
                            if let Some(update) = acts::parse_acts_line(trimmed) {
                                let _ = app.emit("vmix-acts", update);
                            }
                        }
                        // Parse RECORDING responses
                        else if trimmed.starts_with("RECORDING OK ") {
                            let val = &trimmed["RECORDING OK ".len()..];
                            let is_recording = val.trim() == "1";
                            let _ = app.emit("vmix-recording", is_recording);
                        }
                        // Parse STREAMING responses
                        else if trimmed.starts_with("STREAMING OK ") {
                            let val = &trimmed["STREAMING OK ".len()..];
                            let is_streaming = val.trim() == "1";
                            let _ = app.emit("vmix-streaming", is_streaming);
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

    /// Fetch vMix XML state via a separate short-lived TCP connection.
    /// Opens a new connection to the same host, sends "XML\r\n", reads until
    /// "</vmix>", then closes. Avoids interfering with the main reader loop.
    pub async fn fetch_xml(&self) -> Result<String, String> {
        if !self.connected || self.host.is_empty() {
            return Err("Not connected to vMix".to_string());
        }

        log::info!("Fetching XML state from vMix at {}", self.host);

        let stream = TcpStream::connect(&self.host)
            .await
            .map_err(|e| format!("Failed to open XML connection to vMix: {}", e))?;

        let (reader, mut writer) = tokio::io::split(stream);

        writer
            .write_all(b"XML\r\n")
            .await
            .map_err(|e| format!("Failed to send XML command: {}", e))?;

        let mut buf_reader = BufReader::new(reader);
        let mut xml = String::new();
        let mut line = String::new();

        loop {
            line.clear();
            match tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                buf_reader.read_line(&mut line),
            )
            .await
            {
                Ok(Ok(0)) => return Err("Connection closed while reading XML".to_string()),
                Ok(Ok(_)) => {
                    xml.push_str(&line);
                    if xml.contains("</vmix>") {
                        break;
                    }
                }
                Ok(Err(e)) => return Err(format!("Error reading XML: {}", e)),
                Err(_) => return Err("Timeout waiting for vMix XML response".to_string()),
            }
        }

        // Strip anything before <vmix>
        if let Some(start) = xml.find("<vmix>") {
            xml = xml[start..].to_string();
        }

        let _ = writer.shutdown().await;
        log::info!("Fetched vMix XML ({} bytes)", xml.len());
        Ok(xml)
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
