// Package pubsub manages Redis Pub/Sub communication between the Go Gateway
// and the Node.js backend. It subscribes to command channels and routes
// incoming commands to the correct WebSocket client.
package pubsub

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/redis/go-redis/v9"

	ws "github.com/opendesk-ai/gateway/internal/websocket"
)

// AgentCommandEnvelope wraps an AgentActionCommand with routing info.
// This is the shape published by the Node.js backend to Redis.
type AgentCommandEnvelope struct {
	DeviceID string          `json:"deviceId"`
	Command  json.RawMessage `json:"command"`
}

// Subscriber listens to Redis Pub/Sub and routes commands to WebSocket clients.
type Subscriber struct {
	client *redis.Client
	hub    *ws.Hub
}

// NewSubscriber creates a Redis client and returns a Subscriber.
func NewSubscriber(hub *ws.Hub) *Subscriber {
	redisHost := os.Getenv("REDIS_HOST")
	if redisHost == "" {
		redisHost = "localhost"
	}
	redisPort := os.Getenv("REDIS_PORT")
	if redisPort == "" {
		redisPort = "6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: redisHost + ":" + redisPort,
	})

	return &Subscriber{
		client: rdb,
		hub:    hub,
	}
}

// Listen subscribes to the `agent_commands` channel and routes incoming
// commands to the correct WebSocket client based on deviceId.
//
// This function blocks — call it in a goroutine.
func (s *Subscriber) Listen(ctx context.Context) {
	sub := s.client.Subscribe(ctx, "agent_commands")
	defer sub.Close()

	// Wait for confirmation that subscription is created.
	_, err := sub.Receive(ctx)
	if err != nil {
		log.Printf("❌ Redis subscription failed: %v", err)
		return
	}

	log.Println("📡 Subscribed to Redis channel: agent_commands")

	ch := sub.Channel()

	for {
		select {
		case <-ctx.Done():
			log.Println("🛑 Redis subscriber shutting down")
			return
		case msg, ok := <-ch:
			if !ok {
				log.Println("⚠️  Redis channel closed")
				return
			}
			s.handleMessage(msg.Payload)
		}
	}
}

// handleMessage parses an incoming Redis message and forwards the command
// to the correct WebSocket client.
func (s *Subscriber) handleMessage(payload string) {
	var envelope AgentCommandEnvelope
	if err := json.Unmarshal([]byte(payload), &envelope); err != nil {
		log.Printf("⚠️  Invalid command envelope: %v", err)
		return
	}

	if envelope.DeviceID == "" {
		log.Println("⚠️  Command missing deviceId, dropping")
		return
	}

	log.Printf("📬 Command for device %s (%d bytes)", envelope.DeviceID, len(envelope.Command))

	// Look up the WebSocket client and send the command.
	if err := s.hub.SendToDevice(envelope.DeviceID, envelope.Command); err != nil {
		log.Printf("⚠️  Failed to send command to %s: %v", envelope.DeviceID, err)
	}
}

// Ping tests the Redis connection.
func (s *Subscriber) Ping(ctx context.Context) error {
	return s.client.Ping(ctx).Err()
}
