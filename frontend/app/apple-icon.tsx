import { ImageResponse } from "next/og";
import { SITE } from "@/site.config";

// Apple touch icon (PNG). Generated so the build stays hermetic — no binary
// asset to maintain. Mirrors the theme of app/icon.svg.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1 }}>
          {SITE.speedLimitKmh}
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#ef4444", marginTop: 4 }}>
          km/h
        </div>
      </div>
    ),
    { ...size },
  );
}
