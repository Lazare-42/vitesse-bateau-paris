package store

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// boat_days maintenance
// ---------------------------------------------------------------------------

// RefreshBoatDays rebuilds boat_days rows for every Paris-local day >= from.
// With a zero `from`, it rebuilds everything (used for the first backfill).
func (s *Store) RefreshBoatDays(ctx context.Context, from time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	fromDay := from.Format("2006-01-02")
	if from.IsZero() {
		fromDay = "1970-01-01"
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM boat_days WHERE day >= $1::date`, fromDay); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO boat_days (mmsi, day, dir, secs, secs_over, secs_over15, secs_over20, kmh_secs)
		SELECT mmsi, day, dir, SUM(w),
		       COALESCE(SUM(w) FILTER (WHERE speed_knots > $2), 0),
		       COALESCE(SUM(w) FILTER (WHERE speed_knots * 1.852 > 15), 0),
		       COALESCE(SUM(w) FILTER (WHERE speed_knots * 1.852 > 20), 0),
		       SUM(w * speed_knots * 1.852)
		FROM (
		  SELECT mmsi, speed_knots,
		         (received_at AT TIME ZONE 'Europe/Paris')::date AS day,
		         CASE WHEN sin(radians(course)) < 0 THEN 'down' ELSE 'up' END AS dir,
		         received_at,
		         LEAST(
		           EXTRACT(EPOCH FROM LEAD(received_at) OVER (PARTITION BY mmsi ORDER BY received_at) - received_at),
		           CASE WHEN speed_knots > $2 THEN 60 ELSE 330 END
		         ) AS w
		  FROM positions
		  -- one hour of look-back so the first ping of the window has a successor context
		  WHERE received_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/Paris' - INTERVAL '1 hour'
		) s
		WHERE w IS NOT NULL AND w > 0
		  AND speed_knots > 1 AND speed_knots < 30
		  AND received_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/Paris'
		GROUP BY mmsi, day, dir
	`, fromDay, s.speedLimitKnots); err != nil {
		return err
	}
	return tx.Commit()
}

// BoatDaysEmpty reports whether boat_days needs a full backfill.
func (s *Store) BoatDaysEmpty(ctx context.Context) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM (SELECT 1 FROM boat_days LIMIT 1) x`).Scan(&n)
	return n == 0, err
}

// ---------------------------------------------------------------------------
// River flow
// ---------------------------------------------------------------------------

func (s *Store) UpsertFlow(ctx context.Context, day time.Time, q float64) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO river_flow (day, q_m3s) VALUES ($1, $2)
		ON CONFLICT (day) DO UPDATE SET q_m3s = EXCLUDED.q_m3s
	`, day.Format("2006-01-02"), q)
	return err
}

