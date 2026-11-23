"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { BASE_PATH } from "@/site.config";

// Cookieless audience measurement: one beacon per page view with the path
// and the referrer. No cookie, no identifier, no third party (see
// /a-propos#audience). Honours Do Not Track.
export function PageTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    try {
      if (!pathname || pathname === lastPath.current || navigator.doNotTrack === "1") return;
      // document.referrer stays fixed during client-side navigation.
      const entry = lastPath.current === null && document.referrer
        ? new URL(document.referrer)
        : null;
      lastPath.current = pathname;
      const body = JSON.stringify({
        p: pathname,
        r: entry && entry.hostname !== location.hostname ? entry.origin : "",
      });
      const url = `${BASE_PATH}/api/hit`;
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
        void fetch(url, {
          method: "POST",
          body,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      }
    } catch {
      /* never break the page for analytics */
    }
  }, [pathname]);
  return null;
}
