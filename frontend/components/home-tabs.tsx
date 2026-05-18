"use client";

import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Suspense, useCallback } from "react";
import { OffendersTable } from "./offenders-table";
import { ViolationsTable } from "./violations-table";
import { FastestTable, type FastestEver } from "./fastest-table";
import { SITE } from "@/site.config";

type TabId = "records" | "rois" | "recents";

const TABS: { id: TabId; label: string }[] = [
  { id: "rois", label: `Rois ${SITE.riverWithArticle}` },
  { id: "records", label: "Records de vitesse" },
  { id: "recents", label: "Exces recents" },
];

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  max_speed_knots: number;
  avg_speed_knots: number;
  last_infraction_at: string;
  cumulative_excess_knots: number;
  avg_infraction_duration_seconds: number;
  excess_time_ratio: number;
}

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

interface HomeTabsProps {
  fastest: FastestEver[];
  offenders: Offender[];
  infractions: Infraction[];
}

function HomeTabsInner({ fastest, offenders, infractions }: HomeTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams.get("tab");
  const active: TabId =
    raw === "records" || raw === "recents" ? raw : "rois";

  const setTab = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id === "rois") params.delete("tab");
      else params.set("tab", id);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Sections"
        className="mb-4 flex flex-wrap gap-1 border-b border-input"
      >
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {active === "records" && (
        <section
          role="tabpanel"
          id="panel-records"
          aria-labelledby="tab-records"
        >
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Top 50 par vitesse maximale jamais atteinte (sur exces soutenus
              au moins 30 secondes).
            </p>
            <Link
              href="/plus-rapides"
              className="shrink-0 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              Voir le classement complet &rarr;
            </Link>
          </div>
          <FastestTable data={fastest} />
        </section>
      )}

      {active === "rois" && (
        <section
          role="tabpanel"
          id="panel-rois"
          aria-labelledby="tab-rois"
        >
          <p className="mb-4 text-xs text-muted-foreground">
            Classe par defaut sur le pourcentage de temps en exces :
            (duree totale en exces) divisee par (temps total passe dans la
            zone). Plus un bateau roule au-dessus de {SITE.speedLimitKmh}{" "}
            km/h pendant qu&apos;il est suivi en AIS, plus il monte. Les
            autres colonnes (duree moyenne par exces, total cumule, nombre
            d&apos;exces, vitesse max, etc.) restent triables.
          </p>
          <OffendersTable data={offenders} />
        </section>
      )}

      {active === "recents" && (
        <section
          role="tabpanel"
          id="panel-recents"
          aria-labelledby="tab-recents"
        >
          <p className="mb-4 text-xs text-muted-foreground">
            Un exces de vitesse est un segment continu ou un bateau depasse la
            limite de {SITE.speedLimitKmh} km/h. Il commence au premier ping
            en exces et se termine quand la vitesse repasse sous la limite. La
            vitesse max, la vitesse moyenne, la duree et le trajet (point de
            depart &rarr; point d&apos;arrivee) sont enregistres.
          </p>
          <ViolationsTable data={infractions} offenders={offenders} />
        </section>
      )}
    </div>
  );
}

export function HomeTabs(props: HomeTabsProps) {
  return (
    <Suspense
      fallback={<div className="text-sm text-muted-foreground">Chargement...</div>}
    >
      <HomeTabsInner {...props} />
    </Suspense>
  );
}
