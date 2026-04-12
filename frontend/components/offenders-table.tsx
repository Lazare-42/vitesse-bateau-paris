import Link from "next/link";

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
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
  });
}

export function OffendersTable({ data }: { data: Offender[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Aucune infraction enregistree pour le moment.
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
                Infractions
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Vitesse max
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                Vitesse moy.
              </th>
              <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                Derniere infraction
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((o, i) => (
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
        {data.map((o, i) => (
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
                {o.infraction_count} infraction{o.infraction_count > 1 ? "s" : ""}
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
                <p className="text-xs text-muted-foreground">Vitesse moy.</p>
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
