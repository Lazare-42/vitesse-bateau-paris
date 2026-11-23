package api

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBotRe(t *testing.T) {
	for _, ua := range []string{"Googlebot/2.1", "Mozilla/5.0 (compatible; bingbot/2.0)", "curl/8.0", "HeadlessChrome/120"} {
		if !botRe.MatchString(ua) {
			t.Errorf("expected bot: %s", ua)
		}
	}
	if botRe.MatchString("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1") {
		t.Error("iPhone Safari flagged as bot")
	}
}

func TestPathRe(t *testing.T) {
	for _, p := range []string{"/", "/bateau/226009860", "/bilan/2026-10", "/a-propos"} {
		if !pathRe.MatchString(p) {
			t.Errorf("rejected valid path %s", p)
		}
	}
	for _, p := range []string{"", "bateau", "/<script>", "/a b"} {
		if pathRe.MatchString(p) {
			t.Errorf("accepted invalid path %q", p)
		}
	}
}

func TestReferrerHost(t *testing.T) {
	for raw, want := range map[string]string{
		"https://www.Example.org/article?q=private": "example.org",
		"https://www.Example.test:3000/internal":    "",
		"https://a.vitessebateauparis.com/path":     "",
		"https://myvitessebateauparis.com":          "myvitessebateauparis.com",
		"https://[::1]/":                            "",
		"about:blank":                               "",
	} {
		if got := referrerHost(raw, "Example.test:3000"); got != want {
			t.Errorf("referrerHost(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestPrivateTrafficRoute(t *testing.T) {
	s := NewServer(nil, nil, slog.Default(), Options{})
	for _, tc := range []struct{ peer, host, header, value string }{
		{"192.0.2.1:1234", "localhost", "", ""},
		{"127.0.0.1:1234", "example.org", "", ""},
		{"127.0.0.1:1234", "localhost", "X-Forwarded-For", "192.0.2.1"},
		{"127.0.0.1:1234", "localhost", "Origin", "https://example.org"},
	} {
		r := httptest.NewRequest(http.MethodGet, "http://"+tc.host+"/admin/traffic", nil)
		r.RemoteAddr = tc.peer
		if tc.header != "" {
			r.Header.Set(tc.header, tc.value)
		}
		w := httptest.NewRecorder()
		s.router.ServeHTTP(w, r)
		if w.Code != http.StatusNotFound || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("traffic route exposed for %+v: status %d, headers %v", tc, w.Code, w.Header())
		}
	}
}
