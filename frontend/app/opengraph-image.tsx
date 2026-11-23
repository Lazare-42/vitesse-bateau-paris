import { ImageResponse } from "next/og";
import { SITE } from "@/site.config";

// Default social/SERP preview card for every page that doesn't define its own.
export const alt = SITE.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#0a0a0a",
          padding: "80px",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", fontSize: 68, fontWeight: 700 }}>
          {SITE.name}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 34,
            color: "#a1a1aa",
            maxWidth: 900,
          }}
        >
          Excès de vitesse des bateaux sur la {SITE.river} à {SITE.city}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 28,
            color: "#ef4444",
          }}
        >
          Limite {SITE.speedLimitKmh} km/h · données AIS en temps réel
        </div>
      </div>
    ),
    { ...size },
  );
}
