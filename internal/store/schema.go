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
`
