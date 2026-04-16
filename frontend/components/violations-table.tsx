"use client";

import { useMemo, useState } from "react";

interface Infraction {
  id: number;
  mmsi: number;
  vessel_name: string;
  max_speed_knots: number;
  avg_speed_knots: number;
  speed_limit_knots: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  started_at: string;
  ended_at: string;
  ping_count: number;
}

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  cumulative_excess_knots: number;
}

function knotsToKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function excessPercent(speed: number, limit: number): number {
  return Math.round(((speed - limit) / limit) * 100);
}

function duration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function carteUrl(inf: Infraction): string {
  return `/carte?exces=${inf.id}`;
}

type SortKey = "date" | "speed" | "excess";

const sortColumns: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: "date", label: "Date", shortLabel: "Date" },
  { key: "speed", label: "Vitesse max", shortLabel: "V. max" },
  { key: "excess", label: "Exces", shortLabel: "Exces" },
];

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) {
    return (
      <svg
        className="ml-1 inline h-3 w-3 text-muted-foreground/40"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
        />
      </svg>
    );
  }
  return (
    <svg
      className="ml-1 inline h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={desc ? "M19.5 8.25l-7.5 7.5-7.5-7.5" : "M4.5 15.75l7.5-7.5 7.5 7.5"}
      />
    </svg>
  );
}

const speedThresholds = [0, 13, 14, 15, 16, 20] as const;

function knotsFromKmh(kmh: number): number {
  return kmh / 1.852;
}

export function ViolationsTable({
  data,
  offenders,
}: {
  data: Infraction[];
  offenders?: Offender[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);
  const [minSpeedKmh, setMinSpeedKmh] = useState(0);
  const [selectedMmsi, setSelectedMmsi] = useState("");

  const boatFiltered = useMemo(() => {
    if (!selectedMmsi) return data;
    const mmsi = parseInt(selectedMmsi, 10);
    return data.filter((inf) => inf.mmsi === mmsi);
  }, [data, selectedMmsi]);

  const filtered = useMemo(() => {
    if (minSpeedKmh === 0) return boatFiltered;
    const minKnots = knotsFromKmh(minSpeedKmh);
    return boatFiltered.filter((inf) => inf.max_speed_knots >= minKnots);
  }, [boatFiltered, minSpeedKmh]);

  const selectedName = useMemo(() => {
    if (!selectedMmsi || !offenders) return null;
    const mmsi = parseInt(selectedMmsi, 10);
    const o = offenders.find((o) => o.mmsi === mmsi);
    return o?.vessel_name || `MMSI ${mmsi}`;
  }, [offenders, selectedMmsi]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === "date") {
        cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
      } else if (sortKey === "speed") {
        cmp = a.max_speed_knots - b.max_speed_knots;
      } else {
        cmp =
          excessPercent(a.max_speed_knots, a.speed_limit_knots) -
          excessPercent(b.max_speed_knots, b.speed_limit_knots);
      }
      return sortDesc ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Aucun exces enregistre pour le moment.
      </div>
    );
  }

  return (
    <>
      {/* Boat filter */}
      {offenders && offenders.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {selectedName && (
              <>
                <span className="text-sm font-semibold">{selectedName}</span>
                <button
                  onClick={() => setSelectedMmsi("")}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Voir tout
                </button>
              </>
            )}
          </div>
          <select
            value={selectedMmsi}
            onChange={(e) => setSelectedMmsi(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
          >
            <option value="">Tous les bateaux</option>
            {offenders.map((o) => (
              <option key={o.mmsi} value={o.mmsi}>
                {o.vessel_name || `MMSI ${o.mmsi}`} ({knotsToKmh(o.cumulative_excess_knots)} km/h)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Speed threshold filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Vitesse min :</span>
        {speedThresholds.map((t) => (
          <button
            key={t}
            onClick={() => setMinSpeedKmh(t)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              minSpeedKmh === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === 0 ? "Toutes" : `> ${t} km/h`}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-1">
          {filtered.length} exces
        </span>
      </div>

      {/* Mobile sort selector */}
      <div className="sm:hidden mb-3">
        <select
          value={sortKey}
          onChange={(e) => {
            setSortKey(e.target.value as SortKey);
            setSortDesc(true);
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground w-full"
        >
          {sortColumns.map((c) => (
            <option key={c.key} value={c.key}>
              Trier par : {c.shortLabel}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-hidden rounded-lg border">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="hover:bg-transparent">
              {sortColumns.map((col, i) => (
                <th
                  key={col.key}
                  className={`h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input font-medium cursor-pointer select-none hover:text-foreground transition-colors ${
                    i === 0 ? "text-left first:rounded-tl-lg" : "text-right"
                  } ${sortKey === col.key ? "text-foreground" : "text-muted-foreground"}`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} desc={sortDesc} />
                </th>
              ))}
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium">
                Bateau
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Duree
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                Trajet
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inf) => (
              <tr
                key={inf.id}
                className="border-b transition-colors hover:bg-muted/50 last:border-0"
              >
                <td className="py-3 h-10 px-3 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(inf.started_at)}
                </td>
                <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                  {knotsToKmh(inf.max_speed_knots)} km/h
                </td>
                <td className="py-3 h-10 px-3 text-right">
                  <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                    +{excessPercent(inf.max_speed_knots, inf.speed_limit_knots)}%
                  </span>
                </td>
                <td className="py-3 h-10 px-3">
                  {offenders ? (
                    <button
                      onClick={() => setSelectedMmsi(String(inf.mmsi))}
                      className="text-left hover:underline"
                    >
                      <div className="font-medium">
                        {inf.vessel_name || "Inconnu"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        MMSI {inf.mmsi}
                      </div>
                    </button>
                  ) : (
                    <>
                      <div className="font-medium">
                        {inf.vessel_name || "Inconnu"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        MMSI {inf.mmsi}
                      </div>
                    </>
                  )}
                </td>
                <td className="py-3 h-10 px-3 text-right text-xs text-muted-foreground">
                  {duration(inf.started_at, inf.ended_at)}
                  {inf.ping_count > 1 && (
                    <span className="ml-1 text-muted-foreground/60">
                      ({inf.ping_count} pts)
                    </span>
                  )}
                </td>
                <td className="py-3 h-10 px-3 text-right">
                  <a
                    href={carteUrl(inf)}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                      />
                    </svg>
                    Carte
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {sorted.map((inf) => (
          <a
            key={inf.id}
            href={carteUrl(inf)}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-lg border bg-card p-4 text-card-foreground active:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">
                  {inf.vessel_name || "Inconnu"}
                </p>
                <p className="text-xs text-muted-foreground font-mono">
                  MMSI {inf.mmsi}
                </p>
              </div>
              <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                +{excessPercent(inf.max_speed_knots, inf.speed_limit_knots)}%
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-speed-danger">
                  {knotsToKmh(inf.max_speed_knots)} km/h
                </p>
                <p className="text-xs text-muted-foreground">
                  moy. {knotsToKmh(inf.avg_speed_knots)} km/h &middot; limite{" "}
                  {knotsToKmh(inf.speed_limit_knots)} km/h
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">
                  {duration(inf.started_at, inf.ended_at)}
                </p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                    />
                  </svg>
                  Voir sur la carte
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDateShort(inf.started_at)}
            </p>
          </a>
        ))}
      </div>
    </>
  );
}
