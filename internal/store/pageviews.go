package store

import (
	"context"
	"database/sql"
)

// RecordView increments today's (Paris time) counter for a page view.
func (s *Store) RecordView(ctx context.Context, path, referrer, device string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO page_views (day, path, referrer, device, views)
		VALUES ((NOW() AT TIME ZONE 'Europe/Paris')::date, $1, $2, $3, 1)
		ON CONFLICT (day, path, referrer, device) DO UPDATE SET views = page_views.views + 1
	`, path, referrer, device)
	return err
}

type CountRow struct {
	Key   string `json:"key"`
	Views int    `json:"views"`
}

type Traffic struct {
	Days      int        `json:"days"`
	Total     int        `json:"total"`
	Mobile    int        `json:"mobile"`
	PerDay    []CountRow `json:"per_day"`
	Pages     []CountRow `json:"pages"`
	Referrers []CountRow `json:"referrers"`
}

// Traffic summarises page views over the last `days` days.
func (s *Store) Traffic(ctx context.Context, days int) (*Traffic, error) {
	t := &Traffic{Days: days}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	const window = ` FROM page_views WHERE day >= (NOW() AT TIME ZONE 'Europe/Paris')::date - ($1::int - 1)`
	q := func(sql string) ([]CountRow, error) {
		rows, err := tx.QueryContext(ctx, sql, days)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []CountRow{}
		for rows.Next() {
			var r CountRow
			if err := rows.Scan(&r.Key, &r.Views); err != nil {
				return nil, err
			}
			out = append(out, r)
		}
		return out, rows.Err()
	}
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(views), 0), COALESCE(SUM(views) FILTER (WHERE device = 'mobile'), 0)`+window, days).Scan(&t.Total, &t.Mobile); err != nil {
		return nil, err
	}
	if t.PerDay, err = q(`SELECT to_char(day, 'YYYY-MM-DD'), SUM(views)` + window + ` GROUP BY day ORDER BY day`); err != nil {
		return nil, err
	}
	if t.Pages, err = q(`SELECT path, SUM(views) v` + window + ` GROUP BY path ORDER BY v DESC, path LIMIT 30`); err != nil {
		return nil, err
	}
	if t.Referrers, err = q(`SELECT referrer, SUM(views) v` + window + ` AND referrer <> '' GROUP BY referrer ORDER BY v DESC, referrer LIMIT 20`); err != nil {
		return nil, err
	}
	return t, tx.Commit()
}
