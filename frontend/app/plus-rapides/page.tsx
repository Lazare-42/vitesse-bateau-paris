import type { Metadata } from "next";
import { type FastestEver } from "@/components/fastest-table";
import { FastestByCategory } from "@/components/category-filter";
import { MethodologyNote } from "@/components/methodology-note";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Les bateaux les plus rapides sur la ${SITE.river}`,
  description: `Classement de tous les bateaux par leur vitesse maximale jamais enregistrée sur la ${SITE.river} à ${SITE.city}, sur la base des données AIS publiques.`,
  alternates: { canonical: "/plus-rapides" },
  openGraph: {
    title: `Records de vitesse — ${SITE.name}`,
    description: `Classement de tous les bateaux par leur vitesse maximale sur la ${SITE.river} à ${SITE.city}.`,
    url: "/plus-rapides",
    type: "website",
  },
};

const API_URL = process.env.API_URL || "http://localhost:8092";

async function getFastest(): Promise<FastestEver[]> {
  try {
    const res = await fetch(`${API_URL}/api/fastest?limit=100`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function PlusRapidesPage() {
  const fastest = await getFastest();

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Bateaux les plus rapides sur la ${SITE.river} à ${SITE.city}`,
    itemListElement: fastest.slice(0, 25).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.vessel_name || `MMSI ${r.mmsi}`,
      url: `${SITE.url}/bateau/${r.mmsi}`,
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {itemList.itemListElement.length > 0 && <JsonLd data={itemList} />}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Les vitesses record
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Classement de tous les bateaux par leur vitesse maximale jamais
          enregistrée sur la {SITE.river} à {SITE.city}. Filtrez par type
          pour comparer des bateaux comparables : un semi-rigide de 7 m et un
          bateau-mouche de 60 m n&apos;ont pas les mêmes capacités.
        </p>
      </div>

      <MethodologyNote />

      <FastestByCategory data={fastest} />
    </main>
  );
}
