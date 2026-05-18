import { LiveMapWrapper } from "@/components/live-map-wrapper";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";

export default function DirectPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-lg font-semibold mb-2">En direct</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Position en temps réel des bateaux émettant en AIS sur la {SITE.river}.
        Carte rafraîchie automatiquement toutes les 30 secondes ; les bateaux
        en excès (au-dessus de {SITE.speedLimitKmh} km/h) sont en rouge.
      </p>
      <LiveMapWrapper />
    </main>
  );
}
