package api

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/lazrossi/vitesse-bateau-paris/internal/broadcast"
)

// upgrader for /api/ws/live. CheckOrigin is permissive because the service
// is consumed by the same site (proxied via nginx) and an open-origin
// public-data feed; tighten if/when authentication is added.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	wsWriteWait      = 10 * time.Second
	wsPongWait       = 60 * time.Second
	wsPingPeriod     = 30 * time.Second
	wsClientSendBuf  = 64
)

// handleWSLive upgrades the connection and streams every position broadcast
// by the AIS ingester to this client. One JSON-encoded store.LivePosition
// per message. The client should consume them and merge into its in-memory
// map keyed by mmsi.
func (s *Server) handleWSLive(w http.ResponseWriter, r *http.Request) {
	if s.hub == nil {
		http.Error(w, "live updates not enabled", http.StatusServiceUnavailable)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade writes its own response on failure; just log.
		s.logger.Warn("ws upgrade", "error", err)
		return
	}

	client := &broadcast.Client{Send: make(chan []byte, wsClientSendBuf)}
	s.hub.Register(client)

	go s.wsReadPump(conn, client)
	s.wsWritePump(conn, client)
}

// wsWritePump owns the connection's writes and ping cadence.
func (s *Server) wsWritePump(conn *websocket.Conn, client *broadcast.Client) {
	ticker := time.NewTicker(wsPingPeriod)
	defer func() {
		ticker.Stop()
		s.hub.Unregister(client)
		conn.Close()
	}()

	for {
		select {
		case msg, ok := <-client.Send:
			conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if !ok {
				// Hub closed the channel.
				_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// wsReadPump owns the connection's reads. We don't expect inbound payloads
// from clients, but reading is required to receive pongs and notice when
// the client has disconnected.
func (s *Server) wsReadPump(conn *websocket.Conn, client *broadcast.Client) {
	defer func() {
		s.hub.Unregister(client)
		conn.Close()
	}()
	conn.SetReadLimit(512)
	conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
