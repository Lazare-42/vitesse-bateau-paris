import type { TrendPoint } from "@/lib/api";
import { complete } from "@/lib/trends";

/** "2026-10-01" -> "2026-10" */
export const monthKey = (period: string) => period.slice(0, 7);

export function monthLabel(key: string) {
  return new Date(key + "-01T00:00:00Z").toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Months that are finished and have enough data to publish a report. */
export function publishableMonths(months: TrendPoint[], now = new Date()) {
  const current = now.toISOString().slice(0, 7);
  return months.filter((m) => monthKey(m.period) < current && complete(m, "month"));
}
