"use client";

import { useState } from "react";

// BoatThumb renders a small square vessel photo (from the enriched
// photo_thumb_url, served by VesselFinder's static host). We hotlink with
// referrerPolicy="no-referrer" because the host serves the image fine without
// a Referer but applies hotlink protection when one is present. On a missing
// URL or a load error it falls back to a neutral boat glyph so every row keeps
// a consistent fixed-size slot.
export function BoatThumb({
  src,
  alt,
  size = 36,
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (!src || failed) {
    return (
      <div
        style={dim}
        aria-hidden
        className="shrink-0 rounded-md bg-muted flex items-center justify-center text-muted-foreground/60"
      >
        <svg
          className="h-1/2 w-1/2"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5l1.5 3a2.25 2.25 0 002.02 1.25h11A2.25 2.25 0 0019.5 19.5l1.5-3M4.5 16.5h15L18 11.25a1.5 1.5 0 00-1.42-1.01H7.42A1.5 1.5 0 006 11.25L4.5 16.5zM12 10V4.5m0 0l3 1.5m-3-1.5L9 6"
          />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={dim}
      className="shrink-0 rounded-md object-cover bg-muted"
    />
  );
}
