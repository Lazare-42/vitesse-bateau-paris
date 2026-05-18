"use client";

import dynamic from "next/dynamic";

const LiveMap = dynamic(
  () => import("@/components/live-map").then((mod) => mod.LiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[50vh] sm:h-[70vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
        Chargement de la carte…
      </div>
    ),
  },
);

export function LiveMapWrapper() {
  return <LiveMap />;
}
