import type { Metadata } from "next";
import { LiveMapWrapper } from "@/components/live-map-wrapper";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `En direct — bateaux sur la ${SITE.river}`,
  description: `Carte en temps réel de tous les bateaux émettant en AIS sur la ${SITE.river} à ${SITE.city}. Les bateaux en excès (au-dessus de ${SITE.speedLimitKmh} km/h) apparaissent en rouge.`,
  alternates: { canonical: "/direct" },
  openGraph: {
    title: `Carte en direct — bateaux sur la ${SITE.river}`,
    description: `Position en temps réel de tous les bateaux émettant en AIS sur la ${SITE.river} à ${SITE.city}.`,
    url: "/direct",
    type: "website",
  },
};

export default function DirectPage() {
  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold tracking-tight">
        Bateaux en direct sur la {SITE.river}
      </h1>
      <p className="text-sm text-muted-foreground mb-4">
        Position en temps réel des bateaux émettant en AIS sur la {SITE.river}.
        Carte rafraîchie automatiquement toutes les 30 secondes ; les bateaux
        en excès (au-dessus de {SITE.speedLimitKmh} km/h) sont en rouge.
      </p>
      <LiveMapWrapper />
    </main>
  );
}
