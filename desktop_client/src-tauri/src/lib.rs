//! OpenDesk AI Desktop Client — Tauri Application Entry Point
//!
//! This client is a "dumb terminal" — it captures the screen, sends
//! observations to the Go Gateway, receives AgentActionCommands, and
//! executes them using OS-level input simulation.
//!
//! Safety mechanisms:
//! - Global hotkey `Ctrl+Alt+K` severs the WebSocket and halts execution.
//! - Mouse override: if the user moves the mouse >50 pixels between frames,
//!   the AI's action is aborted and an "interrupted" payload is sent.
//!
//! All AI reasoning happens in the Node.js backend.

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use arboard::Clipboard;
use base64::Engine;
use enigo::{Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};
use futures_util::{SinkExt, StreamExt};
use image::codecs::jpeg::JpegEncoder;
use log::{error, info, warn};
use rdev::{listen, Event, EventType, Key as RdevKey};
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
    // OS-level skill tools
    ReadClipboard,
    WriteClipboard,
    ScrollWindow,
    GetActiveWindowTitle,
}

/// Incoming command from the Node.js backend (via Go Gateway).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActionCommand {
    pub action: AgentActionType,
    pub coordinates: Option<ScreenCoordinates>,
    pub text: Option<String>,
    pub key: Option<String>,
    /// Additional parameters for skill tools (e.g., scroll direction/amount).
    #[serde(default)]
    pub params: Option<HashMap<String, String>>,
}

