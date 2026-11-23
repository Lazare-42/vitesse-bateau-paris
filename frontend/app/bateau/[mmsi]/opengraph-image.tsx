import { ImageResponse } from "next/og";
import { getOffenderDetail, vesselSpecs } from "@/lib/api";
import { fmtKmh } from "@/lib/format";
import { SITE } from "@/site.config";

export const alt = "Excès de vitesse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Fetch the enriched vessel photo and inline it as a data URI. We fetch the
// bytes ourselves (rather than passing the remote URL to <img>) so a slow or
// failing host degrades to the text-only card instead of erroring the whole
// image route. No Referer is sent, so VesselFinder's hotlink protection
// doesn't kick in (same reason BoatThumb uses referrerPolicy="no-referrer").
async function fetchImageDataUri(url?: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ mmsi: string }>;
}) {
  const { mmsi } = await params;
  const data = await getOffenderDetail(mmsi);
  const o = data?.offender;
  const name = o?.vessel_name || `MMSI ${mmsi}`;
  const maxKmh = o ? `${fmtKmh(o.max_speed_knots)} km/h` : "—";
  const count = o?.infraction_count ?? 0;
  const specs = o ? vesselSpecs(o).join(" · ") : "";
  const photo = await fetchImageDataUri(o?.photo_url || o?.photo_thumb_url);

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        {/* Text column */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px",
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa" }}>
            Excès de vitesse · {SITE.river} à {SITE.city}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 60,
              fontWeight: 700,
              marginTop: 14,
              maxWidth: photo ? 620 : 1040,
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#71717a", marginTop: 8 }}>
            MMSI {mmsi}
          </div>
          {specs ? (
            <div
              style={{
                display: "flex",
                fontSize: 24,
                color: "#a1a1aa",
                marginTop: 10,
                maxWidth: photo ? 620 : 1040,
              }}
            >
              {specs}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 56, marginTop: 48 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, color: "#a1a1aa" }}>Vitesse max</span>
              <span style={{ fontSize: 50, fontWeight: 700, color: "#ef4444" }}>
                {maxKmh}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, color: "#a1a1aa" }}>Excès</span>
              <span style={{ fontSize: 50, fontWeight: 700 }}>{count}</span>
            </div>
          </div>
        </div>

        {/* Photo column */}
        {photo ? (
          <div style={{ display: "flex", width: 440, height: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={name}
              width={440}
              height={630}
              style={{ width: 440, height: 630, objectFit: "cover" }}
            />
          </div>
        ) : null}
      </div>
    ),
    { ...size },
  );
}