// LatestFlowDay returns the most recent day with a flow value (zero if none).
func (s *Store) LatestFlowDay(ctx context.Context) (time.Time, error) {
	var d sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT MAX(day) FROM river_flow`).Scan(&d)
	if err != nil || !d.Valid {
		return time.Time{}, err
	}
	return d.Time, nil
}

// FirstPositionDay is where flow backfill starts.
func (s *Store) FirstPositionDay(ctx context.Context) (time.Time, error) {
	var d sql.NullTime
	err := s.db.QueryRowContext(ctx, `SELECT MIN(received_at) FROM positions`).Scan(&d)
	if err != nil || !d.Valid {
		return time.Now(), err
	}
	return d.Time, nil
}

type FlowPoint struct {
	Day  string  `json:"day"`
	QM3s float64 `json:"q_m3s"`
}

// LatestFlow returns the latest known daily flow, or nil.
func (s *Store) LatestFlow(ctx context.Context) (*FlowPoint, error) {
	var f FlowPoint
	var d time.Time
	err := s.db.QueryRowContext(ctx, `SELECT day, q_m3s FROM river_flow ORDER BY day DESC LIMIT 1`).Scan(&d, &f.QM3s)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	f.Day = d.Format("2006-01-02")
	return &f, nil
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

// TrendPoint aggregates one period (week or month). Shares are fractions of
// de-duplicated moving samples (≈ share of navigation time).
type TrendPoint struct {
	Period string `json:"period"` // YYYY-MM-DD (start of week/month)
	Days   int    `json:"days"`   // days with data in the period
	Boats  int    `json:"boats"`
	// All directions
	N           int     `json:"moving_s"` // seconds moving
	ShareOver   float64 `json:"share_over"`
	ShareOver15 float64 `json:"share_over15"`
	ShareOver20 float64 `json:"share_over20"`
	AvgKmh      float64 `json:"avg_kmh"`
	// Downstream / upstream split
	NDown           int     `json:"moving_s_down"`
	ShareOverDown   float64 `json:"share_over_down"`
	ShareOver15Down float64 `json:"share_over15_down"`
	NUp             int     `json:"moving_s_up"`
	ShareOverUp     float64 `json:"share_over_up"`
	ShareOver15Up   float64 `json:"share_over15_up"`
	// Sustained public infractions
	Infractions   int     `json:"infractions"`
	ExcessSeconds float64 `json:"excess_seconds"`
	// Mean river flow over the period's days (0 = unknown)
	FlowM3s float64 `json:"flow_m3s"`
}

func validPeriod(p string) string {
	if p == "month" {
		return "month"
	}
	return "week"
}

// trendFilter keeps public vessels only. `extra` may add a condition on
// boat_days (alias b) / vessels (alias v), e.g. an mmsi or operator filter.
func (s *Store) trends(ctx context.Context, period, extra string, args ...any) ([]TrendPoint, error) {
	period = validPeriod(period)
	q := fmt.Sprintf(`
	WITH bd AS (
	  SELECT date_trunc('%[1]s', b.day)::date AS p, b.*
	  FROM boat_days b LEFT JOIN vessels v ON v.mmsi = b.mmsi
	  WHERE NOT %[2]s %[3]s
	),
	agg AS (
	  SELECT p, COUNT(DISTINCT day) days, COUNT(DISTINCT mmsi) boats,
	         SUM(secs)::bigint n, SUM(secs_over)::bigint n_over, SUM(secs_over15)::bigint n_over15, SUM(secs_over20)::bigint n_over20, SUM(kmh_secs) sum_kmh,
	         SUM(secs) FILTER (WHERE dir = 'down')::bigint n_down,
	         SUM(secs_over) FILTER (WHERE dir = 'down')::bigint n_over_down,
	         SUM(secs_over15) FILTER (WHERE dir = 'down')::bigint n_over15_down,
	         SUM(secs) FILTER (WHERE dir = 'up')::bigint n_up,
	         SUM(secs_over) FILTER (WHERE dir = 'up')::bigint n_over_up,
	         SUM(secs_over15) FILTER (WHERE dir = 'up')::bigint n_over15_up
	  FROM bd GROUP BY p
	),
	inf AS (
	  SELECT date_trunc('%[1]s', (i.started_at AT TIME ZONE 'Europe/Paris')::date)::date p,
	         COUNT(*) c, SUM(EXTRACT(EPOCH FROM i.ended_at - i.started_at)) secs
	  FROM infractions i LEFT JOIN vessels v ON v.mmsi = i.mmsi
	  WHERE %[4]s %[5]s
	  GROUP BY 1
	),
	fl AS (
	  SELECT date_trunc('%[1]s', day)::date p, AVG(q_m3s) q FROM river_flow GROUP BY 1
	)
	SELECT agg.p, days, boats, n, n_over, n_over15, n_over20, sum_kmh,
	       COALESCE(n_down, 0), COALESCE(n_over_down, 0), COALESCE(n_over15_down, 0),
	       COALESCE(n_up, 0), COALESCE(n_over_up, 0), COALESCE(n_over15_up, 0),
	       COALESCE(inf.c, 0), COALESCE(inf.secs, 0), COALESCE(fl.q, 0)
	FROM agg LEFT JOIN inf ON inf.p = agg.p LEFT JOIN fl ON fl.p = agg.p
	ORDER BY agg.p`,
		period, exemptVesselSQL, extra, s.publicFilter(), strings.ReplaceAll(extra, "b.mmsi", "i.mmsi"))
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TrendPoint
	for rows.Next() {
		var t TrendPoint
		var p time.Time
		var nOver, nOver15, nOver20, nOverDown, nOver15Down, nOverUp, nOver15Up int
		var sumKmh float64
		if err := rows.Scan(&p, &t.Days, &t.Boats, &t.N, &nOver, &nOver15, &nOver20, &sumKmh,
			&t.NDown, &nOverDown, &nOver15Down, &t.NUp, &nOverUp, &nOver15Up,
			&t.Infractions, &t.ExcessSeconds, &t.FlowM3s); err != nil {
			return nil, err
		}
		t.Period = p.Format("2006-01-02")
		t.ShareOver = ratio(nOver, t.N)
		t.ShareOver15 = ratio(nOver15, t.N)
		t.ShareOver20 = ratio(nOver20, t.N)
		t.AvgKmh = fratio(sumKmh, t.N)
		t.ShareOverDown = ratio(nOverDown, t.NDown)
		t.ShareOver15Down = ratio(nOver15Down, t.NDown)
		t.ShareOverUp = ratio(nOverUp, t.NUp)
		t.ShareOver15Up = ratio(nOver15Up, t.NUp)
		out = append(out, t)
	}
	return out, rows.Err()
}

func ratio(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

func fratio(a float64, b int) float64 {
	if b == 0 {
		return 0
	}
	return a / float64(b)
}

// Trends is the fleet-wide series (public vessels only).
func (s *Store) Trends(ctx context.Context, period string) ([]TrendPoint, error) {
	return s.trends(ctx, period, "")
}

// VesselTrends is the series for one vessel.
func (s *Store) VesselTrends(ctx context.Context, mmsi int, period string) ([]TrendPoint, error) {
	return s.trends(ctx, period, "AND b.mmsi = $1", mmsi)
}

// OperatorTrends is the series for one operator's fleet.
func (s *Store) OperatorTrends(ctx context.Context, slug, period string) ([]TrendPoint, error) {
	return s.trends(ctx, period, "AND v.operator_slug = $1", slug)
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

type OperatorBoat struct {
	MMSI          int     `json:"mmsi"`
	Name          string  `json:"name"`
	PhotoThumbURL string  `json:"photo_thumb_url,omitempty"`
	LengthM       float64 `json:"length_m,omitempty"`
	// Last 30 days vs the 30 days before, downstream share >15 km/h and
	// all-direction share over the limit.
	N30              int     `json:"moving_s_30d"`
	ShareOver30      float64 `json:"share_over_30d"`
	ShareOver15D30   float64 `json:"share_over15_down_30d"`
	NPrev            int     `json:"moving_s_prev"`
	ShareOverPrev    float64 `json:"share_over_prev"`
	ShareOver15DPrev float64 `json:"share_over15_down_prev"`
	NAll             int     `json:"moving_s_all"`
	ShareOverAll     float64 `json:"share_over_all"`
}

type Operator struct {
	Slug  string         `json:"slug"`
	Name  string         `json:"name"`
	URL   string         `json:"url,omitempty"`
	Note  string         `json:"note,omitempty"`
	Boats []OperatorBoat `json:"boats"`
	// Fleet totals over the same windows as OperatorBoat.
	N30              int     `json:"moving_s_30d"`
	ShareOver30      float64 `json:"share_over_30d"`
	ShareOver15D30   float64 `json:"share_over15_down_30d"`
	NPrev            int     `json:"moving_s_prev"`
	ShareOverPrev    float64 `json:"share_over_prev"`
	ShareOver15DPrev float64 `json:"share_over15_down_prev"`
	NAll             int     `json:"moving_s_all"`
	ShareOverAll     float64 `json:"share_over_all"`
	ShareOver15DAll  float64 `json:"share_over15_down_all"`
}

// Operators returns every operator with its boats and window stats.
// Windows are relative to the latest boat_days day.
func (s *Store) Operators(ctx context.Context) ([]Operator, error) {
	rows, err := s.db.QueryContext(ctx, `
	WITH last AS (SELECT COALESCE(MAX(day), CURRENT_DATE) d FROM boat_days),
	w AS (
	  SELECT b.mmsi,
	    (SUM(secs) FILTER (WHERE day > last.d - 30))::bigint n30,
	    (SUM(secs_over) FILTER (WHERE day > last.d - 30))::bigint o30,
	    (SUM(secs) FILTER (WHERE day > last.d - 30 AND dir = 'down'))::bigint nd30,
	    (SUM(secs_over15) FILTER (WHERE day > last.d - 30 AND dir = 'down'))::bigint od30,
	    (SUM(secs) FILTER (WHERE day <= last.d - 30 AND day > last.d - 60))::bigint np,
	    (SUM(secs_over) FILTER (WHERE day <= last.d - 30 AND day > last.d - 60))::bigint op,
	    (SUM(secs) FILTER (WHERE day <= last.d - 30 AND day > last.d - 60 AND dir = 'down'))::bigint ndp,
	    (SUM(secs_over15) FILTER (WHERE day <= last.d - 30 AND day > last.d - 60 AND dir = 'down'))::bigint odp,
	    (SUM(secs))::bigint na, (SUM(secs_over))::bigint oa,
	    (SUM(secs) FILTER (WHERE dir = 'down'))::bigint nda, (SUM(secs_over15) FILTER (WHERE dir = 'down'))::bigint oda
	  FROM boat_days b, last GROUP BY b.mmsi
	)
	SELECT o.slug, o.name, o.url, o.note, v.mmsi, COALESCE(NULLIF(v.name, ''), v.mmsi::text),
	       COALESCE(v.photo_thumb_url, ''), COALESCE(v.length_m, 0),
	       COALESCE(n30, 0), COALESCE(o30, 0), COALESCE(nd30, 0), COALESCE(od30, 0),
	       COALESCE(np, 0), COALESCE(op, 0), COALESCE(ndp, 0), COALESCE(odp, 0),
	       COALESCE(na, 0), COALESCE(oa, 0), COALESCE(nda, 0), COALESCE(oda, 0)
	FROM operators o
	JOIN vessels v ON v.operator_slug = o.slug
	LEFT JOIN w ON w.mmsi = v.mmsi
	ORDER BY o.name, v.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type acc struct{ n30, o30, nd30, od30, np, op, ndp, odp, na, oa, nda, oda int }
	var out []Operator
	idx := map[string]int{}
	tot := map[string]*acc{}
	for rows.Next() {
		var slug, name, url, note string
		var b OperatorBoat
		var a acc
		if err := rows.Scan(&slug, &name, &url, &note, &b.MMSI, &b.Name, &b.PhotoThumbURL, &b.LengthM,
			&a.n30, &a.o30, &a.nd30, &a.od30, &a.np, &a.op, &a.ndp, &a.odp, &a.na, &a.oa, &a.nda, &a.oda); err != nil {
			return nil, err
		}
		i, ok := idx[slug]
		if !ok {
			out = append(out, Operator{Slug: slug, Name: name, URL: url, Note: note})
			i = len(out) - 1
			idx[slug] = i
			tot[slug] = &acc{}
		}
		b.N30, b.ShareOver30, b.ShareOver15D30 = a.n30, ratio(a.o30, a.n30), ratio(a.od30, a.nd30)
		b.NPrev, b.ShareOverPrev, b.ShareOver15DPrev = a.np, ratio(a.op, a.np), ratio(a.odp, a.ndp)
		b.NAll, b.ShareOverAll = a.na, ratio(a.oa, a.na)
		out[i].Boats = append(out[i].Boats, b)
		t := tot[slug]
		t.n30 += a.n30
		t.o30 += a.o30
		t.nd30 += a.nd30
		t.od30 += a.od30
		t.np += a.np
		t.op += a.op
		t.ndp += a.ndp
		t.odp += a.odp
		t.na += a.na
		t.oa += a.oa
		t.nda += a.nda
		t.oda += a.oda
	}
	for i := range out {
		t := tot[out[i].Slug]
		o := &out[i]
		o.N30, o.ShareOver30, o.ShareOver15D30 = t.n30, ratio(t.o30, t.n30), ratio(t.od30, t.nd30)
		o.NPrev, o.ShareOverPrev, o.ShareOver15DPrev = t.np, ratio(t.op, t.np), ratio(t.odp, t.ndp)
		o.NAll, o.ShareOverAll, o.ShareOver15DAll = t.na, ratio(t.oa, t.na), ratio(t.oda, t.nda)
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// Headline stats (recent windows)
// ---------------------------------------------------------------------------

type RecentStats struct {
	LastPositionAt    *time.Time `json:"last_position_at"`
	ShareOver7d       float64    `json:"share_over_7d"`
	ShareOverPrev7d   float64    `json:"share_over_prev_7d"`
	ShareOver15Down7d float64    `json:"share_over15_down_7d"`
	Infractions7d     int        `json:"infractions_7d"`
	InfractionsPrev7d int        `json:"infractions_prev_7d"`
	InfractionsToday  int        `json:"infractions_today"`
	Boats7d           int        `json:"boats_7d"`
	Flow              *FlowPoint `json:"flow,omitempty"`
}

func (s *Store) RecentStats(ctx context.Context) (*RecentStats, error) {
	r := &RecentStats{}
	var last sql.NullTime
	if err := s.db.QueryRowContext(ctx, `SELECT MAX(received_at) FROM positions`).Scan(&last); err != nil {
		return nil, err
	}
	if last.Valid {
		r.LastPositionAt = &last.Time
	}
	var n7, o7, np, op, nd7, od7 int
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(secs) FILTER (WHERE day > CURRENT_DATE - 7), 0)::bigint,
		       COALESCE(SUM(secs_over) FILTER (WHERE day > CURRENT_DATE - 7), 0)::bigint,
		       COALESCE(SUM(secs) FILTER (WHERE day <= CURRENT_DATE - 7), 0)::bigint,
		       COALESCE(SUM(secs_over) FILTER (WHERE day <= CURRENT_DATE - 7), 0)::bigint,
		       COALESCE(SUM(secs) FILTER (WHERE day > CURRENT_DATE - 7 AND dir = 'down'), 0)::bigint,
		       COALESCE(SUM(secs_over15) FILTER (WHERE day > CURRENT_DATE - 7 AND dir = 'down'), 0)::bigint,
		       COUNT(DISTINCT b.mmsi) FILTER (WHERE day > CURRENT_DATE - 7)
		FROM boat_days b LEFT JOIN vessels v ON v.mmsi = b.mmsi
		WHERE day > CURRENT_DATE - 14 AND NOT `+exemptVesselSQL).Scan(&n7, &o7, &np, &op, &nd7, &od7, &r.Boats7d)
	if err != nil {
		return nil, err
	}
	r.ShareOver7d, r.ShareOverPrev7d, r.ShareOver15Down7d = ratio(o7, n7), ratio(op, np), ratio(od7, nd7)
	err = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FILTER (WHERE i.started_at >= NOW() - INTERVAL '7 days'),
		       COUNT(*) FILTER (WHERE i.started_at < NOW() - INTERVAL '7 days'),
		       COUNT(*) FILTER (WHERE (i.started_at AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date)
		FROM infractions i LEFT JOIN vessels v ON v.mmsi = i.mmsi
		WHERE i.started_at >= NOW() - INTERVAL '14 days' AND `+s.publicFilter()).Scan(&r.Infractions7d, &r.InfractionsPrev7d, &r.InfractionsToday)
	if err != nil {
		return nil, err
	}
	r.Flow, err = s.LatestFlow(ctx)
	return r, err
}

