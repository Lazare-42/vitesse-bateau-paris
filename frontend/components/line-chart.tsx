// Dependency-free SVG line chart, rendered on the server. Hover targets carry
// a native <title> tooltip; every chart is paired with a data table by its
// caller for accessibility.

export interface Series {
  label: string;
  /** CSS colour, e.g. "var(--series-1)". */
  color: string;
  points: { x: string; y: number | null }[]; // x = YYYY-MM-DD
  dashed?: boolean;
}

interface Props {
  series: Series[];
  /** Formats y values for axis ticks and tooltips. */
  format: (v: number) => string;
  yMax?: number;
  height?: number;
  /** Vertical marker (YYYY-MM-DD) with a label, e.g. the launch date. */
  marker?: { x: string; label: string };
  ariaLabel: string;
}

const PAD = { top: 12, right: 12, bottom: 28, left: 48 };
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function t(x: string) {
  return new Date(x + "T00:00:00Z").getTime();
}

// Pick a max so the 4 gridline steps land on round values.
function niceMax(v: number) {
  if (v <= 0) return 1;
  const step = v / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(step)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]) if (m * pow >= step) return 4 * m * pow;
  return 40 * pow;
}

// Two renders — wide for sm+ screens, narrow for phones — so axis text stays
// legible (SVG text scales with the viewBox).
export function LineChart(props: Props) {
  const all = props.series.flatMap((s) => s.points.filter((p) => p.y != null));
  if (all.length === 0) {
    return <p className="text-sm text-muted-foreground">Pas encore assez de données.</p>;
  }
  return (
    <figure className="w-full">
      {props.series.length > 1 && (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {props.series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: s.color, opacity: s.dashed ? 0.6 : 1 }}
              />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div className="hidden sm:block">
        <Chart {...props} W={720} />
      </div>
      <div className="sm:hidden">
        <Chart {...props} W={380} height={(props.height ?? 220) * 0.9} compact />
      </div>
    </figure>
  );
}

function Chart({ series, format, yMax, height = 220, marker, ariaLabel, W, compact }: Props & { W: number; compact?: boolean }) {
  const all = series.flatMap((s) => s.points.filter((p) => p.y != null));
  // x domain spans every period (including gaps) so stacked charts align.
  const xs = series.flatMap((s) => s.points.map((p) => t(p.x)));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 86400000);
  const ymax = yMax ?? niceMax(Math.max(...all.map((p) => p.y as number)) * 1.02);
  const H = height;
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const sx = (x: string) => PAD.left + ((t(x) - x0) / (x1 - x0)) * iw;
  const sy = (y: number) => PAD.top + ih - (Math.min(y, ymax) / ymax) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);

  // Month ticks
  const monthTicks: { x: number; label: string }[] = [];
  const d = new Date(x0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  let k = 0;
  while (d.getTime() <= x1) {
    if (compact && k++ % 2 === 1) {
      d.setUTCMonth(d.getUTCMonth() + 1);
      continue;
    }
    monthTicks.push({
      x: PAD.left + ((d.getTime() - x0) / (x1 - x0)) * iw,
      label: MONTHS[d.getUTCMonth()],
    });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} stroke="currentColor" strokeOpacity={0.12} />
            <text x={PAD.left - 6} y={sy(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.6}>
              {format(v)}
            </text>
          </g>
        ))}
        {monthTicks.map((m) => (
          <text key={m.x} x={m.x} y={H - 8} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6}>
            {m.label}
          </text>
        ))}
        {marker && t(marker.x) >= x0 && t(marker.x) <= x1 && (
          <g>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={PAD.top} y2={PAD.top + ih} stroke="currentColor" strokeOpacity={0.5} strokeDasharray="3 3" />
            <text x={sx(marker.x) + 4} y={PAD.top + 10} fontSize={11} fill="currentColor" fillOpacity={0.7}>
              {marker.label}
            </text>
          </g>
        )}
        {series.map((s) => {
          // Break the line on nulls (data gaps).
          const segs: string[] = [];
          let cur = "";
          for (const p of s.points) {
            if (p.y == null) {
              if (cur) segs.push(cur);
              cur = "";
              continue;
            }
            cur += `${cur ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
          }
          if (cur) segs.push(cur);
          return (
            <g key={s.label}>
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" />
              ))}
              {s.points.map((p) =>
                p.y == null ? null : (
                  <g key={p.x}>
                    <circle cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
                    <circle cx={sx(p.x)} cy={sy(p.y)} r={9} fill="transparent">
                      <title>{`${s.label} — ${new Date(p.x + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} : ${format(p.y)}`}</title>
                    </circle>
                  </g>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
