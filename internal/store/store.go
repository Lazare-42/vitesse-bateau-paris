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

// presenceCTE computes per-vessel total time-in-zone (seconds) by summing
// gaps between consecutive position pings. Gaps over 15 min are treated as
// the vessel leaving the zone and are excluded. Subsample of 1 ping per 5 min
// means typical gap is ~5 min; in-infraction pings are full-rate so they
// contribute too. Used as the denominator for excess_time_ratio.
const presenceCTE = `
presence AS (
  SELECT mmsi,
         SUM(EXTRACT(EPOCH FROM gap)) AS time_in_zone_seconds
  FROM (
    SELECT mmsi,
           received_at - LAG(received_at) OVER (PARTITION BY mmsi ORDER BY received_at) AS gap
    FROM positions
  ) g
  WHERE gap IS NOT NULL AND gap < INTERVAL '15 minutes'
  GROUP BY mmsi
)`

type Store struct {
	db *sql.DB
}

type Vessel struct {
	MMSI          int        `json:"mmsi"`
	Name          string     `json:"name"`
	CallSign      string     `json:"call_sign,omitempty"`
	ShipType      int        `json:"ship_type,omitempty"`
	PhotoURL      string     `json:"photo_url,omitempty"`
	PhotoThumbURL string     `json:"photo_thumb_url,omitempty"`
	ENI           int64      `json:"eni,omitempty"`
	Flag          string     `json:"flag,omitempty"`
	TypeText      string     `json:"type_text,omitempty"`
	LengthM       float64    `json:"length_m,omitempty"`
	BeamM         float64    `json:"beam_m,omitempty"`
	FirstSeen     time.Time  `json:"first_seen"`
	LastSeen      time.Time  `json:"last_seen"`
	EnrichedAt    *time.Time `json:"enriched_at,omitempty"`
}

// Enrichment is the set of vessel metadata fetched from an external source
// (currently the VesselFinder click API). Empty fields are left untouched by
// UpdateVesselEnrichment so a later partial lookup never wipes good data.
type Enrichment struct {
	Name          string
	CallSign      string
	PhotoURL      string
	PhotoThumbURL string
	ENI           int64
	Flag          string
	TypeText      string
	LengthM       float64
	BeamM         float64
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
	MMSI                      int       `json:"mmsi"`
	VesselName                string    `json:"vessel_name"`
	PhotoThumbURL             string    `json:"photo_thumb_url,omitempty"`
	PhotoURL                  string    `json:"photo_url,omitempty"`
	Flag                      string    `json:"flag,omitempty"`
	TypeText                  string    `json:"type_text,omitempty"`
	LengthM                   float64   `json:"length_m,omitempty"`
	BeamM                     float64   `json:"beam_m,omitempty"`
	ENI                       int64     `json:"eni,omitempty"`
	InfractionCount           int       `json:"infraction_count"`
	MaxSpeedKnots             float64   `json:"max_speed_knots"`
	AvgSpeedKnots             float64   `json:"avg_speed_knots"`
	LastInfractionAt          time.Time `json:"last_infraction_at"`
	CumulativeExcess          float64   `json:"cumulative_excess_knots"`
	AvgInfractionDurationSecs float64   `json:"avg_infraction_duration_seconds"`
	// TotalExcessSeconds: sum of all sustained-infraction durations for the
	// vessel. Numerator of ExcessTimeRatio (so ratio = total / time_in_zone).
	TotalExcessSeconds float64 `json:"total_excess_seconds"`
	// ExcessTimeRatio: fraction of time spent in excess while in the zone.
	// Numerator: sum of sustained-infraction durations (>=30s).
	// Denominator: sum of gaps between consecutive position pings,
	// counting only gaps under 15 minutes (longer gaps = boat left the zone).
	ExcessTimeRatio float64 `json:"excess_time_ratio"`
}

