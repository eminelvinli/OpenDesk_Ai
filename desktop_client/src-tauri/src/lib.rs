//! OpenDesk AI Desktop Client — Tauri Application Entry Point
//!
//! This is the main library that Tauri loads. It registers commands
//! and plugins, then runs the Tauri application event loop.
//!
//! Architecture note: This client is a "dumb terminal" — it captures
//! the screen and executes coordinate-based actions. All AI reasoning
//! happens in the Node.js backend.

use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

// ---------------------------------------------------------------------------
// Payload types (mirrors backend/src/types/index.ts)
// ---------------------------------------------------------------------------

/// Screen coordinates on the user's display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCoordinates {
    pub x: i32,
    pub y: i32,
}

/// Screen dimensions reported to the backend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenBounds {
    pub width: u32,
    pub height: u32,
}

/// All possible action types the backend can instruct us to perform.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentActionType {
    MouseMove,
    MouseClick,
    MouseDoubleClick,
    KeyboardType,
    KeyboardPress,
    Done,
}

/// Incoming command from the Node.js backend (via Go Gateway).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActionCommand {
    pub action: AgentActionType,
    pub coordinates: Option<ScreenCoordinates>,
    pub text: Option<String>,
    pub key: Option<String>,
}

/// Outgoing observation payload sent to the backend (via Go Gateway).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceObservationPayload {
    pub device_id: String,
    pub timestamp: u64,
    pub screen_base64: String,
    pub screen_bounds: ScreenBounds,
}

// ---------------------------------------------------------------------------
// WebSocket connection (Rust → Go Gateway)
// ---------------------------------------------------------------------------

/// Gateway WebSocket URL. In production, read from config or env var.
const GATEWAY_WS_URL: &str = "ws://localhost:8080/ws";

/// Interval between observation sends (seconds).
const OBSERVATION_INTERVAL_SECS: u64 = 5;

/// Delay before reconnecting after a failure (seconds).
const RECONNECT_DELAY_SECS: u64 = 3;

/// Maximum reconnect delay with exponential backoff (seconds).
const MAX_RECONNECT_DELAY_SECS: u64 = 30;

/// Dummy device ID for testing. In production, this comes from the pairing process.
const DEVICE_ID: &str = "dev-rust-001";

/// Create a dummy DeviceObservationPayload for testing the WebSocket bridge.
fn create_dummy_observation() -> DeviceObservationPayload {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Generate a small dummy "screenshot" (a few bytes of fake data).
    let fake_pixels: Vec<u8> = vec![0xFF; 64]; // 64 bytes of white pixels
    let screen_base64 = format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&fake_pixels)
    );

    DeviceObservationPayload {
        device_id: DEVICE_ID.to_string(),
        timestamp,
        screen_base64,
        screen_bounds: ScreenBounds {
            width: 1920,
            height: 1080,
        },
    }
}

/// Run the WebSocket client loop with automatic reconnection.
///
/// On connection failure, waits with exponential backoff before retrying.
/// Once connected, sends a dummy DeviceObservationPayload every 5 seconds
/// and listens for ACK responses from the Go Gateway.
async fn websocket_loop() {
    let mut reconnect_delay = RECONNECT_DELAY_SECS;

    loop {
        info!("🔗 Connecting to gateway: {}", GATEWAY_WS_URL);

        match connect_async(GATEWAY_WS_URL).await {
            Ok((ws_stream, _response)) => {
                info!("✅ Connected to gateway!");
                reconnect_delay = RECONNECT_DELAY_SECS; // Reset backoff on success.

                let (mut write, mut read) = ws_stream.split();

                // Spawn a reader task to handle incoming messages (ACKs, commands).
                let reader = tokio::spawn(async move {
                    while let Some(msg_result) = read.next().await {
                        match msg_result {
                            Ok(Message::Text(text)) => {
                                info!("📨 Gateway response: {}", text);
                            }
                            Ok(Message::Close(_)) => {
                                info!("🔌 Gateway closed the connection");
                                break;
                            }
                            Err(e) => {
                                error!("❌ Read error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }
                });

                // Send observations every OBSERVATION_INTERVAL_SECS.
                loop {
                    let observation = create_dummy_observation();
                    let json = match serde_json::to_string(&observation) {
                        Ok(j) => j,
                        Err(e) => {
                            error!("❌ Serialization error: {}", e);
                            break;
                        }
                    };

                    info!(
                        "📸 Sending observation | device={} | {}x{} | ts={}",
                        observation.device_id,
                        observation.screen_bounds.width,
                        observation.screen_bounds.height,
                        observation.timestamp
                    );

                    if write.send(Message::Text(json.into())).await.is_err() {
                        warn!("⚠️  Send failed — connection lost");
                        break;
                    }

                    sleep(Duration::from_secs(OBSERVATION_INTERVAL_SECS)).await;
                }

                // Clean up the reader task.
                reader.abort();
            }
            Err(e) => {
                error!(
                    "❌ Connection failed: {} — retrying in {}s",
                    e, reconnect_delay
                );
            }
        }

        // Exponential backoff before reconnecting.
        sleep(Duration::from_secs(reconnect_delay)).await;
        reconnect_delay = (reconnect_delay * 2).min(MAX_RECONNECT_DELAY_SECS);
    }
}

// ---------------------------------------------------------------------------
// Tauri commands (exposed to the frontend webview)
// ---------------------------------------------------------------------------

/// Simple greeting command for testing the Tauri IPC bridge.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello {}! OpenDesk AI client is running.", name)
}

// ---------------------------------------------------------------------------
// Application setup
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|_app| {
            // Spawn the WebSocket client as a background Tokio task.
            // It runs independently of the Tauri UI event loop.
            tokio::spawn(async {
                info!("🚀 Starting WebSocket client...");
                websocket_loop().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenDesk AI desktop client");
}
