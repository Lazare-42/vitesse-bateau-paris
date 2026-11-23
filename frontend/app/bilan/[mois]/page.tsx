import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_SHORT, getMonthBoats, getTrends, type TrendPoint } from "@/lib/api";
import { fmtDelta, fmtPct } from "@/lib/trends";
import { monthKey, monthLabel, publishableMonths } from "@/lib/months";
import { SITE } from "@/site.config";

export const revalidate = 3600;

type Params = { params: Promise<{ mois: string }> };

async function load(mois: string) {
  if (!/^\d{4}-\d{2}$/.test(mois)) return null;
  const months = publishableMonths(await getTrends("month"));
  const i = months.findIndex((m) => monthKey(m.period) === mois);
  if (i < 0) return null;
  return { m: months[i], prev: i > 0 ? months[i - 1] : undefined };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mois } = await params;
  const d = await load(mois);
  if (!d) return { title: "Bilan introuvable", robots: { index: false } };
  const label = monthLabel(mois);
  return {
    title: `Bilan ${label} — excès de vitesse sur la ${SITE.river}`,
    description: `En ${label}, les bateaux ont passé ${fmtPct(d.m.share_over)} de leur temps de navigation au-dessus de ${SITE.speedLimitKmh} km/h sur la ${SITE.river} à ${SITE.city}. ${d.m.infractions.toLocaleString("fr-FR")} excès soutenus, bateaux les plus rapides, débit du fleuve.`,
    alternates: { canonical: `/bilan/${mois}` },
  };
}

export default async function BilanMois({ params }: Params) {
  const { mois } = await params;
  const d = await load(mois);
  if (!d) notFound();
  const { m, prev } = d;
  const boats = await getMonthBoats(mois);
  const label = monthLabel(mois);
  const passengers = boats.filter((b) => b.category === "passagers").slice(0, 10);
  const small = boats.filter((b) => b.category === "petits").slice(0, 5);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/bilan" className="hover:text-foreground">Bilans</Link>
        <span className="mx-1.5">/</span>
        <span className="capitalize text-foreground">{label}</span>
      </nav>
      <h1 className="text-2xl font-bold tracking-tight">
        Bilan de <span className="capitalize">{label}</span>
      </h1>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        En {label}, les bateaux suivis sur la {SITE.river} à {SITE.city} ont passé{" "}
        <strong className="text-foreground">{fmtPct(m.share_over)}</strong> de leur temps de navigation
        au-dessus de {SITE.speedLimitKmh} km/h
        {prev && (
          <>
            {" "}({fmtDelta(prev.share_over, m.share_over)} par rapport à {monthLabel(monthKey(prev.period))})
          </>
        )}
        . En descente, {fmtPct(m.share_over15_down)} du temps a été passé au-dessus de 15 km/h.{" "}
        {m.infractions.toLocaleString("fr-FR")} excès soutenus ont été enregistrés, pour {m.boats} bateaux observés
        en mouvement.
        {m.flow_m3s > 0 && (
          <>
            {" "}Débit moyen de la {SITE.river} : {Math.round(m.flow_m3s)} m³/s
            {prev && prev.flow_m3s > 0 && <> (contre {Math.round(prev.flow_m3s)} m³/s le mois précédent)</>}.
          </>
        )}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Temps > ${SITE.speedLimitKmh} km/h`} value={fmtPct(m.share_over)} />
        <Stat label="Descente > 15 km/h" value={fmtPct(m.share_over15_down)} />
        <Stat label="Excès soutenus" value={m.infractions.toLocaleString("fr-FR")} />
        <Stat label="Débit moyen" value={m.flow_m3s > 0 ? `${Math.round(m.flow_m3s)} m³/s` : "—"} />
      </div>

      <BoatList title="Bateaux à passagers les plus souvent en excès" boats={passengers} />
      <BoatList title="Petits bateaux les plus souvent en excès" boats={small} />

      <p className="mt-8 text-xs text-muted-foreground">
        Classement par part du temps de navigation au-dessus de {SITE.speedLimitKmh} km/h, bateaux ayant navigué au moins
        6 heures dans le mois. <Link href="/evolution" className="underline">Voir l&apos;évolution</Link> ·{" "}
        <Link href="/a-propos#fiabilite" className="underline">méthode</Link>.
      </p>
    </main>
  );
}

function BoatList({ title, boats }: { title: string; boats: Awaited<ReturnType<typeof getMonthBoats>> }) {
  if (boats.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <ol className="divide-y rounded-lg border text-sm">
        {boats.map((b, i) => (
          <li key={b.mmsi} className="flex items-baseline justify-between gap-3 px-4 py-2">
            <span>
              <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
              <Link href={`/bateau/${b.mmsi}`} className="font-medium hover:underline">{b.name}</Link>
              {b.operator_name && <span className="ml-2 text-xs text-muted-foreground">{b.operator_name}</span>}
              {!b.operator_name && <span className="ml-2 text-xs text-muted-foreground">{CATEGORY_SHORT[b.category]}</span>}
            </span>
            <span className="tabular-nums">{fmtPct(b.share_over)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export type { TrendPoint };
