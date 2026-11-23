"use client";

import { TileLayer } from "react-leaflet";

// Basemap shared by every map. CARTO's free basemaps now answer every tile
// with an "API KEY REQUIRED" image, so we use the standard OpenStreetMap
// tiles (attribution required by the OSM tile usage policy) and darken them
// with a CSS filter (.tiles-dark in globals.css) to match the dark theme.
export function BaseTiles() {
  return (
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      className="tiles-dark"
      maxZoom={19}
    />
  );
}
