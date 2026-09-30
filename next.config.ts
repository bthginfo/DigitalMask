import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "sharp"],
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/export": ["./src/modules/exports/assets/**/*"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
