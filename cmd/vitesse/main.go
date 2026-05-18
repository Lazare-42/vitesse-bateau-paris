package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/lazrossi/vitesse-bateau-paris/internal/ais"
	"github.com/lazrossi/vitesse-bateau-paris/internal/api"
	"github.com/lazrossi/vitesse-bateau-paris/internal/broadcast"
	"github.com/lazrossi/vitesse-bateau-paris/internal/config"
	"github.com/lazrossi/vitesse-bateau-paris/internal/enrich"
	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

// Set via -ldflags at build time (see Makefile).
var (
	version   = "dev"
	commit    = "none"
	buildDate = "unknown"
)

func main() {
	configPath := flag.String("config", "config.toml", "path to config file")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("load config", "error", err)
		os.Exit(1)
	}

	st, err := store.New(cfg.Database.URL)
	if err != nil {
		logger.Error("connect to database", "error", err)
		os.Exit(1)
	}
	defer st.Close()

	migrateCtx, migrateCancel := context.WithTimeout(context.Background(), 30*time.Second)
	if err := st.Migrate(migrateCtx); err != nil {
		migrateCancel()
		logger.Error("run migrations", "error", err)
		os.Exit(1)
	}
	migrateCancel()
	logger.Info("database migrated")

	logger.Info("vitesse-bateau-paris started",
		"version", version,
		"commit", commit,
		"build_date", buildDate,
		"speed_limit_knots", cfg.AIS.SpeedLimitKnots,
		"api_port", cfg.Server.Port,
	)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	hub := broadcast.NewHub(logger)
	apiSrv := api.NewServer(st, hub, logger)
	aisClient := ais.NewClient(cfg.AIS.APIKey, cfg.AIS.BBox, cfg.AIS.SpeedLimitKnots, st, hub, logger)
	enricher := enrich.NewEnricher(st, logger)

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := apiSrv.ListenAndServe(cfg.Server.Bind, cfg.Server.Port); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("api server", "error", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := aisClient.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("ais client", "error", err)
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		enricher.Run(ctx)
	}()

	<-ctx.Done()
	logger.Info("shutting down")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := apiSrv.Shutdown(shutdownCtx); err != nil {
		logger.Error("api shutdown", "error", err)
	}

	wg.Wait()
	logger.Info("goodbye")
}
