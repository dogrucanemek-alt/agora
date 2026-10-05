import { getFacts } from "@/lib/store";
import { BRAND, SITE_URL, SNAPSHOT, day, n } from "@/lib/site";
import { TOPICS } from "@/lib/topics";

// llms.txt: a plain summary for language models, with every count read from data/facts.json.
export async function GET() {
  const f = await getFacts();
  const lines = [
    `# ${BRAND}`,
    "",
    `> Search for MCP servers (the tools AI agents connect to), ranked by what we measured: whether each server answers the MCP handshake, what tools it lists, and whether its repository is alive. Signed reports from agent gates count above everything else.`,
    "",
    `Agora is built and run by openforallofus. The catalog is the official MCP registry; the checks are ours and the method is public.`,
    "",
    "## Current numbers",
    `- Servers in the official MCP registry: ${n(f?.servers)} (read ${day(f?.catalogFetchedAt)})`,
    `- Remote endpoints checked: ${n(f?.probe.probed)} on ${day(f?.probeUpdatedAt)}; completed the handshake: ${n(f?.probe.answered)}; asked for sign-in: ${n(f?.probe.authRequired)}; asked for payment: ${n(f?.probe.paymentRequired)}; did not complete the handshake: ${n(f?.probe.notAnswering)}; unknown and left out of these counts (rate-limited us or templated URL): ${n(f ? (f.probe.unknown ?? f.probe.rateLimited + f.probe.templated) : undefined)}`,
    `- Linked GitHub repositories that no longer resolve: ${n(f?.repos.missing)} of ${n(f?.repos.distinct)}`,
    ...(f?.packages ? [
      `- Listed npm packages: ${n(f.packages.npm.listed)}; checked ${n(f.packages.npm.checked)}; not found ${n(f.packages.npm.missing)}`,
      `- Listed PyPI packages: ${n(f.packages.pypi.listed)}; checked ${n(f.packages.pypi.checked)}; not found ${n(f.packages.pypi.missing)} (read ${day(f.packages.fetchedAt)}${f.packages.sample != null ? "; partial sample" : ""})`,
    ] : []),
    "",
    "## What a check does not prove",
    "- An answered handshake means the endpoint is up. It does not mean the server is safe or that its tools behave as described.",
    "- Servers that run locally (npm, PyPI, Docker) cannot be checked from outside.",
    "- A signed report proves the reporter's gate allowed a call; it does not yet prove which server answered.",
    "",
    "## Pages",
    `- [How we check](${SITE_URL}/method): sources, the handshake check, what is indexed`,
    `- [Data](${SITE_URL}/data): the measurements as CSV; archived snapshot doi:${SNAPSHOT.doi} (${SNAPSHOT.date})`,
    `- [For agents](${SITE_URL}/agents): MCP endpoint ${SITE_URL}/api/mcp with search_tools, get_tool, submit_report`,
    `- [State of the MCP registry](${SITE_URL}/report): findings from the latest check`,
    `- [About](${SITE_URL}/about): who runs Agora, contact, privacy`,
    `- [Topics](${SITE_URL}/topics)`,
    ...TOPICS.map((t) => `  - [${t.label} MCP servers](${SITE_URL}/topics/${t.slug})`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
