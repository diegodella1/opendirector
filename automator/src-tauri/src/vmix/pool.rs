use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

use super::acts;
use super::tally;
use crate::vmix::client::VmixResult;

/// The 4 dedicated TCP channels to vMix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VmixChannel {
    /// CutDirect, Fade, Stinger, Merge, Wipe, etc. — highest priority (PANIC goes here).
    Transitions = 0,
    /// OverlayInput*, SetText*, SetImage*, SelectTitlePreset*, etc.
    Graphics = 1,
    /// AudioOn/Off, AudioBus*, SetVolume*, Solo*, etc.
    Audio = 2,
    /// Play, Pause, everything else + SUBSCRIBE (TALLY, ACTS, RECORDING, STREAMING).
    State = 3,
}

impl VmixChannel {
    /// Classify a vMix function name into the appropriate channel.
    pub fn classify(function: &str) -> Self {
        // Transitions: switching/transition functions
        match function {
            "Cut" | "CutDirect" | "Fade" | "FadeToBlack" | "Merge" | "Wipe" | "Zoom"
            | "Fly" | "CrossZoom" | "Slide" | "QuickPlay" => return VmixChannel::Transitions,
            _ => {}
        }
        // Prefix-based classification
        if function.starts_with("Stinger") {
            return VmixChannel::Transitions;
        }

        // Graphics
        if function.starts_with("OverlayInput")
            || function.starts_with("SetText")
            || function.starts_with("SetImage")
            || function.starts_with("SelectTitlePreset")
            || function.starts_with("SetColor")
            || function.starts_with("SetCountdown")
            || function.starts_with("TitleBeginAnimation")
            || function.starts_with("DataSource")
        {
            return VmixChannel::Graphics;
        }

        // Audio
        if function.starts_with("Audio")
            || function.starts_with("SetVolume")
            || function.starts_with("SetBalance")
            || function.starts_with("Solo")
            || function.starts_with("BusX")
            || function.starts_with("SetBus")
            || function == "MasterAudioOn"
            || function == "MasterAudioOff"
        {
            return VmixChannel::Audio;
        }

        // Everything else: State
        VmixChannel::State
    }

    const ALL: [VmixChannel; 4] = [
        VmixChannel::Transitions,
        VmixChannel::Graphics,
        VmixChannel::Audio,
        VmixChannel::State,
    ];

    fn label(&self) -> &'static str {
        match self {
            VmixChannel::Transitions => "Transitions",
            VmixChannel::Graphics => "Graphics",
            VmixChannel::Audio => "Audio",
            VmixChannel::State => "State",
        }
    }
}

/// A single TCP connection slot in the pool.
struct ConnectionSlot {
    writer: Mutex<tokio::io::WriteHalf<TcpStream>>,
    channel: VmixChannel,
    connected: AtomicBool,
}

/// Pool of 4 dedicated TCP connections to vMix.
///
/// Each channel has its own `Mutex<WriteHalf>`, so transitions/graphics/audio/state
/// can write concurrently. No outer mutex needed on AppState.
pub struct VmixPool {
    host: std::sync::RwLock<String>,
    connected: AtomicBool,
    slots: tokio::sync::RwLock<Option<[Arc<ConnectionSlot>; 4]>>,
}

