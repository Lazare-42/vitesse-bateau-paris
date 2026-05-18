// Package broadcast provides an in-memory fan-out hub used to push live
// position updates from the AIS ingester to connected WebSocket clients.
//
// The hub has no knowledge of the message format: it accepts []byte and
// delivers it to every registered client. Sends are non-blocking; if a
// client's send buffer is full, the message for that client is dropped
// rather than stalling the broadcaster.
package broadcast

import (
	"log/slog"
	"sync"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]struct{}
	logger  *slog.Logger
}

// Client is a registered receiver. Messages arrive on Send; the consumer
// (typically a WebSocket write pump) is responsible for ranging over Send
// and flushing to the wire. When the consumer is done it must call
// hub.Unregister(client), which closes Send.
type Client struct {
	Send chan []byte
}

func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients: make(map[*Client]struct{}),
		logger:  logger,
	}
}

func (h *Hub) Register(c *Client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.Send)
	}
	h.mu.Unlock()
}

func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.Send <- msg:
		default:
			// Slow client; drop this message for them. The next will arrive.
		}
	}
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
