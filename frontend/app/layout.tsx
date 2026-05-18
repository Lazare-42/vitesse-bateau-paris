import type { Metadata } from "next";
import { Sofia_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import { SITE, SPEED_LIMIT_KNOTS } from "@/site.config";
import "./globals.css";

const sofiaSans = Sofia_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sofia",
});

const description = `Suivi en temps réel des excès de vitesse des bateaux sur la ${SITE.river} à ${SITE.city}. Limite de ${SITE.speedLimitKmh} km/h (${SPEED_LIMIT_KNOTS.toFixed(1)} nœuds), détection automatique via les données AIS publiques.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.name,
    template: `%s — ${SITE.name}`,
  },
  description,
  applicationName: SITE.name,
  authors: [{ name: "Lazare Rossillon" }],
  creator: "Lazare Rossillon",
  keywords: [
    `excès de vitesse ${SITE.river}`,
    `bateaux ${SITE.city}`,
    "AIS",
    `navigation fluviale ${SITE.city}`,
    `vitesse bateau ${SITE.river}`,
    "bateaux-mouches",
    "péniches",
    "VNF",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.name,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE.name,
      url: SITE.url,
      inLanguage: "fr-FR",
      description,
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      founder: { "@type": "Person", name: "Lazare Rossillon" },
      email: "lazare.bot@gmail.com",
      sameAs: ["https://github.com/Lazare-42/vitesse-bateau-paris"],
    },
  ];

  return (
    <html lang="fr" className="dark">
      <body
        className={`${sofiaSans.variable} font-sans flex min-h-screen flex-col antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Nav />

        <div className="flex-1">{children}</div>

        <footer className="border-t border-input mt-12">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              Créé par Lazare Rossillon, contact à{" "}
              <a
                href="mailto:lazare.bot@gmail.com"
                className="underline hover:text-foreground transition-colors"
              >
                lazare.bot@gmail.com
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
