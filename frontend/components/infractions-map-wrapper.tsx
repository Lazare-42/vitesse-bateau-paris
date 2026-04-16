"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

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

const InfractionsMap = dynamic(
  () =>
    import("@/components/infractions-map").then((mod) => mod.InfractionsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[50vh] sm:h-[70vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Chargement de la carte...
      </div>
    ),
  },
);

export function InfractionsMapWrapper(props: {
  infractions: Infraction[];
  offenders: Offender[];
}) {
  const searchParams = useSearchParams();
  const infractionParam = searchParams.get("exces");
  const bateauParam = searchParams.get("bateau");

  return (
    <InfractionsMap
      {...props}
      initialInfractionId={infractionParam ? parseInt(infractionParam, 10) : undefined}
      initialMmsi={bateauParam ? parseInt(bateauParam, 10) : undefined}
    />
  );
}
