import type { MetadataRoute } from "next";
import { getOffenders, getOperators, getTrends } from "@/lib/api";
import { monthKey, publishableMonths } from "@/lib/months";
import { SITE } from "@/site.config";

// Split into sub-sitemaps. Next.js serves a sitemap index at /sitemap.xml that
// references /sitemap/core.xml and /sitemap/bateaux.xml. Keeping each section
// separate makes coverage easy to read in Search Console, and the boat section
// can grow toward the 50k-URL / 50MB per-file limit on its own.
export async function generateSitemaps() {
  return [{ id: "core" }, { id: "bateaux" }];
}

// Regenerate hourly. The boat list is fetched at request/revalidate time, so
// the hermetic build doesn't need the backend (getOffenders returns [] then).
export const revalidate = 3600;

const CORE: {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}[] = [
  { path: "/", changeFrequency: "hourly", priority: 1.0 },
  { path: "/direct", changeFrequency: "always", priority: 0.9 },
  { path: "/evolution", changeFrequency: "daily", priority: 0.9 },
  { path: "/compagnies", changeFrequency: "daily", priority: 0.8 },
  { path: "/bilan", changeFrequency: "monthly", priority: 0.7 },
  { path: "/baignade", changeFrequency: "weekly", priority: 0.6 },
  { path: "/exces", changeFrequency: "hourly", priority: 0.9 },
  { path: "/plus-rapides", changeFrequency: "daily", priority: 0.8 },
  { path: "/carte", changeFrequency: "hourly", priority: 0.8 },
  {
    path: "/dossiers/vitesse-bateaux-mouches",
    changeFrequency: "weekly",
    priority: 0.7,
  },
  { path: "/a-propos", changeFrequency: "monthly", priority: 0.5 },
];

export default async function sitemap({
  id,
}: {
  id: string;
}): Promise<MetadataRoute.Sitemap> {
  if (id === "bateaux") {
    const offenders = await getOffenders(100);
    return offenders.map((o) => ({
      url: `${SITE.url}/bateau/${o.mmsi}`,
      // Real content-change time — Google only trusts lastmod when accurate.
      lastModified: o.last_infraction_at
        ? new Date(o.last_infraction_at)
        : new Date(),
      changeFrequency: "daily",
      priority: 0.6,
    }));
  }

  const now = new Date();
  const [operators, months] = await Promise.all([getOperators(), getTrends("month")]);
  return [
    ...CORE.map((r) => ({
      url: `${SITE.url}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...operators.map((o) => ({
      url: `${SITE.url}/compagnies/${o.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...publishableMonths(months).map((m) => ({
      url: `${SITE.url}/bilan/${monthKey(m.period)}`,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
