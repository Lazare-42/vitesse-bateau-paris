import type { Metadata } from "next";
import { SITE } from "@/site.config";

export const metadata: Metadata = {
  title: `À propos — ${SITE.name}`,
  description: `Méthodologie de ${SITE.name} : comment les excès de vitesse sont détectés à partir des données AIS publiques, et quels bateaux sont inclus.`,
  alternates: { canonical: "/a-propos" },
  openGraph: {
    title: `À propos — ${SITE.name}`,
    description: `Méthodologie : détection des excès de vitesse des bateaux sur la ${SITE.river} à partir des données AIS publiques.`,
    url: "/a-propos",
    type: "article",
  },
};

export default function AProposPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Comment ça marche</h1>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            La limite de vitesse
          </h2>
          <p>
            La vitesse maximale autorisée sur la Seine à Paris est de{" "}
            <strong className="text-foreground">
              12 km/h (6,5 nœuds)
            </strong>{" "}
            dans les zones de navigation les plus centrales. Cette limite est
            fixée par l&apos;
            <a
              href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000363059/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Arrêté du 22 novembre 1993 fixant le règlement particulier de
              police de la navigation sur le réseau fluvial de la ville de Paris
            </a>{" "}
            (article 12 : vitesse limitée à 12 km/h dans la traversée de Paris){" "}
            et vise à protéger les berges, les ouvrages d&apos;art et les autres
            usagers de la voie d&apos;eau.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Les données AIS
          </h2>
          <p>
            Chaque bateau de commerce et de transport de passagers est équipé
            d&apos;un transpondeur{" "}
            <a
              href="https://fr.wikipedia.org/wiki/Syst%C3%A8me_d%27identification_automatique"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              AIS (Automatic Identification System)
            </a>
            . Ce transpondeur émet en continu la position, la vitesse (SOG
            &mdash; Speed Over Ground), le cap et l&apos;identifiant unique du
            bateau (MMSI). Les signaux sont reçus par des stations terrestres et
            des satellites, puis redistribués en temps réel.
          </p>
          <p className="mt-2">
            Nous recevons ces données via le flux WebSocket gratuit de{" "}
            <a
              href="https://aisstream.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              aisstream.io
            </a>
            , filtré sur une zone englobant la Seine à Paris (de Issy-les-Moulineaux
            à la Villette environ). Les noms des bateaux sont enrichis via la base
            de données{" "}
            <a
              href="https://www.itu.int/mmsapp/shipstation/list"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              ITU MARS
            </a>{" "}
            de l&apos;Union Internationale des Télécommunications.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Quels bateaux sont inclus ?
          </h2>
          <p>
            <strong className="text-foreground">Tous les bateaux qui
            émettent en AIS dans la zone.</strong> Aucun filtrage par type
            n&apos;est appliqué : bateaux de commerce et péniches de fret,
            bateaux à passagers (bateaux-mouches, vedettes touristiques),
            vedettes de service (douanes, police fluviale, pompiers, VNF),
            plaisanciers, péniches-logements en déplacement. Le site se
            contente d&apos;agréger ce que les transpondeurs émettent. Si un
            bateau apparaît souvent en tête du classement, c&apos;est qu&apos;il
            dépasse souvent la limite &mdash; pas parce qu&apos;il aurait été
            ciblé.
          </p>
          <p className="mt-2">
            Quelques nuances de couverture, par construction du système AIS :
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              Les très petites embarcations (avirons, kayaks, paddle, petits
              hors-bord de loisir) n&apos;ont pas de transpondeur et ne sont
              donc pas visibles.
            </li>
            <li>
              Un bateau qui éteint son AIS disparaît du suivi. C&apos;est
              normalement interdit en navigation commerciale.
            </li>
            <li>
              Les excès très brefs (moins de 30 secondes) sont ignorés pour
              écarter les sauts de signal GPS sous les ponts &mdash; les
              vitesses extrêmes ponctuelles ne sont donc pas comptées.
            </li>
          </ul>
          <p className="mt-2">
            Le site n&apos;a pas vocation à désigner une catégorie d&apos;usagers
            plutôt qu&apos;une autre. Il publie des statistiques brutes sur la
            base d&apos;une règle unique : 12 km/h pour tout le monde.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Définition d&apos;un excès de vitesse
          </h2>
          <p>
            Un excès de vitesse est un{" "}
            <strong className="text-foreground">
              segment continu de dépassement de la limite
            </strong>
            . Il est défini comme suit :
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Début :</strong> premier ping
              AIS où la vitesse du bateau dépasse 6,5 nœuds.
            </li>
            <li>
              <strong className="text-foreground">Fin :</strong> le bateau
              envoie un ping en dessous de la limite, ou aucun ping n&apos;est
              reçu pendant 2 minutes (le bateau a quitté la zone).
            </li>
            <li>
              On enregistre la{" "}
              <strong className="text-foreground">vitesse maximale</strong>, la{" "}
              <strong className="text-foreground">vitesse moyenne</strong>, la{" "}
              <strong className="text-foreground">durée</strong>, le{" "}
              <strong className="text-foreground">nombre de pings</strong> et le{" "}
              <strong className="text-foreground">
                trajet (point de départ et d&apos;arrivée)
              </strong>
              .
            </li>
          </ul>
          <p className="mt-2">
            Ce n&apos;est pas un excès au sens légal &mdash; seuls les
            services de la navigation fluviale (VNF) sont habilités à
            verbaliser. Il s&apos;agit d&apos;un constat factuel basé sur les
            données AIS publiques.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Architecture technique
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Backend :</strong> Go, connecté
              en WebSocket au flux AIS. Stocke les positions et excès dans
              PostgreSQL.
            </li>
            <li>
              <strong className="text-foreground">Frontend :</strong> Next.js,
              rendu côté serveur, rafraîchi toutes les 30 secondes.
            </li>
            <li>
              <strong className="text-foreground">Données :</strong> les
              positions normales sont échantillonnées à 1 par bateau par 5
              minutes pour limiter le stockage. Les positions en excès de vitesse
              sont stockées à pleine résolution (chaque ping).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Code source
          </h2>
          <p>
            Le code source de ce projet est disponible sur{" "}
            <a
              href="https://github.com/Lazare-42/vitesse-bateau-paris"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
