import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "postgres",
    "sharp",
    "@tensorflow-models/face-detection",
    "@tensorflow/tfjs-core",
    "@tensorflow/tfjs-converter",
    "@tensorflow/tfjs-backend-cpu",
  ],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/export": ["./src/modules/exports/assets/**/*"],
    "/api/documents/*/export": ["./src/modules/exports/assets/**/*"],
    "/api/files": ["./src/modules/files/assets/face-detection/**/*"],
    "/api/ensemble": ["./src/modules/files/assets/face-detection/**/*"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
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
