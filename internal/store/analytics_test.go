package store

import "testing"

func TestCSVQuote(t *testing.T) {
	cases := map[string]string{
		"PARISIS":  "PARISIS",
		"A, B":     `"A, B"`,
		`say "hi"`: `"say ""hi"""`,
	}
	for in, want := range cases {
		if got := csvQuote(in); got != want {
			t.Errorf("csvQuote(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRatio(t *testing.T) {
	if ratio(1, 0) != 0 || ratio(1, 4) != 0.25 {
		t.Fatal("ratio")
	}
}

func TestPublicFilterLegalZone(t *testing.T) {
	s := &Store{}
	base := s.publicFilter()
	s.SetLegalZone([4]float64{48.8, 2.26, 48.9, 2.41})
	if s.publicFilter() == base {
		t.Fatal("legal zone not applied")
	}
}
