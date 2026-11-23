"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BASE_PATH } from "@/site.config";

// Cookieless audience measurement: one beacon per page view with the path
// and the referrer. No cookie, no identifier, no third party (see
// /a-propos#audience). Honours Do Not Track.
export function PageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (navigator.doNotTrack === "1") return;
      const body = JSON.stringify({ p: pathname, r: document.referrer });
      const url = `${BASE_PATH}/api/hit`;
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
        void fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
      }
    } catch {
      /* never break the page for analytics */
    }
  }, [pathname]);
  return null;
}
