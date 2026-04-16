package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

type Store struct {
	db *sql.DB
}

type Vessel struct {
	MMSI      int       `json:"mmsi"`
	Name      string    `json:"name"`
	CallSign  string    `json:"call_sign,omitempty"`
	ShipType  int       `json:"ship_type,omitempty"`
	FirstSeen time.Time `json:"first_seen"`
	LastSeen  time.Time `json:"last_seen"`
}

type Position struct {
	ID         int64     `json:"id"`
	MMSI       int       `json:"mmsi"`
	Latitude   float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	SpeedKnots float64  `json:"speed_knots"`
	Course     float64   `json:"course"`
	Heading    int       `json:"heading"`
	ReceivedAt time.Time `json:"received_at"`
}

type Infraction struct {
	ID              int64     `json:"id"`
	MMSI            int       `json:"mmsi"`
	VesselName      string    `json:"vessel_name"`
	MaxSpeedKnots   float64   `json:"max_speed_knots"`
	AvgSpeedKnots   float64   `json:"avg_speed_knots"`
	SpeedLimitKnots float64   `json:"speed_limit_knots"`
	StartLat        float64   `json:"start_lat"`
	StartLon        float64   `json:"start_lon"`
	EndLat          float64   `json:"end_lat"`
	EndLon          float64   `json:"end_lon"`
	StartedAt       time.Time `json:"started_at"`
	EndedAt         time.Time `json:"ended_at"`
	PingCount       int       `json:"ping_count"`
}

type Offender struct {
	MMSI              int       `json:"mmsi"`
	VesselName        string    `json:"vessel_name"`
	InfractionCount   int       `json:"infraction_count"`
	MaxSpeedKnots     float64   `json:"max_speed_knots"`
	AvgSpeedKnots     float64   `json:"avg_speed_knots"`
	LastInfractionAt  time.Time `json:"last_infraction_at"`
	CumulativeExcess  float64   `json:"cumulative_excess_knots"`
}

type Stats struct {
	TotalVesselsTracked int     `json:"total_vessels_tracked"`
	TotalPositions      int64   `json:"total_positions"`
	TotalInfractions    int64   `json:"total_infractions"`
	UniqueOffenders     int     `json:"unique_offenders"`
	AvgInfractionSpeed  float64 `json:"avg_infraction_speed_knots"`
	MaxInfractionSpeed  float64 `json:"max_infraction_speed_knots"`
}

func New(databaseURL string) (*Store, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, schema)
	return err
}

func (s *Store) UpsertVessel(ctx context.Context, mmsi int, name, callSign string, shipType int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO vessels (mmsi, name, call_sign, ship_type, first_seen, last_seen)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		ON CONFLICT (mmsi) DO UPDATE SET
			name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE vessels.name END,
			call_sign = CASE WHEN EXCLUDED.call_sign != '' THEN EXCLUDED.call_sign ELSE vessels.call_sign END,
			ship_type = CASE WHEN EXCLUDED.ship_type != 0 THEN EXCLUDED.ship_type ELSE vessels.ship_type END,
			last_seen = NOW()
	`, mmsi, name, callSign, shipType)
	return err
}

func (s *Store) InsertPosition(ctx context.Context, mmsi int, lat, lon, speed, course float64, heading int) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO positions (mmsi, latitude, longitude, speed_knots, course, heading, received_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
	`, mmsi, lat, lon, speed, course, heading)
	return err
}

func (s *Store) InsertInfraction(ctx context.Context, inf *Infraction) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO infractions (mmsi, vessel_name, max_speed_knots, avg_speed_knots, speed_limit_knots,
			start_lat, start_lon, end_lat, end_lon, started_at, ended_at, ping_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, inf.MMSI, inf.VesselName, inf.MaxSpeedKnots, inf.AvgSpeedKnots, inf.SpeedLimitKnots,
		inf.StartLat, inf.StartLon, inf.EndLat, inf.EndLon, inf.StartedAt, inf.EndedAt, inf.PingCount)
	return err
}

func (s *Store) TopOffenders(ctx context.Context, limit int) ([]Offender, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.mmsi,
		       COALESCE(NULLIF(v.name, ''), MAX(i.vessel_name), '') as vessel_name,
		       COUNT(*) as infraction_count,
		       MAX(i.max_speed_knots) as max_speed, AVG(i.avg_speed_knots) as avg_speed,
		       MAX(i.ended_at) as last_infraction,
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		GROUP BY i.mmsi, v.name
		ORDER BY cumulative_excess DESC, max_speed DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var offenders []Offender
	for rows.Next() {
		var o Offender
		if err := rows.Scan(&o.MMSI, &o.VesselName, &o.InfractionCount,
			&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess); err != nil {
			return nil, err
		}
		offenders = append(offenders, o)
	}
	return offenders, rows.Err()
}

