import { ImageResponse } from "next/og";
import { getOffenderDetail } from "@/lib/api";
import { fmtKmh } from "@/lib/format";
import { SITE } from "@/site.config";

export const alt = "Excès de vitesse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ mmsi: string }>;
}) {
  const { mmsi } = await params;
  const data = await getOffenderDetail(mmsi);
  const name = data?.offender.vessel_name || `MMSI ${mmsi}`;
  const maxKmh = data ? `${fmtKmh(data.offender.max_speed_knots)} km/h` : "—";
  const count = data?.offender.infraction_count ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0a0a0a",
          padding: "80px",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa" }}>
          Excès de vitesse · {SITE.river} à {SITE.city}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            marginTop: 16,
            maxWidth: 1040,
          }}
        >
          {name}
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#71717a", marginTop: 8 }}>
          MMSI {mmsi}
        </div>
        <div style={{ display: "flex", gap: 64, marginTop: 56 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, color: "#a1a1aa" }}>Vitesse max</span>
            <span style={{ fontSize: 52, fontWeight: 700, color: "#ef4444" }}>
              {maxKmh}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 24, color: "#a1a1aa" }}>Excès</span>
            <span style={{ fontSize: 52, fontWeight: 700 }}>{count}</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