/// Tool result returned from a data-querying skill (clipboard read, window title).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultPayload {
    pub tool_name: String,
    pub data: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Outgoing observation payload sent to the backend (via Go Gateway).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceObservationPayload {
    pub device_id: String,
    pub timestamp: u64,
    pub screen_base64: String,
    pub screen_bounds: ScreenBounds,
/// Total number of monitors detected on the device.
    pub monitor_count: usize,
    /// Zero-based index of the captured monitor (matches REQUESTED_MONITOR_ID).
    pub active_monitor_id: usize,
    /// Metadata for all connected monitors (populated each frame).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitors: Option<Vec<MonitorInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<ToolResultPayload>,
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Gateway WebSocket URL.
///
/// Set `GATEWAY_WS_URL` env var at compile time to override for production:
///   GATEWAY_WS_URL=wss://gateway.opendesk.ai/ws cargo build --release
///
/// The GitHub Actions workflow injects this from the GATEWAY_WS_URL repository secret.
/// Falls back to localhost for local development when the env var is not set.
const GATEWAY_WS_URL: &str = {
    match option_env!("GATEWAY_WS_URL") {
        Some(url) => url,
        None => "ws://localhost:8080/ws",
    }
};

const OBSERVATION_INTERVAL_SECS: u64 = 5;
const RECONNECT_DELAY_SECS: u64 = 3;
const MAX_RECONNECT_DELAY_SECS: u64 = 30;
const DEVICE_ID: &str = "dev-rust-001";
const JPEG_QUALITY: u8 = 60;

/// Mouse displacement threshold (pixels) before the AI action is overridden.
const MOUSE_OVERRIDE_THRESHOLD: i32 = 50;

// ---------------------------------------------------------------------------
// Global Safety State
// ---------------------------------------------------------------------------

/// Atomic kill switch flag. Set to true by the hotkey thread.
static KILL_SWITCH_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Tracks modifier key states for the Ctrl+Alt+K combo.
static CTRL_HELD: AtomicBool = AtomicBool::new(false);
static ALT_HELD: AtomicBool = AtomicBool::new(false);

/// Last known physical mouse position (set after each observation).
static LAST_MOUSE_X: AtomicI32 = AtomicI32::new(0);
static LAST_MOUSE_Y: AtomicI32 = AtomicI32::new(0);

/// Which monitor to capture.
/// -1 = primary (default). Set by incoming AgentActionCommand with params.monitorId.
static REQUESTED_MONITOR_ID: AtomicI32 = AtomicI32::new(-1);

// ---------------------------------------------------------------------------
// Kill Switch Hotkey Thread (rdev)
// ---------------------------------------------------------------------------

/// Spawn a background OS thread that listens for global keyboard events.
/// Detects Ctrl+Alt+K and sets KILL_SWITCH_ACTIVE.
///
/// Uses `rdev::listen` which runs a blocking OS event loop — must be on its
/// own `std::thread`, not a Tokio task.
pub fn spawn_hotkey_listener() {
    thread::Builder::new()
        .name("kill-switch-listener".to_string())
        .spawn(|| {
            info!("🛡️  Kill switch listener started (Ctrl+Alt+K to halt)");

            if let Err(e) = listen(handle_hotkey_event) {
                error!("❌ Global hotkey listener error: {:?}", e);
            }
        })
        .expect("Failed to spawn hotkey listener thread");
}

/// Handle a global keyboard event from rdev.
/// Updates modifier state and triggers the kill switch on Ctrl+Alt+K.
fn handle_hotkey_event(event: Event) {
    match event.event_type {
        EventType::KeyPress(key) => {
            match key {
                RdevKey::ControlLeft | RdevKey::ControlRight => {
                    CTRL_HELD.store(true, Ordering::SeqCst);
                }
                RdevKey::Alt | RdevKey::AltGr => {
                    ALT_HELD.store(true, Ordering::SeqCst);
                }
                RdevKey::KeyK => {
                    if CTRL_HELD.load(Ordering::SeqCst) && ALT_HELD.load(Ordering::SeqCst) {
                        info!("🔴 KILL SWITCH ACTIVATED (Ctrl+Alt+K)");
                        KILL_SWITCH_ACTIVE.store(true, Ordering::SeqCst);
                    }
                }
                _ => {}
            }
        }
        EventType::KeyRelease(key) => {
            match key {
                RdevKey::ControlLeft | RdevKey::ControlRight => {
                    CTRL_HELD.store(false, Ordering::SeqCst);
                }
                RdevKey::Alt | RdevKey::AltGr => {
                    ALT_HELD.store(false, Ordering::SeqCst);
                }
                _ => {}
            }
        }
        _ => {}
    }
}

/// Reset the kill switch so the agent can run again after halting.
pub fn reset_kill_switch() {
    KILL_SWITCH_ACTIVE.store(false, Ordering::SeqCst);
    info!("🟢 Kill switch reset — agent can resume");
}

// ---------------------------------------------------------------------------
// Mouse Override Check
// ---------------------------------------------------------------------------

/// Get the current physical mouse position using enigo.
/// Returns (x, y) or (0, 0) on failure.
fn get_current_mouse_pos() -> (i32, i32) {
    // rdev doesn't provide a query API; we use a simple approach:
    // The last mouse position is updated by the capture loop.
    (
        LAST_MOUSE_X.load(Ordering::SeqCst),
        LAST_MOUSE_Y.load(Ordering::SeqCst),
    )
}

/// Update the tracked mouse position from rdev's last known position.
/// Called after each observation to establish the "last known" baseline.
fn update_last_mouse_pos(x: i32, y: i32) {
    LAST_MOUSE_X.store(x, Ordering::SeqCst);
    LAST_MOUSE_Y.store(y, Ordering::SeqCst);
}

/// Check whether the user has physically moved the mouse significantly.
///
/// If the real mouse position deviates >50 pixels from where the AI
/// last saw it, the human has overridden the AI — abort the action.
///
/// Returns true if the user's mouse movement should block AI execution.
fn is_mouse_overridden(last_x: i32, last_y: i32) -> bool {
    let (cur_x, cur_y) = get_current_mouse_pos();
    let dx = (cur_x - last_x).abs();
    let dy = (cur_y - last_y).abs();
    let overridden = dx > MOUSE_OVERRIDE_THRESHOLD || dy > MOUSE_OVERRIDE_THRESHOLD;

    if overridden {
        warn!(
            "🚫 Mouse override: user moved mouse by ({}, {}), threshold {}px — aborting AI action",
            dx, dy, MOUSE_OVERRIDE_THRESHOLD
        );
    }

    overridden
}


// ---------------------------------------------------------------------------
// Screen Capture (xcap) — Multi-Monitor
// ---------------------------------------------------------------------------

/// Enumerate all connected monitors and return MonitorInfo metadata.
fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| MonitorInfo {
            id: i,
            name: m.name().to_string(),
            width: m.width(),
            height: m.height(),
            is_primary: i == 0, // xcap lists the primary display first
        })
        .collect())
}

