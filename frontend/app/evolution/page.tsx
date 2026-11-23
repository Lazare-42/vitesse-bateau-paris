import type { Metadata } from "next";
import Link from "next/link";
import { getTrends } from "@/lib/api";
import { LineChart, pct } from "@/components/line-chart";
import { complete, fmtDelta, fmtPct, fmtPeriod, pooled, seriesOf } from "@/lib/trends";
import { BASE_PATH, SITE } from "@/site.config";

export const revalidate = 600;

export const metadata: Metadata = {
  title: `Évolution des excès de vitesse sur la ${SITE.river}`,
  description: `Les bateaux ralentissent-ils sur la ${SITE.river} à ${SITE.city} ? Part du temps de navigation au-dessus de ${SITE.speedLimitKmh} km/h, semaine par semaine, en descente et en montée, avec le débit du fleuve.`,
  alternates: { canonical: "/evolution" },
};

export default async function EvolutionPage() {
  const weeks = await getTrends("week");
  const full = weeks.filter((t) => complete(t));
  const first = full.slice(0, 4);
  const last = full.slice(-4);
  // Weeks blanked for lack of data, between the first and last complete week
  // (AIS reception outages), listed so readers don't wonder why the line breaks.
  const firstFull = full[0]?.period ?? "";
  const lastFull = full[full.length - 1]?.period ?? "";
  const gaps = weeks.filter((t) => !complete(t) && t.period > firstFull && t.period < lastFull);
  const hasFlow = weeks.some((t) => t.flow_m3s > 0);
  const marker = SITE.launchDate ? { x: SITE.launchDate, label: "mise en ligne" } : undefined;

  const shareFirst = pooled(first, (t) => t.share_over, (t) => t.moving_s);
  const shareLast = pooled(last, (t) => t.share_over, (t) => t.moving_s);
  const downFirst = pooled(first, (t) => t.share_over15_down, (t) => t.moving_s_down);
  const downLast = pooled(last, (t) => t.share_over15_down, (t) => t.moving_s_down);
  const upFirst = pooled(first, (t) => t.share_over_up, (t) => t.moving_s_up);
  const upLast = pooled(last, (t) => t.share_over_up, (t) => t.moving_s_up);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Évolution</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Les bateaux ralentissent-ils sur la {SITE.river} ? On mesure ici la{" "}
        <strong className="text-foreground">part du temps de navigation</strong>{" "}
        passé au-dessus de {SITE.speedLimitKmh} km/h, semaine par semaine (et non
        un nombre d&apos;excès, qui dépend surtout du trafic). Les semaines avec
        moins de 4 jours de données sont laissées en blanc.
      </p>
      {gaps.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Interruptions de la réception AIS (semaines non affichées) :{" "}
          {gaps.map((t) => fmtPeriod(t.period, "week")).join(", ")}.
        </p>
      )}

      {full.length >= 8 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile
            label={`Temps au-dessus de ${SITE.speedLimitKmh} km/h`}
            from={shareFirst}
            to={shareLast}
            sub="tous sens confondus"
          />
          <Tile label="Temps au-dessus de 15 km/h" from={downFirst} to={downLast} sub="en descente (avec le courant)" />
          <Tile
            label={`Temps au-dessus de ${SITE.speedLimitKmh} km/h`}
            from={upFirst}
            to={upLast}
            sub="en montée (contre le courant)"
          />
        </div>
      )}
      {full.length >= 8 && (
        <p className="mt-2 text-xs text-muted-foreground">
          4 premières semaines complètes ({fmtPeriod(first[0].period, "week")} →) comparées aux 4 dernières.
        </p>
      )}

      <Section title={`Part du temps au-dessus de ${SITE.speedLimitKmh} km/h`}>
        <LineChart
          ariaLabel="Part du temps au-dessus de la limite, par semaine"
          format={pct}
          marker={marker}
          series={[
            { label: "Descente", color: "var(--series-2)", points: seriesOf(weeks, (t) => t.share_over_down) },
            { label: "Montée", color: "var(--series-1)", points: seriesOf(weeks, (t) => t.share_over_up) },
            { label: "Tous", color: "var(--series-3)", points: seriesOf(weeks, (t) => t.share_over), dashed: true },
          ]}
        />
      </Section>

      <Section title="Gros excès : temps au-dessus de 15 km/h en descente">
        <LineChart
          ariaLabel="Part du temps au-dessus de 15 km/h en descente, par semaine"
          format={pct}
          marker={marker}
          series={[{ label: "Descente > 15 km/h", color: "var(--series-2)", points: seriesOf(weeks, (t) => t.share_over15_down) }]}
        />
      </Section>

      {hasFlow && (
        <Section title={`Débit de la ${SITE.river}`}>
          <LineChart
            ariaLabel="Débit moyen du fleuve, par semaine"
            format={(v) => `${Math.round(v)} m³/s`}
            marker={marker}
            series={[{ label: "Débit", color: "var(--series-1)", points: weeks.map((t) => ({ x: t.period, y: t.flow_m3s > 0 ? t.flow_m3s : null })) }]}
          />
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Pourquoi le débit compte :</strong> l&apos;AIS
            mesure la vitesse par rapport au sol. Quand le courant est fort, un bateau qui
            descend est poussé et dépasse plus facilement la limite à régime égal ; un bateau
            qui monte est freiné. Une baisse des excès en descente peut donc venir d&apos;un
            débit plus faible plutôt que d&apos;un changement de comportement. Comparez les
            courbes de descente avec le débit avant de conclure. Source : Hub&apos;Eau
            (eaufrance), débit journalier moyen.
          </p>
        </Section>
      )}

      <Section title="Excès soutenus (30 s et plus) par jour, moyenne de la semaine">
        <LineChart
          ariaLabel="Nombre moyen d'excès soutenus par jour, par semaine"
          format={(v) => Math.round(v).toLocaleString("fr-FR")}
          marker={marker}
          series={[{ label: "Excès par jour", color: "var(--series-1)", points: seriesOf(weeks, (t) => t.infractions / Math.max(t.days, 1)) }]}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Moyenne par jour de données, pour que les semaines incomplètes restent comparables.
          Le nombre brut d&apos;excès suit surtout le trafic (saison, météo) : préférez la part du temps ci-dessus.
        </p>
      </Section>

      <details className="mt-10 rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Tableau des données</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-right">
                <th className="py-1 text-left font-medium">Semaine</th>
                <th className="font-medium">Jours</th>
                <th className="font-medium">Bateaux</th>
                <th className="font-medium">&gt; {SITE.speedLimitKmh} km/h</th>
                <th className="font-medium">Descente</th>
                <th className="font-medium">Montée</th>
                <th className="font-medium">Desc. &gt; 15</th>
                <th className="font-medium">Excès</th>
                {hasFlow && <th className="font-medium">Débit</th>}
              </tr>
            </thead>
            <tbody>
              {weeks.map((t) => (
                <tr key={t.period} className="border-t text-right tabular-nums">
                  <td className="py-1 text-left">{fmtPeriod(t.period, "week")}</td>
                  <td>{t.days}</td>
                  <td>{t.boats}</td>
                  <td>{fmtPct(t.share_over)}</td>
                  <td>{fmtPct(t.share_over_down)}</td>
                  <td>{fmtPct(t.share_over_up)}</td>
                  <td>{fmtPct(t.share_over15_down)}</td>
                  <td>{t.infractions.toLocaleString("fr-FR")}</td>
                  {hasFlow && <td>{t.flow_m3s > 0 ? `${Math.round(t.flow_m3s)} m³/s` : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="mt-6 text-sm text-muted-foreground">
        Données ouvertes :{" "}
        <a className="underline hover:text-foreground" href={`${BASE_PATH}/api/export/boat-days.csv`}>
          échantillon journalier par bateau (CSV)
        </a>{" "}
        ·{" "}
        <a className="underline hover:text-foreground" href={`${BASE_PATH}/api/export/infractions.csv`}>
          tous les excès (CSV)
        </a>
        . Méthode détaillée sur la page{" "}
        <Link href="/a-propos" className="underline hover:text-foreground">
          À propos
        </Link>
        .
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Tile({ label, from, to, sub }: { label: string; from: number; to: number; sub: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">
        {fmtPct(from)} → {fmtPct(to)}
      </p>
      <p className="text-xs text-muted-foreground">
        {fmtDelta(from, to)} · {sub}
      </p>
    </div>
  );
}
