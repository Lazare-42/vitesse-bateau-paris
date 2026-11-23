package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"text/tabwriter"

	"github.com/lazrossi/vitesse-bateau-paris/internal/store"
)

// Cookieless page-view tracking. The browser posts {p: path, r: referrer};
// we keep only the path (no query string), the referring host and a
// mobile/desktop flag. Nothing identifying is stored or logged.

var (
	botRe  = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|headless|preview|lighthouse|monitor|curl|wget|python|httpclient|facebookexternalhit`)
	pathRe = regexp.MustCompile(`^/[A-Za-z0-9/_\-.%~]*$`)
)

func (s *Server) handleHit(w http.ResponseWriter, r *http.Request) {
	// Always 204: the beacon never needs an answer and we don't want to
	// signal anything to scrapers.
	defer w.WriteHeader(http.StatusNoContent)

	ua := r.Header.Get("User-Agent")
	if ua == "" || botRe.MatchString(ua) {
		return
	}
	var body struct {
		P string `json:"p"`
		R string `json:"r"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 2048)).Decode(&body); err != nil {
		return
	}
	path := body.P
	if i := strings.IndexAny(path, "?#"); i >= 0 {
		path = path[:i]
	}
	if len(path) == 0 || len(path) > 200 || !pathRe.MatchString(path) {
		return
	}
	ref := ""
	if u, err := url.Parse(body.R); err == nil && u.Hostname() != "" {
		ref = strings.TrimPrefix(strings.ToLower(u.Hostname()), "www.")
		if len(ref) > 100 || ref == r.Host || strings.HasSuffix(ref, "vitessebateauparis.com") {
			ref = "" // internal navigation
		}
	}
	device := "desktop"
	if strings.Contains(ua, "Mobi") {
		device = "mobile"
	}
	if err := s.store.RecordView(r.Context(), path, ref, device); err != nil {
		s.logger.Error("record view", "error", err)
	}
}

// handleTraffic prints a plain-text audience summary. It is mounted outside
// /api (so the Next.js rewrite never exposes it) and only answers loopback
// clients: `curl localhost:8092/admin/traffic?days=30`.
func (s *Server) handleTraffic(w http.ResponseWriter, r *http.Request) {
	// chi's RealIP middleware rewrites RemoteAddr from these headers, so a
	// request carrying any of them is treated as proxied and refused.
	for _, h := range []string{"X-Forwarded-For", "X-Real-IP", "True-Client-IP"} {
		if r.Header.Get(h) != "" {
			http.NotFound(w, r)
			return
		}
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		http.NotFound(w, r)
		return
	}
	days := queryInt(r, "days", 30)
	if days > 366 {
		days = 366
	}
	t, err := s.store.Traffic(r.Context(), days)
	if err != nil {
		s.logger.Error("traffic", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if r.URL.Query().Get("format") == "json" {
		writeJSON(w, http.StatusOK, t)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', tabwriter.AlignRight)
	mobilePct := 0
	if t.Total > 0 {
		mobilePct = t.Mobile * 100 / t.Total
	}
	fmt.Fprintf(w, "Page views, last %d days: %d (%d%% mobile)\n\n", t.Days, t.Total, mobilePct)
	section := func(title string, rows []store.CountRow) {
		fmt.Fprintf(tw, "%s\tviews\t\n", title)
		for _, row := range rows {
			fmt.Fprintf(tw, "%s\t%d\t\n", row.Key, row.Views)
		}
		fmt.Fprintln(tw, "\t\t")
		tw.Flush()
	}
	section("day", t.PerDay)
	section("page", t.Pages)
	section("referrer", t.Referrers)
}
