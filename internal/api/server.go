package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/lazrossi/vitesse-bateau-paris/internal/broadcast"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

type Server struct {
	store  *store.Store
	router chi.Router
	logger *slog.Logger
	hub    *broadcast.Hub
	srv    *http.Server
	opts   Options
	cache  *ttlCache
}

// Options carries optional, deployment-specific features.
type Options struct {
	SwimSites   []store.SwimSite
	SwimRadiusM int
}

func NewServer(s *store.Store, hub *broadcast.Hub, logger *slog.Logger, opts Options) *Server {
	if opts.SwimRadiusM <= 0 {
		opts.SwimRadiusM = 300
	}
	srv := &Server{
		store:  s,
		hub:    hub,
		logger: logger,
		opts:   opts,
		cache:  newTTLCache(),
	}
	srv.setupRouter()
	return srv
}

func (s *Server) setupRouter() {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	r.Get("/health", s.handleHealth)
	// Local-only audience summary (see hits.go); not under /api on purpose.
	r.Get("/admin/traffic", s.handleTraffic)

	// REST endpoints: 30 s request timeout.
	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))
		r.Route("/api", func(r chi.Router) {
			r.Get("/stats", s.handleStats)
			r.Get("/offenders", s.handleOffenders)
			r.Get("/offenders/{mmsi}", s.handleOffenderDetail)
			r.Get("/infractions", s.handleInfractions)
			r.Get("/infractions/{id}", s.handleInfractionDetail)
			r.Get("/fastest", s.handleFastest)
			r.Get("/live", s.handleLive)
			r.Get("/stats/recent", s.handleRecentStats)
			r.Get("/trends", s.handleTrends)
			r.Get("/offenders/{mmsi}/trends", s.handleVesselTrends)
			r.Get("/operators", s.handleOperators)
			r.Get("/operators/{slug}/trends", s.handleOperatorTrends)
			r.Get("/swim-sites", s.handleSwimSites)
			r.Get("/months/{month}/boats", s.handleMonthBoats)
			r.Post("/hit", s.handleHit)
		})
	})

	// CSV exports can take longer than 30 s to stream on slow clients.
	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(5 * time.Minute))
		r.Route("/api/export", func(r chi.Router) {
			r.Get("/infractions.csv", s.handleExportInfractions)
			r.Get("/boat-days.csv", s.handleExportBoatDays)
		})
	})

	// WebSocket endpoint must not be wrapped in a request timeout —
	// hijacked connections are long-lived.
	r.Get("/api/ws/live", s.handleWSLive)

	s.router = r
}

func (s *Server) ListenAndServe(bind string, port int) error {
	addr := fmt.Sprintf("%s:%d", bind, port)
	s.srv = &http.Server{
		Addr:    addr,
		Handler: s.router,
		// No global timeouts: WriteTimeout would kill the WebSocket write
		// pump after the first 30 s. ReadHeaderTimeout protects against
		// slowloris on the REST endpoints; WriteTimeout is handled per
		// REST request via the chi Timeout middleware above.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	s.logger.Info("API server starting", "addr", addr)
	return s.srv.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.srv != nil {
		return s.srv.Shutdown(ctx)
	}
	return nil
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
