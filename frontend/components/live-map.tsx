"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SITE, SPEED_LIMIT_KNOTS, BASE_PATH } from "@/site.config";
import { CruisingList, type LivePosition } from "./cruising-list";

function knotsToKmh(n: number): string {
  return (n * 1.852).toFixed(1);
}

function formatAge(iso: string): string {
  const ageS = (Date.now() - new Date(iso).getTime()) / 1000;
  if (ageS < 60) return `il y a ${Math.round(ageS)}s`;
  const m = Math.round(ageS / 60);
  return `il y a ${m} min`;
}

const STALE_MS = 3 * 60_000; // mark gray after 3 min without updates
const PRUNE_MS = 15 * 60_000; // drop entirely after 15 min
const WARNING_RATIO = 0.95; // amber if speed within 5% of limit
const POLL_FALLBACK_MS = 5_000; // when WS is down, hit /api/live this often

type Bucket = "speeding" | "warning" | "ok" | "stale";

function bucketize(p: LivePosition): Bucket {
  const ageMs = Date.now() - new Date(p.received_at).getTime();
  if (ageMs > STALE_MS) return "stale";
  if (p.speed_knots > SPEED_LIMIT_KNOTS) return "speeding";
  if (p.speed_knots > SPEED_LIMIT_KNOTS * WARNING_RATIO) return "warning";
  return "ok";
}

const BUCKET_STYLE: Record<
  Bucket,
  { color: string; fill: string; radius: number; weight: number }
> = {
  speeding: { color: "#ef4444", fill: "#ef4444", radius: 8, weight: 2 },
  warning: { color: "#f59e0b", fill: "#f59e0b", radius: 7, weight: 2 },
  ok: { color: "#22c55e", fill: "#22c55e", radius: 6, weight: 1.5 },
  stale: { color: "#6b7280", fill: "#6b7280", radius: 5, weight: 1 },
};

type ConnectionState = "connecting" | "open" | "polling" | "error";
type MobileView = "map" | "list";

