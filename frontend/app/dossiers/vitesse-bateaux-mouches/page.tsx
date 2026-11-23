import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { fmtKmh } from "@/lib/format";
import { SITE, SPEED_LIMIT_KNOTS } from "@/site.config";

// Evergreen pillar page — regenerate hourly so the live figures stay fresh.
export const revalidate = 3600;

const API_URL = process.env.API_URL || "http://localhost:8092";

const title = `À quelle vitesse vont les bateaux-mouches sur la ${SITE.river} ?`;
const description = `Vitesse réelle et limite légale des bateaux-mouches sur la ${SITE.river} à ${SITE.city} : la règle des ${SITE.speedLimitKmh} km/h, ce que montrent les données AIS, et le classement des bateaux qui dépassent.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/dossiers/vitesse-bateaux-mouches" },
  openGraph: {
    title,
    description,
    url: "/dossiers/vitesse-bateaux-mouches",
    type: "article",
  },
};

interface Stats {
  total_infractions: number;
  unique_offenders: number;
  avg_infraction_speed_knots: number;
  max_infraction_speed_knots: number;
  avg_infractions_per_day: number;
}

async function getStats(): Promise<Stats | null> {
  try {
    const res = await fetch(`${API_URL}/api/stats`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// Evergreen Q&A — no live figures baked in, so the rich result never goes stale.
const faq = [
  {
    q: `Quelle est la vitesse maximale autorisée pour les bateaux-mouches sur la ${SITE.river} à ${SITE.city} ?`,
    a: `La vitesse est limitée à ${SITE.speedLimitKmh} km/h (environ ${SPEED_LIMIT_KNOTS.toFixed(1)} nœuds) dans la traversée de ${SITE.city}, en application de l'arrêté du 22 novembre 1993 portant règlement particulier de police de la navigation. La même limite s'applique à tous les bateaux, pas seulement aux bateaux-mouches.`,
  },
  {
    q: `À quelle vitesse vont réellement les bateaux-mouches ?`,
    a: `En croisière touristique, les bateaux-mouches naviguent normalement autour de la limite. Mais nos relevés AIS montrent que des dépassements surviennent régulièrement. Le classement des excès et les pages par bateau donnent la vitesse maximale relevée pour chaque navire.`,
  },
  {
    q: `Les bateaux-mouches respectent-ils la limite de vitesse ?`,
    a: `La plupart du temps, oui. Mais tous types confondus (bateaux à passagers, péniches de fret, vedettes de service), des dépassements de la limite de ${SITE.speedLimitKmh} km/h sont enregistrés chaque jour. Les chiffres ci-dessus, issus des données AIS publiques, le quantifient.`,
  },
  {
    q: `Comment la vitesse des bateaux est-elle mesurée ?`,
    a: `À partir des signaux AIS (Automatic Identification System) que chaque bateau de commerce et de transport de passagers émet en continu : position, vitesse fond (SOG) et identifiant MMSI. Aucun radar ni capteur privé n'est utilisé — uniquement des données publiques.`,
  },
  {
    q: `Un excès relevé sur ce site est-il une infraction verbalisée ?`,
    a: `Non. Il s'agit d'un constat factuel basé sur les données AIS, pas d'un procès-verbal. Seuls les services de Voies navigables de France (VNF) sont habilités à constater et sanctionner les infractions à la police de la navigation.`,
  },
];

