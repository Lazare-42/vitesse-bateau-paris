import { Suspense } from "react";
import { InfractionsMapWrapper } from "@/components/infractions-map-wrapper";
import { MethodologyNote } from "@/components/methodology-note";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:8092";

interface Infraction {
  id: number;
  mmsi: number;
  vessel_name: string;
  max_speed_knots: number;
  avg_speed_knots: number;
  speed_limit_knots: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  started_at: string;
  ended_at: string;
  ping_count: number;
}

async function getInfractions(): Promise<Infraction[]> {
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

async function getInfraction(id: number): Promise<Infraction | null> {
  try {
    const res = await fetch(`${API_URL}/api/infractions/${id}`, {
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
    const res = await fetch(`${API_URL}/api/offenders?limit=100`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function CartePage({
  searchParams,
}: {
  searchParams: Promise<{ exces?: string }>;
}) {
  const params = await searchParams;
  const focusedId = params.exces ? parseInt(params.exces, 10) : NaN;

  const [infractions, offenders, focused] = await Promise.all([
    getInfractions(),
    getOffenders(),
    Number.isFinite(focusedId) ? getInfraction(focusedId) : Promise.resolve(null),
  ]);

  // Ensure the focused infraction is in the list even if it's outside the
  // default 24h window (e.g. when arriving from the all-time Records page).
  const merged =
    focused && !infractions.some((i) => i.id === focused.id)
      ? [focused, ...infractions]
      : infractions;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-lg font-semibold mb-4">Carte des exces</h1>
      <MethodologyNote />
      <Suspense
        fallback={
          <div className="flex h-[50vh] sm:h-[70vh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
            Chargement...
          </div>
        }
      >
        <InfractionsMapWrapper infractions={merged} offenders={offenders} />
      </Suspense>
    </main>
  );
}