// ---------------------------------------------------------------------------
// Swimming sites
// ---------------------------------------------------------------------------

type SwimSite struct {
	Name string  `json:"name" toml:"name"`
	Lat  float64 `json:"lat" toml:"lat"`
	Lon  float64 `json:"lon" toml:"lon"`
}

type SwimSiteStats struct {
	SwimSite
	RadiusM int `json:"radius_m"`
	// Sustained public infractions whose start or end point is within
	// RadiusM of the site, during the bathing season (June-September), per
	// year-month.
	Months []struct {
		Month       string `json:"month"`
		Infractions int    `json:"infractions"`
		Boats       int    `json:"boats"`
	} `json:"months"`
	Total int `json:"total"`
}

func (s *Store) SwimSiteStats(ctx context.Context, sites []SwimSite, radiusM int) ([]SwimSiteStats, error) {
	var out []SwimSiteStats
	for _, site := range sites {
		st := SwimSiteStats{SwimSite: site, RadiusM: radiusM}
		// Equirectangular distance is accurate to <0.1% at this scale.
		rows, err := s.db.QueryContext(ctx, `
			SELECT to_char(date_trunc('month', i.started_at AT TIME ZONE 'Europe/Paris'), 'YYYY-MM') m,
			       COUNT(*), COUNT(DISTINCT i.mmsi)
			FROM infractions i LEFT JOIN vessels v ON v.mmsi = i.mmsi
			WHERE `+s.publicFilter()+`
			  AND extract(month FROM i.started_at AT TIME ZONE 'Europe/Paris') BETWEEN 6 AND 9
			  AND LEAST(
			    6371000 * sqrt(power(radians(i.start_lat - $1), 2) + power(radians(i.start_lon - $2) * cos(radians($1)), 2)),
			    6371000 * sqrt(power(radians(i.end_lat - $1), 2) + power(radians(i.end_lon - $2) * cos(radians($1)), 2))
			  ) <= $3
			GROUP BY 1 ORDER BY 1`, site.Lat, site.Lon, radiusM)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var m struct {
				Month       string `json:"month"`
				Infractions int    `json:"infractions"`
				Boats       int    `json:"boats"`
			}
			if err := rows.Scan(&m.Month, &m.Infractions, &m.Boats); err != nil {
				rows.Close()
				return nil, err
			}
			st.Total += m.Infractions
			st.Months = append(st.Months, m)
		}
		rows.Close()
		out = append(out, st)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// CSV exports
// ---------------------------------------------------------------------------

// ExportInfractionsCSV streams every public infraction as CSV.
func (s *Store) ExportInfractionsCSV(ctx context.Context, w io.Writer) error {
	rows, err := s.db.QueryContext(ctx, `
		SELECT i.id, i.mmsi, COALESCE(NULLIF(v.name, ''), i.vessel_name, ''), `+categorySQL+`,
		       COALESCE(v.operator_slug, ''),
		       i.started_at, i.ended_at, EXTRACT(EPOCH FROM i.ended_at - i.started_at)::int,
		       round((i.max_speed_knots * 1.852)::numeric, 2), round((i.avg_speed_knots * 1.852)::numeric, 2),
		       round((i.speed_limit_knots * 1.852)::numeric, 2),
		       i.start_lat, i.start_lon, i.end_lat, i.end_lon, i.ping_count
		FROM infractions i LEFT JOIN vessels v ON v.mmsi = i.mmsi
		WHERE `+s.publicFilter()+`
		ORDER BY i.started_at`)
	if err != nil {
		return err
	}
	defer rows.Close()
	fmt.Fprintln(w, "id,mmsi,vessel_name,category,operator,started_at,ended_at,duration_s,max_kmh,avg_kmh,limit_kmh,start_lat,start_lon,end_lat,end_lon,pings")
	for rows.Next() {
		var id int64
		var mmsi, dur, pings int
		var name, cat, op string
		var st, en time.Time
		var mx, av, lim, sla, slo, ela, elo float64
		if err := rows.Scan(&id, &mmsi, &name, &cat, &op, &st, &en, &dur, &mx, &av, &lim, &sla, &slo, &ela, &elo, &pings); err != nil {
			return err
		}
		fmt.Fprintf(w, "%d,%d,%s,%s,%s,%s,%s,%d,%.2f,%.2f,%.2f,%.6f,%.6f,%.6f,%.6f,%d\n",
			id, mmsi, csvQuote(name), cat, op, st.UTC().Format(time.RFC3339), en.UTC().Format(time.RFC3339),
			dur, mx, av, lim, sla, slo, ela, elo, pings)
	}
	return rows.Err()
}

// ExportBoatDaysCSV streams the daily per-boat sample aggregates.
func (s *Store) ExportBoatDaysCSV(ctx context.Context, w io.Writer) error {
	rows, err := s.db.QueryContext(ctx, `
		SELECT b.day, b.mmsi, COALESCE(NULLIF(v.name, ''), ''), `+categorySQL+`, COALESCE(v.operator_slug, ''),
		       b.dir, b.secs::bigint, b.secs_over::bigint, b.secs_over15::bigint, b.secs_over20::bigint, round((b.kmh_secs / b.secs)::numeric, 2),
		       COALESCE(f.q_m3s, 0)
		FROM boat_days b LEFT JOIN vessels v ON v.mmsi = b.mmsi LEFT JOIN river_flow f ON f.day = b.day
		WHERE NOT `+exemptVesselSQL+`
		ORDER BY b.day, b.mmsi, b.dir`)
	if err != nil {
		return err
	}
	defer rows.Close()
	fmt.Fprintln(w, "day,mmsi,vessel_name,category,operator,direction,moving_s,over_limit_s,over_15kmh_s,over_20kmh_s,avg_kmh,river_flow_m3s")
	for rows.Next() {
		var day time.Time
		var mmsi, n, o, o15, o20 int
		var name, cat, op, dir string
		var avg, q float64
		if err := rows.Scan(&day, &mmsi, &name, &cat, &op, &dir, &n, &o, &o15, &o20, &avg, &q); err != nil {
			return err
		}
		fmt.Fprintf(w, "%s,%d,%s,%s,%s,%s,%d,%d,%d,%d,%.2f,%.1f\n",
			day.Format("2006-01-02"), mmsi, csvQuote(name), cat, op, dir, n, o, o15, o20, avg, q)
	}
	return rows.Err()
}

func csvQuote(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}

// ---------------------------------------------------------------------------
// Monthly report: top boats of a month
// ---------------------------------------------------------------------------

type MonthBoat struct {
	MMSI         int     `json:"mmsi"`
	Name         string  `json:"name"`
	Category     string  `json:"category"`
	OperatorSlug string  `json:"operator_slug,omitempty"`
	OperatorName string  `json:"operator_name,omitempty"`
	N            int     `json:"moving_s"`
	ShareOver    float64 `json:"share_over"`
	ShareOver15  float64 `json:"share_over15"`
}

// MonthTopBoats ranks boats with at least minSamples moving samples in the
// month (YYYY-MM) by share of time over the limit.
func (s *Store) MonthTopBoats(ctx context.Context, month string, minSamples, limit int) ([]MonthBoat, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT b.mmsi, COALESCE(NULLIF(v.name, ''), b.mmsi::text), `+categorySQL+`,
		       COALESCE(v.operator_slug, ''), COALESCE(op.name, ''),
		       SUM(b.secs)::bigint, SUM(b.secs_over) / SUM(b.secs), SUM(b.secs_over15) / SUM(b.secs)
		FROM boat_days b
		LEFT JOIN vessels v ON v.mmsi = b.mmsi
		LEFT JOIN operators op ON op.slug = v.operator_slug
		WHERE to_char(b.day, 'YYYY-MM') = $1 AND NOT `+exemptVesselSQL+`
		GROUP BY b.mmsi, v.mmsi, op.name
		HAVING SUM(b.secs) >= $2
		ORDER BY 7 DESC
		LIMIT $3`, month, minSamples, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MonthBoat
	for rows.Next() {
		var m MonthBoat
		if err := rows.Scan(&m.MMSI, &m.Name, &m.Category, &m.OperatorSlug, &m.OperatorName, &m.N, &m.ShareOver, &m.ShareOver15); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
