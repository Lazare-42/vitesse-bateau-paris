import type { MetadataRoute } from "next";
import { SITE } from "@/site.config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    // generateSitemaps() emits sub-sitemaps but no parent index, so list each
    // one (robots.txt supports multiple Sitemap: lines).
    sitemap: [
      `${SITE.url}/sitemap/core.xml`,
      `${SITE.url}/sitemap/bateaux.xml`,
    ],
    host: SITE.url,
  };
}
