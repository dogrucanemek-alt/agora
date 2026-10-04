import Link from "next/link";
import { Footer } from "@/components/Chrome";
import Search from "@/components/Search";
import Sky from "@/components/Sky";
import { getFacts } from "@/lib/store";
import { BRAND, ORG, PRODUCT, SITE_URL, day, n } from "@/lib/site";
import { TOPICS } from "@/lib/topics";

// The search box is interactive; everything under it is rendered on the server so that people without
// JavaScript, search engines and AI crawlers read the same answers and numbers.
export default async function Home() {
  const f = await getFacts();
  const p = f?.probe;
  const what = `${PRODUCT} is a search engine for MCP servers, the tools AI agents connect to. It lists all ${n(f?.servers)} servers in the official MCP registry and checks the ones with a remote endpoint: does it answer the MCP handshake, which tools does it list, is its repository still there. Results are ranked by those checks, not by votes.`;
  const found = `On ${day(f?.probeUpdatedAt)} we checked ${n(p?.probed)} remote endpoints. ${n(p?.answered)} completed the handshake, ${n(p?.authRequired)} asked for sign-in first and ${n(p?.notAnswering)} did not complete it. ${n(f?.repos.missing)} of ${n(f?.repos.distinct)} linked GitHub repositories no longer resolve.`;
  const agents = `Yes. ${PRODUCT} is itself an MCP server at ${SITE_URL}/api/mcp with three tools: search_tools, get_tool and submit_report. Reading needs no key. Reports that carry a signed decision record from an agent gate rank above anything we measure ourselves.`;
  const qa = [
    { q: `What is ${PRODUCT}?`, a: what },
    { q: "How many MCP servers actually work?", a: found },
    { q: "Can my agent use it?", a: agents },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: ORG, url: SITE_URL },
      {
        "@type": "WebSite",
        name: BRAND,
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#org` },
        potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
      { "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) },
    ],
  };
  return (
    <>
      <Sky />
      <div className="vignette" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Search tagline={`${n(f?.servers)} MCP servers. We checked ${n(p?.probed)} remote endpoints: ${n(p?.answered)} complete the handshake, ${n(p?.notAnswering)} fail it.`} />
      <section className="tool about">
        {qa.map((x) => (
          <div key={x.q}>
            <h2>{x.q}</h2>
            <p>{x.a}</p>
          </div>
        ))}
        <p className="muted">
          An answered handshake means a server is up, not that it is safe. <Link href="/method">How we check</Link> ·{" "}
          <Link href="/data">Download the data</Link> · <Link href="/agents">Connect your agent</Link>
        </p>
        <h2>Browse by topic</h2>
        <ul className="topics">
          {TOPICS.map((t) => (
            <li key={t.slug}>
              <Link href={`/topics/${t.slug}`}>{t.label}</Link>
            </li>
          ))}
        </ul>
      </section>
      <Footer />
    </>
  );
}
