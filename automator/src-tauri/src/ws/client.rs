use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;
use std::sync::Arc;

/// WebSocket client for connecting to the OpenDirector server.
pub struct WsClient {
    sender: Option<Arc<Mutex<futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >>>>,
    connected: bool,
}

impl WsClient {
    pub fn new() -> Self {
        Self {
            sender: None,
            connected: false,
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    /// Connect to the OpenDirector WebSocket server and join a show room.
    pub async fn connect(
        &mut self,
        server_url: &str,
        show_id: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        // Convert http(s) URL to ws(s) URL
        let ws_url = server_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");
        let ws_url = format!("{}/ws", ws_url.trim_end_matches('/'));

        log::info!("Connecting to WebSocket at {}", ws_url);

        let (ws_stream, _) = tokio_tungstenite::connect_async(&ws_url)
            .await
            .map_err(|e| format!("Failed to connect to WebSocket: {}", e))?;

        let (sender, mut receiver) = ws_stream.split();
        let sender = Arc::new(Mutex::new(sender));

        // Join show room
        let join_msg = serde_json::json!({
            "type": "join",
            "showId": show_id
        });
        {
            let mut s = sender.lock().await;
            s.send(Message::Text(join_msg.to_string()))
                .await
                .map_err(|e| format!("Failed to join show room: {}", e))?;
        }

        self.sender = Some(sender.clone());
        self.connected = true;

        // Spawn reader loop — emits Tauri events for each WS message
        let app = app_handle.clone();
        tokio::spawn(async move {
            while let Some(msg_result) = receiver.next().await {
                match msg_result {
                    Ok(Message::Text(text)) => {
                        log::debug!("WS << {}", text);

                        // Try to parse and route by channel
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                            let channel = parsed
                                .get("channel")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown");

                            match channel {
                                "rundown" => {
                                    let _ = app.emit("ws-rundown", text.clone());
                                }
                                "execution" => {
                                    let _ = app.emit("ws-execution", text.clone());
                                }
                                "tally" => {
                                    let _ = app.emit("ws-tally", text.clone());
                                }
                                "media" => {
                                    let _ = app.emit("ws-media", text.clone());
                                }
                                "prompter" => {
                                    // Automator ignores prompter messages
                                }
                                _ => {
                                    let _ = app.emit("ws-message", text.clone());
                                }
                            }
                        } else {
                            let _ = app.emit("ws-message", text);
                        }
                    }
                    Ok(Message::Close(_)) => {
                        log::warn!("WebSocket connection closed by server");
                        let _ = app.emit("ws-disconnected", ());
                        break;
                    }
                    Ok(Message::Ping(data)) => {
                        // Respond with pong (tungstenite handles this automatically in most cases)
                        let mut s = sender.lock().await;
                        let _ = s.send(Message::Pong(data)).await;
                    }
                    Err(e) => {
                        log::error!("WebSocket read error: {}", e);
                        let _ = app.emit("ws-disconnected", ());
                        break;
                    }
                    _ => {}
                }
            }
        });

        log::info!("Connected to WebSocket and joined show {}", show_id);
        Ok(())
    }

    /// Send a JSON message through the WebSocket.
    pub async fn send(&self, message: &serde_json::Value) -> Result<(), String> {
        let sender = self
            .sender
            .as_ref()
            .ok_or_else(|| "WebSocket not connected".to_string())?;

        let mut s = sender.lock().await;
        s.send(Message::Text(message.to_string()))
            .await
            .map_err(|e| format!("Failed to send WebSocket message: {}", e))
    }

    /// Disconnect the WebSocket.
    pub async fn disconnect(&mut self) {
        if let Some(sender) = self.sender.take() {
            let mut s = sender.lock().await;
            let _ = s.close().await;
        }
        self.connected = false;
        log::info!("Disconnected from WebSocket");
    }
}