export default async function DossierBateauxMouchesPage() {
  const stats = await getStats();

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: SITE.url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Vitesse des bateaux-mouches",
      },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: "fr-FR",
    author: { "@type": "Person", name: "Lazare Rossillon" },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
    mainEntityOfPage: `${SITE.url}/dossiers/vitesse-bateaux-mouches`,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={[breadcrumb, article, faqLd]} />

      <nav className="mb-4 text-xs text-muted-foreground" aria-label="Fil d'Ariane">
        <Link href="/" className="hover:text-foreground transition-colors">
          Accueil
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Vitesse des bateaux-mouches</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          Les <strong className="text-foreground">bateaux-mouches</strong> et
          autres bateaux à passagers qui sillonnent la {SITE.river} à {SITE.city}{" "}
          sont soumis, comme tous les bateaux, à une limite de vitesse stricte.
          Cette page explique quelle est cette limite, à quelle vitesse les
          bateaux naviguent réellement d&apos;après les données AIS publiques, et
          où consulter le détail bateau par bateau.
        </p>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            La limite : {SITE.speedLimitKmh} km/h dans Paris
          </h2>
          <p>
            La vitesse maximale autorisée dans la traversée de {SITE.city} est de{" "}
            <strong className="text-foreground">
              {SITE.speedLimitKmh} km/h ({SPEED_LIMIT_KNOTS.toFixed(1)} nœuds)
            </strong>
            , fixée par l&apos;
            <a
              href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000363059/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              arrêté du 22 novembre 1993
            </a>{" "}
            portant règlement particulier de police de la navigation sur le
            réseau fluvial de la Ville de Paris. Elle vise à protéger les berges,
            les ouvrages d&apos;art et les autres usagers de la voie d&apos;eau.
            Elle s&apos;applique à <strong className="text-foreground">tous</strong>{" "}
            les bateaux — bateaux-mouches, vedettes, péniches de fret comme
            navires de service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            À quelle vitesse vont-ils vraiment ?
          </h2>
          <p>
            En croisière touristique, un bateau-mouche navigue normalement autour
            de la limite. Mais en mesurant en continu la vitesse fond (SOG) émise
            par les transpondeurs AIS, on observe des dépassements réguliers,
            tous types de bateaux confondus.
          </p>
          {stats ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure
                value={stats.total_infractions.toLocaleString("fr-FR")}
                label="excès enregistrés"
              />
              <Figure
                value={stats.unique_offenders.toLocaleString("fr-FR")}
                label="bateaux concernés"
              />
              <Figure
                value={`${fmtKmh(stats.max_infraction_speed_knots)} km/h`}
                label="vitesse record"
                danger
              />
              <Figure
                value={stats.avg_infractions_per_day.toLocaleString("fr-FR", {
                  maximumFractionDigits: 1,
                })}
                label="excès / jour en moyenne"
              />
            </div>
          ) : null}
          <p className="mt-4">
            Le détail est public :{" "}
            <Link href="/plus-rapides" className="underline hover:text-foreground transition-colors">
              le classement des vitesses record
            </Link>
            ,{" "}
            <Link href="/exces" className="underline hover:text-foreground transition-colors">
              la liste de tous les excès
            </Link>{" "}
            et{" "}
            <Link href="/carte" className="underline hover:text-foreground transition-colors">
              la carte des trajets
            </Link>
            . Chaque bateau dispose d&apos;une page dédiée avec son historique et
            ses trajets.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Tous les bateaux rapides ne sont pas des bateaux-mouches
          </h2>
          <p>
            Important : le terme « bateau-mouche » désigne les bateaux de
            promenade à passagers. Or beaucoup de bateaux suivis ici sont des{" "}
            <strong className="text-foreground">péniches de fret</strong>, des{" "}
            vedettes de service (police fluviale, pompiers, VNF) ou des
            plaisanciers. Nous n&apos;étiquetons un bateau comme « bateau à
            passagers » que lorsque son type AIS le confirme. Le site applique une
            règle unique à tout le monde : {SITE.speedLimitKmh} km/h.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-foreground">
            Questions fréquentes
          </h2>
          <dl className="space-y-4">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-medium text-foreground">{f.q}</dt>
                <dd className="mt-1">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="text-xs">
          Méthodologie complète sur la page{" "}
          <Link href="/a-propos" className="underline hover:text-foreground transition-colors">
            Comment ça marche
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Figure({
  value,
  label,
  danger,
}: {
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <p className={`text-lg font-semibold ${danger ? "text-speed-danger" : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
