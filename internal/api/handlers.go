package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.store.GetStats(r.Context())
	if err != nil {
		s.logger.Error("get stats", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) handleOffenders(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 25)
	if limit > 100 {
		limit = 100
	}

	offenders, err := s.store.TopOffenders(r.Context(), limit)
	if err != nil {
		s.logger.Error("get offenders", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if offenders == nil {
		offenders = []store.Offender{}
	}
	writeJSON(w, http.StatusOK, offenders)
}

func (s *Server) handleOffenderDetail(w http.ResponseWriter, r *http.Request) {
	mmsiStr := chi.URLParam(r, "mmsi")
	mmsi, err := strconv.Atoi(mmsiStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid mmsi"})
		return
	}

	offender, infractions, err := s.store.OffenderDetail(r.Context(), mmsi)
	if err != nil {
		s.logger.Error("get offender detail", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if offender == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "offender not found"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"offender":    offender,
		"infractions": infractions,
	})
}

func (s *Server) handleInfractions(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	if limit > 2000 {
		limit = 2000
	}
	sinceHours := queryInt(r, "since_hours", 0)
	if sinceHours > 24*365 {
		sinceHours = 24 * 365
	}

	infractions, err := s.store.RecentInfractions(r.Context(), limit, sinceHours)
	if err != nil {
		s.logger.Error("get infractions", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if infractions == nil {
		infractions = []store.Infraction{}
	}
	writeJSON(w, http.StatusOK, infractions)
}

func (s *Server) handleInfractionDetail(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	inf, err := s.store.GetInfraction(r.Context(), id)
	if err != nil {
		s.logger.Error("get infraction", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if inf == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "infraction not found"})
		return
	}
	writeJSON(w, http.StatusOK, inf)
}

func (s *Server) handleFastest(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 20)
	if limit > 200 {
		limit = 200
	}

	rows, err := s.store.FastestVessels(r.Context(), limit)
	if err != nil {
		s.logger.Error("get fastest", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if rows == nil {
		rows = []store.VesselSpeedRow{}
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Server) handleLive(w http.ResponseWriter, r *http.Request) {
	sinceMinutes := queryInt(r, "since_minutes", 10)
	if sinceMinutes < 1 {
		sinceMinutes = 10
	}
	if sinceMinutes > 60 {
		sinceMinutes = 60
	}

	positions, err := s.store.LivePositions(r.Context(), sinceMinutes)
	if err != nil {
		s.logger.Error("get live positions", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}
	if positions == nil {
		positions = []store.LivePosition{}
	}
	writeJSON(w, http.StatusOK, positions)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func queryInt(r *http.Request, key string, defaultVal int) int {
	s := r.URL.Query().Get(key)
	if s == "" {
		return defaultVal
	}
	v, err := strconv.Atoi(s)
	if err != nil || v < 1 {
		return defaultVal
	}
	return v
}
