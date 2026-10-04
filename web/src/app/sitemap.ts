import type { MetadataRoute } from "next";
import { getFacts, indexableNames } from "@/lib/store";
import { SITE_URL, toolPath } from "@/lib/site";
import { TOPICS } from "@/lib/topics";

// Only pages we ask search engines to index; tool pages marked noindex are left out on purpose.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tools, facts] = await Promise.all([indexableNames(), getFacts()]);
  const checked = facts?.probeUpdatedAt ? new Date(facts.probeUpdatedAt) : undefined;
  return [
    { url: `${SITE_URL}/`, lastModified: checked },
    { url: `${SITE_URL}/topics`, lastModified: checked },
    ...TOPICS.map((t) => ({ url: `${SITE_URL}/topics/${t.slug}`, lastModified: checked })),
    { url: `${SITE_URL}/method`, lastModified: checked },
    { url: `${SITE_URL}/data`, lastModified: checked },
    { url: `${SITE_URL}/agents` },
    ...tools.map((t) => ({ url: SITE_URL + toolPath(t.name), lastModified: checked ?? (t.updatedAt ? new Date(t.updatedAt) : undefined) })),
  ];
}