export function LiveMap() {
  const [positions, setPositions] = useState<Map<number, LivePosition>>(
    () => new Map(),
  );
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [lastUpdate, setLastUpdate] = useState(0);
  // Re-render every 1 s so the "il y a Xs" age string ticks smoothly and
  // the "stale" colouring transitions without waiting for a WS push.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  // Imperative refs for the WS pipeline so reconnect logic isn't tied to
  // a particular render.
  const wsRef = useRef<WebSocket | null>(null);
  const pollIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffRef = useRef(1000);
  const cancelledRef = useRef(false);

  function applyOne(p: LivePosition) {
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(p.mmsi, p);
      return next;
    });
    setLastUpdate(Date.now());
  }

  function applySnapshot(arr: LivePosition[]) {
    const next = new Map<number, LivePosition>();
    for (const p of arr) next.set(p.mmsi, p);
    setPositions(next);
    setLastUpdate(Date.now());
  }

  function stopPolling() {
    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
  }

  function startPolling() {
    if (pollIdRef.current) return;
    setConn("polling");
    const tick = async () => {
      try {
        const res = await fetch(`${BASE_PATH}/api/live?since_minutes=10`);
        if (res.ok) applySnapshot(await res.json());
      } catch {
        // keep trying
      }
    };
    tick();
    pollIdRef.current = setInterval(tick, POLL_FALLBACK_MS);
  }

  useEffect(() => {
    cancelledRef.current = false;

    async function snapshot() {
      try {
        const res = await fetch(`${BASE_PATH}/api/live?since_minutes=10`);
        if (res.ok) applySnapshot(await res.json());
      } catch {
        // ignore; WS may still come up
      }
    }

    function connect() {
      if (cancelledRef.current) return;
      setConn("connecting");
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}${BASE_PATH}/api/ws/live`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConn("open");
        backoffRef.current = 1000;
        stopPolling();
      };
      ws.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data) as LivePosition;
          applyOne(p);
        } catch {
          // skip malformed
        }
      };
      ws.onerror = () => {
        // onclose will fire next; handle there.
      };
      ws.onclose = () => {
        if (cancelledRef.current) return;
        // Fall back to polling so the map keeps updating during the
        // reconnect window, then try to re-open WS with backoff.
        startPolling();
        const delay = Math.min(backoffRef.current, 15_000);
        backoffRef.current = Math.min(backoffRef.current * 2, 15_000);
        setTimeout(connect, delay);
      };
    }

    snapshot();
    connect();

    return () => {
      cancelledRef.current = true;
      stopPolling();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prune very stale vessels so the map doesn't accumulate grey markers
  // forever for boats that have left.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setPositions((prev) => {
        let dropped = false;
        const next = new Map(prev);
        for (const [mmsi, p] of prev) {
          if (now - new Date(p.received_at).getTime() > PRUNE_MS) {
            next.delete(mmsi);
            dropped = true;
          }
        }
        return dropped ? next : prev;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c = { speeding: 0, warning: 0, ok: 0, stale: 0, total: positions.size };
    for (const p of positions.values()) c[bucketize(p)]++;
    return c;
  }, [positions]);

  const ageStr = (() => {
    if (lastUpdate === 0) return "";
    const s = Math.floor((Date.now() - lastUpdate) / 1000);
    if (s < 2) return "à l'instant";
    if (s < 60) return `il y a ${s}s`;
    const m = Math.floor(s / 60);
    return `il y a ${m} min`;
  })();

  const liveIndicator = (
    // Concentric circles: a static dot under, and a re-mounting halo on
    // top that runs the ping animation once per new WS message. The key
    // is lastUpdate so React tears down and recreates the halo whenever
    // a fresh position arrives.
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        key={lastUpdate}
        className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
        style={{
          animation: "vitesse-ping 600ms cubic-bezier(0, 0, 0.2, 1) 1",
        }}
      />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );

  const statusLine = (() => {
    if (conn === "open")
      return (
        <span className="inline-flex items-center gap-2">
          {liveIndicator}
          en direct
        </span>
      );
    if (conn === "polling")
      return <span className="text-amber-500">connexion temps réel perdue (polling)</span>;
    if (conn === "error")
      return <span className="text-speed-danger">erreur de connexion</span>;
    return "connexion…";
  })();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="text-muted-foreground">{statusLine}</span>
        <span className="text-muted-foreground">
          &middot;{" "}
          <span className="font-medium text-foreground">{counts.total}</span>{" "}
          bateau{counts.total !== 1 ? "x" : ""}
          {lastUpdate > 0 && (
            <>
              {" "}
              &middot; dernière donnée{" "}
              <span suppressHydrationWarning>{ageStr}</span>
            </>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: BUCKET_STYLE.speeding.fill }}
          />
          en excès ({counts.speeding})
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: BUCKET_STYLE.warning.fill }}
          />
          proche limite ({counts.warning})
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: BUCKET_STYLE.ok.fill }}
          />
          sous la limite ({counts.ok})
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: BUCKET_STYLE.stale.fill }}
          />
          ancien ({counts.stale})
        </span>
      </div>

      {/* Mobile toggle Carte / Liste — hidden on lg+ where both show side-by-side */}
      <div
        role="tablist"
        aria-label="Vue mobile"
        className="lg:hidden mb-3 inline-flex rounded-md border p-0.5"
      >
        {(["map", "list"] as MobileView[]).map((v) => {
          const active = mobileView === v;
          return (
            <button
              key={v}
              role="tab"
              aria-selected={active}
              onClick={() => setMobileView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "map" ? "Carte" : "Liste"}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className={`lg:col-span-2 ${mobileView !== "map" ? "hidden lg:block" : ""}`}
        >
          <div className="rounded-lg overflow-hidden border">
            <MapContainer
              center={SITE.mapCenter}
              zoom={SITE.mapZoom}
              className="h-[50vh] sm:h-[70vh] w-full"
              attributionControl={false}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {Array.from(positions.values()).map((p) => {
                const b = bucketize(p);
                const style = BUCKET_STYLE[b];
                return (
                  <CircleMarker
                    key={p.mmsi}
                    center={[p.latitude, p.longitude]}
                    radius={style.radius}
                    pathOptions={{
                      color: style.color,
                      fillColor: style.fill,
                      fillOpacity: 0.8,
                      weight: style.weight,
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">
                          {p.vessel_name || "Inconnu"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          MMSI {p.mmsi}
                        </p>
                        <p className="mt-1">
                          <span
                            className={
                              p.speed_knots > SPEED_LIMIT_KNOTS
                                ? "font-medium text-speed-danger"
                                : "font-medium"
                            }
                          >
                            {knotsToKmh(p.speed_knots)} km/h
                          </span>{" "}
                          <span className="text-muted-foreground text-xs">
                            ({p.speed_knots.toFixed(1)} nœuds)
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cap {Math.round(p.course)}° &middot;{" "}
                          {formatAge(p.received_at)}
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        <div
          className={`lg:col-span-1 ${mobileView !== "list" ? "hidden lg:block" : ""}`}
        >
          <CruisingList positions={positions} />
        </div>
      </div>
    </div>
  );
}
