import Link from "next/link";
import type { RecentStats } from "@/lib/api";
import { fmtDelta, fmtPct } from "@/lib/trends";
import { SITE } from "@/site.config";

function ago(iso: string | null) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
}

// Headline block for the home page: what is happening now, and is it
// getting better — before the detailed tables.
export function Headline({ r }: { r: RecentStats }) {
  const better = r.share_over_7d < r.share_over_prev_7d;
  const stale = r.last_position_at
    ? Date.now() - new Date(r.last_position_at).getTime() > 30 * 60 * 1000
    : true;
  return (
    <section className="mb-6 rounded-lg border bg-card p-4 text-card-foreground sm:p-5">
      <p className="text-sm text-muted-foreground">7 derniers jours</p>
      <p className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
        {fmtPct(r.share_over_7d)} du temps de navigation au-dessus de {SITE.speedLimitKmh} km/h
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.share_over_prev_7d > 0 && (
          <>
            <span className={better ? "text-speed-ok" : "text-speed-danger"}>
              {fmtDelta(r.share_over_prev_7d, r.share_over_7d)}
            </span>{" "}
            par rapport à la semaine précédente ·{" "}
          </>
        )}
        {r.infractions_today.toLocaleString("fr-FR")} excès aujourd&apos;hui ·{" "}
        {r.boats_7d.toLocaleString("fr-FR")} bateaux en mouvement cette semaine ·{" "}
        <Link href="/evolution" className="underline hover:text-foreground">
          voir l&apos;évolution
        </Link>
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {r.flow && (
          <span>
            Débit de la {SITE.river} : <strong className="text-foreground">{Math.round(r.flow.q_m3s)} m³/s</strong>{" "}
            ({new Date(r.flow.day + "T00:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" })})
            {r.flow.q_m3s >= 150 && " — courant fort, les vitesses en descente sont gonflées"}
          </span>
        )}
        <span className={stale ? "text-speed-warning" : ""}>
          Dernière donnée AIS : {ago(r.last_position_at) ?? "inconnue"}
          {stale && " — réception interrompue, les chiffres récents peuvent être incomplets"}
        </span>
      </p>
    </section>
  );
}