impl VmixPool {
    pub fn new() -> Self {
        Self {
            host: std::sync::RwLock::new(String::new()),
            connected: AtomicBool::new(false),
            slots: tokio::sync::RwLock::new(None),
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    pub fn host(&self) -> String {
        self.host.read().unwrap().clone()
    }

    /// Open 4 TCP connections to vMix in parallel.
    /// State channel gets SUBSCRIBE + reader loop; others get drain tasks.
    pub async fn connect(
        &self,
        host: &str,
        port: u16,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let addr = format!("{}:{}", host, port);
        log::info!("VmixPool: connecting 4 channels to {}", addr);

        // Open 4 TCP connections in parallel
        let futures: Vec<_> = VmixChannel::ALL
            .iter()
            .map(|ch| {
                let addr = addr.clone();
                let ch = *ch;
                async move {
                    let stream = TcpStream::connect(&addr).await.map_err(|e| {
                        format!("Failed to connect {} channel to {}: {}", ch.label(), addr, e)
                    })?;
                    Ok::<(VmixChannel, TcpStream), String>((ch, stream))
                }
            })
            .collect();

        let results = futures_util::future::join_all(futures).await;

        let mut streams: Vec<(VmixChannel, TcpStream)> = Vec::with_capacity(4);
        for result in results {
            streams.push(result?);
        }

        // Build slots
        let mut slot_arr: [Option<Arc<ConnectionSlot>>; 4] = [None, None, None, None];

        for (channel, stream) in streams {
            let (reader, writer) = tokio::io::split(stream);
            let slot = Arc::new(ConnectionSlot {
                writer: Mutex::new(writer),
                channel,
                connected: AtomicBool::new(true),
            });

            if channel == VmixChannel::State {
                // Subscribe to updates on the State channel
                {
                    let mut w = slot.writer.lock().await;
                    w.write_all(b"SUBSCRIBE TALLY\r\n").await.map_err(|e| {
                        format!("Failed to subscribe to TALLY: {}", e)
                    })?;
                    w.write_all(b"SUBSCRIBE ACTS\r\n").await.map_err(|e| {
                        format!("Failed to subscribe to ACTS: {}", e)
                    })?;
                    w.write_all(b"SUBSCRIBE RECORDING\r\n").await.map_err(|e| {
                        format!("Failed to subscribe to RECORDING: {}", e)
                    })?;
                    w.write_all(b"SUBSCRIBE STREAMING\r\n").await.map_err(|e| {
                        format!("Failed to subscribe to STREAMING: {}", e)
                    })?;
                }

                // Spawn reader loop (same logic as client.rs)
                let app = app_handle.clone();
                let slot_ref = Arc::clone(&slot);
                tokio::spawn(async move {
                    let mut buf_reader = BufReader::new(reader);
                    let mut line = String::new();

                    loop {
                        line.clear();
                        match buf_reader.read_line(&mut line).await {
                            Ok(0) => {
                                log::warn!("vMix State channel TCP connection closed");
                                slot_ref.connected.store(false, Ordering::Relaxed);
                                let _ = app.emit("vmix-disconnected", ());
                                break;
                            }
                            Ok(_) => {
                                let trimmed = line.trim();
                                log::debug!("vMix [State] << {}", trimmed);

                                if trimmed.starts_with("TALLY OK ") {
                                    let tally_str = &trimmed["TALLY OK ".len()..];
                                    let t = tally::parse_tally(tally_str);
                                    let _ = app.emit("vmix-tally", t);
                                } else if trimmed.starts_with("ACTS") {
                                    if let Some(update) = acts::parse_acts_line(trimmed) {
                                        let _ = app.emit("vmix-acts", update);
                                    }
                                } else if trimmed.starts_with("RECORDING OK ") {
                                    let val = &trimmed["RECORDING OK ".len()..];
                                    let is_recording = val.trim() == "1";
                                    let _ = app.emit("vmix-recording", is_recording);
                                } else if trimmed.starts_with("STREAMING OK ") {
                                    let val = &trimmed["STREAMING OK ".len()..];
                                    let is_streaming = val.trim() == "1";
                                    let _ = app.emit("vmix-streaming", is_streaming);
                                } else if trimmed.starts_with("FUNCTION") {
                                    let _ = app.emit("vmix-response", trimmed.to_string());
                                }
                            }
                            Err(e) => {
                                log::error!("vMix State channel read error: {}", e);
                                slot_ref.connected.store(false, Ordering::Relaxed);
                                let _ = app.emit("vmix-disconnected", ());
                                break;
                            }
                        }
                    }
                });
            } else {
                // Drain task: read and discard to prevent TCP buffer from filling up
                let label = channel.label();
                let slot_ref = Arc::clone(&slot);
                tokio::spawn(async move {
                    let mut buf_reader = BufReader::new(reader);
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match buf_reader.read_line(&mut line).await {
                            Ok(0) => {
                                log::warn!("vMix {} channel TCP connection closed", label);
                                slot_ref.connected.store(false, Ordering::Relaxed);
                                break;
                            }
                            Ok(_) => {
                                log::debug!("vMix [{}] << {}", label, line.trim());
                            }
                            Err(e) => {
                                log::error!("vMix {} channel read error: {}", label, e);
                                slot_ref.connected.store(false, Ordering::Relaxed);
                                break;
                            }
                        }
                    }
                });
            }

            slot_arr[channel as usize] = Some(slot);
        }

        // Unwrap all slots (all 4 must be present)
        let final_slots = [
            slot_arr[0].take().unwrap(),
            slot_arr[1].take().unwrap(),
            slot_arr[2].take().unwrap(),
            slot_arr[3].take().unwrap(),
        ];

        {
            let mut h = self.host.write().unwrap();
            *h = addr.clone();
        }
        {
            let mut slots = self.slots.write().await;
            *slots = Some(final_slots);
        }
        self.connected.store(true, Ordering::Relaxed);

        log::info!("VmixPool: all 4 channels connected to {}", addr);
        Ok(())
    }

    /// Send a vMix command, automatically classifying it to the right channel.
    /// Falls back to any connected slot if the primary channel is down.
    pub async fn send_command(&self, function: &str, params: &str) -> Result<VmixResult, String> {
        let channel = VmixChannel::classify(function);
        self.send_on_slot(channel, function, params).await
    }

    /// Send a vMix command on a specific channel (e.g., Transitions for PANIC).
    /// Falls back to any connected slot if the target channel is down.
    pub async fn send_on_channel(
        &self,
        channel: VmixChannel,
        function: &str,
        params: &str,
    ) -> Result<VmixResult, String> {
        self.send_on_slot(channel, function, params).await
    }

    /// Internal: send on a specific slot, with fallback.
    async fn send_on_slot(
        &self,
        preferred: VmixChannel,
        function: &str,
        params: &str,
    ) -> Result<VmixResult, String> {
        let slots_guard = self.slots.read().await;
        let slots = slots_guard
            .as_ref()
            .ok_or_else(|| "Not connected to vMix".to_string())?;

        let cmd = if params.is_empty() {
            format!("FUNCTION {}\r\n", function)
        } else {
            format!("FUNCTION {} {}\r\n", function, params)
        };

        // Try preferred channel first
        let primary = &slots[preferred as usize];
        if primary.connected.load(Ordering::Relaxed) {
            let start = std::time::Instant::now();
            let mut w = primary.writer.lock().await;
            match w.write_all(cmd.as_bytes()).await {
                Ok(_) => {
                    let latency = start.elapsed().as_millis() as u64;
                    log::info!(
                        "vMix [{}] >> {}",
                        preferred.label(),
                        cmd.trim()
                    );
                    return Ok(VmixResult {
                        ok: true,
                        function: function.to_string(),
                        message: format!("Sent via {}: {}", preferred.label(), cmd.trim()),
                        latency_ms: latency,
                    });
                }
                Err(e) => {
                    log::warn!(
                        "vMix {} channel write failed: {}, trying fallback",
                        preferred.label(),
                        e
                    );
                    primary.connected.store(false, Ordering::Relaxed);
                }
            }
        }

        // Fallback: try any other connected slot
        for slot in slots.iter() {
            if slot.channel == preferred {
                continue;
            }
            if !slot.connected.load(Ordering::Relaxed) {
                continue;
            }
            let start = std::time::Instant::now();
            let mut w = slot.writer.lock().await;
            match w.write_all(cmd.as_bytes()).await {
                Ok(_) => {
                    let latency = start.elapsed().as_millis() as u64;
                    log::warn!(
                        "vMix [{}→{}] >> {} (fallback)",
                        preferred.label(),
                        slot.channel.label(),
                        cmd.trim()
                    );
                    return Ok(VmixResult {
                        ok: true,
                        function: function.to_string(),
                        message: format!(
                            "Sent via {} (fallback from {}): {}",
                            slot.channel.label(),
                            preferred.label(),
                            cmd.trim()
                        ),
                        latency_ms: latency,
                    });
                }
                Err(e) => {
                    log::warn!("vMix {} channel fallback write failed: {}", slot.channel.label(), e);
                    slot.connected.store(false, Ordering::Relaxed);
                }
            }
        }

        Err("All vMix connections are down".to_string())
    }

    /// Fetch vMix XML state via a separate short-lived TCP connection.
    pub async fn fetch_xml(&self) -> Result<String, String> {
        if !self.connected.load(Ordering::Relaxed) {
            return Err("Not connected to vMix".to_string());
        }

        let host = self.host();
        if host.is_empty() {
            return Err("Not connected to vMix".to_string());
        }

        log::info!("Fetching XML state from vMix at {}", host);

        let stream = TcpStream::connect(&host)
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

    /// Disconnect all 4 channels.
    pub async fn disconnect(&self) {
        {
            let mut slots = self.slots.write().await;
            if let Some(ref slot_arr) = *slots {
                for slot in slot_arr {
                    slot.connected.store(false, Ordering::Relaxed);
                    let mut w = slot.writer.lock().await;
                    let _ = w.shutdown().await;
                }
            }
            *slots = None;
        }
        self.connected.store(false, Ordering::Relaxed);
        {
            let mut h = self.host.write().unwrap();
            h.clear();
        }
        log::info!("VmixPool: disconnected all channels");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_transitions() {
        assert_eq!(VmixChannel::classify("CutDirect"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Cut"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Fade"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("FadeToBlack"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Merge"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Stinger1"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Stinger2"), VmixChannel::Transitions);
        assert_eq!(VmixChannel::classify("Wipe"), VmixChannel::Transitions);
    }

    #[test]
    fn test_classify_graphics() {
        assert_eq!(VmixChannel::classify("OverlayInput1In"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("OverlayInput1Out"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("SetText"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("SetImage"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("SelectTitlePreset"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("SetColor"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("SetCountdown"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("TitleBeginAnimation"), VmixChannel::Graphics);
        assert_eq!(VmixChannel::classify("DataSourceNextRow"), VmixChannel::Graphics);
    }

    #[test]
    fn test_classify_audio() {
        assert_eq!(VmixChannel::classify("AudioOn"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("AudioOff"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("AudioBusOn"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("SetVolume"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("SetBalance"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("SoloOn"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("BusXAudio"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("SetBusAVolume"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("MasterAudioOn"), VmixChannel::Audio);
        assert_eq!(VmixChannel::classify("MasterAudioOff"), VmixChannel::Audio);
    }

    #[test]
    fn test_classify_state_fallback() {
        assert_eq!(VmixChannel::classify("Play"), VmixChannel::State);
        assert_eq!(VmixChannel::classify("Pause"), VmixChannel::State);
        assert_eq!(VmixChannel::classify("Restart"), VmixChannel::State);
        assert_eq!(VmixChannel::classify("Loop"), VmixChannel::State);
        assert_eq!(VmixChannel::classify("StartRecording"), VmixChannel::State);
        assert_eq!(VmixChannel::classify("SomeUnknownFunction"), VmixChannel::State);
    }
}
