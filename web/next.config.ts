import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The probe's user agent links to /probe; the explanation lives on the method page.
  async redirects() {
    return [{ source: "/probe", destination: "/method", permanent: true }];
  },
};

export default nextConfig;
