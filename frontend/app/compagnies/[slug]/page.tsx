import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOperators, getOperatorTrends, getTrends } from "@/lib/api";
import { LineChart, pct } from "@/components/line-chart";
import { BoatThumb } from "@/components/boat-thumb";
import { fmtDelta, fmtPct, seriesOf } from "@/lib/trends";
import { SITE } from "@/site.config";

export const revalidate = 600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const op = (await getOperators()).find((o) => o.slug === slug);
  if (!op) return { title: "Compagnie introuvable", robots: { index: false } };
  return {
    title: `${op.name} — vitesse de ses bateaux sur la ${SITE.river}`,
    description: `${op.name} : part du temps de navigation au-dessus de ${SITE.speedLimitKmh} km/h pour ses ${op.boats.length} bateaux suivis sur la ${SITE.river} à ${SITE.city}, évolution mois par mois.`,
    alternates: { canonical: `/compagnies/${slug}` },
  };
}

export default async function CompagniePage({ params }: Params) {
  const { slug } = await params;
  const [ops, trends, fleet] = await Promise.all([
    getOperators(),
    getOperatorTrends(slug, "month"),
    getTrends("month"),
  ]);
  const op = ops.find((o) => o.slug === slug);
  if (!op) notFound();
  const marker = SITE.launchDate ? { x: SITE.launchDate, label: "mise en ligne" } : undefined;
  const boats = [...op.boats].sort((a, b) => b.share_over_all - a.share_over_all);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground" aria-label="Fil d'Ariane">
        <Link href="/compagnies" className="hover:text-foreground">Compagnies</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{op.name}</span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">{op.name}</h1>
      {op.note && <p className="mt-1 text-sm text-muted-foreground">{op.note}</p>}
      {op.url && (
        <a href={op.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-muted-foreground underline hover:text-foreground">
          Site de la compagnie
        </a>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bateaux suivis" value={String(op.boats.length)} />
        <Stat label="30 derniers jours" value={op.moving_s_30d ? fmtPct(op.share_over_30d) : "—"} sub={`du temps > ${SITE.speedLimitKmh} km/h`} />
        <Stat label="vs 30 jours précédents" value={op.moving_s_30d && op.moving_s_prev ? fmtDelta(op.share_over_prev, op.share_over_30d) : "—"} />
        <Stat label="Descente > 15 km/h" value={fmtPct(op.share_over15_down_all)} sub="depuis le début" />
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Mois par mois, comparé à l&apos;ensemble des bateaux</h2>
      <LineChart
        ariaLabel={`Part du temps au-dessus de ${SITE.speedLimitKmh} km/h, ${op.name} et ensemble des bateaux`}
        format={pct}
        marker={marker}
        series={[
          { label: `${op.name} — tous sens`, color: "var(--series-1)", points: seriesOf(trends, (t) => t.share_over, "month") },
          { label: `${op.name} — descente > 15 km/h`, color: "var(--series-2)", points: seriesOf(trends, (t) => t.share_over15_down, "month") },
          { label: "Tous les bateaux — tous sens", color: "var(--series-3)", points: seriesOf(fleet, (t) => t.share_over, "month"), dashed: true },
        ]}
      />

      <h2 className="mt-10 mb-3 text-lg font-semibold">Bateaux</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs text-muted-foreground dark:bg-input/30">
            <tr className="text-right">
              <th className="px-3 py-2 text-left font-medium">Bateau</th>
              <th className="px-3 py-2 font-medium">30 derniers jours</th>
              <th className="px-3 py-2 font-medium">30 jours précédents</th>
              <th className="px-3 py-2 font-medium">Depuis le début</th>
            </tr>
          </thead>
          <tbody>
            {boats.map((b) => (
              <tr key={b.mmsi} className="border-t text-right tabular-nums hover:bg-muted/50">
                <td className="px-3 py-2 text-left">
                  <Link href={`/bateau/${b.mmsi}`} className="inline-flex items-center gap-2 hover:underline">
                    <BoatThumb src={b.photo_thumb_url} alt={b.name} size={32} />
                    {b.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{b.moving_s_30d ? fmtPct(b.share_over_30d) : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{b.moving_s_prev ? fmtPct(b.share_over_prev) : "—"}</td>
                <td className="px-3 py-2">{b.moving_s_all ? fmtPct(b.share_over_all) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        « — » : bateau non observé en mouvement sur la période. Rattachement établi à partir de sources publiques ;
        corrections bienvenues (contact en bas de page).
      </p>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
