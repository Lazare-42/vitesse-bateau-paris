import Link from "next/link";
import { CarteLink } from "./carte-link";

export interface FastestEver {
  infraction_id: number;
  mmsi: number;
  vessel_name: string;
  max_speed_knots: number;
  avg_speed_knots: number;
  speed_limit_knots: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

function knotsToKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m} min ${s}s`;
}

export function FastestTable({ data }: { data: FastestEver[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Aucun exces enregistre pour le moment.
      </div>
    );
  }

  return (
    <>
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
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Record (max)
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Moyenne
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Duree
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Date
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                Carte
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr
                key={r.mmsi}
                className="border-b transition-colors hover:bg-muted/50 last:border-0"
              >
                <td className="py-3 h-10 px-3 text-muted-foreground">{i + 1}</td>
                <td className="py-3 h-10 px-3">
                  <Link
                    href={`/exces?bateau=${r.mmsi}`}
                    className="hover:underline"
                  >
                    <div className="font-medium">
                      {r.vessel_name || "Inconnu"}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      MMSI {r.mmsi}
                    </div>
                  </Link>
                </td>
                <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                  {knotsToKmh(r.max_speed_knots)} km/h
                </td>
                <td className="py-3 h-10 px-3 text-right text-speed-warning">
                  {knotsToKmh(r.avg_speed_knots)} km/h
                </td>
                <td className="py-3 h-10 px-3 text-right text-muted-foreground">
                  {formatDuration(r.duration_seconds)}
                </td>
                <td className="py-3 h-10 px-3 text-right text-muted-foreground text-xs">
                  {formatDate(r.started_at)}
                </td>
                <td className="py-3 h-10 px-3 text-right">
                  <CarteLink
                    href={
                      r.infraction_id
                        ? `/carte?exces=${r.infraction_id}`
                        : `/carte?bateau=${r.mmsi}`
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden flex flex-col gap-3">
        {data.map((r, i) => (
          <div
            key={r.mmsi}
            className="rounded-lg border bg-card p-4 text-card-foreground transition-colors"
          >
            <Link
              href={`/exces?bateau=${r.mmsi}`}
              className="block active:bg-muted/50 -m-4 p-4 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <p className="font-semibold">{r.vessel_name || "Inconnu"}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    MMSI {r.mmsi}
                  </p>
                </div>
                <span className="text-lg font-bold text-speed-danger">
                  {knotsToKmh(r.max_speed_knots)} km/h
                </span>
              </div>
            </Link>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Moyenne : {knotsToKmh(r.avg_speed_knots)} km/h &middot;{" "}
                {formatDuration(r.duration_seconds)} &middot;{" "}
                {formatDate(r.started_at)}
              </p>
              <CarteLink
                href={
                  r.infraction_id
                    ? `/carte?exces=${r.infraction_id}`
                    : `/carte?bateau=${r.mmsi}`
                }
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
