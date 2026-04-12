package ais

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

const (
	wsURL = "wss://stream.aisstream.io/v0/stream"

	// Throttle normal (non-violating) position writes to 1 per vessel per 5 min.
	// Violations are always stored at full resolution.
	positionThrottle = 5 * time.Minute

	// If no ping received for this long, close the active infraction session.
	sessionTimeout = 2 * time.Minute
)

// activeSession tracks an ongoing speeding infraction for a single vessel.
type activeSession struct {
	mmsi      int
	name      string
	limit     float64
	startLat  float64
	startLon  float64
	endLat    float64
	endLon    float64
	startedAt time.Time
	lastPing  time.Time
	maxSpeed  float64
	sumSpeed  float64
	pingCount int
}

type Client struct {
	apiKey     string
	bbox       [4]float64 // sw_lat, sw_lon, ne_lat, ne_lon
	speedLimit float64    // knots
	store      *store.Store
	logger     *slog.Logger

	mu       sync.Mutex
	lastSave map[int]time.Time          // mmsi -> last non-violation position save
	sessions map[int]*activeSession      // mmsi -> active speeding session
}

// AIS protocol types

type subscriptionMessage struct {
	APIKey             string            `json:"APIKey"`
	BoundingBoxes      [][][2]float64    `json:"BoundingBoxes"`
	FilterMessageTypes []string          `json:"FilterMessageTypes,omitempty"`
}

type aisStreamMessage struct {
	MetaData    map[string]interface{} `json:"MetaData"`
	MessageType string                 `json:"MessageType"`
	Message     json.RawMessage        `json:"Message"`
}

type positionReport struct {
	UserID      int     `json:"UserID"` // MMSI
	Sog         float64 `json:"Sog"`    // Speed Over Ground in knots
	Latitude    float64 `json:"Latitude"`
	Longitude   float64 `json:"Longitude"`
	Cog         float64 `json:"Cog"`         // Course Over Ground
	TrueHeading int     `json:"TrueHeading"`
}

type shipStaticData struct {
	UserID   int    `json:"UserID"`
	CallSign string `json:"CallSign"`
	Name     string `json:"Name"`
	Type     int    `json:"Type"`
}

func NewClient(apiKey string, bbox [4]float64, speedLimit float64, s *store.Store, logger *slog.Logger) *Client {
	return &Client{
		apiKey:     apiKey,
		bbox:       bbox,
		speedLimit: speedLimit,
		store:      s,
		logger:     logger,
		lastSave:   make(map[int]time.Time),
		sessions:   make(map[int]*activeSession),
	}
}

func (c *Client) Run(ctx context.Context) error {
	// Background goroutine to flush timed-out sessions
	go c.sessionReaper(ctx)

	for {
		if err := c.connect(ctx); err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			c.logger.Error("websocket connection lost", "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
			c.logger.Info("reconnecting to aisstream.io...")
		}
	}
}

// sessionReaper periodically closes sessions that haven't received a ping.
func (c *Client) sessionReaper(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Flush all remaining sessions on shutdown
			c.mu.Lock()
			for mmsi, sess := range c.sessions {
				c.flushSession(ctx, sess)
				delete(c.sessions, mmsi)
			}
			c.mu.Unlock()
			return
		case <-ticker.C:
			c.mu.Lock()
			now := time.Now()
			for mmsi, sess := range c.sessions {
				if now.Sub(sess.lastPing) >= sessionTimeout {
					c.flushSession(ctx, sess)
					delete(c.sessions, mmsi)
				}
			}
			c.mu.Unlock()
		}
	}
}

func (c *Client) connect(ctx context.Context) error {
	c.logger.Info("connecting to aisstream.io", "bbox", c.bbox)

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	sub := subscriptionMessage{
		APIKey: c.apiKey,
		BoundingBoxes: [][][2]float64{
			{
				{c.bbox[0], c.bbox[1]}, // SW corner
				{c.bbox[2], c.bbox[3]}, // NE corner
			},
		},
		FilterMessageTypes: []string{
			"PositionReport",
			"StandardClassBPositionReport",
			"ShipStaticData",
		},
	}

	if err := conn.WriteJSON(sub); err != nil {
		return fmt.Errorf("send subscription: %w", err)
	}
	c.logger.Info("subscribed to AIS stream")

	// Read loop
	for {
		select {
		case <-ctx.Done():
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return ctx.Err()
		default:
		}

		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}

		var msg aisStreamMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.logger.Warn("unmarshal message", "error", err)
			continue
		}

		c.handleMessage(ctx, &msg)
	}
}

func (c *Client) handleMessage(ctx context.Context, msg *aisStreamMessage) {
	shipName := metaString(msg.MetaData, "ShipName")

	switch msg.MessageType {
	case "PositionReport", "StandardClassBPositionReport":
		c.handlePosition(ctx, msg, shipName)
	case "ShipStaticData":
		c.handleStatic(ctx, msg)
	}
}

