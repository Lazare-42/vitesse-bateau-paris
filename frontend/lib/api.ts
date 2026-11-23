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
  category?: Category;
  operator_slug?: string;
  operator_name?: string;
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

// ---------------------------------------------------------------------------
// Analytics (trends, operators, recent stats). Shares are fractions of moving
// time, measured on a de-duplicated 5-min AIS sample (see /a-propos).
// ---------------------------------------------------------------------------

export type Category = "passagers" | "petits" | "fret" | "autres";

export const CATEGORY_LABEL: Record<Category, string> = {
  passagers: "Bateaux à passagers (20 m et plus)",
  petits: "Petits bateaux (moins de 20 m)",
  fret: "Fret et service",
  autres: "Autres / inconnus",
};

export const CATEGORY_SHORT: Record<Category, string> = {
  passagers: "Passagers",
  petits: "Petits bateaux",
  fret: "Fret",
  autres: "Autres",
};

export interface TrendPoint {
  period: string;
  days: number;
  boats: number;
  moving_s: number;
  share_over: number;
  share_over15: number;
  share_over20: number;
  avg_kmh: number;
  moving_s_down: number;
  share_over_down: number;
  share_over15_down: number;
  moving_s_up: number;
  share_over_up: number;
  share_over15_up: number;
  infractions: number;
  excess_seconds: number;
  flow_m3s: number;
}

export interface FlowPoint {
  day: string;
  q_m3s: number;
}

export interface RecentStats {
  last_position_at: string | null;
  share_over_7d: number;
  share_over_prev_7d: number;
  share_over15_down_7d: number;
  infractions_7d: number;
  infractions_prev_7d: number;
  infractions_today: number;
  boats_7d: number;
  flow?: FlowPoint;
}

export interface OperatorBoat {
  mmsi: number;
  name: string;
  photo_thumb_url?: string;
  length_m?: number;
  moving_s_30d: number;
  share_over_30d: number;
  share_over15_down_30d: number;
  moving_s_prev: number;
  share_over_prev: number;
  share_over15_down_prev: number;
  moving_s_all: number;
  share_over_all: number;
}

export interface Operator {
  slug: string;
  name: string;
  url?: string;
  note?: string;
  boats: OperatorBoat[];
  moving_s_30d: number;
  share_over_30d: number;
  share_over15_down_30d: number;
  moving_s_prev: number;
  share_over_prev: number;
  share_over15_down_prev: number;
  moving_s_all: number;
  share_over_all: number;
  share_over15_down_all: number;
}

export interface SwimSiteStats {
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  months: { month: string; infractions: number; boats: number }[] | null;
  total: number;
}

async function getJSON<T>(path: string, fallback: T, revalidate: number): Promise<T> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export const getRecentStats = () =>
  getJSON<RecentStats | null>("/api/stats/recent", null, 60);

export const getTrends = (period: "week" | "month" = "week") =>
  getJSON<TrendPoint[]>(`/api/trends?period=${period}`, [], 600);

export const getVesselTrends = (mmsi: number | string, period: "week" | "month" = "month") =>
  getJSON<TrendPoint[]>(`/api/offenders/${mmsi}/trends?period=${period}`, [], 3600);

export const getOperators = () => getJSON<Operator[]>("/api/operators", [], 600);

export const getOperatorTrends = (slug: string, period: "week" | "month" = "month") =>
  getJSON<TrendPoint[]>(`/api/operators/${encodeURIComponent(slug)}/trends?period=${period}`, [], 600);

export const getSwimSites = () => getJSON<SwimSiteStats[]>("/api/swim-sites", [], 1800);

export interface MonthBoat {
  mmsi: number;
  name: string;
  category: Category;
  operator_slug?: string;
  operator_name?: string;
  moving_s: number;
  share_over: number;
  share_over15: number;
}

export const getMonthBoats = (month: string) =>
  getJSON<MonthBoat[]>(`/api/months/${month}/boats`, [], 1800);
