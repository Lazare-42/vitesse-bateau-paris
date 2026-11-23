// Package jobs runs periodic maintenance: the boat_days aggregate refresh and
// the river-flow import.
package jobs

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/lazrossi/vitesse-bateau-paris/internal/river"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

type Runner struct {
	store   *store.Store
	logger  *slog.Logger
	station string
	http    *http.Client
}

func New(s *store.Store, station string, logger *slog.Logger) *Runner {
	return &Runner{store: s, station: station, logger: logger, http: &http.Client{Timeout: 30 * time.Second}}
}

// Run blocks until ctx is done.
func (r *Runner) Run(ctx context.Context) {
	r.backfill(ctx)
	r.refreshFlow(ctx)

	aggTick := time.NewTicker(15 * time.Minute)
	flowTick := time.NewTicker(6 * time.Hour)
	defer aggTick.Stop()
	defer flowTick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-aggTick.C:
			r.refreshRecent(ctx)
		case <-flowTick.C:
			r.refreshFlow(ctx)
		}
	}
}

func (r *Runner) backfill(ctx context.Context) {
	empty, err := r.store.BoatDaysEmpty(ctx)
	if err != nil {
		r.logger.Error("boat_days check", "error", err)
		return
	}
	if !empty {
		r.refreshRecent(ctx)
		return
	}
	start := time.Now()
	if err := r.store.RefreshBoatDays(ctx, time.Time{}); err != nil {
		r.logger.Error("boat_days backfill", "error", err)
		return
	}
	r.logger.Info("boat_days backfilled", "took", time.Since(start).Round(time.Millisecond))
}

// refreshRecent rebuilds yesterday and today (Paris time) so late pings and
// the current day stay accurate.
func (r *Runner) refreshRecent(ctx context.Context) {
	from := time.Now().AddDate(0, 0, -1)
	if err := r.store.RefreshBoatDays(ctx, from); err != nil {
		r.logger.Error("boat_days refresh", "error", err)
	}
}

func (r *Runner) refreshFlow(ctx context.Context) {
	if r.station == "" {
		return
	}
	from, err := r.store.LatestFlowDay(ctx)
	if err != nil {
		r.logger.Error("latest flow day", "error", err)
		return
	}
	if from.IsZero() {
		if from, err = r.store.FirstPositionDay(ctx); err != nil {
			r.logger.Error("first position day", "error", err)
			return
		}
	}
	// Re-fetch a week back: recent Hub'Eau values are provisional.
	from = from.AddDate(0, 0, -7)
	flows, err := river.FetchDailyFlow(ctx, r.http, r.station, from)
	if err != nil {
		r.logger.Warn("hubeau fetch", "error", err)
		return
	}
	for _, f := range flows {
		if err := r.store.UpsertFlow(ctx, f.Day, f.QM3s); err != nil {
			r.logger.Error("upsert flow", "error", err)
			return
		}
	}
	r.logger.Info("river flow updated", "days", len(flows))
}
