package enrich

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

var (
	breadcrumbRe = regexp.MustCompile(`name="Breadcrumb"\s+type="hidden"\s+value="([^"]*)"`)
	rowRe        = regexp.MustCompile(`(?s)<tr[^>]*>.*?<td[^>]*>.*?</td>\s*<td[^>]*data-target="[^"]*"[^>]*>([^<]+)</td>\s*<td[^>]*data-target="[^"]*"[^>]*>([^<]*)</td>`)
)

const ituURL = "https://www.itu.int/mmsapp/shipstation/list"

type Enricher struct {
	store  *store.Store
	logger *slog.Logger
}

func NewEnricher(s *store.Store, logger *slog.Logger) *Enricher {
	return &Enricher{store: s, logger: logger}
}

func (e *Enricher) Run(ctx context.Context) {
	time.Sleep(30 * time.Second)
	e.enrichAll(ctx)

	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.enrichAll(ctx)
		}
	}
}

func (e *Enricher) enrichAll(ctx context.Context) {
	vessels, err := e.store.UnnamedVessels(ctx, 50)
	if err != nil {
		e.logger.Error("fetch unnamed vessels", "error", err)
		return
	}
	if len(vessels) == 0 {
		return
	}

	// Bulk backfill any infractions that have names in the vessels table already
	if n, err := e.store.BackfillAllInfractionNames(ctx); err != nil {
		e.logger.Error("bulk backfill infraction names", "error", err)
	} else if n > 0 {
		e.logger.Info("backfilled infraction names", "count", n)
	}

	e.logger.Info("enriching vessel names", "count", len(vessels))

	for _, mmsi := range vessels {
		if ctx.Err() != nil {
			return
		}

		// Try VesselFinder first (works for inland vessels)
		name, callSign, err := lookupVesselFinder(ctx, mmsi)
		if err != nil {
			e.logger.Warn("VesselFinder lookup failed", "mmsi", mmsi, "error", err)
		}

		// Fallback to ITU MARS if VesselFinder didn't find a name
		if name == "" {
			name, callSign, err = lookupITU(ctx, mmsi)
			if err != nil {
				e.logger.Warn("ITU lookup failed", "mmsi", mmsi, "error", err)
			}
		}

		if name != "" {
			e.logger.Info("enriched vessel", "mmsi", mmsi, "name", name, "call_sign", callSign)
			if err := e.store.UpsertVessel(ctx, mmsi, name, callSign, 0); err != nil {
				e.logger.Error("update vessel name", "error", err)
			}
			if err := e.store.BackfillInfractionNames(ctx, mmsi, name); err != nil {
				e.logger.Error("backfill infraction names", "error", err)
			}
		}

		time.Sleep(2 * time.Second)
	}
}

// VesselFinder public click API — works for inland vessels, returns JSON.
func lookupVesselFinder(ctx context.Context, mmsi int) (name, callSign string, err error) {
	url := fmt.Sprintf("https://www.vesselfinder.com/api/pub/click/%d", mmsi)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("VesselFinder returned %d", resp.StatusCode)
	}

	var result struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", err
	}

	return strings.TrimSpace(result.Name), "", nil
}

// ITU MARS database — fallback for seagoing vessels.
func lookupITU(ctx context.Context, mmsi int) (name, callSign string, err error) {
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, Timeout: 15 * time.Second}

	req, err := http.NewRequestWithContext(ctx, "GET", ituURL, nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; vitesse-bateau-paris/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	matches := breadcrumbRe.FindSubmatch(body)
	if matches == nil {
		return "", "", fmt.Errorf("breadcrumb token not found")
	}
	breadcrumb := string(matches[1])

	form := url.Values{
		"Breadcrumb":     {breadcrumb},
		"ScrollTopValue": {""},
		"viewCommand":    {"Search"},
		"onview":         {""},
		"Search.Name":    {""},
		"Search.MaritimeMobileServiceIdentity":                              {fmt.Sprintf("%d", mmsi)},
		"Search.CallSign":                                                    {""},
		"Search.VesselIdentificationNumber":                                  {""},
		"Search.EmergencyPositionIndicatingRadioBeaconHexadecimalIdentifier": {""},
		"Search.SatelliteNumber":                                             {""},
		"Search.Administration.SelectedId":                                   {""},
		"Search.GeographicalArea.SelectedId":                                 {""},
		"Search.GeneralClassification.SelectedId":                            {""},
	}

	req, err = http.NewRequestWithContext(ctx, "POST", ituURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; vitesse-bateau-paris/1.0)")

	resp, err = client.Do(req)
	if err != nil {
		return "", "", err
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("ITU returned %d", resp.StatusCode)
	}

	rowMatches := rowRe.FindSubmatch(body)
	if rowMatches == nil {
		return "", "", nil
	}

	name = strings.TrimSpace(string(rowMatches[1]))
	callSign = strings.TrimSpace(string(rowMatches[2]))
	return name, callSign, nil
}
