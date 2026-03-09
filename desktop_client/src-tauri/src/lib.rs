//! OpenDesk AI Desktop Client — Tauri Application Entry Point
//!
//! This client is a "dumb terminal" — it captures the screen, sends
//! observations to the Go Gateway, receives AgentActionCommands, and
//! executes them using OS-level input simulation.
//!
//! All AI reasoning happens in the Node.js backend.

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use enigo::{
    Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};
use futures_util::{SinkExt, StreamExt};
use image::codecs::jpeg::JpegEncoder;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use xcap::Monitor;

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
// Configuration
// ---------------------------------------------------------------------------

const GATEWAY_WS_URL: &str = "ws://localhost:8080/ws";
const OBSERVATION_INTERVAL_SECS: u64 = 5;
const RECONNECT_DELAY_SECS: u64 = 3;
const MAX_RECONNECT_DELAY_SECS: u64 = 30;
const DEVICE_ID: &str = "dev-rust-001";

/// JPEG quality for screenshot compression (1–100). Lower = smaller payload.
const JPEG_QUALITY: u8 = 60;

// ---------------------------------------------------------------------------
// Screen Capture (xcap)
// ---------------------------------------------------------------------------

/// Capture the primary monitor and return a JPEG-encoded base64 data URI
/// along with the screen dimensions.
///
/// Pipeline: xcap → RgbaImage → JPEG encode → base64 string.
fn capture_screen() -> Result<(String, ScreenBounds), String> {
    // Get the primary monitor.
    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    let monitor = monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitors found".to_string())?;

    let width = monitor.width();
    let height = monitor.height();

    // Capture the screen as an RGBA image.
    let image = monitor
        .capture_image()
        .map_err(|e| format!("Screen capture failed: {}", e))?;

    // Encode to JPEG for a smaller payload.
    let mut jpeg_buf: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut jpeg_buf);
    let encoder = JpegEncoder::new_with_quality(&mut cursor, JPEG_QUALITY);
    image
        .write_with_encoder(encoder)
        .map_err(|e| format!("JPEG encoding failed: {}", e))?;

    // Encode to base64 with data URI prefix.
    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_buf);
    let data_uri = format!("data:image/jpeg;base64,{}", b64);

    Ok((
        data_uri,
        ScreenBounds {
            width,
            height,
        },
    ))
}

/// Build a DeviceObservationPayload with a real screenshot.
fn create_observation() -> Result<DeviceObservationPayload, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let (screen_base64, screen_bounds) = capture_screen()?;

    Ok(DeviceObservationPayload {
        device_id: DEVICE_ID.to_string(),
        timestamp,
        screen_base64,
        screen_bounds,
    })
}

// ---------------------------------------------------------------------------
// Command Execution (enigo)
// ---------------------------------------------------------------------------

/// Validate that coordinates are within screen bounds.
/// Prevents enigo from moving the mouse to invalid positions.
fn validate_coords(coords: &ScreenCoordinates, bounds: &ScreenBounds) -> bool {
    coords.x >= 0
        && coords.y >= 0
        && (coords.x as u32) <= bounds.width
        && (coords.y as u32) <= bounds.height
}

