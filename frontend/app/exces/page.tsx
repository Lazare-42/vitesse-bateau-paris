import type { Metadata } from "next";
import { Suspense } from "react";
import { InfractionsBrowser } from "@/components/infractions-browser";
import { MethodologyNote } from "@/components/methodology-note";
import { SITE } from "@/site.config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Tous les excès de vitesse sur la ${SITE.river}`,
  description: `Liste détaillée des excès de vitesse récents et historiques des bateaux sur la ${SITE.river} à ${SITE.city}, filtrable par bateau, période et vitesse minimale.`,
  alternates: { canonical: "/exces" },
  openGraph: {
    title: `Tous les excès — ${SITE.name}`,
    description: `Liste détaillée des excès de vitesse sur la ${SITE.river} à ${SITE.city}.`,
    url: "/exces",
    type: "website",
  },
};

const API_URL = process.env.API_URL || "http://localhost:8092";

async function getInfractions() {
  try {
    const res = await fetch(`${API_URL}/api/infractions?since_hours=24&limit=2000`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getOffenders() {
  try {
    const res = await fetch(`${API_URL}/api/offenders?limit=100`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function InfractionsPage() {
  const [infractions, offenders] = await Promise.all([
    getInfractions(),
    getOffenders(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">
        Tous les excès de vitesse sur la {SITE.river}
      </h1>
      <MethodologyNote />
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Chargement…</div>
        }
      >
        <InfractionsBrowser infractions={infractions} offenders={offenders} />
      </Suspense>
    </main>
  );
}
