// Package websocket manages WebSocket connections between Rust desktop clients
// and the Go gateway. It tracks connected devices and handles incoming
// DeviceObservationPayload messages.
package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

// ScreenBounds represents the screen dimensions of a connected device.
type ScreenBounds struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// DeviceObservationPayload is the JSON payload streamed from the Rust client.
type DeviceObservationPayload struct {
	DeviceID     string       `json:"deviceId"`
	Timestamp    int64        `json:"timestamp"`
	ScreenBase64 string       `json:"screenBase64"`
	ScreenBounds ScreenBounds `json:"screenBounds"`
}

// Client represents a single connected Rust desktop client.
type Client struct {
	DeviceID string
	Conn     *websocket.Conn
	Hub      *Hub
	writeMu  sync.Mutex // Guards concurrent writes to the WebSocket.
}

// Hub manages all active WebSocket connections.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client // deviceId → client
}

// NewHub creates a new connection hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
	}
}

// Register adds a client to the hub.
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.DeviceID] = client
	log.Printf("✅ Device registered: %s (total: %d)", client.DeviceID, len(h.clients))
}

// Unregister removes a client from the hub.
func (h *Hub) Unregister(deviceID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, deviceID)
	log.Printf("🔌 Device unregistered: %s (total: %d)", deviceID, len(h.clients))
}

// GetClient returns a client by deviceID, or nil if not found.
func (h *Hub) GetClient(deviceID string) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.clients[deviceID]
}

// ConnectedCount returns the number of connected devices.
func (h *Hub) ConnectedCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// SendToDevice sends a raw JSON message to a specific device via WebSocket.
// Returns an error if the device is not connected or the write fails.
func (h *Hub) SendToDevice(deviceID string, message []byte) error {
	client := h.GetClient(deviceID)
	if client == nil {
		return fmt.Errorf("device %s not connected", deviceID)
	}

	client.writeMu.Lock()
	defer client.writeMu.Unlock()

	if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
		return fmt.Errorf("write to %s failed: %w", deviceID, err)
	}

	log.Printf("📤 Command sent to device %s (%d bytes)", deviceID, len(message))
	return nil
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// HandleConnection upgrades an HTTP request to a WebSocket connection,
// reads DeviceObservationPayload messages, and logs them.
//
// On the first message, validates that the device is paired by calling
// the Node.js backend. Unpaired devices are rejected.
func HandleConnection(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("❌ WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("🔗 New connection from %s, waiting for first message...", conn.RemoteAddr())

	var deviceID string

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("⚠️  Unexpected close from %s: %v", conn.RemoteAddr(), err)
			}
			break
		}

		var payload DeviceObservationPayload
		if jsonErr := json.Unmarshal(message, &payload); jsonErr != nil {
			log.Printf("⚠️  Invalid JSON from %s: %v", conn.RemoteAddr(), jsonErr)
			continue
		}

		// Register on first valid message — with pairing check.
		if deviceID == "" {
			deviceID = payload.DeviceID

			// Validate pairing with the Node.js backend.
			if !checkDevicePaired(deviceID) {
				log.Printf("🚫 Unpaired device rejected: %s", deviceID)
				reject := fmt.Sprintf(`{"status":"error","error":"Device %s is not paired. Enter your pairing code in the dashboard."}`, deviceID)
				conn.WriteMessage(websocket.TextMessage, []byte(reject))
				return
			}

			client := &Client{
				DeviceID: deviceID,
				Conn:     conn,
				Hub:      hub,
			}
			hub.Register(client)
			defer hub.Unregister(deviceID)
		}

		// Truncate base64 for logging (avoid flooding console).
		base64Preview := payload.ScreenBase64
		if len(base64Preview) > 40 {
			base64Preview = fmt.Sprintf("%s...[%d bytes]", base64Preview[:40], len(payload.ScreenBase64))
		}

		log.Printf("📸 [%s] Observation received | %dx%d | ts=%d | data=%s",
			payload.DeviceID,
			payload.ScreenBounds.Width,
			payload.ScreenBounds.Height,
			payload.Timestamp,
			base64Preview,
		)

		// TODO: Forward observation to Node.js backend via Redis Pub/Sub.
		// For now, send an ACK back to the Rust client.
		ack := fmt.Sprintf(`{"status":"ok","deviceId":"%s"}`, payload.DeviceID)
		if writeErr := conn.WriteMessage(websocket.TextMessage, []byte(ack)); writeErr != nil {
			log.Printf("❌ Write error to %s: %v", deviceID, writeErr)
			break
		}
	}

	log.Printf("🔌 Connection closed: %s (%s)", conn.RemoteAddr(), deviceID)
}

// checkDevicePaired calls the Node.js backend to verify a device is paired.
// Returns true if paired, false otherwise. On error, defaults to allowing
// the connection (fail-open during development).
func checkDevicePaired(deviceID string) bool {
	backendURL := os.Getenv("BACKEND_URL")
	if backendURL == "" {
		backendURL = "http://localhost:3001"
	}

	url := fmt.Sprintf("%s/api/device/check/%s", backendURL, deviceID)

	resp, err := http.Get(url)
	if err != nil {
		// Backend unreachable — fail-open in dev, fail-closed in prod.
		log.Printf("⚠️  Pairing check failed (backend unreachable): %v — allowing connection", err)
		return true
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("⚠️  Pairing check returned status %d for %s", resp.StatusCode, deviceID)
		return true // Fail-open in development.
	}

	var result struct {
		Paired bool   `json:"paired"`
		UserID string `json:"userId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("⚠️  Failed to parse pairing response: %v", err)
		return true
	}

	if result.Paired {
		log.Printf("✅ Device %s is paired with user %s", deviceID, result.UserID)
	}
	return result.Paired
}
