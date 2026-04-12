"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo } from "react";

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

function mapUrl(inf: Infraction): string {
  if (inf.start_lat === inf.end_lat && inf.start_lon === inf.end_lon) {
    return `https://www.google.com/maps?q=${inf.start_lat},${inf.start_lon}`;
  }
  return `https://www.google.com/maps/dir/${inf.start_lat},${inf.start_lon}/${inf.end_lat},${inf.end_lon}`;
}

export function InfractionsBrowser({
  infractions,
  offenders,
}: {
  infractions: Infraction[];
  offenders: Offender[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedMmsi = searchParams.get("bateau");

  const filtered = useMemo(() => {
    if (!selectedMmsi) return infractions;
    const mmsi = parseInt(selectedMmsi, 10);
    return infractions.filter((inf) => inf.mmsi === mmsi);
  }, [infractions, selectedMmsi]);

  const selectedName = useMemo(() => {
    if (!selectedMmsi) return null;
    const mmsi = parseInt(selectedMmsi, 10);
    const o = offenders.find((o) => o.mmsi === mmsi);
    return o?.vessel_name || `MMSI ${mmsi}`;
  }, [offenders, selectedMmsi]);

  function setFilter(mmsi: string) {
    if (mmsi === "") {
      router.push("/infractions");
    } else {
      router.push(`/infractions?bateau=${mmsi}`);
    }
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {selectedName ? (
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{selectedName}</h2>
              <button
                onClick={() => setFilter("")}
                className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Voir tout
              </button>
            </div>
          ) : (
            <h2 className="text-lg font-semibold">Toutes les infractions</h2>
          )}
          <p className="text-sm text-muted-foreground">
            {filtered.length} infraction{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>

        <select
          value={selectedMmsi || ""}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
        >
          <option value="">Tous les bateaux</option>
          {offenders.map((o) => (
            <option key={o.mmsi} value={o.mmsi}>
              {o.vessel_name || `MMSI ${o.mmsi}`} ({o.infraction_count})
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Aucune infraction enregistree pour le moment.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-hidden rounded-lg border">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="hover:bg-transparent">
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium first:rounded-tl-lg">
                    Date
                  </th>
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium">
                    Bateau
                  </th>
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                    Vitesse max
                  </th>
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                    Vitesse moy.
                  </th>
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                    Exces
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
                {filtered.map((inf) => (
                  <tr
                    key={inf.id}
                    className="border-b transition-colors hover:bg-muted/50 last:border-0"
                  >
                    <td className="py-3 h-10 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(inf.started_at)}
                    </td>
                    <td className="py-3 h-10 px-3">
                      <button
                        onClick={() => setFilter(String(inf.mmsi))}
                        className="text-left hover:underline"
                      >
                        <div className="font-medium">
                          {inf.vessel_name || "Inconnu"}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          MMSI {inf.mmsi}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                      {knotsToKmh(inf.max_speed_knots)} km/h
                    </td>
                    <td className="py-3 h-10 px-3 text-right text-speed-warning">
                      {knotsToKmh(inf.avg_speed_knots)} km/h
                    </td>
                    <td className="py-3 h-10 px-3 text-right">
                      <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                        +
                        {excessPercent(
                          inf.max_speed_knots,
                          inf.speed_limit_knots,
                        )}
                        %
                      </span>
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
                        href={mapUrl(inf)}
                        target="_blank"
                        rel="noopener noreferrer"
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
            {filtered.map((inf) => (
              <a
                key={inf.id}
                href={mapUrl(inf)}
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
                    +
                    {excessPercent(
                      inf.max_speed_knots,
                      inf.speed_limit_knots,
                    )}
                    %
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-speed-danger">
                      {knotsToKmh(inf.max_speed_knots)} km/h
                    </p>
                    <p className="text-xs text-muted-foreground">
                      moy. {knotsToKmh(inf.avg_speed_knots)} km/h
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
                      Carte
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
      )}
    </div>
  );
}
