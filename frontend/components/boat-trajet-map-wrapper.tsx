"use client";

import dynamic from "next/dynamic";

// Leaflet needs the DOM, so load the map client-side only. A Server Component
// can't pass ssr:false to next/dynamic, hence this thin client wrapper.
interface Infraction {
  id: number;
  max_speed_knots: number;
  speed_limit_knots: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  started_at: string;
  ended_at: string;
}

const BoatTrajetMap = dynamic(
  () => import("@/components/boat-trajet-map").then((m) => m.BoatTrajetMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[40vh] sm:h-[55vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Chargement de la carte…
      </div>
    ),
  },
);

export function BoatTrajetMapWrapper({
  infractions,
}: {
  infractions: Infraction[];
}) {
  return <BoatTrajetMap infractions={infractions} />;
}
