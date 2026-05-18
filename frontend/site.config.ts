// Configuration zone-spécifique du site.
//
// Pour déployer cet outil sur une autre zone (par exemple la Marne) :
//   1. Fork le repo.
//   2. Fixe les variables NEXT_PUBLIC_* listées ci-dessous au build time
//      (ou édite les valeurs par défaut dans ce fichier).
//   3. Mets à jour le bbox + speed_limit_knots dans le config.toml du backend
//      pour qu'ils correspondent.
//   4. Réécris la page /a-propos pour la référence légale locale.

export interface SubZone {
  name: string;
  bounds: [[number, number], [number, number]]; // [[SW lat, SW lon], [NE lat, NE lon]]
}

function parseLatLon(s: string | undefined, fallback: [number, number]): [number, number] {
  if (!s) return fallback;
  const parts = s.split(",").map((x) => parseFloat(x.trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return fallback;
  return [parts[0], parts[1]];
}

function parseZones(s: string | undefined, fallback: SubZone[]): SubZone[] {
  if (!s) return fallback;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed as SubZone[];
  } catch {
    // fallthrough
  }
  return fallback;
}

export const SITE = {
  // Titre affiché sur la page d'accueil et dans le <title>.
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Vitesse Bateau Paris",

  // Ville (utilisée dans les phrases : "...sur la Seine à <city>").
  city: process.env.NEXT_PUBLIC_CITY_NAME || "Paris",

  // Nom du fleuve (utilisé seul : "Sur la <river>").
  river: process.env.NEXT_PUBLIC_RIVER_NAME || "Seine",

  // Nom du fleuve avec article défini contracté ("de la Seine", "de la Marne").
  // Utilisé pour les labels type "Rois de la Seine".
  riverWithArticle:
    process.env.NEXT_PUBLIC_RIVER_WITH_ARTICLE || "de la Seine",

  // Limite de vitesse en km/h. Doit correspondre à speed_limit_knots dans
  // le config.toml du backend (limite en km/h ÷ 1.852).
  speedLimitKmh: Number(process.env.NEXT_PUBLIC_SPEED_LIMIT_KMH) || 12,

  // Centre par défaut de la carte [lat, lon].
  mapCenter: parseLatLon(process.env.NEXT_PUBLIC_MAP_CENTER, [48.8566, 2.335]),

  // Zoom initial de la carte.
  mapZoom: Number(process.env.NEXT_PUBLIC_MAP_ZOOM) || 12,

  // Sous-zones cliquables sur la carte. Vide par défaut (pas de filtre par
  // zone). Chaque déploiement fournit les siennes via NEXT_PUBLIC_MAP_ZONES
  // (JSON sérialisé) dans son .env.local.
  zones: parseZones(process.env.NEXT_PUBLIC_MAP_ZONES, []),
} as const;

export const SPEED_LIMIT_KNOTS = SITE.speedLimitKmh / 1.852;

// basePath prefix for sub-path deployments (e.g. "/marne"). Empty string
// when the site is mounted at the domain root. Must mirror the basePath in
// next.config.ts (also driven by NEXT_PUBLIC_BASE_PATH).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
