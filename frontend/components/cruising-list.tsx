import { SPEED_LIMIT_KNOTS } from "@/site.config";

export interface LivePosition {
  mmsi: number;
  vessel_name: string;
  latitude: number;
  longitude: number;
  speed_knots: number;
  course: number;
  received_at: string;
}

const CRUISING_MIN_KNOTS = 0.5; // below this we treat the vessel as moored
const STALE_MS = 3 * 60_000;
const WARNING_RATIO = 0.95;

function knotsToKmh(n: number): string {
  return (n * 1.852).toFixed(1);
}

function formatAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 2) return "à l'instant";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m} min`;
}

function speedColor(p: LivePosition): string {
  const ageMs = Date.now() - new Date(p.received_at).getTime();
  if (ageMs > STALE_MS) return "text-muted-foreground";
  if (p.speed_knots > SPEED_LIMIT_KNOTS) return "text-speed-danger";
  if (p.speed_knots > SPEED_LIMIT_KNOTS * WARNING_RATIO)
    return "text-speed-warning";
  return "text-speed-ok";
}

export function CruisingList({
  positions,
  selectedMmsi,
  onSelect,
}: {
  positions: Map<number, LivePosition>;
  selectedMmsi?: number | null;
  onSelect?: (mmsi: number) => void;
}) {
  const cruising = Array.from(positions.values())
    .filter((p) => p.speed_knots >= CRUISING_MIN_KNOTS)
    .sort((a, b) => b.speed_knots - a.speed_knots);

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">En navigation</h2>
        <span className="text-xs text-muted-foreground">
          {cruising.length} bateau{cruising.length !== 1 ? "x" : ""}
        </span>
      </div>
      {cruising.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
          Aucun bateau en mouvement.
        </div>
      ) : (
        <ul
          className="divide-y overflow-y-auto"
          style={{ maxHeight: "calc(100vh - 14rem)" }}
        >
          {cruising.map((p) => {
            const active = p.mmsi === selectedMmsi;
            return (
              <li key={p.mmsi}>
                <button
                  type="button"
                  onClick={() => onSelect?.(p.mmsi)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                    active ? "bg-muted" : "hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`text-base font-semibold tabular-nums w-16 text-right ${speedColor(p)}`}
                  >
                    {knotsToKmh(p.speed_knots)}
                    <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
                      km/h
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {p.vessel_name || "Inconnu"}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      MMSI {p.mmsi} &middot;{" "}
                      <span suppressHydrationWarning>
                        {formatAge(p.received_at)}
                      </span>
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