func (c *Client) handlePosition(ctx context.Context, msg *aisStreamMessage, shipName string) {
	var pos positionReport

	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(msg.Message, &envelope); err != nil {
		c.logger.Warn("parse position envelope", "error", err)
		return
	}

	raw, ok := envelope[msg.MessageType]
	if !ok {
		c.logger.Warn("missing message type key in envelope", "type", msg.MessageType)
		return
	}

	if err := json.Unmarshal(raw, &pos); err != nil {
		c.logger.Warn("parse position", "error", err)
		return
	}

	if pos.UserID == 0 || (pos.Latitude == 0 && pos.Longitude == 0) {
		return
	}
	if pos.Sog >= 102.3 { // AIS "not available" sentinel
		return
	}

	// Ensure vessel exists
	if err := c.store.UpsertVessel(ctx, pos.UserID, shipName, "", 0); err != nil {
		c.logger.Error("upsert vessel", "error", err, "mmsi", pos.UserID)
		return
	}

	isSpeeding := pos.Sog > c.speedLimit

	// Position storage: full resolution for violations, throttled otherwise
	storePosition := isSpeeding
	if !isSpeeding {
		c.mu.Lock()
		if last, ok := c.lastSave[pos.UserID]; !ok || time.Since(last) >= positionThrottle {
			storePosition = true
			c.lastSave[pos.UserID] = time.Now()
		}
		c.mu.Unlock()
	}

	if storePosition {
		if err := c.store.InsertPosition(ctx, pos.UserID, pos.Latitude, pos.Longitude,
			pos.Sog, pos.Cog, pos.TrueHeading); err != nil {
			c.logger.Error("insert position", "error", err, "mmsi", pos.UserID)
			return
		}
	}

	// Infraction session tracking
	c.mu.Lock()
	sess, hasSession := c.sessions[pos.UserID]

	if isSpeeding {
		now := time.Now()
		if !hasSession {
			// Start new infraction session
			sess = &activeSession{
				mmsi:      pos.UserID,
				name:      shipName,
				limit:     c.speedLimit,
				startLat:  pos.Latitude,
				startLon:  pos.Longitude,
				endLat:    pos.Latitude,
				endLon:    pos.Longitude,
				startedAt: now,
				lastPing:  now,
				maxSpeed:  pos.Sog,
				sumSpeed:  pos.Sog,
				pingCount: 1,
			}
			c.sessions[pos.UserID] = sess

			c.logger.Warn("infraction started",
				"mmsi", pos.UserID,
				"name", shipName,
				"speed_knots", math.Round(pos.Sog*10)/10,
				"limit_knots", c.speedLimit,
				"lat", pos.Latitude,
				"lon", pos.Longitude,
			)
		} else {
			// Continue existing session
			sess.endLat = pos.Latitude
			sess.endLon = pos.Longitude
			sess.lastPing = now
			sess.sumSpeed += pos.Sog
			sess.pingCount++
			if pos.Sog > sess.maxSpeed {
				sess.maxSpeed = pos.Sog
			}
			if shipName != "" && sess.name == "" {
				sess.name = shipName
			}
		}
	} else if hasSession {
		// Speed dropped below limit — close the session
		c.flushSession(ctx, sess)
		delete(c.sessions, pos.UserID)
	}
	c.mu.Unlock()
}

// flushSession writes a completed infraction to the database. Must be called with c.mu held.
func (c *Client) flushSession(ctx context.Context, sess *activeSession) {
	inf := &store.Infraction{
		MMSI:            sess.mmsi,
		VesselName:      sess.name,
		MaxSpeedKnots:   math.Round(sess.maxSpeed*10) / 10,
		AvgSpeedKnots:   math.Round(sess.sumSpeed/float64(sess.pingCount)*10) / 10,
		SpeedLimitKnots: sess.limit,
		StartLat:        sess.startLat,
		StartLon:        sess.startLon,
		EndLat:          sess.endLat,
		EndLon:          sess.endLon,
		StartedAt:       sess.startedAt,
		EndedAt:         sess.lastPing,
		PingCount:       sess.pingCount,
	}

	c.logger.Warn("infraction ended",
		"mmsi", sess.mmsi,
		"name", sess.name,
		"max_speed_knots", inf.MaxSpeedKnots,
		"avg_speed_knots", inf.AvgSpeedKnots,
		"duration", sess.lastPing.Sub(sess.startedAt).Round(time.Second),
		"pings", sess.pingCount,
	)

	if err := c.store.InsertInfraction(ctx, inf); err != nil {
		c.logger.Error("insert infraction", "error", err, "mmsi", sess.mmsi)
	}
}

func (c *Client) handleStatic(ctx context.Context, msg *aisStreamMessage) {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(msg.Message, &envelope); err != nil {
		return
	}
	raw, ok := envelope["ShipStaticData"]
	if !ok {
		return
	}

	var sd shipStaticData
	if err := json.Unmarshal(raw, &sd); err != nil {
		return
	}
	if sd.UserID == 0 {
		return
	}

	if err := c.store.UpsertVessel(ctx, sd.UserID, sd.Name, sd.CallSign, sd.Type); err != nil {
		c.logger.Error("upsert vessel static", "error", err, "mmsi", sd.UserID)
	}
}

func metaString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}
