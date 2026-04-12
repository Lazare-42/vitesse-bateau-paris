import { Stats } from "@/components/stats";
import { OffendersTable } from "@/components/offenders-table";
import { ViolationsTable } from "@/components/violations-table";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8092";

async function getStats() {
  try {
    const res = await fetch(`${API_URL}/api/stats`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getOffenders() {
  try {
    const res = await fetch(`${API_URL}/api/offenders?limit=50`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getInfractions() {
  try {
    const res = await fetch(`${API_URL}/api/infractions?limit=50`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function Home() {
  const [stats, offenders, infractions] = await Promise.all([
    getStats(),
    getOffenders(),
    getInfractions(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Vitesse Bateau Paris
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivi en temps reel des exces de vitesse sur la Seine &mdash; limite :{" "}
          6.5 noeuds (~12 km/h)
        </p>
      </div>

      {stats && <Stats data={stats} />}

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Pires recidivistes</h2>
        <OffendersTable data={offenders} />
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Infractions recentes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Une infraction est un segment continu ou un bateau depasse la limite
            de 12 km/h (6.5 noeuds). Elle commence au premier ping en exces et
            se termine quand la vitesse repasse sous la limite. La vitesse max,
            la vitesse moyenne, la duree et le trajet (point de depart &rarr;
            point d&apos;arrivee) sont enregistres.
          </p>
        </div>
        <ViolationsTable data={infractions} />
      </section>
    </main>
  );
}
