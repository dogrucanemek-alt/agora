// One page per MCP server. Every line states where it comes from and when it was read:
// the registry entry, the GitHub repository, our handshake check, or a signed report.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, Header } from "@/components/Chrome";
import { answers, getServer, related, type Server } from "@/lib/store";
import { BRAND, FLAG_TEXT, clip, SITE_URL, day, liveLabel, n, registryRecordUrl, toolPath } from "@/lib/site";

type Props = { params: Promise<{ slug: string[] }> };

// Rendered on first visit and kept until the next deploy: the data only changes when we redeploy.
export function generateStaticParams() {
  return [];
}

const nameOf = async (params: Props["params"]) => (await params).slug.map(decodeURIComponent).join("/");
const display = (s: Server) => s.title || s.name.split("/").pop() || s.name;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getServer(await nameOf(params));
  if (!found) return { title: `Not found | ${BRAND}`, robots: { index: false } };
  const s = found.server;
  const status = s.live ? liveLabel(s.live).text : "Not checked yet";
  const tools = s.live?.toolCount != null ? ` ${s.live.toolCount} tools.` : "";
  return {
    title: `${display(s)} MCP server: status and tools | ${BRAND}`,
    description: `${s.description.slice(0, 150)} ${status}.${tools}`.trim(),
    alternates: { canonical: SITE_URL + toolPath(s.name) },
    robots: { index: !!s.indexable, follow: true },
    openGraph: { title: `${display(s)} MCP server`, description: s.description.slice(0, 200), url: SITE_URL + toolPath(s.name), siteName: BRAND, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", images: ["/opengraph-image"] },
  };
}

function Row({ k, children, src }: { k: string; children: React.ReactNode; src: React.ReactNode }) {
  return (
    <tr>
      <th scope="row">{k}</th>
      <td>{children}</td>
      <td className="src">{src}</td>
    </tr>
  );
}

