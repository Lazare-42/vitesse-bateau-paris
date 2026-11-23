import type { Metadata } from "next";
import Link from "next/link";
import { getSwimSites } from "@/lib/api";
import { monthLabel } from "@/lib/months";
import { SITE } from "@/site.config";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: `Baignade dans la ${SITE.river} et vitesse des bateaux`,
  description: `Excès de vitesse des bateaux à proximité des sites de baignade de la ${SITE.river} à ${SITE.city}, pendant la saison estivale.`,
  alternates: { canonical: "/baignade" },
};

export default async function BaignadePage() {
  const sites = await getSwimSites();
  if (sites.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold tracking-tight">Sites de baignade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aucun site de baignade suivi pour cette zone.</p>
      </main>
    );
  }
  const months = Array.from(new Set(sites.flatMap((s) => (s.months ?? []).map((m) => m.month)))).sort();
  const radius = sites[0].radius_m;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Baignade et vitesse des bateaux</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Depuis 2025, on peut se baigner dans la {SITE.river} à {SITE.city} l&apos;été. Un bateau qui dépasse la
        limite près d&apos;un site de baignade crée des vagues et un risque pour les nageurs. Voici le nombre
        d&apos;excès soutenus (30 s et plus) qui commencent ou se terminent à moins de {radius} m d&apos;un site,
        de juin à septembre.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs text-muted-foreground dark:bg-input/30">
            <tr className="text-right">
              <th className="px-3 py-2 text-left font-medium">Site</th>
              {months.map((m) => (
                <th key={m} className="px-3 py-2 font-medium capitalize">{monthLabel(m)}</th>
              ))}
              <th className="px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.name} className="border-t text-right tabular-nums">
                <td className="px-3 py-2 text-left font-medium">{s.name}</td>
                {months.map((m) => {
                  const v = (s.months ?? []).find((x) => x.month === m);
                  return (
                    <td key={m} className="px-3 py-2">
                      {v ? (
                        <>
                          {v.infractions.toLocaleString("fr-FR")}
                          <span className="block text-xs text-muted-foreground">{v.boats} bateaux</span>
                        </>
                      ) : (
                        "0"
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-semibold">{s.total.toLocaleString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Les positions des sites sont approximatives et le rayon de {radius} m couvre aussi le chenal voisin : un
        excès compté ici n&apos;a pas forcément eu lieu pendant les horaires d&apos;ouverture de la baignade. Les
        excès de chaque bateau sont visibles sur la <Link href="/carte" className="underline">carte</Link>.
      </p>
    </main>
  );
}
