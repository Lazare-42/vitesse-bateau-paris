"use client";

import { BaseTiles } from "./base-tiles";
import { useEffect } from "react";
import {
  MapContainer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { SITE } from "@/site.config";

// Local shape (mirrors the infraction fields we draw) — kept self-contained
// like infractions-map.tsx so this client bundle never pulls in lib/api.
interface Infraction {
  id: number;
  max_speed_knots: number;
  speed_limit_knots: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  started_at: string;
  ended_at: string;
}

function knotsToKmh(knots: number): string {
  return (knots * 1.852).toFixed(1);
}

function excessPercent(speed: number, limit: number): number {
  return Math.round(((speed - limit) / limit) * 100);
}

function duration(start: string, end: string): string {
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasCoords(inf: Infraction): boolean {
  return (
    Number.isFinite(inf.start_lat) &&
    Number.isFinite(inf.start_lon) &&
    (inf.start_lat !== 0 || inf.start_lon !== 0)
  );
}

function isSinglePoint(inf: Infraction): boolean {
  return inf.start_lat === inf.end_lat && inf.start_lon === inf.end_lon;
}

// Fit the viewport to all of this boat's trajets once they're mounted.
function FitBounds({ infractions }: { infractions: Infraction[] }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    for (const inf of infractions) {
      pts.push([inf.start_lat, inf.start_lon]);
      pts.push([inf.end_lat, inf.end_lon]);
    }
    if (pts.length > 0) {
      map.fitBounds(pts as LatLngBoundsExpression, { padding: [30, 30], maxZoom: 16 });
    }
  }, [infractions, map]);
  return null;
}

export function BoatTrajetMap({ infractions }: { infractions: Infraction[] }) {
  const drawable = infractions.filter(hasCoords);

  return (
    <div className="rounded-lg overflow-hidden border">
      <MapContainer
        center={SITE.mapCenter}
        zoom={SITE.mapZoom}
        className="h-[40vh] sm:h-[55vh] w-full"
        attributionControl={true}
      >
        <BaseTiles />
        <FitBounds infractions={drawable} />

        {drawable.map((inf) => {
          const excess = excessPercent(inf.max_speed_knots, inf.speed_limit_knots);
          const color = excess >= 30 ? "#ef4444" : "#f59e0b";
          const weight = Math.min(2 + excess / 15, 7);
          const popup = (
            <Popup>
              <div className="text-xs leading-relaxed">
                <div className="font-semibold text-sm">
                  {knotsToKmh(inf.max_speed_knots)} km/h (+{excess}%)
                </div>
                <div>Durée : {duration(inf.started_at, inf.ended_at)}</div>
                <div>{formatDateShort(inf.started_at)}</div>
              </div>
            </Popup>
          );

          if (isSinglePoint(inf)) {
            return (
              <CircleMarker
                key={inf.id}
                center={[inf.start_lat, inf.start_lon]}
                radius={Math.min(4 + excess / 10, 10)}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.7, weight: 1 }}
              >
                {popup}
              </CircleMarker>
            );
          }

          return (
            <Polyline
              key={inf.id}
              positions={[
                [inf.start_lat, inf.start_lon],
                [inf.end_lat, inf.end_lon],
              ]}
              pathOptions={{ color, weight, opacity: 0.85 }}
            >
              {popup}
            </Polyline>
          );
        })}
      </MapContainer>
    </div>
  );
}
