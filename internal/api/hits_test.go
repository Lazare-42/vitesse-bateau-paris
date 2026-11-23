package api

import "testing"

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
