// Package river fetches daily river flow from the French Hub'Eau
// hydrometry API (https://hubeau.eaufrance.fr), open data, no key needed.
package river

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

const obsElabURL = "https://hubeau.eaufrance.fr/api/v2/hydrometrie/obs_elab"

type DailyFlow struct {
	Day  time.Time
	QM3s float64
}

// FetchDailyFlow returns daily mean flow (QmnJ) for a station since `from`.
func FetchDailyFlow(ctx context.Context, client *http.Client, station string, from time.Time) ([]DailyFlow, error) {
	q := url.Values{}
	q.Set("code_entite", station)
	q.Set("grandeur_hydro_elab", "QmnJ")
	q.Set("date_debut_obs_elab", from.Format("2006-01-02"))
	q.Set("size", "1000")
	q.Set("fields", "date_obs_elab,resultat_obs_elab")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, obsElabURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "vitesse-bateau/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	// Hub'Eau answers 206 Partial Content when more pages exist; 1000 days is
	// plenty for one call, so both 200 and 206 are fine.
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		return nil, fmt.Errorf("hubeau: status %d", resp.StatusCode)
	}
	var body struct {
		Data []struct {
			Date   string  `json:"date_obs_elab"`
			Result float64 `json:"resultat_obs_elab"` // litres per second
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	out := make([]DailyFlow, 0, len(body.Data))
	for _, d := range body.Data {
		t, err := time.Parse("2006-01-02", d.Date)
		if err != nil {
			continue
		}
		out = append(out, DailyFlow{Day: t, QM3s: d.Result / 1000})
	}
	return out, nil
}
