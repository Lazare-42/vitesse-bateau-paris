package store

const schema = `
CREATE TABLE IF NOT EXISTS vessels (
    mmsi         INTEGER PRIMARY KEY,
    name         TEXT NOT NULL DEFAULT '',
    call_sign    TEXT NOT NULL DEFAULT '',
    ship_type    INTEGER NOT NULL DEFAULT 0,
    first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS positions (
    id           BIGSERIAL PRIMARY KEY,
    mmsi         INTEGER NOT NULL REFERENCES vessels(mmsi),
    latitude     DOUBLE PRECISION NOT NULL,
    longitude    DOUBLE PRECISION NOT NULL,
    speed_knots  DOUBLE PRECISION NOT NULL,
    course       DOUBLE PRECISION NOT NULL DEFAULT 0,
    heading      INTEGER NOT NULL DEFAULT 511,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_mmsi ON positions(mmsi);
CREATE INDEX IF NOT EXISTS idx_positions_received_at ON positions(received_at);
CREATE INDEX IF NOT EXISTS idx_positions_mmsi_received_at ON positions(mmsi, received_at);

CREATE TABLE IF NOT EXISTS infractions (
    id                BIGSERIAL PRIMARY KEY,
    mmsi              INTEGER NOT NULL REFERENCES vessels(mmsi),
    vessel_name       TEXT NOT NULL DEFAULT '',
    max_speed_knots   DOUBLE PRECISION NOT NULL,
    avg_speed_knots   DOUBLE PRECISION NOT NULL,
    speed_limit_knots DOUBLE PRECISION NOT NULL,
    start_lat         DOUBLE PRECISION NOT NULL,
    start_lon         DOUBLE PRECISION NOT NULL,
    end_lat           DOUBLE PRECISION NOT NULL,
    end_lon           DOUBLE PRECISION NOT NULL,
    started_at        TIMESTAMPTZ NOT NULL,
    ended_at          TIMESTAMPTZ NOT NULL,
    ping_count        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_infractions_mmsi ON infractions(mmsi);
CREATE INDEX IF NOT EXISTS idx_infractions_started_at ON infractions(started_at);
CREATE INDEX IF NOT EXISTS idx_infractions_max_speed ON infractions(max_speed_knots DESC);

-- Enrichment columns, filled by internal/enrich from the VesselFinder click
-- API (one HTTP call already made for name lookups). photo_* are public
-- ship-photo URLs; eni is the European inland-vessel registry id (the key for
-- any future owner/operator lookup); length_m/beam_m come from the same call.
-- enriched_at is set on every attempt (success or not) so we don't re-hit the
-- upstream for vessels that simply have no public record.
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS photo_url       TEXT NOT NULL DEFAULT '';
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS photo_thumb_url TEXT NOT NULL DEFAULT '';
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS eni             BIGINT NOT NULL DEFAULT 0;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS flag            TEXT NOT NULL DEFAULT '';
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS type_text       TEXT NOT NULL DEFAULT '';
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS length_m        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS beam_m          DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS enriched_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vessels_enriched_at ON vessels(enriched_at);

-- Manual exemption flag (police, fire brigade, VNF service craft...) on top
-- of the automatic type-based rule in exemptVesselSQL. exempt_reason is shown
-- on /a-propos-style pages when relevant.
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS exempt        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS exempt_reason TEXT    NOT NULL DEFAULT '';

-- Operators (companies). Mapping is curated from public sources; see
-- operatorSeed in operators.go.
CREATE TABLE IF NOT EXISTS operators (
    slug  TEXT PRIMARY KEY,
    name  TEXT NOT NULL,
    url   TEXT NOT NULL DEFAULT '',
    note  TEXT NOT NULL DEFAULT ''
);
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS operator_slug TEXT REFERENCES operators(slug);

-- boat_days: one row per vessel x Paris-local day x direction, built from a
-- de-duplicated sample (first stored ping per vessel per 5-min clock bucket,
-- moving only: 1 < SOG < 30 kn). Positions are throttled to 1/5 min unless
-- speeding, so this sample puts speeding and non-speeding time on the same
-- footing. dir: 'down' = westward course component (Seine flows E->W through
-- Paris), 'up' otherwise. Refreshed incrementally by RefreshBoatDays.
CREATE TABLE IF NOT EXISTS boat_days (
    mmsi      INTEGER NOT NULL,
    day       DATE    NOT NULL,
    dir       TEXT    NOT NULL,
    n         INTEGER NOT NULL,
    n_over    INTEGER NOT NULL,
    n_over15  INTEGER NOT NULL,
    n_over20  INTEGER NOT NULL,
    sum_kmh   DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (mmsi, day, dir)
);
CREATE INDEX IF NOT EXISTS idx_boat_days_day ON boat_days(day);

-- Daily mean river flow (m3/s) from Hub'Eau, station configured in
-- [river] hubeau_station. Used to put downstream speeds in context.
CREATE TABLE IF NOT EXISTS river_flow (
    day   DATE PRIMARY KEY,
    q_m3s DOUBLE PRECISION NOT NULL
);
`