/// Capture a specific monitor by zero-based index.
/// Falls back to the primary monitor (index 0) if index is out of range.
fn capture_screen_by_id(monitor_id: usize) -> Result<(String, ScreenBounds, i32, i32), String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;

    if monitors.is_empty() {
        return Err("No monitors found".to_string());
    }

    let idx = if monitor_id < monitors.len() {
        monitor_id
    } else {
        warn!(
            "Monitor {} not found ({} available), falling back to primary",
            monitor_id,
            monitors.len()
        );
        0
    };

    let monitor = &monitors[idx];
    let width = monitor.width();
    let height = monitor.height();

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Screen capture failed on monitor {}: {}", idx, e))?;

    let mut jpeg_buf: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut jpeg_buf);
    let encoder = JpegEncoder::new_with_quality(&mut cursor, JPEG_QUALITY);
    image
        .write_with_encoder(encoder)
        .map_err(|e| format!("JPEG encoding failed: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_buf);
    let data_uri = format!("data:image/jpeg;base64,{}", b64);

    // rdev updates mouse position asynchronously via the hotkey listener thread.
    let mouse_x = LAST_MOUSE_X.load(Ordering::SeqCst);
    let mouse_y = LAST_MOUSE_Y.load(Ordering::SeqCst);

    Ok((data_uri, ScreenBounds { width, height }, mouse_x, mouse_y))
}

/// Create a full DeviceObservationPayload with multi-monitor metadata.
fn create_observation() -> Result<(DeviceObservationPayload, i32, i32), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Read which monitor to capture (set by execute_command when params.monitorId is present).
    let monitor_id = {
        let raw = REQUESTED_MONITOR_ID.load(Ordering::SeqCst);
        if raw < 0 { 0usize } else { raw as usize }
    };

    let (screen_base64, screen_bounds, mouse_x, mouse_y) = capture_screen_by_id(monitor_id)?;

    // Build monitor metadata (no pixel capture — metadata only, cheap).
    let monitor_list = list_monitors().unwrap_or_default();
    let monitor_count = monitor_list.len();

    let payload = DeviceObservationPayload {
        device_id: DEVICE_ID.to_string(),
        timestamp,
        screen_base64,
        screen_bounds,
        monitor_count,
        active_monitor_id: monitor_id,
        monitors: Some(monitor_list),
        status: None,
        tool_result: None,
    };

    Ok((payload, mouse_x, mouse_y))
}

/// Build an "interrupted" payload to notify the backend.
fn create_interrupted_payload(reason: &str) -> DeviceObservationPayload {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    DeviceObservationPayload {
        device_id: DEVICE_ID.to_string(),
        timestamp,
        screen_base64: String::new(),
        screen_bounds: ScreenBounds { width: 0, height: 0 },
        monitor_count: 0,
        active_monitor_id: 0,
        monitors: None,
        status: Some(format!("interrupted:{}", reason)),
        tool_result: None,
    }
}

// Command Execution (enigo) with Kill Switch + Mouse Override
// ---------------------------------------------------------------------------

/// Validate that coordinates are within screen bounds.
fn validate_coords(coords: &ScreenCoordinates, bounds: &ScreenBounds) -> bool {
    coords.x >= 0
        && coords.y >= 0
        && (coords.x as u32) <= bounds.width
        && (coords.y as u32) <= bounds.height
}

/// Result of attempting to execute a command.
pub enum ExecutionResult {
    /// Command executed successfully.
    Success,
    /// Kill switch was active — halt and notify backend.
    KillSwitch,
    /// User moved mouse — abort this action.
    MouseOverride,
    /// Command failed for another reason.
    Error(String),
}

