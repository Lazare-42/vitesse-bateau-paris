"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
  cumulative_excess_knots: number;
}

interface Infraction {
  mmsi: number;
  vessel_name: string;
  max_speed_knots: number;
  avg_speed_knots: number;
  speed_limit_knots: number;
  started_at: string;
}

const speedThresholds = [0, 13, 14, 15, 16, 20] as const;

function knotsFromKmh(kmh: number): number {
  return kmh / 1.852;
}

type SortKey =
  | "cumulative_excess_knots"
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

const columns: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: "cumulative_excess_knots", label: "Total au-dessus de la limite", shortLabel: "Total exces" },
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

function aggregateOffenders(infractions: Infraction[]): Offender[] {
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
    result.push({
      mmsi,
      vessel_name: infs[0].vessel_name,
      infraction_count: infs.length,
      max_speed_knots: maxSpeed,
      avg_speed_knots: avgSpeed,
      last_infraction_at: lastAt,
      cumulative_excess_knots: cumulativeExcess,
    });
  }
  return result;
}

export function OffendersTable({ data }: { data: Offender[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("cumulative_excess_knots");
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
      const res = await fetch("/api/infractions?limit=10000");
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

  const effectiveData = useMemo(() => {
    if (minSpeedKmh === 0 || !allInfractions) return data;
    const minKnots = knotsFromKmh(minSpeedKmh);
    const filtered = allInfractions.filter(
      (inf) => inf.max_speed_knots >= minKnots,
    );
    return aggregateOffenders(filtered);
  }, [data, allInfractions, minSpeedKmh]);

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
                  } last:rounded-tr-lg`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} desc={desc} />
                </th>
              ))}
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
                <td className="py-3 h-10 px-3 text-right">
                  <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                    +{knotsToKmh(o.cumulative_excess_knots)}
                  </span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {sorted.map((o, i) => (
          <Link
            key={o.mmsi}
            href={`/exces?bateau=${o.mmsi}`}
            className="block rounded-lg border bg-card p-4 text-card-foreground active:bg-muted/50 transition-colors"
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
                +{knotsToKmh(o.cumulative_excess_knots)} km/h cumule
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Vitesse max</p>
                <p className="font-medium text-speed-danger">
                  {knotsToKmh(o.max_speed_knots)} km/h
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Nb. exces
                </p>
                <p>{o.infraction_count}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Dernier exces : {formatDate(o.last_infraction_at)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
