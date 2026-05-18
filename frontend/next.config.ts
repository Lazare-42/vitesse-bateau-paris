import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://localhost:8092";

// Optional path prefix for sub-path deployments (e.g. "/marne" so the site
// lives at vitessebateauparis.com/marne/...). Leave empty for root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "standalone",
  ...(basePath ? { basePath } : {}),
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${API_URL}/api/:path*`,
    },
  ],
};

export default nextConfig;