export default async function ToolPage({ params }: Props) {
  const name = await nameOf(params);
  const found = await getServer(name);
  if (!found) notFound();
  const { server: s, reports, proofs } = found;
  const near = await related(s);
  const gh = s.gh && !("missing" in s.gh) ? s.gh : null;
  const remote = s.remotes.find((r) => r.type === "streamable-http") ?? s.remotes[0];
  const npm = s.packages.find((p) => p.registry === "npm");
  const short = (s.name.split("/").pop() ?? "server").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const live = s.live ? liveLabel(s.live) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: display(s),
        alternateName: s.name,
        description: s.description,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        url: SITE_URL + toolPath(s.name),
        ...(s.version ? { softwareVersion: s.version } : {}),
        ...(gh?.license && gh.license !== "NOASSERTION" ? { license: `https://spdx.org/licenses/${gh.license}` } : {}),
        sameAs: [s.repo && `https://github.com/${s.repo}`, s.website].filter(Boolean),
        ...(s.updatedAt ? { dateModified: s.updatedAt } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND, item: SITE_URL + "/" },
          { "@type": "ListItem", position: 2, name: display(s), item: SITE_URL + toolPath(s.name) },
        ],
      },
    ],
  };

  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">Agora</Link> / <span>{s.name.split("/")[0]}</span>
        </nav>
        <h1>{display(s)}</h1>
        <div className="n">{s.name}</div>
        <p className="lede">{s.description}</p>
        <p className="attrib">Description as published in the official MCP registry.</p>

        {live && (
          <div className={`status ${live.tone}`}>
            <strong>{live.text}.</strong> Checked {day(s.live!.at)}.
          </div>
        )}

        <h2>What we measured</h2>
        <table className="facts">
          <tbody>
            <Row k="Endpoint" src={<a href={registryRecordUrl(s.name)}>registry</a>}>
              {remote ? <code>{remote.url}</code> : "None listed (runs locally)"}
            </Row>
            {s.live && (
              <Row k="Handshake" src={<Link href="/method">our check, {day(s.live.at)}</Link>}>
                {live!.text}
                {s.live.ms != null && answers(s.live) ? ` (${n(s.live.ms)} ms)` : ""}
              </Row>
            )}
            {s.live?.protocol && (
              <Row k="Protocol version" src={<Link href="/method">our check, {day(s.live.at)}</Link>}>
                {s.live.protocol}
              </Row>
            )}
            {s.live?.tools && (
              <Row k={`Tools (${s.live.toolCount})`} src={<Link href="/method">tools/list, {day(s.live.at)}</Link>}>
                <span className="toollist">{s.live.tools.join(", ")}</span>
              </Row>
            )}
            {gh && (
              <>
                <Row k="GitHub stars" src={<a href={`https://github.com/${s.repo}`}>github.com/{s.repo}</a>}>
                  {n(gh.stars)}
                </Row>
                <Row k="Last push" src={<a href={`https://github.com/${s.repo}`}>GitHub API</a>}>
                  {day(gh.pushedAt)}
                  {gh.archived ? " (archived)" : ""}
                </Row>
                {gh.license && gh.license !== "NOASSERTION" && (
                  <Row k="Licence" src={<a href={`https://github.com/${s.repo}`}>GitHub API</a>}>
                    {gh.license}
                  </Row>
                )}
              </>
            )}
            <Row k="Registry version" src={<a href={registryRecordUrl(s.name)}>registry</a>}>
              {s.version ?? "unknown"} · {s.status} · updated {day(s.updatedAt)}
            </Row>
            {s.packages.map((p, i) => (
              <Row key={i} k="Package" src={<a href={registryRecordUrl(s.name)}>registry</a>}>
                <code>
                  {p.registry}: {p.id}
                </code>
              </Row>
            ))}
          </tbody>
        </table>

        {(s.flags ?? []).length > 0 && (
          <>
            <h2>Worth knowing</h2>
            <ul className="flags">
              {s.flags!.map((f) => (
                <li key={f}>{FLAG_TEXT[f] ?? f}</li>
              ))}
            </ul>
          </>
        )}

        <h2>Signed reports</h2>
        {proofs.count === 0 ? (
          <p className="muted">
            No signed reports yet. A report carries a signed decision record from the reporter&apos;s gate, so it shows a real call went through, not
            just an opinion. <Link href="/agents">How to file one</Link>.
          </p>
        ) : (
          <ul className="reports">
            {reports.map((r) => (
              <li key={r.receipt}>
                <span className={`b ${r.verdict === "works" ? "proof ok" : "dep"}`}>{r.verdict}</span> {day(new Date(r.at).toISOString())} · tool{" "}
                <code>{r.tool}</code> · operator <code>{r.operator}</code> · level {r.level}
                {r.note && <div className="note">“{r.note}”</div>}
              </li>
            ))}
          </ul>
        )}

        {(remote || npm) && (
          <>
            <h2>Connect</h2>
            {remote && !remote.url.includes("{") && (
              <pre>
                <code>{`claude mcp add --transport http ${short} ${remote.url}`}</code>
              </pre>
            )}
            {npm && (
              <pre>
                <code>{`npx -y ${npm.id}`}</code>
              </pre>
            )}
            <p className="muted">Commands are built from the registry entry. Check the publisher&apos;s documentation before giving any server access to your data.</p>
          </>
        )}

        {near.length > 0 && (
          <>
            <h2>Related servers</h2>
            <ul className="near">
              {near.map((x) => (
                <li key={x.name}>
                  <Link href={toolPath(x.name)}>{display(x)}</Link> <span className="muted">{clip(x.description, 90)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {s.repo && (
          <>
            <h2>Badge for your README</h2>
            <p className="muted">Shows the result of our latest check and links back to this page.</p>
            <pre>
              <code>{`[![agora](${SITE_URL}/badge/${s.name}.svg)](${SITE_URL + toolPath(s.name)})`}</code>
            </pre>
          </>
        )}

        <p className="agentnote muted">
          Agents can read this page as data: MCP endpoint <code>{SITE_URL}/api/mcp</code>, tool <code>get_tool</code> with name <code>{s.name}</code>.
        </p>
      </main>
      <Footer />
    </>
  );
}
