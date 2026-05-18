"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { SITE, SPEED_LIMIT_KNOTS, BASE_PATH } from "@/site.config";

interface LivePosition {
  mmsi: number;
  vessel_name: string;
  latitude: number;
  longitude: number;
  speed_knots: number;
  course: number;
  received_at: string;
}

function knotsToKmh(n: number): string {
  return (n * 1.852).toFixed(1);
}

function formatAge(iso: string): string {
  const ageS = (Date.now() - new Date(iso).getTime()) / 1000;
  if (ageS < 60) return `il y a ${Math.round(ageS)}s`;
  const m = Math.round(ageS / 60);
  return `il y a ${m} min`;
}

const POLL_MS = 30_000;
const STALE_MS = 3 * 60_000; // mark gray if last seen > 3 min ago
const WARNING_RATIO = 0.95; // amber if speed within 5% of limit

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

export function LiveMap() {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const res = await fetch(`${BASE_PATH}/api/live?since_minutes=10`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LivePosition[];
        if (cancelled) return;
        setPositions(data);
        setError(null);
        setLastFetched(Date.now());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const counts = useMemo(() => {
    const c = { speeding: 0, warning: 0, ok: 0, stale: 0, total: positions.length };
    for (const p of positions) c[bucketize(p)]++;
    return c;
  }, [positions]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">
          {loading
            ? "Chargement..."
            : error
              ? <span className="text-speed-danger">Erreur : {error}</span>
              : <>
                  <span className="font-medium text-foreground">
                    {counts.total}
                  </span>{" "}
                  bateau{counts.total !== 1 ? "x" : ""} visible
                  {counts.total !== 1 ? "s" : ""}
                  {lastFetched > 0 && (
                    <>
                      {" "}
                      &middot;{" "}
                      <span suppressHydrationWarning>
                        màj {new Date(lastFetched).toLocaleTimeString("fr-FR")}
                      </span>
                    </>
                  )}
                </>}
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ background: BUCKET_STYLE.speeding.fill }}
          />
          en exces ({counts.speeding})
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

      <div className="rounded-lg overflow-hidden border">
        <MapContainer
          center={SITE.mapCenter}
          zoom={SITE.mapZoom}
          className="h-[50vh] sm:h-[70vh] w-full"
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {positions.map((p) => {
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
                        ({p.speed_knots.toFixed(1)} noeuds)
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
  );
}
