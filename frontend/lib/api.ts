// Server-side API helpers for the Go backend. These run only in Server
// Components / metadata routes (never shipped to the client), so they hit
// API_URL directly rather than the /api rewrite.
//
// Every call swallows errors and returns an empty/null fallback: the Nix
// build is hermetic (no backend reachable during `next build`), so
// generateStaticParams and the sitemap must degrade to "nothing to
// pre-render" and let the pages render on-demand at runtime via ISR.

const API_URL = process.env.API_URL || "http://localhost:8092";

export interface Offender {
  mmsi: number;
  vessel_name: string;
  // Enrichment (VesselFinder), all optional — absent until a boat is enriched.
  photo_thumb_url?: string;
  photo_url?: string;
  flag?: string;
  type_text?: string;
  length_m?: number;
  beam_m?: number;
  eni?: number;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
  cumulative_excess_knots: number;
  avg_infraction_duration_seconds: number;
  total_excess_seconds: number;
  excess_time_ratio: number;
}

export interface Infraction {
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

export interface OffenderDetail {
  offender: Offender;
  infractions: Infraction[];
}

// True only when the enriched type marks a passenger vessel — the category
// that includes bateaux-mouches and vedettes. Cargo péniches, tugs, service
// craft, etc. return false, so we never mislabel a freight barge as a
// bateau-mouche. Conservative: matches only an explicit "passenger" type.
export function isPassengerVessel(typeText?: string): boolean {
  return !!typeText && /passenger|passager/i.test(typeText);
}

// Human-readable spec chips from VesselFinder enrichment, in display order.
// Empty entries are dropped, so callers can `.join(" · ")` safely.
export function vesselSpecs(o: Offender): string[] {
  const specs: string[] = [];
  if (o.type_text) specs.push(o.type_text);
  if (o.flag) specs.push(o.flag);
  if (o.length_m) {
    specs.push(
      o.beam_m
        ? `${o.length_m.toFixed(0)} × ${o.beam_m.toFixed(0)} m`
        : `${o.length_m.toFixed(0)} m`,
    );
  }
  if (o.eni) specs.push(`ENI ${o.eni}`);
  return specs;
}

// The set of boats worth a dedicated page + sitemap entry: the top offenders
// (boats with at least one recorded infraction). Capped at 100 server-side.
export async function getOffenders(limit = 100): Promise<Offender[]> {
  try {
    const res = await fetch(`${API_URL}/api/offenders?limit=${limit}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function getOffenderDetail(
  mmsi: number | string,
): Promise<OffenderDetail | null> {
  try {
    const res = await fetch(`${API_URL}/api/offenders/${mmsi}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null; // 404 (unknown boat) included
    return res.json();
  } catch {
    return null;
  }
}
