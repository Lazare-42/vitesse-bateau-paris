import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A propos - Vitesse Bateau Paris",
};

export default function AProposPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Comment ca marche</h1>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            La limite de vitesse
          </h2>
          <p>
            La vitesse maximale autorisee sur la Seine a Paris est de{" "}
            <strong className="text-foreground">
              12 km/h (6.5 noeuds)
            </strong>{" "}
            dans les zones de navigation les plus centrales. Cette limite est
            fixee par l&apos;
            <a
              href="https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000363059/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Arrete du 22 novembre 1993 fixant le reglement particulier de
              police de la navigation sur le reseau fluvial de la ville de Paris
            </a>{" "}
            (article 12 : vitesse limitee a 12 km/h dans la traversee de Paris){" "}
            et vise a proteger les berges, les ouvrages d&apos;art et les autres
            usagers de la voie d&apos;eau.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Les donnees AIS
          </h2>
          <p>
            Chaque bateau de commerce et de transport de passagers est equipe
            d&apos;un transpondeur{" "}
            <a
              href="https://fr.wikipedia.org/wiki/Syst%C3%A8me_d%27identification_automatique"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              AIS (Automatic Identification System)
            </a>
            . Ce transpondeur emet en continu la position, la vitesse (SOG
            &mdash; Speed Over Ground), le cap et l&apos;identifiant unique du
            bateau (MMSI). Les signaux sont recus par des stations terrestres et
            des satellites, puis redistribues en temps reel.
          </p>
          <p className="mt-2">
            Nous recevons ces donnees via le flux WebSocket gratuit de{" "}
            <a
              href="https://aisstream.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              aisstream.io
            </a>
            , filtre sur une zone englobant la Seine a Paris (de Issy-les-Moulineaux
            a la Villette environ). Les noms des bateaux sont enrichis via la base
            de donnees{" "}
            <a
              href="https://www.itu.int/mmsapp/shipstation/list"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              ITU MARS
            </a>{" "}
            de l&apos;Union Internationale des Telecommunications.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Definition d&apos;un exces de vitesse
          </h2>
          <p>
            Un exces de vitesse est un{" "}
            <strong className="text-foreground">
              segment continu de depassement de la limite
            </strong>
            . Il est defini comme suit :
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Debut :</strong> premier ping
              AIS ou la vitesse du bateau depasse 6.5 noeuds.
            </li>
            <li>
              <strong className="text-foreground">Fin :</strong> le bateau
              envoie un ping en dessous de la limite, ou aucun ping n&apos;est
              recu pendant 2 minutes (le bateau a quitte la zone).
            </li>
            <li>
              On enregistre la{" "}
              <strong className="text-foreground">vitesse maximale</strong>, la{" "}
              <strong className="text-foreground">vitesse moyenne</strong>, la{" "}
              <strong className="text-foreground">duree</strong>, le{" "}
              <strong className="text-foreground">nombre de pings</strong> et le{" "}
              <strong className="text-foreground">
                trajet (point de depart et d&apos;arrivee)
              </strong>
              .
            </li>
          </ul>
          <p className="mt-2">
            Ce n&apos;est pas un exces au sens legal &mdash; seuls les
            services de la navigation fluviale (VNF) sont habilites a
            verbaliser. Il s&apos;agit d&apos;un constat factuel base sur les
            donnees AIS publiques.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Architecture technique
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong className="text-foreground">Backend :</strong> Go, connecte
              en WebSocket au flux AIS. Stocke les positions et exces dans
              PostgreSQL.
            </li>
            <li>
              <strong className="text-foreground">Frontend :</strong> Next.js,
              rendu cote serveur, rafraichi toutes les 30 secondes.
            </li>
            <li>
              <strong className="text-foreground">Donnees :</strong> les
              positions normales sont echantillonnees a 1 par bateau par 5
              minutes pour limiter le stockage. Les positions en exces de vitesse
              sont stockees a pleine resolution (chaque ping).
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
