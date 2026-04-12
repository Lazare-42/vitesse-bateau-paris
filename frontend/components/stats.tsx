interface StatsData {
  total_vessels_tracked: number;
  total_positions: number;
  total_infractions: number;
  unique_offenders: number;
  avg_infraction_speed_knots: number;
  max_infraction_speed_knots: number;
}

function knotsToKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

export function Stats({ data }: { data: StatsData }) {
  const cards = [
    {
      label: "Bateaux suivis",
      value: data.total_vessels_tracked.toLocaleString("fr-FR"),
    },
    {
      label: "Infractions",
      value: data.total_infractions.toLocaleString("fr-FR"),
    },
    {
      label: "Recidivistes",
      value: data.unique_offenders.toLocaleString("fr-FR"),
    },
    {
      label: "Vitesse max",
      value: `${knotsToKmh(data.max_infraction_speed_knots)} km/h`,
      sub: `${data.max_infraction_speed_knots.toFixed(1)} noeuds`,
    },
    {
      label: "Vitesse moy. infraction",
      value: `${knotsToKmh(data.avg_infraction_speed_knots)} km/h`,
      sub: `${data.avg_infraction_speed_knots.toFixed(1)} noeuds`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border bg-card p-4 text-card-foreground"
        >
          <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-xl font-bold">{c.value}</p>
          {c.sub && (
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
