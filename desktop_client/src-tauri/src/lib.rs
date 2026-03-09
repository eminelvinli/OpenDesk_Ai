//! OpenDesk AI Desktop Client — Tauri Application Entry Point
//!
//! This is the main library that Tauri loads. It registers commands
//! and plugins, then runs the Tauri application event loop.
//!
//! Architecture note: This client is a "dumb terminal" — it captures
//! the screen and executes coordinate-based actions. All AI reasoning
//! happens in the Node.js backend.

use serde::{Deserialize, Serialize};

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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running OpenDesk AI desktop client");
}
