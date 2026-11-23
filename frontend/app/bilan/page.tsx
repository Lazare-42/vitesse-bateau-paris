import type { Metadata } from "next";
import Link from "next/link";
import { getTrends } from "@/lib/api";
import { fmtPct } from "@/lib/trends";
import { monthKey, monthLabel, publishableMonths } from "@/lib/months";
import { BASE_PATH, SITE } from "@/site.config";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Bilans mensuels — vitesse des bateaux sur la ${SITE.river}`,
  description: `Chaque mois, le bilan des excès de vitesse des bateaux sur la ${SITE.river} à ${SITE.city} : part du temps au-dessus de ${SITE.speedLimitKmh} km/h, bateaux les plus rapides, débit du fleuve.`,
  alternates: { canonical: "/bilan", types: { "application/rss+xml": "/bilan/rss.xml" } },
};

export default async function BilanIndex() {
  const months = publishableMonths(await getTrends("month")).reverse();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Bilans mensuels</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Un bilan par mois terminé.{" "}
        <a href={`${BASE_PATH}/bilan/rss.xml`} className="underline hover:text-foreground">Flux RSS</a>.
      </p>
      <ul className="mt-6 divide-y rounded-lg border">
        {months.map((m) => (
          <li key={m.period}>
            <Link href={`/bilan/${monthKey(m.period)}`} className="flex items-baseline justify-between px-4 py-3 hover:bg-muted/50">
              <span className="font-medium capitalize">{monthLabel(monthKey(m.period))}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {fmtPct(m.share_over)} du temps &gt; {SITE.speedLimitKmh} km/h
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
