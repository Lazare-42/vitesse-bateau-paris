package store

import "context"

// operatorSeed is the curated operator mapping, sourced from public fleet
// listings (company sites, Wikipedia/Commons, trade press). Keyed by MMSI so
// it only matches the Paris deployment's vessels; other deployments simply get
// no operator rows assigned. It never overrides a manually set operator_slug.
var operatorSeed = []struct {
	Slug, Name, URL, Note string
	MMSIs                 []int
}{
	{"bateaux-mouches", "Compagnie des Bateaux-Mouches", "https://www.bateaux-mouches.fr", "",
		[]int{226009330, 226009370, 226009360, 226009350, 226009340, 226009390}},
	{"bateaux-parisiens", "Bateaux Parisiens", "https://www.bateauxparisiens.com", "Trimarans de promenade.",
		[]int{226009960, 226010040, 226009840, 226010090}},
	{"batobus", "Batobus", "https://www.batobus.com", "Navettes fluviales, marque de Bateaux Parisiens.",
		[]int{226009860, 226009880, 226009910, 226009890, 226009870, 226009850}},
	{"vedettes-de-paris", "Vedettes de Paris", "https://www.vedettesdeparis.fr", "",
		[]int{226008830, 226008840, 226008790}},
	{"vedettes-du-pont-neuf", "Vedettes du Pont Neuf", "https://www.vedettesdupontneuf.com", "",
		[]int{226005910, 226005890, 226005970}},
}

// SeedOperators inserts the curated operators and assigns unassigned vessels.
// Idempotent; safe to run at every start-up.
func (s *Store) SeedOperators(ctx context.Context) error {
	for _, o := range operatorSeed {
		if _, err := s.db.ExecContext(ctx, `
			INSERT INTO operators (slug, name, url, note) VALUES ($1, $2, $3, $4)
			ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url, note = EXCLUDED.note
		`, o.Slug, o.Name, o.URL, o.Note); err != nil {
			return err
		}
		for _, m := range o.MMSIs {
			if _, err := s.db.ExecContext(ctx, `
				UPDATE vessels SET operator_slug = $1 WHERE mmsi = $2 AND operator_slug IS NULL
			`, o.Slug, m); err != nil {
				return err
			}
		}
	}
	return nil
}
