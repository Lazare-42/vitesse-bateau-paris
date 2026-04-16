import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://localhost:8092";

const nextConfig: NextConfig = {
  output: "standalone",
  rewrites: async () => [
    {
      source: "/api/:path*",
      destination: `${API_URL}/api/:path*`,
    },
  ],
};

export default nextConfig;
