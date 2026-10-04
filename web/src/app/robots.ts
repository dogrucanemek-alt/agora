import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines and AI crawlers are welcome; the API is for agents, not for crawling.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
