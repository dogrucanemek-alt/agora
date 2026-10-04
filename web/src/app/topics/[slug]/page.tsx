// Topic page: one category question, answered in one paragraph built from measured counts, then the
// list ranked by those measurements. The FAQPage markup carries exactly the visible question and answer.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer, Header } from "@/components/Chrome";
import { getFacts, search, topicStats } from "@/lib/store";
import { BRAND, SITE_URL, day, liveLabel, n } from "@/lib/site";
import { TOPICS, topicBySlug } from "@/lib/topics";
import { toolPath } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return TOPICS.map((t) => ({ slug: t.slug }));
}

async function answerFor(slug: string) {
  const t = topicBySlug(slug);
  if (!t) return null;
  const [st, facts] = await Promise.all([topicStats(t.query), getFacts()]);
  const when = day(facts?.probeUpdatedAt);
  const answer =
    `Of ${n(st.matched)} servers in the official MCP registry that mention ${t.label}, we checked ${n(st.checked)} remote endpoints on ${when}: ` +
    `${n(st.answers)} answered the MCP handshake, ${n(st.gated)} answered but asked for sign-in or payment first, and ${n(st.down)} did not answer. ` +
    `${n(st.local)} run on your own machine and cannot be checked from outside.`;
  const limit =
    "What this does not tell you: whether a server is safe, or whether its tools do what they say. An answer to the handshake proves the endpoint is up, nothing more.";
  return { t, st, answer, limit, when };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await answerFor((await params).slug);
  if (!a) return { robots: { index: false } };
  return {
    title: `${a.t.label} MCP servers that answer, checked ${a.when} | ${BRAND}`,
    description: a.answer.slice(0, 300),
    alternates: { canonical: `${SITE_URL}/topics/${a.t.slug}` },
  };
}

export default async function TopicPage({ params }: Props) {
  const a = await answerFor((await params).slug);
  if (!a) notFound();
  const list = await search(a.t.query, 30);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: a.t.question, acceptedAnswer: { "@type": "Answer", text: `${a.answer} ${a.limit}` } }] },
      {
        "@type": "ItemList",
        name: `${a.t.label} MCP servers`,
        itemListElement: list.results.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: SITE_URL + toolPath(s.name), name: s.title || s.name })),
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
          <Link href="/">Agora</Link> / <Link href="/topics">topics</Link>
        </nav>
        <h1>{a.t.label} MCP servers</h1>
        <h2>{a.t.question}</h2>
        <p className="lede">{a.answer}</p>
        <p className="muted">{a.limit}</p>
        <p className="muted">
          Ranked by our checks and repository activity, not by votes. <Link href="/method">How we check</Link>.
        </p>
        <ol className="out topiclist">
          {list.results.map((s) => (
            <li className="r" key={s.name}>
              <h3>
                <Link href={toolPath(s.name)}>{s.title || s.name.split("/").pop()}</Link>
              </h3>
              <div className="n">{s.name}</div>
              <p>{s.description}</p>
              {s.live ? <span className={`b ${liveLabel(s.live).tone === "ok" ? "proof ok" : liveLabel(s.live).tone === "bad" ? "dep" : ""}`}>{liveLabel(s.live).text}</span> : <span className="b">runs locally</span>}
              {s.gh && !("missing" in s.gh) && s.gh.stars > 0 && <span className="b">★ {n(s.gh.stars)}</span>}
            </li>
          ))}
        </ol>
        <p className="muted">
          Showing the top {list.results.length} of {n(list.total)}. <Link href={`/?q=${encodeURIComponent(a.t.query)}`}>Search all</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
