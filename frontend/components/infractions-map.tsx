"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Rectangle,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { LatLngBoundsExpression, Popup as LPopup } from "leaflet";
import "leaflet/dist/leaflet.css";

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

interface Offender {
  mmsi: number;
  vessel_name: string;
  infraction_count: number;
  cumulative_excess_knots: number;
}

const ZONES: {
  name: string;
  bounds: LatLngBoundsExpression;
}[] = [
  {
    name: "Boulogne",
    bounds: [
      [48.8385, 2.2565],
      [48.8585, 2.2875],
    ],
  },
  {
    name: "Trocadero",
    bounds: [
      [48.855, 2.2875],
      [48.867, 2.3035],
    ],
  },
  {
    name: "Centre",
    bounds: [
      [48.854, 2.3035],
      [48.865, 2.347],
    ],
  },
  {
    name: "Bastille",
    bounds: [
      [48.846, 2.347],
      [48.858, 2.369],
    ],
  },
  {
    name: "Bercy",
    bounds: [
      [48.832, 2.369],
      [48.848, 2.3965],
    ],
  },
];

function knotsToKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

function excessPercent(speed: number, limit: number): number {
  return Math.round(((speed - limit) / limit) * 100);
}

function duration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isInZone(inf: Infraction, zone: (typeof ZONES)[0]): boolean {
  const [[s, w], [n, e]] = zone.bounds as [[number, number], [number, number]];
  const midLat = (inf.start_lat + inf.end_lat) / 2;
  const midLon = (inf.start_lon + inf.end_lon) / 2;
  return midLat >= s && midLat <= n && midLon >= w && midLon <= e;
}

function isSinglePoint(inf: Infraction): boolean {
  return inf.start_lat === inf.end_lat && inf.start_lon === inf.end_lon;
}

function ClearZoneOnClick({ onClear }: { onClear: () => void }) {
  useMapEvents({
    click: () => onClear(),
  });
  return null;
}

function FlyToInfraction({ infraction }: { infraction: Infraction | null }) {
  const map = useMap();
  const hasFlown = useRef(false);

  useEffect(() => {
    if (!infraction || hasFlown.current) return;
    hasFlown.current = true;
    const lat = (infraction.start_lat + infraction.end_lat) / 2;
    const lon = (infraction.start_lon + infraction.end_lon) / 2;
    map.flyTo([lat, lon], 16, { duration: 1 });
  }, [infraction, map]);

  return null;
}

function InfractionPolyline({
  inf,
  isHighlighted,
  initialOpen,
}: {
  inf: Infraction;
  isHighlighted: boolean;
  initialOpen: boolean;
}) {
  const popupRef = useRef<LPopup>(null);
  const map = useMap();

  useEffect(() => {
    if (initialOpen && popupRef.current) {
      setTimeout(() => popupRef.current?.openOn(map), 600);
    }
  }, [initialOpen, map]);

  const excess = excessPercent(inf.max_speed_knots, inf.speed_limit_knots);
  const color = isHighlighted ? "#6366f1" : excess >= 30 ? "#ef4444" : "#f59e0b";
  const weight = isHighlighted ? 6 : Math.min(2 + excess / 15, 7);

  const popup = (
    <Popup ref={popupRef}>
      <div className="text-xs leading-relaxed">
        <div className="font-semibold text-sm">
          {inf.vessel_name || "Inconnu"}
        </div>
        <div>
          {knotsToKmh(inf.max_speed_knots)} km/h (+{excess}%)
        </div>
        <div>Duree: {duration(inf.started_at, inf.ended_at)}</div>
        <div>{formatDateShort(inf.started_at)}</div>
      </div>
    </Popup>
  );

  if (isSinglePoint(inf)) {
    return (
      <CircleMarker
        center={[inf.start_lat, inf.start_lon]}
        radius={isHighlighted ? 12 : Math.min(4 + excess / 10, 10)}
        pathOptions={{
          color,
          fillColor: color,
          fillOpacity: isHighlighted ? 0.9 : 0.7,
          weight: isHighlighted ? 3 : 1,
        }}
      >
        {popup}
      </CircleMarker>
    );
  }

  return (
    <Polyline
      positions={[
        [inf.start_lat, inf.start_lon],
        [inf.end_lat, inf.end_lon],
      ]}
      pathOptions={{ color, weight, opacity: isHighlighted ? 1 : 0.8 }}
    >
      {popup}
    </Polyline>
  );
}

type SortKey = "date" | "speed" | "excess";

const sortColumns: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: "date", label: "Date", shortLabel: "Date" },
  { key: "speed", label: "Vitesse max", shortLabel: "V. max" },
  { key: "excess", label: "Exces", shortLabel: "Exces" },
];

