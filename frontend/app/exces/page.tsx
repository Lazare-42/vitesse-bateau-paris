import { Suspense } from "react";
import { InfractionsBrowser } from "@/components/infractions-browser";

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

export default async function InfractionsPage() {
  const [infractions, offenders] = await Promise.all([
    getInfractions(),
    getOffenders(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">Chargement...</div>
        }
      >
        <InfractionsBrowser infractions={infractions} offenders={offenders} />
      </Suspense>
    </main>
  );
}