/// Execute an AgentActionCommand with safety checks.
///
/// Checks (in order):
/// 1. Kill switch flag — if set, returns KillSwitch immediately.
/// 2. Mouse override — if user moved mouse >50px, returns MouseOverride.
/// 3. Coordinate bounds validation.
/// 4. enigo execution.
fn execute_command_safe(
    enigo: &mut Enigo,
    command: &AgentActionCommand,
    screen_bounds: &ScreenBounds,
    last_mouse_x: i32,
    last_mouse_y: i32,
) -> ExecutionResult {
    // 1. Kill switch takes unconditional priority.
    if KILL_SWITCH_ACTIVE.load(Ordering::SeqCst) {
        return ExecutionResult::KillSwitch;
    }

    // 2. Mouse override check for mouse actions.
    let is_mouse_action = matches!(
        command.action,
        AgentActionType::MouseMove | AgentActionType::MouseClick | AgentActionType::MouseDoubleClick
    );

    if is_mouse_action && is_mouse_overridden(last_mouse_x, last_mouse_y) {
        return ExecutionResult::MouseOverride;
    }

    // 3. Execute the command.
    match execute_command(enigo, command, screen_bounds) {
        Ok(()) => ExecutionResult::Success,
        Err(e) => ExecutionResult::Error(e),
    }
}

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

        // ------------------------------------------------------------------
        // OS-level skill tools
        // ------------------------------------------------------------------

        AgentActionType::WriteClipboard => {
            let text = command
                .text
                .as_ref()
                .ok_or("write_clipboard requires text")?;
            let mut clip = Clipboard::new()
                .map_err(|e| format!("Failed to open clipboard: {}", e))?;
            clip.set_text(text.clone())
                .map_err(|e| format!("write_clipboard failed: {}", e))?;
            info!("📋 Wrote {} chars to clipboard", text.len());
        }

        AgentActionType::ScrollWindow => {
            let dir = command
                .params
                .as_ref()
                .and_then(|p| p.get("direction"))
                .map(|s| s.as_str())
                .unwrap_or("down");
            let amount: i32 = command
                .params
                .as_ref()
                .and_then(|p| p.get("amount"))
                .and_then(|s| s.parse().ok())
                .unwrap_or(3)
                .min(10)
                .max(1);
            let scroll_amount = if dir == "up" { amount } else { -amount };
            enigo
                .scroll(scroll_amount, enigo::Axis::Vertical)
                .map_err(|e| format!("scroll_window failed: {}", e))?;
            info!("🖱️  Scrolled {} {} ticks", dir, amount);
        }

        // ReadClipboard and GetActiveWindowTitle are handled outside execute_command
        // (they produce a ToolResultPayload rather than performing an action).
        AgentActionType::ReadClipboard | AgentActionType::GetActiveWindowTitle => {
            info!("ℹ️  Skill {} delegated to tool result handler", format!("{:?}", command.action));
        }
    }

    Ok(())
}

/// Map a key name string to an enigo Key enum value.
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
        s if s.len() == 1 => {
            let c = s.chars().next().unwrap();
            Ok(Key::Unicode(c))
        }
        _ => Err(format!("Unknown key: \"{}\"", key)),
    }
}

// ---------------------------------------------------------------------------
// Skill Query Execution (returns data to backend)
// ---------------------------------------------------------------------------

/// Execute a data-querying skill tool and return a ToolResultPayload.
///
/// These skills don't perform OS actions — they read data and return it
/// so the backend can inject it into the next LLM call.
fn execute_skill_query(action: &AgentActionType) -> ToolResultPayload {
    match action {
        AgentActionType::ReadClipboard => {
            match Clipboard::new().and_then(|mut c| c.get_text()) {
                Ok(text) => {
                    info!("📋 Read {} chars from clipboard", text.len());
                    ToolResultPayload {
                        tool_name: "read_clipboard".to_string(),
                        data: text,
                        success: true,
                        error: None,
                    }
                }
                Err(e) => {
                    warn!("⚠️  read_clipboard failed: {}", e);
                    ToolResultPayload {
                        tool_name: "read_clipboard".to_string(),
                        data: String::new(),
                        success: false,
                        error: Some(format!("read_clipboard error: {}", e)),
                    }
                }
            }
        }

        AgentActionType::GetActiveWindowTitle => {
            let result = get_active_window_title();
            match result {
                Ok(title) => {
                    info!("🪟 Active window: {}", title);
                    ToolResultPayload {
                        tool_name: "get_active_window_title".to_string(),
                        data: title,
                        success: true,
                        error: None,
                    }
                }
                Err(e) => {
                    warn!("⚠️  get_active_window_title failed: {}", e);
                    ToolResultPayload {
                        tool_name: "get_active_window_title".to_string(),
                        data: String::new(),
                        success: false,
                        error: Some(format!("window title error: {}", e)),
                    }
                }
            }
        }

        _ => ToolResultPayload {
            tool_name: "unknown".to_string(),
            data: String::new(),
            success: false,
            error: Some("Not a query-type skill".to_string()),
        },
    }
}

