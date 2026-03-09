// Package websocket manages WebSocket connections between Rust desktop clients
// and the Go gateway. It tracks connected devices and handles incoming
// DeviceObservationPayload messages.
package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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
// The first message from the client must be a valid DeviceObservationPayload
// containing the deviceId, which is used to register the connection.
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

		// Register on first valid message.
		if deviceID == "" {
			deviceID = payload.DeviceID
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
