import path from "node:path";
import type { NextConfig } from "next";

// Data lives in ../data (built by the scripts at the repo root, not in git). Tracing from the repo root
// lets server routes carry the three files they read; the registry dump and probe logs stay behind.
const DATA = ["../data/index.json", "../data/facts.json", "../data/reports.json"];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: { "/*": DATA, "/**/*": DATA },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // The probe's user agent links to /probe; the explanation lives on the method page.
  async redirects() {
    return [{ source: "/probe", destination: "/method", permanent: true }];
  },
};

export default nextConfig;
