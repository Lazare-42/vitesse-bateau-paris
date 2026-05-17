import { Stats } from "@/components/stats";
import { type FastestEver } from "@/components/fastest-table";
import { MethodologyNote } from "@/components/methodology-note";
import { HomeTabs } from "@/components/home-tabs";
import { SITE, SPEED_LIMIT_KNOTS } from "@/site.config";

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
    const res = await fetch(`${API_URL}/api/infractions?since_hours=24&limit=2000`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getFastest(): Promise<FastestEver[]> {
  try {
    const res = await fetch(`${API_URL}/api/fastest?limit=50`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function Home() {
  const [stats, offenders, infractions, fastest] = await Promise.all([
    getStats(),
    getOffenders(),
    getInfractions(),
    getFastest(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{SITE.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivi en temps reel des exces de vitesse sur la {SITE.river} &mdash;
          limite : {SPEED_LIMIT_KNOTS.toFixed(1)} noeuds (~{SITE.speedLimitKmh}{" "}
          km/h)
        </p>
      </div>

      <MethodologyNote />

      {stats && (
        <section className="mb-8">
          <Stats data={stats} />
        </section>
      )}

      <HomeTabs
        fastest={fastest}
        offenders={offenders}
        infractions={infractions}
      />
    </main>
  );
}