/// Execute an AgentActionCommand using enigo for OS-level input simulation.
///
/// Coordinate validation is performed before any mouse action to prevent
/// moving the cursor outside the screen bounds.
fn execute_command(
    enigo: &mut Enigo,
    command: &AgentActionCommand,
    screen_bounds: &ScreenBounds,
) -> Result<(), String> {
    match command.action {
        AgentActionType::MouseMove => {
            let coords = command
                .coordinates
                .as_ref()
                .ok_or("mouse_move requires coordinates")?;

            if !validate_coords(coords, screen_bounds) {
                return Err(format!(
                    "Coordinates ({}, {}) out of bounds ({}x{})",
                    coords.x, coords.y, screen_bounds.width, screen_bounds.height
                ));
            }

            enigo
                .move_mouse(coords.x, coords.y, Coordinate::Abs)
                .map_err(|e| format!("mouse_move failed: {}", e))?;

            info!("🖱️  Moved mouse to ({}, {})", coords.x, coords.y);
        }

        AgentActionType::MouseClick => {
            let coords = command
                .coordinates
                .as_ref()
                .ok_or("mouse_click requires coordinates")?;

            if !validate_coords(coords, screen_bounds) {
                return Err(format!(
                    "Coordinates ({}, {}) out of bounds ({}x{})",
                    coords.x, coords.y, screen_bounds.width, screen_bounds.height
                ));
            }

            enigo
                .move_mouse(coords.x, coords.y, Coordinate::Abs)
                .map_err(|e| format!("move before click failed: {}", e))?;
            enigo
                .button(enigo::Button::Left, Direction::Click)
                .map_err(|e| format!("mouse_click failed: {}", e))?;

            info!("🖱️  Clicked at ({}, {})", coords.x, coords.y);
        }

        AgentActionType::MouseDoubleClick => {
            let coords = command
                .coordinates
                .as_ref()
                .ok_or("mouse_double_click requires coordinates")?;

            if !validate_coords(coords, screen_bounds) {
                return Err(format!(
                    "Coordinates ({}, {}) out of bounds ({}x{})",
                    coords.x, coords.y, screen_bounds.width, screen_bounds.height
                ));
            }

            enigo
                .move_mouse(coords.x, coords.y, Coordinate::Abs)
                .map_err(|e| format!("move before double click failed: {}", e))?;
            enigo
                .button(enigo::Button::Left, Direction::Click)
                .map_err(|e| format!("double click (1) failed: {}", e))?;
            enigo
                .button(enigo::Button::Left, Direction::Click)
                .map_err(|e| format!("double click (2) failed: {}", e))?;

            info!("🖱️  Double-clicked at ({}, {})", coords.x, coords.y);
        }

        AgentActionType::KeyboardType => {
            let text = command
                .text
                .as_ref()
                .ok_or("keyboard_type requires text")?;

            enigo
                .text(text)
                .map_err(|e| format!("keyboard_type failed: {}", e))?;

            info!("⌨️  Typed: \"{}\"", text);
        }

        AgentActionType::KeyboardPress => {
            let key_str = command
                .key
                .as_ref()
                .ok_or("keyboard_press requires key")?;

            let key = map_key_string(key_str)?;
            enigo
                .key(key, Direction::Click)
                .map_err(|e| format!("keyboard_press failed: {}", e))?;

            info!("🔑 Pressed key: \"{}\"", key_str);
        }

        AgentActionType::Done => {
            info!("✅ Agent signaled done — no action to execute");
        }
    }

    Ok(())
}

/// Map a key name string to an enigo Key enum value.
/// Supports common keys used by Vision LLMs.
fn map_key_string(key: &str) -> Result<Key, String> {
    match key.to_lowercase().as_str() {
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "backspace" => Ok(Key::Backspace),
        "delete" => Ok(Key::Delete),
        "space" => Ok(Key::Space),
        "up" | "arrowup" => Ok(Key::UpArrow),
        "down" | "arrowdown" => Ok(Key::DownArrow),
        "left" | "arrowleft" => Ok(Key::LeftArrow),
        "right" | "arrowright" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        #[cfg(target_os = "macos")]
        "command" | "meta" | "cmd" => Ok(Key::Meta),
        #[cfg(not(target_os = "macos"))]
        "command" | "meta" | "super" | "win" => Ok(Key::Meta),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" | "option" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        // Single character keys (a-z, 0-9, punctuation).
        s if s.len() == 1 => {
            let c = s.chars().next().unwrap();
            Ok(Key::Unicode(c))
        }
        _ => Err(format!("Unknown key: \"{}\"", key)),
    }
}

// ---------------------------------------------------------------------------
// WebSocket Loop (with real capture + execution)
// ---------------------------------------------------------------------------

