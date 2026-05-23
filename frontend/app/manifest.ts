import type { MetadataRoute } from "next";
import { SITE } from "@/site.config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Vitesse Bateau",
    description: `Suivi des excès de vitesse des bateaux sur la ${SITE.river} à ${SITE.city}, à partir des données AIS publiques.`,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
