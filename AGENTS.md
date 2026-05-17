# AGENTS.md

Operational notes for AI agents working in this repo.

## What this is

`vitesse-bateau-paris` tracks AIS-reported speeding on the Seine inside Paris (12 km/h limit). Go backend ingests AIS, PostgreSQL stores positions + infractions, Next.js frontend renders the public site at vitessebateauparis.com.

- Backend: `cmd/vitesse` + `internal/{ais,api,store}`. Listens on `:8092`.
- Frontend: `frontend/` (Next.js 15, app router). Listens on `:3100`. `next.config.ts` rewrites `/api/*` to the backend.
- DB: PostgreSQL, schema migrations live in `internal/store/`.

## Deployment

Services run as **systemd user units on the host** (not Docker, despite `docker-compose.yml` existing in the repo — that file is unused in production).

- `vitesse-bateau-paris.service` → `~/.local/bin/vitesse -config ./config.toml`
- `vitesse-bateau-paris-frontend.service` → `next start -p 3100` from `frontend/`

Both are defined in `~/nixos-config/modules/services/vitesse.nix`.

## Rebuild flow

`nixos-rebuild switch` does **not** rebuild application code — the Nix module only defines the systemd units and points at pre-built artifacts. After any code change you must rebuild manually.

### Backend (Go)

```bash
cd /data/lazrossi/code/vitesse-bateau-paris
make build
# Atomic replace — the running service holds the old inode open, so cp fails with "Text file busy"
cp vitesse ~/.local/bin/vitesse.new && mv ~/.local/bin/vitesse.new ~/.local/bin/vitesse
systemctl --user restart vitesse-bateau-paris.service
```

### Frontend (Next.js)

```bash
cd /data/lazrossi/code/vitesse-bateau-paris/frontend
npm run build
systemctl --user restart vitesse-bateau-paris-frontend.service
```

The frontend is unavailable during the restart (≈ a few seconds). The backend keeps running until the restart.

### When `nixos-rebuild` is needed

Only when `~/nixos-config/modules/services/vitesse.nix` itself changes — env vars, paths, dependencies, new services. Code changes never need a NixOS rebuild.

## Verifying after a deploy

```bash
systemctl --user status vitesse-bateau-paris.service vitesse-bateau-paris-frontend.service
journalctl --user -u vitesse-bateau-paris.service -n 30 --no-pager
curl -s localhost:8092/api/stats | head
curl -s localhost:3100/ -o /dev/null -w '%{http_code}\n'
```

## Useful commands

```bash
make build          # go build to ./vitesse
make test           # go test ./...
make fmt            # go fmt ./...
make lint           # golangci-lint run
cd frontend && npx tsc --noEmit   # frontend typecheck
```

## Forking to a different zone (Marne, Rhône, etc.)

The site is single-zone-per-deployment. Zone-specific values are centralized in **`frontend/site.config.ts`**, fed by `NEXT_PUBLIC_*` env vars at build time. To fork:

- `frontend/.env.local` (copy from `.env.example`): set site name, city, river, river-with-article, speed limit in km/h, map center, map zoom, optional sub-zones JSON.
- `config.toml`: update `bbox` and `speed_limit_knots`. Speed limit must match the frontend's `NEXT_PUBLIC_SPEED_LIMIT_KMH` ÷ 1.852.
- `frontend/app/a-propos/page.tsx`: rewrite the legal-reference paragraph (different jurisdiction = different *arrêté*) and the geographic-bounds sentence. Deliberately not templated.

Each fork has its own Postgres database; no multi-tenant schema.

## Methodology constants worth knowing

- **Speed limit**: 12 km/h (6.5 knots). Hardcoded in the ingest path.
- **Sustained-infraction threshold**: 30 seconds. Defined as `sustainedFilter` in `internal/store/store.go` and applied to every public query so brief GPS spikes (typically under bridges) don't count. Surface this in any new query that feeds public stats.
- **AIS scope**: no ship-type filter — we capture every `PositionReport`, `StandardClassBPositionReport`, and `ShipStaticData` in the Paris bbox. See `internal/ais/client.go`. The /a-propos page explains this publicly; do not silently narrow the scope.

## Things that look wrong but aren't

- `docker-compose.yml` and `Dockerfile` exist but production does not use them. Don't "fix" them to match the live deployment unless asked.
- The `vitesse` binary in the repo root is the build artifact from `make build` and is gitignored.
- `make docker-*` targets work locally for development; they have no relationship to the live host.
