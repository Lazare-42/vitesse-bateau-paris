// Formatting helpers shared by Server Components. Mirrors the client-side
// formatters in components/offenders-table.tsx so the boat pages read the
// same as the rest of the site.

export function knotsToKmhNum(knots: number): number {
  return knots * 1.852;
}

export function fmtKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtLongDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM === 0 ? `${h}h` : `${h}h ${remM}min`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `${d}j` : `${d}j ${remH}h`;
}

export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

export function fmtPercent(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  const pct = ratio * 100;
  return pct >= 10 ? `${pct.toFixed(0)} %` : `${pct.toFixed(1)} %`;
}