func (s *Store) OffenderDetail(ctx context.Context, mmsi int) (*Offender, []Infraction, error) {
	o := &Offender{}
	err := s.db.QueryRowContext(ctx, `
		SELECT i.mmsi,
		       COALESCE(NULLIF(v.name, ''), MAX(i.vessel_name), '') as vessel_name,
		       COUNT(*) as infraction_count,
		       MAX(i.max_speed_knots) as max_speed, AVG(i.avg_speed_knots) as avg_speed,
		       MAX(i.ended_at) as last_infraction,
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE i.mmsi = $1
		GROUP BY i.mmsi, v.name
	`, mmsi).Scan(&o.MMSI, &o.VesselName, &o.InfractionCount,
		&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess)
	if err == sql.ErrNoRows {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.mmsi,
		       COALESCE(NULLIF(v.name, ''), i.vessel_name, '') as vessel_name,
		       i.max_speed_knots, i.avg_speed_knots, i.speed_limit_knots,
		       i.start_lat, i.start_lon, i.end_lat, i.end_lon, i.started_at, i.ended_at, i.ping_count
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE i.mmsi = $1
		ORDER BY i.ended_at DESC
		LIMIT 100
	`, mmsi)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	var infractions []Infraction
	for rows.Next() {
		var inf Infraction
		if err := rows.Scan(&inf.ID, &inf.MMSI, &inf.VesselName, &inf.MaxSpeedKnots,
			&inf.AvgSpeedKnots, &inf.SpeedLimitKnots, &inf.StartLat, &inf.StartLon,
			&inf.EndLat, &inf.EndLon, &inf.StartedAt, &inf.EndedAt, &inf.PingCount); err != nil {
			return nil, nil, err
		}
		infractions = append(infractions, inf)
	}
	return o, infractions, rows.Err()
}

func (s *Store) RecentInfractions(ctx context.Context, limit int) ([]Infraction, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.mmsi,
		       COALESCE(NULLIF(v.name, ''), i.vessel_name, '') as vessel_name,
		       i.max_speed_knots, i.avg_speed_knots, i.speed_limit_knots,
		       i.start_lat, i.start_lon, i.end_lat, i.end_lon, i.started_at, i.ended_at, i.ping_count
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		ORDER BY i.ended_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var infractions []Infraction
	for rows.Next() {
		var inf Infraction
		if err := rows.Scan(&inf.ID, &inf.MMSI, &inf.VesselName, &inf.MaxSpeedKnots,
			&inf.AvgSpeedKnots, &inf.SpeedLimitKnots, &inf.StartLat, &inf.StartLon,
			&inf.EndLat, &inf.EndLon, &inf.StartedAt, &inf.EndedAt, &inf.PingCount); err != nil {
			return nil, err
		}
		infractions = append(infractions, inf)
	}
	return infractions, rows.Err()
}

func (s *Store) GetStats(ctx context.Context) (*Stats, error) {
	st := &Stats{}

	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM vessels`).Scan(&st.TotalVesselsTracked)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM positions`).Scan(&st.TotalPositions)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM infractions`).Scan(&st.TotalInfractions)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT mmsi) FROM infractions`).Scan(&st.UniqueOffenders)
	if err != nil {
		return nil, err
	}

	var avgSpeed, maxSpeed sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `SELECT AVG(max_speed_knots), MAX(max_speed_knots) FROM infractions`).Scan(&avgSpeed, &maxSpeed)
	if err != nil {
		return nil, err
	}
	st.AvgInfractionSpeed = avgSpeed.Float64
	st.MaxInfractionSpeed = maxSpeed.Float64

	return st, nil
}

// UnnamedVessels returns MMSIs of vessels with empty names, limited to n results.
func (s *Store) UnnamedVessels(ctx context.Context, limit int) ([]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT mmsi FROM vessels
		WHERE name = '' OR name IS NULL
		ORDER BY last_seen DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mmsis []int
	for rows.Next() {
		var mmsi int
		if err := rows.Scan(&mmsi); err != nil {
			return nil, err
		}
		mmsis = append(mmsis, mmsi)
	}
	return mmsis, rows.Err()
}

// BackfillInfractionNames updates infraction records that have no vessel name.
func (s *Store) BackfillInfractionNames(ctx context.Context, mmsi int, name string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE infractions SET vessel_name = $1
		WHERE mmsi = $2 AND (vessel_name = '' OR vessel_name IS NULL)
	`, name, mmsi)
	return err
}

// BackfillAllInfractionNames bulk-updates all infractions with empty names from the vessels table.
func (s *Store) BackfillAllInfractionNames(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `
		UPDATE infractions SET vessel_name = v.name
		FROM vessels v
		WHERE infractions.mmsi = v.mmsi
		  AND (infractions.vessel_name = '' OR infractions.vessel_name IS NULL)
		  AND v.name <> ''
	`)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
