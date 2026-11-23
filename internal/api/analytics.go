package api

import (
	"net/http"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

// ttlCache memoises expensive aggregate responses for a short time. The
// frontend already caches via ISR; this protects the DB from parallel
// revalidations and direct API consumers.
type ttlCache struct {
	mu sync.Mutex
	m  map[string]cacheEntry
}

type cacheEntry struct {
	v   any
	exp time.Time
}

func newTTLCache() *ttlCache { return &ttlCache{m: map[string]cacheEntry{}} }

func (c *ttlCache) get(key string, ttl time.Duration, fn func() (any, error)) (any, error) {
	c.mu.Lock()
	if e, ok := c.m[key]; ok && time.Now().Before(e.exp) {
		c.mu.Unlock()
		return e.v, nil
	}
	c.mu.Unlock()
	v, err := fn()
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.m[key] = cacheEntry{v: v, exp: time.Now().Add(ttl)}
	c.mu.Unlock()
	return v, nil
}

func (s *Server) cached(w http.ResponseWriter, key string, ttl time.Duration, fn func() (any, error)) {
	v, err := s.cache.get(key, ttl, fn)
	if err != nil {
		s.logger.Error("query", "key", key, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func period(r *http.Request) string {
	if r.URL.Query().Get("period") == "month" {
		return "month"
	}
	return "week"
}

func emptyIfNil[T any](v []T) []T {
	if v == nil {
		return []T{}
	}
	return v
}

func (s *Server) handleRecentStats(w http.ResponseWriter, r *http.Request) {
	s.cached(w, "recent", time.Minute, func() (any, error) { return s.store.RecentStats(r.Context()) })
}

func (s *Server) handleTrends(w http.ResponseWriter, r *http.Request) {
	p := period(r)
	s.cached(w, "trends:"+p, 10*time.Minute, func() (any, error) {
		t, err := s.store.Trends(r.Context(), p)
		return emptyIfNil(t), err
	})
}

func (s *Server) handleVesselTrends(w http.ResponseWriter, r *http.Request) {
	mmsi, err := strconv.Atoi(chi.URLParam(r, "mmsi"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid mmsi"})
		return
	}
	p := period(r)
	s.cached(w, "vtrends:"+strconv.Itoa(mmsi)+":"+p, 10*time.Minute, func() (any, error) {
		t, err := s.store.VesselTrends(r.Context(), mmsi, p)
		return emptyIfNil(t), err
	})
}

func (s *Server) handleOperators(w http.ResponseWriter, r *http.Request) {
	s.cached(w, "operators", 10*time.Minute, func() (any, error) {
		o, err := s.store.Operators(r.Context())
		return emptyIfNil(o), err
	})
}

func (s *Server) handleOperatorTrends(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	p := period(r)
	s.cached(w, "otrends:"+slug+":"+p, 10*time.Minute, func() (any, error) {
		t, err := s.store.OperatorTrends(r.Context(), slug, p)
		return emptyIfNil(t), err
	})
}

func (s *Server) handleSwimSites(w http.ResponseWriter, r *http.Request) {
	s.cached(w, "swim", 30*time.Minute, func() (any, error) {
		st, err := s.store.SwimSiteStats(r.Context(), s.opts.SwimSites, s.opts.SwimRadiusM)
		return emptyIfNil(st), err
	})
}

func (s *Server) handleExportInfractions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="exces.csv"`)
	if err := s.store.ExportInfractionsCSV(r.Context(), w); err != nil {
		s.logger.Error("export infractions", "error", err)
	}
}

func (s *Server) handleExportBoatDays(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="bateaux-jours.csv"`)
	if err := s.store.ExportBoatDaysCSV(r.Context(), w); err != nil {
		s.logger.Error("export boat days", "error", err)
	}
}

var monthRe = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

func (s *Server) handleMonthBoats(w http.ResponseWriter, r *http.Request) {
	month := chi.URLParam(r, "month")
	if !monthRe.MatchString(month) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid month"})
		return
	}
	s.cached(w, "month:"+month, 30*time.Minute, func() (any, error) {
		b, err := s.store.MonthTopBoats(r.Context(), month, 6*3600, 20)
		return emptyIfNil(b), err
	})
}

var _ = store.SwimSite{}
