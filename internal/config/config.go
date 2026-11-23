package config

import (
	"fmt"
	"os"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Database DatabaseConfig `toml:"database"`
	AIS      AISConfig      `toml:"ais"`
	Server   ServerConfig   `toml:"server"`
	River    RiverConfig    `toml:"river"`
}

// RiverConfig holds optional river context. All fields optional: an empty
// station disables flow fetching; no swim sites disables that endpoint.
type RiverConfig struct {
	// Hub'Eau hydrometry station code (e.g. F700000103 = Seine à Paris-Austerlitz).
	HubeauStation string `toml:"hubeau_station"`
	// Bathing sites to monitor (name, lat, lon).
	SwimSites []SwimSite `toml:"swim_sites"`
	// Radius around each swim site, metres (default 300).
	SwimRadiusM int `toml:"swim_radius_m"`
}

type SwimSite struct {
	Name string  `toml:"name"`
	Lat  float64 `toml:"lat"`
	Lon  float64 `toml:"lon"`
}

type DatabaseConfig struct {
	URL string `toml:"url"`
}

type AISConfig struct {
	APIKey          string     `toml:"api_key"`
	SpeedLimitKnots float64    `toml:"speed_limit_knots"`
	BBox            [4]float64 `toml:"bbox"` // sw_lat, sw_lon, ne_lat, ne_lon
	// LegalBBox, optional: only infractions starting inside this box are
	// shown publicly (the area where the limit legally applies). Zero = BBox.
	LegalBBox [4]float64 `toml:"legal_bbox"`
}

type ServerConfig struct {
	Port int    `toml:"port"`
	Bind string `toml:"bind"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	cfg := &Config{
		AIS: AISConfig{
			SpeedLimitKnots: 6.5,
			BBox:            [4]float64{48.815, 2.25, 48.91, 2.42},
		},
		River: RiverConfig{SwimRadiusM: 300},
		Server: ServerConfig{
			Port: 8080,
			Bind: "0.0.0.0",
		},
	}

	if err := toml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Allow env overrides
	if v := os.Getenv("VITESSE_DB_URL"); v != "" {
		cfg.Database.URL = v
	}
	if v := os.Getenv("VITESSE_AIS_API_KEY"); v != "" {
		cfg.AIS.APIKey = v
	}

	if cfg.Database.URL == "" {
		return nil, fmt.Errorf("database.url is required")
	}
	if cfg.AIS.APIKey == "" {
		return nil, fmt.Errorf("ais.api_key is required")
	}

	return cfg, nil
}
