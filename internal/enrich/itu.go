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
	vessels, err := e.store.VesselsNeedingEnrichment(ctx, 50)
	if err != nil {
		e.logger.Error("fetch vessels needing enrichment", "error", err)
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

	e.logger.Info("enriching vessels", "count", len(vessels))

	for _, mmsi := range vessels {
		if ctx.Err() != nil {
			return
		}

		// VesselFinder's click API works for inland vessels and returns name,
		// photo, ENI, dimensions, type and flag in a single call.
		enr, err := lookupVesselFinder(ctx, mmsi)
		if err != nil {
			e.logger.Warn("VesselFinder lookup failed", "mmsi", mmsi, "error", err)
		}

		// Fallback to ITU MARS only for the name (seagoing vessels).
		if enr.Name == "" {
			name, callSign, ituErr := lookupITU(ctx, mmsi)
			if ituErr != nil {
				e.logger.Warn("ITU lookup failed", "mmsi", mmsi, "error", ituErr)
			}
			enr.Name = name
			if enr.CallSign == "" {
				enr.CallSign = callSign
			}
		}

		// Always stamp enriched_at (UpdateVesselEnrichment does), even on a
		// miss, so we don't keep re-querying vessels with no public record.
		if err := e.store.UpdateVesselEnrichment(ctx, mmsi, enr); err != nil {
			e.logger.Error("update vessel enrichment", "error", err, "mmsi", mmsi)
		} else if enr.Name != "" || enr.PhotoURL != "" {
			e.logger.Info("enriched vessel", "mmsi", mmsi, "name", enr.Name,
				"photo", enr.PhotoURL != "", "eni", enr.ENI)
		}

		if enr.Name != "" {
			if err := e.store.BackfillInfractionNames(ctx, mmsi, enr.Name); err != nil {
				e.logger.Error("backfill infraction names", "error", err)
			}
		}

		time.Sleep(2 * time.Second)
	}
}

// vesselFinderPhotoBase is the static host for user-submitted ship photos.
// The `pic` token from the click API is appended, then a size suffix:
// `/1` is the full-size photo, `/0` the thumbnail.
const vesselFinderPhotoBase = "https://static.vesselfinder.net/ship-photo/"

// VesselFinder public click API — works for inland vessels, returns JSON with
// name, a photo token, the European inland-vessel id (ENI), dimensions, a
// human-readable type and flag country. One call yields everything we store.
func lookupVesselFinder(ctx context.Context, mmsi int) (store.Enrichment, error) {
	url := fmt.Sprintf("https://www.vesselfinder.com/api/pub/click/%d", mmsi)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return store.Enrichment{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return store.Enrichment{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return store.Enrichment{}, fmt.Errorf("VesselFinder returned %d", resp.StatusCode)
	}

	var result struct {
		Name    string  `json:"name"`
		Pic     string  `json:"pic"`     // photo token, "" or "0-0-…" when none
		Eni     int64   `json:"eni"`     // European inland-vessel id
		Type    string  `json:"type"`    // e.g. "Passenger ship"
		Country string  `json:"country"` // e.g. "France"
		Al      float64 `json:"al"`      // length overall, metres
		Aw      float64 `json:"aw"`      // beam, metres
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return store.Enrichment{}, err
	}

	enr := store.Enrichment{
		Name:     strings.TrimSpace(result.Name),
		ENI:      result.Eni,
		TypeText: strings.TrimSpace(result.Type),
		Flag:     strings.TrimSpace(result.Country),
		LengthM:  result.Al,
		BeamM:    result.Aw,
	}
	if full, thumb, ok := vesselFinderPhotoURLs(result.Pic); ok {
		enr.PhotoURL = full
		enr.PhotoThumbURL = thumb
	}
	return enr, nil
}

// vesselFinderPhotoURLs builds the full-size and thumbnail photo URLs from a
// `pic` token. Returns ok=false when the token carries no real photo (empty,
// or a "0-0-…" sentinel with no image hash).
func vesselFinderPhotoURLs(pic string) (full, thumb string, ok bool) {
	pic = strings.TrimSpace(pic)
	if pic == "" {
		return "", "", false
	}
	// Tokens look like "<imo>-<mmsi>-<32-hex-hash>"; the trailing hash is what
	// identifies an actual uploaded photo. No hash → no photo.
	parts := strings.Split(pic, "-")
	if len(parts) < 3 || len(parts[len(parts)-1]) < 16 {
		return "", "", false
	}
	return vesselFinderPhotoBase + pic + "/1", vesselFinderPhotoBase + pic + "/0", true
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
