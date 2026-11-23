import { getTrends } from "@/lib/api";
import { fmtPct } from "@/lib/trends";
import { monthKey, monthLabel, publishableMonths } from "@/lib/months";
import { SITE } from "@/site.config";

export const revalidate = 3600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  const months = publishableMonths(await getTrends("month")).reverse();
  const items = months
    .map((m) => {
      const key = monthKey(m.period);
      const url = `${SITE.url}/bilan/${key}`;
      // Published on the 1st of the following month.
      const [y, mo] = key.split("-").map(Number);
      const pub = new Date(Date.UTC(mo === 12 ? y + 1 : y, mo % 12, 1)).toUTCString();
      const desc = `${fmtPct(m.share_over)} du temps de navigation au-dessus de ${SITE.speedLimitKmh} km/h, ${m.infractions} excès soutenus.`;
      return `<item><title>${esc(`Bilan ${monthLabel(key)}`)}</title><link>${url}</link><guid>${url}</guid><pubDate>${pub}</pubDate><description>${esc(desc)}</description></item>`;
    })
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(`${SITE.name} — bilans mensuels`)}</title><link>${SITE.url}/bilan</link><description>${esc(`Bilans mensuels des excès de vitesse sur la ${SITE.river} à ${SITE.city}`)}</description><language>fr-fr</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
