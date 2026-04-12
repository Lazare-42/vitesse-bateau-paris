"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
}

type SortKey =
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
  { key: "infraction_count", label: "Infractions", shortLabel: "Infr." },
  { key: "max_speed_knots", label: "Vitesse max", shortLabel: "V. max" },
  {
    key: "avg_speed_knots",
    label: "Vitesse moy. en infraction",
    shortLabel: "V. moy.",
  },
  {
    key: "last_infraction_at",
    label: "Derniere infraction",
    shortLabel: "Derniere",
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

export function OffendersTable({ data }: { data: Offender[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("infraction_count");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
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
  }, [data, sortKey, desc]);

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
        Aucune infraction enregistree pour le moment.
      </div>
    );
  }

  return (
    <>
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
                    href={`/infractions?bateau=${o.mmsi}`}
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
                    {o.infraction_count}
                  </span>
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
            href={`/infractions?bateau=${o.mmsi}`}
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
                {o.infraction_count} infraction
                {o.infraction_count > 1 ? "s" : ""}
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
                  Vitesse moy. en infraction
                </p>
                <p className="text-speed-warning">
                  {knotsToKmh(o.avg_speed_knots)} km/h
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Derniere infraction : {formatDate(o.last_infraction_at)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