function SortIcon({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) {
    return (
      <svg
        className="ml-1 inline h-3 w-3 text-muted-foreground/40"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
        />
      </svg>
    );
  }
  return (
    <svg
      className="ml-1 inline h-3 w-3"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={desc ? "M19.5 8.25l-7.5 7.5-7.5-7.5" : "M4.5 15.75l7.5-7.5 7.5 7.5"}
      />
    </svg>
  );
}

export function InfractionsMap({
  infractions,
  offenders,
  initialInfractionId,
  initialMmsi,
}: {
  infractions: Infraction[];
  offenders: Offender[];
  initialInfractionId?: number;
  initialMmsi?: number;
}) {
  const [soloMode, setSoloMode] = useState(!!initialInfractionId);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedMmsi, setSelectedMmsi] = useState<string>(
    initialMmsi ? String(initialMmsi) : "",
  );
  const [highlightedId] = useState<number | undefined>(initialInfractionId);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDesc, setSortDesc] = useState(true);

  const focusedInfraction = useMemo(() => {
    if (!initialInfractionId) return null;
    return infractions.find((inf) => inf.id === initialInfractionId) ?? null;
  }, [infractions, initialInfractionId]);

  const exitSoloMode = useCallback(() => setSoloMode(false), []);

  const handleSelectZone = useCallback((zone: string | null) => {
    setSoloMode(false);
    setSelectedZone(zone);
  }, []);

  const handleSelectMmsi = useCallback((mmsi: string) => {
    setSoloMode(false);
    setSelectedMmsi(mmsi);
  }, []);

  const filtered = useMemo(() => {
    if (soloMode && focusedInfraction) return [focusedInfraction];
    let result = infractions;
    if (selectedMmsi) {
      const mmsi = parseInt(selectedMmsi, 10);
      result = result.filter((inf) => inf.mmsi === mmsi);
    }
    if (selectedZone) {
      const zone = ZONES.find((z) => z.name === selectedZone);
      if (zone) result = result.filter((inf) => isInZone(inf, zone));
    }
    return result;
  }, [infractions, selectedMmsi, selectedZone, soloMode, focusedInfraction]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === "date") {
        cmp = new Date(a.started_at).getTime() - new Date(b.started_at).getTime();
      } else if (sortKey === "speed") {
        cmp = a.max_speed_knots - b.max_speed_knots;
      } else {
        cmp =
          excessPercent(a.max_speed_knots, a.speed_limit_knots) -
          excessPercent(b.max_speed_knots, b.speed_limit_knots);
      }
      return sortDesc ? -cmp : cmp;
    });
  }, [filtered, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const selectedName = useMemo(() => {
    if (!selectedMmsi) return null;
    const mmsi = parseInt(selectedMmsi, 10);
    const o = offenders.find((o) => o.mmsi === mmsi);
    return o?.vessel_name || `MMSI ${mmsi}`;
  }, [offenders, selectedMmsi]);

  return (
    <div>
      {/* Solo mode banner */}
      {soloMode && focusedInfraction && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm font-medium flex-1">
            {focusedInfraction.vessel_name || "Inconnu"} —{" "}
            {knotsToKmh(focusedInfraction.max_speed_knots)} km/h (+
            {excessPercent(focusedInfraction.max_speed_knots, focusedInfraction.speed_limit_knots)}
            %)
          </p>
          <button
            onClick={exitSoloMode}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Voir tous les exces
          </button>
        </div>
      )}

      {/* Filters bar */}
      {!soloMode && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Zone :</span>
            <button
              onClick={() => handleSelectZone(null)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                !selectedZone
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              Toutes
            </button>
            {ZONES.map((zone) => (
              <button
                key={zone.name}
                onClick={() =>
                  handleSelectZone(selectedZone === zone.name ? null : zone.name)
                }
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedZone === zone.name
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {zone.name}
              </button>
            ))}
          </div>

          <select
            value={selectedMmsi}
            onChange={(e) => handleSelectMmsi(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
          >
            <option value="">Tous les bateaux</option>
            {offenders.map((o) => (
              <option key={o.mmsi} value={o.mmsi}>
                {o.vessel_name || `MMSI ${o.mmsi}`} ({knotsToKmh(o.cumulative_excess_knots)} km/h)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="rounded-lg overflow-hidden border">
        <MapContainer
          center={[48.8566, 2.335]}
          zoom={13}
          className="h-[50vh] sm:h-[70vh] w-full"
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <ClearZoneOnClick onClear={() => handleSelectZone(null)} />
          <FlyToInfraction infraction={focusedInfraction} />

          {/* Seine zones — hidden in solo mode */}
          {!soloMode &&
            ZONES.map((zone) => (
              <Rectangle
                key={zone.name}
                bounds={zone.bounds}
                pathOptions={{
                  color: "#6366f1",
                  weight: selectedZone === zone.name ? 2 : 1,
                  fillColor: "#6366f1",
                  fillOpacity: selectedZone === zone.name ? 0.25 : 0.08,
                }}
                eventHandlers={{
                  click: (e) => {
                    e.originalEvent.stopPropagation();
                    handleSelectZone(
                      selectedZone === zone.name ? null : zone.name,
                    );
                  },
                }}
              >
                <Popup>
                  <span className="font-semibold">{zone.name}</span>
                  <br />
                  <span className="text-xs">
                    {infractions.filter((inf) => isInZone(inf, zone)).length}{" "}
                    exces
                  </span>
                </Popup>
              </Rectangle>
            ))}

          {/* Infraction lines/markers */}
          {filtered.map((inf) => (
            <InfractionPolyline
              key={inf.id}
              inf={inf}
              isHighlighted={inf.id === highlightedId}
              initialOpen={inf.id === initialInfractionId}
            />
          ))}
        </MapContainer>
      </div>

      {/* Infraction count */}
      <p className="mt-3 text-sm text-muted-foreground">
        {filtered.length} exces
        {selectedName ? ` — ${selectedName}` : ""}
        {selectedZone ? ` — zone ${selectedZone}` : ""}
      </p>

      {/* Filtered list */}
      {filtered.length > 0 && (
        <div className="mt-4">
          {/* Mobile sort selector */}
          <div className="sm:hidden mb-3">
            <select
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setSortDesc(true);
              }}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground w-full"
            >
              {sortColumns.map((c) => (
                <option key={c.key} value={c.key}>
                  Trier par : {c.shortLabel}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-hidden rounded-lg border">
            <table className="w-full caption-bottom text-sm">
              <thead>
                <tr className="hover:bg-transparent">
                  {sortColumns.map((col, i) => (
                    <th
                      key={col.key}
                      className={`h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input font-medium cursor-pointer select-none hover:text-foreground transition-colors ${
                        i === 0 ? "text-left first:rounded-tl-lg" : "text-right"
                      } ${sortKey === col.key ? "text-foreground" : "text-muted-foreground"}`}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon active={sortKey === col.key} desc={sortDesc} />
                    </th>
                  ))}
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-left text-muted-foreground font-medium">
                    Bateau
                  </th>
                  <th className="h-8 px-3 bg-secondary dark:bg-input/30 border-b border-input text-right text-muted-foreground font-medium last:rounded-tr-lg">
                    Duree
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inf) => (
                  <tr
                    key={inf.id}
                    className={`border-b transition-colors hover:bg-muted/50 last:border-0 ${
                      inf.id === highlightedId ? "bg-muted/30" : ""
                    }`}
                  >
                    <td className="py-3 h-10 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateShort(inf.started_at)}
                    </td>
                    <td className="py-3 h-10 px-3 text-right font-medium text-speed-danger">
                      {knotsToKmh(inf.max_speed_knots)} km/h
                    </td>
                    <td className="py-3 h-10 px-3 text-right">
                      <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                        +
                        {excessPercent(
                          inf.max_speed_knots,
                          inf.speed_limit_knots,
                        )}
                        %
                      </span>
                    </td>
                    <td className="py-3 h-10 px-3">
                      <button
                        onClick={() => handleSelectMmsi(String(inf.mmsi))}
                        className="text-left hover:underline"
                      >
                        <div className="font-medium">
                          {inf.vessel_name || "Inconnu"}
                        </div>
                      </button>
                    </td>
                    <td className="py-3 h-10 px-3 text-right text-xs text-muted-foreground">
                      {duration(inf.started_at, inf.ended_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden flex flex-col gap-3">
            {sorted.map((inf) => (
              <div
                key={inf.id}
                className={`rounded-lg border bg-card p-4 text-card-foreground ${
                  inf.id === highlightedId ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <button
                      onClick={() => handleSelectMmsi(String(inf.mmsi))}
                      className="font-semibold text-left hover:underline"
                    >
                      {inf.vessel_name || "Inconnu"}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {formatDateShort(inf.started_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-md bg-speed-danger/10 px-2 py-0.5 text-xs font-medium text-speed-danger">
                    +
                    {excessPercent(
                      inf.max_speed_knots,
                      inf.speed_limit_knots,
                    )}
                    %
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-lg font-bold text-speed-danger">
                    {knotsToKmh(inf.max_speed_knots)} km/h
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {duration(inf.started_at, inf.ended_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
