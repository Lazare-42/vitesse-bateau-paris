import type { TrendPoint } from "@/lib/api";

// Weeks with fewer than this many days of data (AIS reception gaps, partial
// first/last week) are shown as gaps rather than as misleading dips.
export const MIN_DAYS_WEEK = 4;
export const MIN_DAYS_MONTH = 10;

export function complete(t: TrendPoint, period: "week" | "month" = "week") {
  return t.days >= (period === "week" ? MIN_DAYS_WEEK : MIN_DAYS_MONTH);
}

/** Map trend points to chart points, nulling incomplete periods. */
export function seriesOf(
  trends: TrendPoint[],
  pick: (t: TrendPoint) => number,
  period: "week" | "month" = "week",
) {
  return trends.map((t) => ({ x: t.period, y: complete(t, period) && t.moving_s > 0 ? pick(t) : null }));
}

/** Sample-weighted share over a set of periods. */
export function pooled(
  trends: TrendPoint[],
  num: (t: TrendPoint) => number,
  den: (t: TrendPoint) => number,
) {
  let a = 0;
  let b = 0;
  for (const t of trends) {
    a += num(t) * den(t);
    b += den(t);
  }
  return b > 0 ? a / b : 0;
}

export function fmtPct(v: number, digits = 0) {
  return `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
}

export function fmtDelta(from: number, to: number) {
  if (from <= 0) return "—";
  const d = (to - from) / from;
  const s = `${d > 0 ? "+" : ""}${Math.round(d * 100)} %`;
  return s.replace("-", "−");
}

export function fmtPeriod(p: string, period: "week" | "month") {
  const d = new Date(p + "T00:00:00Z");
  return period === "month"
    ? d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    : `sem. du ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })}`;
}
