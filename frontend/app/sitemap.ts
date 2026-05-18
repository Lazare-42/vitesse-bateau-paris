import type { MetadataRoute } from "next";
import { SITE } from "@/site.config";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; changeFrequency: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly"; priority: number }[] = [
    { path: "/", changeFrequency: "hourly", priority: 1.0 },
    { path: "/direct", changeFrequency: "always", priority: 0.9 },
    { path: "/exces", changeFrequency: "hourly", priority: 0.9 },
    { path: "/plus-rapides", changeFrequency: "daily", priority: 0.8 },
    { path: "/carte", changeFrequency: "hourly", priority: 0.8 },
    { path: "/a-propos", changeFrequency: "monthly", priority: 0.5 },
  ];

  return routes.map((r) => ({
    url: `${SITE.url}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
