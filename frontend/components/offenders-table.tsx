"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarteLink } from "./carte-link";
import { BASE_PATH } from "@/site.config";

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
  cumulative_excess_knots: number;
  avg_infraction_duration_seconds: number;
  total_excess_seconds: number;
  excess_time_ratio: number;
}

interface Infraction {
  mmsi: number;
  vessel_name: string;
  max_speed_knots: number;
  avg_speed_knots: number;
  speed_limit_knots: number;
  started_at: string;
  ended_at: string;
}

const speedThresholds = [0, 13, 14, 15, 16, 20] as const;

function knotsFromKmh(kmh: number): number {
  return kmh / 1.852;
}

type SortKey =
  | "excess_time_ratio"
  | "avg_infraction_duration_seconds"
  | "total_excess_seconds"
  | "infraction_count"
  | "max_speed_knots"
  | "avg_speed_knots"
  | "last_infraction_at";

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
  });
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

function formatLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM === 0 ? `${h}h` : `${h}h ${remM}min`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `${d}j` : `${d}j ${remH}h`;
}

function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  const pct = ratio * 100;
  return pct >= 10 ? `${pct.toFixed(0)} %` : `${pct.toFixed(1)} %`;
}

const columns: { key: SortKey; label: string; shortLabel: string }[] = [
  {
    key: "excess_time_ratio",
    label: "% du temps en exces",
    shortLabel: "% exces",
  },
  {
    key: "total_excess_seconds",
    label: "Temps total en exces",
    shortLabel: "Total temps",
  },
  {
    key: "avg_infraction_duration_seconds",
    label: "Duree moy. en exces",
    shortLabel: "Duree moy.",
  },
  { key: "infraction_count", label: "Nb. exces", shortLabel: "Nb." },
  { key: "max_speed_knots", label: "Vitesse max", shortLabel: "V. max" },
  {
    key: "avg_speed_knots",
    label: "Vitesse moy. en exces",
    shortLabel: "V. moy.",
  },
  {
    key: "last_infraction_at",
    label: "Dernier exces",
    shortLabel: "Dernier",
  },
];

