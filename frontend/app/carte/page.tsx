import { Suspense } from "react";
import { InfractionsMapWrapper } from "@/components/infractions-map-wrapper";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8092";

async function getInfractions() {
  try {
    const res = await fetch(`${API_URL}/api/infractions?limit=1000`, {
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

export default async function CartePage() {
  const [infractions, offenders] = await Promise.all([
    getInfractions(),
    getOffenders(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-lg font-semibold mb-4">Carte des exces</h1>
      <Suspense
        fallback={
          <div className="flex h-[50vh] sm:h-[70vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
            Chargement...
          </div>
        }
      >
        <InfractionsMapWrapper infractions={infractions} offenders={offenders} />
      </Suspense>
    </main>
  );
}