// LivePosition is the latest position of a vessel for the real-time map.
type LivePosition struct {
	MMSI          int       `json:"mmsi"`
	VesselName    string    `json:"vessel_name"`
	PhotoThumbURL string    `json:"photo_thumb_url,omitempty"`
	Latitude      float64   `json:"latitude"`
	Longitude  float64   `json:"longitude"`
	SpeedKnots float64   `json:"speed_knots"`
	Course     float64   `json:"course"`
	ReceivedAt time.Time `json:"received_at"`
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
	PhotoThumbURL   string    `json:"photo_thumb_url,omitempty"`
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
		WITH `+presenceCTE+`
		SELECT i.mmsi,
		       COALESCE(NULLIF(v.name, ''), MAX(i.vessel_name), '') as vessel_name,
		       COALESCE(v.photo_thumb_url, '') as photo_thumb_url,
		       COUNT(*) as infraction_count,
		       MAX(i.max_speed_knots) as max_speed, AVG(i.avg_speed_knots) as avg_speed,
		       MAX(i.ended_at) as last_infraction,
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess,
		       AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as avg_duration_seconds,
		       SUM(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as total_excess_seconds,
		       CASE
		         WHEN COALESCE(p.time_in_zone_seconds, 0) > 0
		         THEN SUM(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) / p.time_in_zone_seconds
		         ELSE 0
		       END as excess_ratio
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		LEFT JOIN presence p ON i.mmsi = p.mmsi
		WHERE `+sustainedFilter+`
		  -- Require at least 10 minutes of observed presence: otherwise the
		  -- ratio is meaningless (boats seen only during one infraction
		  -- always score 100%).
		  AND p.time_in_zone_seconds >= 600
		GROUP BY i.mmsi, v.name, v.photo_thumb_url, p.time_in_zone_seconds
		ORDER BY excess_ratio DESC, total_excess_seconds DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var offenders []Offender
	for rows.Next() {
		var o Offender
		if err := rows.Scan(&o.MMSI, &o.VesselName, &o.PhotoThumbURL, &o.InfractionCount,
			&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess,
			&o.AvgInfractionDurationSecs, &o.TotalExcessSeconds, &o.ExcessTimeRatio); err != nil {
			return nil, err
		}
		offenders = append(offenders, o)
	}
	return offenders, rows.Err()
}

func (s *Store) OffenderDetail(ctx context.Context, mmsi int) (*Offender, []Infraction, error) {
	o := &Offender{}
	err := s.db.QueryRowContext(ctx, `
		WITH vessel_presence AS (
		  SELECT SUM(EXTRACT(EPOCH FROM gap)) AS time_in_zone_seconds
		  FROM (
		    SELECT received_at - LAG(received_at) OVER (ORDER BY received_at) AS gap
		    FROM positions WHERE mmsi = $1
		  ) g
		  WHERE gap IS NOT NULL AND gap < INTERVAL '15 minutes'
		)
		SELECT i.mmsi,
		       COALESCE(NULLIF(v.name, ''), MAX(i.vessel_name), '') as vessel_name,
		       COALESCE(v.photo_thumb_url, '') as photo_thumb_url,
		       COALESCE(v.photo_url, '') as photo_url,
		       COALESCE(v.flag, '') as flag,
		       COALESCE(v.type_text, '') as type_text,
		       COALESCE(v.length_m, 0) as length_m,
		       COALESCE(v.beam_m, 0) as beam_m,
		       COALESCE(v.eni, 0) as eni,
		       COUNT(*) as infraction_count,
		       MAX(i.max_speed_knots) as max_speed, AVG(i.avg_speed_knots) as avg_speed,
		       MAX(i.ended_at) as last_infraction,
		       SUM(i.avg_speed_knots - i.speed_limit_knots) as cumulative_excess,
		       AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as avg_duration_seconds,
		       SUM(EXTRACT(EPOCH FROM (i.ended_at - i.started_at))) as total_excess_seconds,
		       CASE
		         WHEN COALESCE((SELECT time_in_zone_seconds FROM vessel_presence), 0) > 0
		         THEN SUM(EXTRACT(EPOCH FROM (i.ended_at - i.started_at)))
		              / (SELECT time_in_zone_seconds FROM vessel_presence)
		         ELSE 0
		       END as excess_ratio
		FROM infractions i
		LEFT JOIN vessels v ON i.mmsi = v.mmsi
		WHERE i.mmsi = $1 AND `+sustainedFilter+`
		GROUP BY i.mmsi, v.name, v.photo_thumb_url, v.photo_url, v.flag, v.type_text, v.length_m, v.beam_m, v.eni
	`, mmsi).Scan(&o.MMSI, &o.VesselName, &o.PhotoThumbURL, &o.PhotoURL, &o.Flag, &o.TypeText, &o.LengthM, &o.BeamM, &o.ENI, &o.InfractionCount,
		&o.MaxSpeedKnots, &o.AvgSpeedKnots, &o.LastInfractionAt, &o.CumulativeExcess,
		&o.AvgInfractionDurationSecs, &o.TotalExcessSeconds, &o.ExcessTimeRatio)
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
		       COALESCE(v.photo_thumb_url, '') as photo_thumb_url,
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
		if err := rows.Scan(&r.InfractionID, &r.MMSI, &r.VesselName, &r.PhotoThumbURL, &r.MaxSpeedKnots, &r.AvgSpeedKnots,
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

// LivePositions returns the latest position per vessel seen in the last
// `sinceMinutes` minutes. Used by the real-time map.
func (s *Store) LivePositions(ctx context.Context, sinceMinutes int) ([]LivePosition, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT ON (p.mmsi)
		       p.mmsi,
		       COALESCE(NULLIF(v.name, ''), '') as vessel_name,
		       COALESCE(v.photo_thumb_url, '') as photo_thumb_url,
		       p.latitude, p.longitude, p.speed_knots, p.course, p.received_at
		FROM positions p
		LEFT JOIN vessels v ON p.mmsi = v.mmsi
		WHERE p.received_at >= NOW() - make_interval(mins => $1)
		ORDER BY p.mmsi, p.received_at DESC
	`, sinceMinutes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []LivePosition
	for rows.Next() {
		var p LivePosition
		if err := rows.Scan(&p.MMSI, &p.VesselName, &p.PhotoThumbURL, &p.Latitude, &p.Longitude,
			&p.SpeedKnots, &p.Course, &p.ReceivedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
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

// VesselsNeedingEnrichment returns MMSIs of vessels never enriched (photo,
// dimensions, ENI, etc.), most-recently-seen first, limited to n. enriched_at
// is set on every attempt, so a vessel with no public record is tried once and
// then left alone.
func (s *Store) VesselsNeedingEnrichment(ctx context.Context, limit int) ([]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT mmsi FROM vessels
		WHERE enriched_at IS NULL
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

// UpdateVesselEnrichment writes externally-fetched metadata onto a vessel row
// and stamps enriched_at. Empty/zero fields in e leave the existing column
// untouched, so a partial lookup never overwrites good data; the name is only
// filled when currently blank (AIS-reported names take precedence).
func (s *Store) UpdateVesselEnrichment(ctx context.Context, mmsi int, e Enrichment) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE vessels SET
			name            = CASE WHEN (name = '' OR name IS NULL) AND $2 <> '' THEN $2 ELSE name END,
			call_sign       = CASE WHEN (call_sign = '' OR call_sign IS NULL) AND $3 <> '' THEN $3 ELSE call_sign END,
			photo_url       = CASE WHEN $4 <> '' THEN $4 ELSE photo_url END,
			photo_thumb_url = CASE WHEN $5 <> '' THEN $5 ELSE photo_thumb_url END,
			eni             = CASE WHEN $6 <> 0 THEN $6 ELSE eni END,
			flag            = CASE WHEN $7 <> '' THEN $7 ELSE flag END,
			type_text       = CASE WHEN $8 <> '' THEN $8 ELSE type_text END,
			length_m        = CASE WHEN $9 <> 0 THEN $9 ELSE length_m END,
			beam_m          = CASE WHEN $10 <> 0 THEN $10 ELSE beam_m END,
			enriched_at     = NOW()
		WHERE mmsi = $1
	`, mmsi, e.Name, e.CallSign, e.PhotoURL, e.PhotoThumbURL, e.ENI, e.Flag, e.TypeText, e.LengthM, e.BeamM)
	return err
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