function SortIcon({
  active,
  desc,
}: {
  active: boolean;
  desc: boolean;
}) {
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

function aggregateOffenders(
  infractions: Infraction[],
  ratioByMmsi: Map<number, number>,
): Offender[] {
  const byMmsi = new Map<number, Infraction[]>();
  for (const inf of infractions) {
    const list = byMmsi.get(inf.mmsi);
    if (list) list.push(inf);
    else byMmsi.set(inf.mmsi, [inf]);
  }
  const result: Offender[] = [];
  for (const [mmsi, infs] of byMmsi) {
    const maxSpeed = Math.max(...infs.map((i) => i.max_speed_knots));
    const avgSpeed =
      infs.reduce((sum, i) => sum + i.avg_speed_knots, 0) / infs.length;
    const lastAt = infs.reduce(
      (latest, i) => (i.started_at > latest ? i.started_at : latest),
      infs[0].started_at,
    );
    const cumulativeExcess = infs.reduce(
      (sum, i) => sum + (i.avg_speed_knots - i.speed_limit_knots),
      0,
    );
    const totalDuration = infs.reduce(
      (sum, i) =>
        sum +
        (new Date(i.ended_at).getTime() - new Date(i.started_at).getTime()) /
          1000,
      0,
    );
    const avgDuration = totalDuration / infs.length;
    result.push({
      mmsi,
      vessel_name: infs[0].vessel_name,
      infraction_count: infs.length,
      max_speed_knots: maxSpeed,
      avg_speed_knots: avgSpeed,
      last_infraction_at: lastAt,
      cumulative_excess_knots: cumulativeExcess,
      avg_infraction_duration_seconds: avgDuration,
      total_excess_seconds: totalDuration,
      // The ratio is per-vessel (time-in-excess / time-in-zone) and can't
      // be recomputed client-side without positions data, so we pass the
      // global value through from the server-rendered offenders list.
      // It overstates the ratio when the speed-threshold filter is on
      // (it's still the all-speeds ratio), which is an acceptable limit.
      excess_time_ratio: ratioByMmsi.get(mmsi) ?? 0,
    });
  }
  return result;
}

export function OffendersTable({ data }: { data: Offender[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("excess_time_ratio");
  const [desc, setDesc] = useState(true);
  const [minSpeedKmh, setMinSpeedKmh] = useState(0);
  const [allInfractions, setAllInfractions] = useState<Infraction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchAllInfractions = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_PATH}/api/infractions?limit=10000`);
      if (res.ok) {
        setAllInfractions(await res.json());
      }
    } catch {
      // keep using original data
    } finally {
      setLoading(false);
    }
  }, []);

  function handleThreshold(t: number) {
    setMinSpeedKmh(t);
    if (t > 0 && !fetchedRef.current) {
      fetchAllInfractions();
    }
  }

  const ratioByMmsi = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of data) m.set(o.mmsi, o.excess_time_ratio);
    return m;
  }, [data]);

  const effectiveData = useMemo(() => {
    if (minSpeedKmh === 0 || !allInfractions) return data;
    const minKnots = knotsFromKmh(minSpeedKmh);
    const filtered = allInfractions.filter(
      (inf) => inf.max_speed_knots >= minKnots,
    );
    return aggregateOffenders(filtered, ratioByMmsi);
  }, [data, allInfractions, minSpeedKmh, ratioByMmsi]);

  const sorted = useMemo(() => {
    return [...effectiveData].sort((a, b) => {
      let cmp: number;
      if (sortKey === "last_infraction_at") {
        cmp =
          new Date(a.last_infraction_at).getTime() -
          new Date(b.last_infraction_at).getTime();
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number);
      }
      return desc ? -cmp : cmp;
    });
  }, [effectiveData, sortKey, desc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setDesc(!desc);
    } else {
      setSortKey(key);
      setDesc(true);
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
      {/* Speed threshold filter */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Vitesse min :</span>
        {speedThresholds.map((t) => (
          <button
            key={t}
            onClick={() => handleThreshold(t)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              minSpeedKmh === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === 0 ? "Toutes" : `> ${t} km/h`}
          </button>
        ))}
        {minSpeedKmh > 0 && !loading && (
          <span className="text-xs text-muted-foreground ml-1">
            {effectiveData.length} bateau{effectiveData.length !== 1 ? "x" : ""}
          </span>
        )}
        {loading && (
          <span className="text-xs text-muted-foreground ml-1 animate-pulse">
            Chargement...
          </span>
        )}
      </div>

      {/* Mobile sort selector */}
      <div className="sm:hidden mb-3">
        <select
          value={sortKey}
          onChange={(e) => {
            setSortKey(e.target.value as SortKey);
            setDesc(true);
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground w-full"
        >
          {columns.map((c) => (
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
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium first:rounded-tl-lg">
                #
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium">
                Bateau
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right font-medium cursor-pointer select-none hover:text-foreground transition-colors ${
                    sortKey === col.key
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} desc={desc} />
                </th>
              ))}
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                Carte
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((o, i) => (
              <tr
                key={o.mmsi}
                className="border-b transition-colors hover:bg-muted/50 last:border-0"
              >
                <td className="py-3 h-10 px-3 text-muted-foreground">
                  {i + 1}
                </td>
                <td className="py-3 h-10 px-3">
                  <Link
                    href={`/exces?bateau=${o.mmsi}`}
                    className="hover:underline"
                  >
                    <div className="font-medium">
                      {o.vessel_name || "Inconnu"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      MMSI {o.mmsi}
                    </div>
                  </Link>
                </td>
                <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                  {formatPercent(o.excess_time_ratio)}
                </td>
                <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                  {formatLongDuration(o.total_excess_seconds)}
                </td>
                <td className="py-3 h-10 px-3 text-right text-speed-warning">
                  {formatDuration(o.avg_infraction_duration_seconds)}
                </td>
                <td className="py-3 h-10 px-3 text-right">
                  {o.infraction_count}
                </td>
                <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                  {knotsToKmh(o.max_speed_knots)} km/h
                </td>
                <td className="py-3 h-10 px-3 text-right text-speed-warning">
                  {knotsToKmh(o.avg_speed_knots)} km/h
                </td>
                <td className="py-3 h-10 px-3 text-right text-muted-foreground text-xs">
                  {formatDate(o.last_infraction_at)}
                </td>
                <td className="py-3 h-10 px-3 text-right">
                  <CarteLink href={`/carte?bateau=${o.mmsi}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {sorted.map((o, i) => (
          <div
            key={o.mmsi}
            className="rounded-lg border bg-card p-4 text-card-foreground transition-colors"
          >
            <Link
              href={`/exces?bateau=${o.mmsi}`}
              className="block active:bg-muted/50 -m-4 p-4 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <p className="font-semibold">
                    {o.vessel_name || "Inconnu"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    MMSI {o.mmsi}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                  {formatPercent(o.excess_time_ratio)} du temps en exces
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Temps total en exces
                  </p>
                  <p className="font-medium text-speed-danger">
                    {formatLongDuration(o.total_excess_seconds)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Duree moy. en exces
                  </p>
                  <p className="text-speed-warning">
                    {formatDuration(o.avg_infraction_duration_seconds)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vitesse max</p>
                  <p className="font-medium text-speed-danger">
                    {knotsToKmh(o.max_speed_knots)} km/h
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Nb. exces</p>
                  <p>{o.infraction_count}</p>
                </div>
              </div>
            </Link>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Dernier exces : {formatDate(o.last_infraction_at)}
              </p>
              <CarteLink href={`/carte?bateau=${o.mmsi}`} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