/// Run the WebSocket client loop with real screen capture and command execution.
///
/// - Sends real screenshots as JPEG base64 every 5 seconds.
/// - Parses incoming AgentActionCommands and executes them via enigo.
/// - Reconnects with exponential backoff on disconnection.
async fn websocket_loop() {
    let mut reconnect_delay = RECONNECT_DELAY_SECS;

    // Track the latest screen bounds for coordinate validation.
    let current_bounds = Arc::new(std::sync::Mutex::new(ScreenBounds {
        width: 1920,
        height: 1080,
    }));

    loop {
        info!("🔗 Connecting to gateway: {}", GATEWAY_WS_URL);

        match connect_async(GATEWAY_WS_URL).await {
            Ok((ws_stream, _response)) => {
                info!("✅ Connected to gateway!");
                reconnect_delay = RECONNECT_DELAY_SECS;

                let (mut write, mut read) = ws_stream.split();
                let is_connected = Arc::new(AtomicBool::new(true));
                let bounds_for_reader = Arc::clone(&current_bounds);
                let connected_flag = Arc::clone(&is_connected);

                // READER: Handle incoming commands from the backend.
                let reader = tokio::spawn(async move {
                    // Create enigo instance for OS input simulation.
                    let mut enigo = match Enigo::new(&Settings::default()) {
                        Ok(e) => e,
                        Err(e) => {
                            error!("❌ Failed to create enigo instance: {:?}", e);
                            return;
                        }
                    };

                    while let Some(msg_result) = read.next().await {
                        match msg_result {
                            Ok(Message::Text(text)) => {
                                match serde_json::from_str::<AgentActionCommand>(&text) {
                                    Ok(cmd) => {
                                        info!("🎯 Received command: {:?}", cmd.action);

                                        let bounds = bounds_for_reader.lock().unwrap().clone();
                                        if let Err(e) = execute_command(&mut enigo, &cmd, &bounds) {
                                            error!("❌ Execution failed: {}", e);
                                        }
                                    }
                                    Err(_) => {
                                        // Not a command (ACK or status message).
                                        info!("📨 Gateway: {}", text);
                                    }
                                }
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

                    connected_flag.store(false, Ordering::SeqCst);
                });

                // WRITER: Send real screen observations periodically.
                while is_connected.load(Ordering::SeqCst) {
                    match create_observation() {
                        Ok(observation) => {
                            // Update current screen bounds.
                            {
                                let mut bounds = current_bounds.lock().unwrap();
                                *bounds = observation.screen_bounds.clone();
                            }

                            let payload_size = observation.screen_base64.len();
                            info!(
                                "📸 Captured {}x{} | JPEG base64: {} KB",
                                observation.screen_bounds.width,
                                observation.screen_bounds.height,
                                payload_size / 1024
                            );

                            let json = match serde_json::to_string(&observation) {
                                Ok(j) => j,
                                Err(e) => {
                                    error!("❌ Serialization error: {}", e);
                                    break;
                                }
                            };

                            if write.send(Message::Text(json.into())).await.is_err() {
                                warn!("⚠️  Send failed — connection lost");
                                break;
                            }
                        }
                        Err(e) => {
                            error!("❌ Screen capture failed: {}", e);
                            // Continue trying — monitor might become available.
                        }
                    }

                    sleep(Duration::from_secs(OBSERVATION_INTERVAL_SECS)).await;
                }

                reader.abort();
            }
            Err(e) => {
                error!("❌ Connection failed: {} — retrying in {}s", e, reconnect_delay);
            }
        }

        sleep(Duration::from_secs(reconnect_delay)).await;
        reconnect_delay = (reconnect_delay * 2).min(MAX_RECONNECT_DELAY_SECS);
    }
}

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Simple greeting command for testing the Tauri IPC bridge.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello {}! OpenDesk AI client is running.", name)
}

// ---------------------------------------------------------------------------
// Application Entry Point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|_app| {
            tokio::spawn(async {
                info!("🚀 Starting screen capture + WebSocket client...");
                websocket_loop().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenDesk AI desktop client");
}
