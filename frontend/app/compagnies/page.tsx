import type { Metadata } from "next";
import Link from "next/link";
import { getOperators } from "@/lib/api";
import { fmtDelta, fmtPct } from "@/lib/trends";
import { SITE } from "@/site.config";

export const revalidate = 600;

export const metadata: Metadata = {
  title: `Compagnies de bateaux et excès de vitesse sur la ${SITE.river}`,
  description: `Quelles compagnies de bateaux respectent la limite de ${SITE.speedLimitKmh} km/h sur la ${SITE.river} à ${SITE.city} ? Part du temps en excès par compagnie, sur 30 jours et depuis le début du suivi.`,
  alternates: { canonical: "/compagnies" },
};

export default async function CompagniesPage() {
  const ops = (await getOperators()).sort((a, b) => b.share_over_30d - a.share_over_30d);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Par compagnie</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Part du temps de navigation passé au-dessus de {SITE.speedLimitKmh} km/h par
        les bateaux de chaque compagnie. Une compagnie peut agir sur toute sa flotte
        (consignes, horaires) : c&apos;est souvent à ce niveau que les choses changent.
      </p>

      {ops.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Aucune compagnie référencée pour cette zone.</p>
      ) : (
        <>
        <ul className="mt-6 space-y-3 sm:hidden">
          {ops.map((o) => (
            <li key={o.slug} className="rounded-lg border p-4">
              <Link href={`/compagnies/${o.slug}`} className="font-medium hover:underline">
                {o.name}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {o.boats.length} bateau{o.boats.length > 1 ? "x" : ""}
              </span>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs tabular-nums">
                <div>
                  <dt className="text-muted-foreground">30 derniers jours</dt>
                  <dd className="text-lg font-semibold">{o.moving_s_30d ? fmtPct(o.share_over_30d) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">vs 30 jours précédents</dt>
                  <dd className="text-lg">
                    {o.moving_s_30d && o.moving_s_prev ? fmtDelta(o.share_over_prev, o.share_over_30d) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Depuis le début</dt>
                  <dd>{fmtPct(o.share_over_all)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Descente &gt; 15 km/h</dt>
                  <dd>{fmtPct(o.share_over15_down_all)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="mt-6 hidden overflow-x-auto rounded-lg border sm:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs text-muted-foreground dark:bg-input/30">
              <tr className="text-right">
                <th className="px-3 py-2 text-left font-medium">Compagnie</th>
                <th className="px-3 py-2 font-medium">Bateaux</th>
                <th className="px-3 py-2 font-medium">30 derniers jours</th>
                <th className="px-3 py-2 font-medium">30 jours précédents</th>
                <th className="px-3 py-2 font-medium">Évolution</th>
                <th className="px-3 py-2 font-medium">Depuis le début</th>
                <th className="px-3 py-2 font-medium">Descente &gt; 15 km/h</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.slug} className="border-t text-right tabular-nums hover:bg-muted/50">
                  <td className="px-3 py-2 text-left">
                    <Link href={`/compagnies/${o.slug}`} className="font-medium hover:underline">
                      {o.name}
                    </Link>
                    {o.note && <p className="text-xs text-muted-foreground">{o.note}</p>}
                  </td>
                  <td className="px-3 py-2">{o.boats.length}</td>
                  <td className="px-3 py-2 font-semibold">{o.moving_s_30d ? fmtPct(o.share_over_30d) : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{o.moving_s_prev ? fmtPct(o.share_over_prev) : "—"}</td>
                  <td className="px-3 py-2">{o.moving_s_30d && o.moving_s_prev ? fmtDelta(o.share_over_prev, o.share_over_30d) : "—"}</td>
                  <td className="px-3 py-2">{fmtPct(o.share_over_all)}</td>
                  <td className="px-3 py-2">{fmtPct(o.share_over15_down_all)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div className="mt-6 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          Le rattachement des bateaux aux compagnies est établi à partir de sources
          publiques (sites des compagnies, presse spécialisée, Wikipédia). Seuls les
          bateaux identifiés avec certitude sont rattachés. Une compagnie souhaitant
          corriger ce rattachement ou réagir peut écrire à l&apos;adresse indiquée en bas de page.
        </p>
        <p>
          Les écarts entre périodes dépendent aussi du débit du fleuve (voir{" "}
          <Link href="/evolution" className="underline hover:text-foreground">Évolution</Link>) et
          du nombre de bateaux en service : à lire comme une tendance, pas comme un constat individuel.
        </p>
      </div>
    </main>
  );
}
