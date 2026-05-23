import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { CarteLink } from "@/components/carte-link";
import { BoatThumb } from "@/components/boat-thumb";
import { getOffenders, getOffenderDetail } from "@/lib/api";
import {
  fmtKmh,
  fmtDate,
  fmtDateTime,
  fmtDuration,
  fmtLongDuration,
  fmtPercent,
} from "@/lib/format";
import { SITE } from "@/site.config";

// ISR: each boat page is statically cached and regenerated hourly. The data
// is fetched server-side so the full infraction history is in the HTML.
export const revalidate = 3600;

type Params = { params: Promise<{ mmsi: string }> };

// Pre-render the current top offenders at build time when the backend is
// reachable; returns [] in the hermetic Nix build, in which case every boat
// page is rendered on-demand on first request (dynamicParams defaults to true).
export async function generateStaticParams() {
  const offenders = await getOffenders(100);
  return offenders.map((o) => ({ mmsi: String(o.mmsi) }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mmsi } = await params;
  const data = await getOffenderDetail(mmsi);
  if (!data) {
    return { title: "Bateau introuvable", robots: { index: false } };
  }
  const o = data.offender;
  const name = o.vessel_name || `MMSI ${o.mmsi}`;
  const title = `${name} — excès de vitesse sur la ${SITE.river}`;
  const description = `${name} (MMSI ${o.mmsi}) : ${o.infraction_count} excès de vitesse enregistrés sur la ${SITE.river} à ${SITE.city}, vitesse maximale ${fmtKmh(o.max_speed_knots)} km/h. Historique détaillé des dépassements à partir des données AIS publiques.`;
  return {
    title,
    description,
    alternates: { canonical: `/bateau/${o.mmsi}` },
    openGraph: {
      title,
      description,
      url: `/bateau/${o.mmsi}`,
      type: "profile",
    },
  };
}

export default async function BateauPage({ params }: Params) {
  const { mmsi } = await params;
  const data = await getOffenderDetail(mmsi);
  if (!data) notFound();

  const o = data.offender;
  const name = o.vessel_name || `MMSI ${o.mmsi}`;
  const infractions = [...data.infractions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  const overLimit = o.max_speed_knots / (SITE.speedLimitKmh / 1.852);

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Tous les excès",
        item: `${SITE.url}/exces`,
      },
      { "@type": "ListItem", position: 3, name },
    ],
  };

  const vehicle = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name,
    identifier: String(o.mmsi),
    url: `${SITE.url}/bateau/${o.mmsi}`,
    ...(o.photo_url ? { image: o.photo_url } : {}),
    description: `Bateau suivi sur la ${SITE.river} à ${SITE.city} via les données AIS publiques. ${o.infraction_count} excès de vitesse enregistrés, vitesse maximale ${fmtKmh(o.max_speed_knots)} km/h.`,
  };

  // Enrichment spec line (VesselFinder): type, flag, dimensions, inland id.
  const specs: string[] = [];
  if (o.type_text) specs.push(o.type_text);
  if (o.flag) specs.push(o.flag);
  if (o.length_m) {
    specs.push(
      o.beam_m
        ? `${o.length_m.toFixed(0)} × ${o.beam_m.toFixed(0)} m`
        : `${o.length_m.toFixed(0)} m`,
    );
  }
  if (o.eni) specs.push(`ENI ${o.eni}`);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={[breadcrumb, vehicle]} />

      {/* Breadcrumb */}
      <nav className="mb-4 text-xs text-muted-foreground" aria-label="Fil d'Ariane">
        <Link href="/" className="hover:text-foreground transition-colors">
          Accueil
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/exces" className="hover:text-foreground transition-colors">
          Tous les excès
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <BoatThumb src={o.photo_url || o.photo_thumb_url} alt={name} size={96} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <p className="mt-1 text-sm text-muted-foreground font-mono">
              MMSI {o.mmsi}
            </p>
            {specs.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {specs.join(" · ")}
              </p>
            )}
          </div>
        </div>
        <CarteLink href={`/carte?bateau=${o.mmsi}`} />
      </div>

      {/* Lede — unique, data-first summary */}
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">{name}</strong> a été enregistré{" "}
        <strong className="text-foreground">{o.infraction_count}</strong> fois en
        excès de vitesse sur la {SITE.river} à {SITE.city}. Sa vitesse maximale
        relevée est de{" "}
        <strong className="text-speed-danger">
          {fmtKmh(o.max_speed_knots)} km/h
        </strong>
        , soit {overLimit.toFixed(1)}× la limite de {SITE.speedLimitKmh} km/h. Le
        bateau a passé au total{" "}
        <strong className="text-foreground">
          {fmtLongDuration(o.total_excess_seconds)}
        </strong>{" "}
        au-dessus de la limite. Son dernier excès remonte au{" "}
        {fmtDate(o.last_infraction_at)}.
      </p>

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vitesse max" value={`${fmtKmh(o.max_speed_knots)} km/h`} danger />
        <Stat label="Nb. excès" value={String(o.infraction_count)} />
        <Stat label="Temps en excès" value={fmtLongDuration(o.total_excess_seconds)} />
        <Stat label="% du temps en excès" value={fmtPercent(o.excess_time_ratio)} />
      </div>

      {/* Infraction history */}
      <h2 className="mt-10 mb-3 text-lg font-semibold">Historique des excès</h2>
      {infractions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun excès détaillé disponible pour ce bateau.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr>
                <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium first:rounded-tl-lg">
                  Date
                </th>
                <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                  Vitesse max
                </th>
                <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium">
                  Vitesse moy.
                </th>
                <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                  Durée
                </th>
              </tr>
            </thead>
            <tbody>
              {infractions.map((inf) => {
                const dur =
                  (new Date(inf.ended_at).getTime() -
                    new Date(inf.started_at).getTime()) /
                  1000;
                return (
                  <tr
                    key={inf.id}
                    className="border-b transition-colors hover:bg-muted/50 last:border-0"
                  >
                    <td className="py-3 h-10 px-3 text-muted-foreground text-xs">
                      {fmtDateTime(inf.started_at)}
                    </td>
                    <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                      {fmtKmh(inf.max_speed_knots)} km/h
                    </td>
                    <td className="py-3 h-10 px-3 text-right text-speed-warning">
                      {fmtKmh(inf.avg_speed_knots)} km/h
                    </td>
                    <td className="py-3 h-10 px-3 text-right text-muted-foreground">
                      {fmtDuration(dur)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/exces" className="text-muted-foreground hover:text-foreground transition-colors underline">
          ← Tous les excès
        </Link>
        <Link href="/plus-rapides" className="text-muted-foreground hover:text-foreground transition-colors underline">
          Records de vitesse
        </Link>
        <Link href="/direct" className="text-muted-foreground hover:text-foreground transition-colors underline">
          Bateaux en direct
        </Link>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-speed-danger" : ""}`}>
        {value}
      </p>
    </div>
  );
}
