// Package main starts the OpenDesk AI Gateway server.
//
// The Gateway is a stateless WebSocket router that manages connections
// between Rust desktop clients and the Node.js backend via Redis Pub/Sub.
// It holds zero business logic — it just forwards messages.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	ws "github.com/opendesk-ai/gateway/internal/websocket"
)

func main() {
	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "8080"
	}

	hub := ws.NewHub()

	mux := http.NewServeMux()

	// WebSocket endpoint for Rust desktop clients.
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.HandleConnection(hub, w, r)
	})

	// Health check endpoint.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"ok","service":"opendesk-gateway","connections":%d}`, hub.ConnectedCount())
	})

	server := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Graceful shutdown on SIGTERM/SIGINT.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-quit
		log.Println("🛑 Shutting down gateway...")
		server.Close()
	}()

	log.Printf("🌐 OpenDesk AI Gateway running on ws://localhost:%s/ws", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("❌ Server error: %v", err)
	}
}
