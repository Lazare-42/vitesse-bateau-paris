package store

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"time"

	_ "github.com/lib/pq"
)

// sustainedFilter is the WHERE-clause fragment applied to every infraction
// query so brief GPS spikes (typically under bridges, where the signal is
// disrupted) do not count as real speeding events. Tables must be aliased `i`.
const sustainedFilter = `(i.ended_at - i.started_at) >= INTERVAL '30 seconds'`

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
	MMSI                       int       `json:"mmsi"`
	VesselName                 string    `json:"vessel_name"`
	InfractionCount            int       `json:"infraction_count"`
	MaxSpeedKnots              float64   `json:"max_speed_knots"`
	AvgSpeedKnots              float64   `json:"avg_speed_knots"`
	LastInfractionAt           time.Time `json:"last_infraction_at"`
	CumulativeExcess           float64   `json:"cumulative_excess_knots"`
	AvgInfractionDurationSecs  float64   `json:"avg_infraction_duration_seconds"`
}

type Stats struct {
	TotalVesselsTracked  int     `json:"total_vessels_tracked"`
	TotalPositions       int64   `json:"total_positions"`
	TotalInfractions     int64   `json:"total_infractions"`
	UniqueOffenders      int     `json:"unique_offenders"`
	AvgInfractionSpeed   float64 `json:"avg_infraction_speed_knots"`
	MaxInfractionSpeed   float64 `json:"max_infraction_speed_knots"`
	AvgInfractionsPerDay float64 `json:"avg_infractions_per_day"`
}

type VesselSpeedRow struct {
	InfractionID    int64     `json:"infraction_id"`
	MMSI            int       `json:"mmsi"`
	VesselName      string    `json:"vessel_name"`
	MaxSpeedKnots   float64   `json:"max_speed_knots"`
	AvgSpeedKnots   float64   `json:"avg_speed_knots"`
	SpeedLimitKnots float64   `json:"speed_limit_knots"`
	StartedAt       time.Time `json:"started_at"`
	EndedAt         time.Time `json:"ended_at"`
	DurationSeconds int       `json:"duration_seconds"`
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
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess,
		       AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as avg_duration_seconds
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE `+sustainedFilter+`
		GROUP BY i.mmsi, v.name
		ORDER BY avg_duration_seconds DESC, cumulative_excess DESC
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
			&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess,
			&o.AvgInfractionDurationSecs); err != nil {
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
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess,
		       AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as avg_duration_seconds
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE i.mmsi = $1 AND `+sustainedFilter+`
		GROUP BY i.mmsi, v.name
	`, mmsi).Scan(&o.MMSI, &o.VesselName, &o.InfractionCount,
		&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess,
		&o.AvgInfractionDurationSecs)
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
		WHERE i.mmsi = $1 AND `+sustainedFilter+`
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

// GetInfraction returns a single infraction by id (no sustained-duration
// filter — callers may want to display any record, e.g. a leaderboard link).
// Returns nil on no match.
func (s *Store) GetInfraction(ctx context.Context, id int64) (*Infraction, error) {
	inf := &Infraction{}
	err := s.db.QueryRowContext(ctx, `
		SELECT i.id, i.mmsi,
		       COALESCE(NULLIF(v.name, ''), i.vessel_name, '') as vessel_name,
		       i.max_speed_knots, i.avg_speed_knots, i.speed_limit_knots,
		       i.start_lat, i.start_lon, i.end_lat, i.end_lon, i.started_at, i.ended_at, i.ping_count
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE i.id = $1
	`, id).Scan(&inf.ID, &inf.MMSI, &inf.VesselName, &inf.MaxSpeedKnots,
		&inf.AvgSpeedKnots, &inf.SpeedLimitKnots, &inf.StartLat, &inf.StartLon,
		&inf.EndLat, &inf.EndLon, &inf.StartedAt, &inf.EndedAt, &inf.PingCount)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return inf, nil
}

func (s *Store) RecentInfractions(ctx context.Context, limit, sinceHours int) ([]Infraction, error) {
	since := ""
	if sinceHours > 0 {
		since = fmt.Sprintf(" AND i.started_at >= NOW() - INTERVAL '%d hours'", sinceHours)
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.mmsi,
		       COALESCE(NULLIF(v.name, ''), i.vessel_name, '') as vessel_name,
		       i.max_speed_knots, i.avg_speed_knots, i.speed_limit_knots,
		       i.start_lat, i.start_lon, i.end_lat, i.end_lon, i.started_at, i.ended_at, i.ping_count
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE `+sustainedFilter+since+`
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

	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM infractions i WHERE `+sustainedFilter).Scan(&st.TotalInfractions)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRowContext(ctx, `SELECT COUNT(DISTINCT i.mmsi) FROM infractions i WHERE `+sustainedFilter).Scan(&st.UniqueOffenders)
	if err != nil {
		return nil, err
	}

	var avgSpeed, maxSpeed sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `SELECT AVG(i.max_speed_knots), MAX(i.max_speed_knots) FROM infractions i WHERE `+sustainedFilter).Scan(&avgSpeed, &maxSpeed)
	if err != nil {
		return nil, err
	}
	st.AvgInfractionSpeed = avgSpeed.Float64
	st.MaxInfractionSpeed = maxSpeed.Float64

	// Average sustained infractions per day, since the first recorded
	// sustained infraction. Floored at 1 day to avoid division blow-ups on
	// fresh installs.
	var firstAt sql.NullTime
	err = s.db.QueryRowContext(ctx, `SELECT MIN(i.started_at) FROM infractions i WHERE `+sustainedFilter).Scan(&firstAt)
	if err != nil {
		return nil, err
	}
	if firstAt.Valid && st.TotalInfractions > 0 {
		days := time.Since(firstAt.Time).Hours() / 24
		if days < 1 {
			days = 1
		}
		st.AvgInfractionsPerDay = float64(st.TotalInfractions) / days
	}

	return st, nil
}

// FastestVessels returns the top N vessels by personal-best max speed, one row
// per vessel. Limited to sustained infractions.
func (s *Store) FastestVessels(ctx context.Context, limit int) ([]VesselSpeedRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT ON (i.mmsi)
		       i.id, i.mmsi,
		       COALESCE(NULLIF(v.name, ''), i.vessel_name, '') as vessel_name,
		       i.max_speed_knots, i.avg_speed_knots, i.speed_limit_knots,
		       i.started_at, i.ended_at,
		       EXTRACT(EPOCH FROM (i.ended_at - i.started_at))::int as duration_seconds
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE `+sustainedFilter+`
		ORDER BY i.mmsi, i.max_speed_knots DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []VesselSpeedRow
	for rows.Next() {
		var r VesselSpeedRow
		if err := rows.Scan(&r.InfractionID, &r.MMSI, &r.VesselName, &r.MaxSpeedKnots, &r.AvgSpeedKnots,
			&r.SpeedLimitKnots, &r.StartedAt, &r.EndedAt, &r.DurationSeconds); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// DISTINCT ON forces ordering by mmsi first; re-sort by speed for the leaderboard.
	sort.Slice(out, func(i, j int) bool {
		return out[i].MaxSpeedKnots > out[j].MaxSpeedKnots
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
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