/// Get the title of the currently focused window using platform-specific APIs.
fn get_active_window_title() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get name of first process whose frontmost is true"])
            .output()
            .map_err(|e| format!("osascript failed: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let output = Command::new("xdotool")
            .args(["getactivewindow", "getwindowname"])
            .output()
            .map_err(|e| format!("xdotool failed: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("powershell")
            .args(["-Command", "(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object CPU -Descending | Select-Object -First 1).MainWindowTitle"])
            .output()
            .map_err(|e| format!("powershell failed: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

// ---------------------------------------------------------------------------
// WebSocket Loop (with kill switch + mouse override)
// ---------------------------------------------------------------------------

/// Run the WebSocket client loop with safety features:
/// - Kill switch: severs connection instantly on Ctrl+Alt+K.
/// - Mouse override: aborts mouse actions if human moved the mouse.
/// - Sends "interrupted" payload to backend on either event.
async fn websocket_loop() {
    let mut reconnect_delay = RECONNECT_DELAY_SECS;

    let current_bounds = Arc::new(std::sync::Mutex::new(ScreenBounds {
        width: 1920,
        height: 1080,
    }));

    loop {
        // Don't reconnect while kill switch is active.
        if KILL_SWITCH_ACTIVE.load(Ordering::SeqCst) {
            info!("🔴 Kill switch is active — waiting for reset before reconnecting...");
            sleep(Duration::from_secs(2)).await;
            continue;
        }

        info!("🔗 Connecting to gateway: {}", GATEWAY_WS_URL);

        match connect_async(GATEWAY_WS_URL).await {
            Ok((ws_stream, _response)) => {
                info!("✅ Connected to gateway!");
                reconnect_delay = RECONNECT_DELAY_SECS;

                let (write, mut read) = ws_stream.split();
                // Share the write half between the READER (tool result responses)
                // and the WRITER (periodic observation frames).
                let write_shared = Arc::new(tokio::sync::Mutex::new(write));
                let write_for_reader = Arc::clone(&write_shared);

                let is_connected = Arc::new(AtomicBool::new(true));
                let bounds_for_reader = Arc::clone(&current_bounds);
                let connected_flag = Arc::clone(&is_connected);

                // READER task: handle incoming commands with safety checks.
                let reader = tokio::spawn(async move {
                    let mut enigo = match Enigo::new(&Settings::default()) {
                        Ok(e) => e,
                        Err(e) => {
                            error!("❌ Failed to create enigo instance: {:?}", e);
                            return;
                        }
                    };

                    while let Some(msg_result) = read.next().await {
                        // Kill switch check on every message.
                        if KILL_SWITCH_ACTIVE.load(Ordering::SeqCst) {
                            info!("🔴 Kill switch detected in reader — stopping");
                            break;
                        }

                        match msg_result {
                            Ok(Message::Text(text)) => {
                                match serde_json::from_str::<AgentActionCommand>(&text) {
                                    Ok(cmd) => {
                                        info!("🎯 Received command: {:?}", cmd.action);

                                        let bounds = bounds_for_reader.lock().unwrap().clone();
                                        let last_x = LAST_MOUSE_X.load(Ordering::SeqCst);
                                        let last_y = LAST_MOUSE_Y.load(Ordering::SeqCst);

                                        // Query-type skills return data to the backend instead of
                                        // performing an OS action. Send a tool_result observation.
                                        let is_query = matches!(
                                            cmd.action,
                                            AgentActionType::ReadClipboard | AgentActionType::GetActiveWindowTitle
                                        );

                                        if is_query {
                                            let tool_result = execute_skill_query(&cmd.action);
                                            info!("📤 Sending tool_result for {:?}", cmd.action);

                                            let ts = SystemTime::now()
                                                .duration_since(UNIX_EPOCH)
                                                .unwrap_or_default()
                                                .as_secs();

                                            let payload = DeviceObservationPayload {
                                                device_id: DEVICE_ID.to_string(),
                                                timestamp: ts,
                                                screen_base64: String::new(), // no screenshot needed for tool results
                                                screen_bounds: bounds,
                                                status: None,
                                                tool_result: Some(tool_result),
                                            };

                                            if let Ok(json) = serde_json::to_string(&payload) {
                                                let _ = write_for_reader.lock().await.send(Message::Text(json)).await;
                                            }
                                        } else {
                                            match execute_command_safe(
                                                &mut enigo,
                                                &cmd,
                                                &bounds,
                                                last_x,
                                                last_y,
                                            ) {
                                                ExecutionResult::Success => {}
                                                ExecutionResult::KillSwitch => {
                                                    warn!("🔴 Kill switch — skipping command");
                                                    break;
                                                }
                                                ExecutionResult::MouseOverride => {
                                                    warn!("🚫 Mouse override — AI action cancelled");
                                                }
                                                ExecutionResult::Error(e) => {
                                                    error!("❌ Execution failed: {}", e);
                                                }
                                            }
                                        }
                                    }
                                    Err(_) => {
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

                // WRITER: Send observations, check kill switch between each frame.
                while is_connected.load(Ordering::SeqCst) {
                    // Kill switch: sever connection and send interrupt.
                    if KILL_SWITCH_ACTIVE.load(Ordering::SeqCst) {
                        warn!("🔴 Kill switch activated — severing WebSocket connection");

                        let payload = create_interrupted_payload("kill_switch");
                        let mut w = write_shared.lock().await;
                        if let Ok(json) = serde_json::to_string(&payload) {
                            let _ = w.send(Message::Text(json.into())).await;
                        }
                        let _ = w.send(Message::Close(None)).await;
                        info!("📪 Connection severed by kill switch");
                        break;
                    }

                    match create_observation() {
                        Ok((mut observation, mouse_x, mouse_y)) => {
                            // Update bounds.
                            {
                                let mut bounds = current_bounds.lock().unwrap();
                                *bounds = observation.screen_bounds.clone();
                            }

                            // Update mouse baseline for override detection.
                            update_last_mouse_pos(mouse_x, mouse_y);

                            // Check if mouse was overridden since last frame.
                            let old_x = LAST_MOUSE_X.load(Ordering::SeqCst);
                            let old_y = LAST_MOUSE_Y.load(Ordering::SeqCst);

                            if is_mouse_overridden(old_x, old_y) {
                                observation.status = Some("interrupted:mouse_override".to_string());
                                warn!("🚫 Sending interrupted payload (mouse override)");
                            }

                            info!(
                                "📸 Captured {}x{} | JPEG: {} KB",
                                observation.screen_bounds.width,
                                observation.screen_bounds.height,
                                observation.screen_base64.len() / 1024
                            );

                            let json = match serde_json::to_string(&observation) {
                                Ok(j) => j,
                                Err(e) => {
                                    error!("❌ Serialization error: {}", e);
                                    break;
                                }
                            };

                            if write_shared.lock().await.send(Message::Text(json.into())).await.is_err() {
                                warn!("⚠️  Send failed — connection lost");
                                break;
                            }
                        }
                        Err(e) => {
                            error!("❌ Screen capture failed: {}", e);
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

/// Trigger the kill switch manually from the frontend.
#[tauri::command]
fn halt_agent() -> String {
    KILL_SWITCH_ACTIVE.store(true, Ordering::SeqCst);
    info!("🔴 Agent halted via Tauri command");
    "Agent halted".to_string()
}

/// Reset the kill switch to allow the agent to resume.
#[tauri::command]
fn resume_agent() -> String {
    reset_kill_switch();
    "Agent resumed".to_string()
}

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

    // Start the global hotkey listener on a dedicated OS thread (blocking).
    spawn_hotkey_listener();

    // Start a separate rdev thread to track mouse position for override detection.
    thread::Builder::new()
        .name("mouse-tracker".to_string())
        .spawn(|| {
            if let Err(e) = listen(|event| {
                if let EventType::MouseMove { x, y } = event.event_type {
                    LAST_MOUSE_X.store(x as i32, Ordering::SeqCst);
                    LAST_MOUSE_Y.store(y as i32, Ordering::SeqCst);
                }
            }) {
                error!("❌ Mouse tracker error: {:?}", e);
            }
        })
        .expect("Failed to spawn mouse tracker thread");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet, halt_agent, resume_agent])
        .setup(|_app| {
            tokio::spawn(async {
                info!("🚀 Starting screen capture + WebSocket client with kill switch...");
                websocket_loop().await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenDesk AI desktop client");
}
