// The registry report: the measurements as findings. Each finding is one number with its source;
// all of them are read from data/facts.json, so the page cannot drift from the data it describes.

import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { getFacts } from "@/lib/store";
import { BRAND, ORG, SITE_URL, SNAPSHOT, day, n, pct } from "@/lib/site";

const month = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "");

export async function generateMetadata(): Promise<Metadata> {
  const f = await getFacts();
  return {
    title: `State of the MCP registry, ${month(f?.probeUpdatedAt)} | ${BRAND}`,
    description: `We checked ${n(f?.probe.probed)} remote MCP servers from the official registry. ${n(f?.probe.answered)} completed the handshake; ${n(f?.probe.notAnswering)} did not complete it. Method and data are open.`,
    alternates: { canonical: `${SITE_URL}/report` },
  };
}

export default async function Report() {
  const f = await getFacts();
  if (!f) return null;
  const p = f.probe;
  const mass = f.massPublishers ?? [];
  const massTotal = mass.reduce((a, x) => a + x.n, 0);
  const protocols = f.protocols ?? {};
  const answeredTotal = Object.values(protocols).reduce((a, x) => a + x, 0);
  const newest = Object.keys(protocols).sort().at(-1);
  const tc = f.toolCounts;

  const findings: { h: string; body: React.ReactNode }[] = [
    ...(f.packages && f.packages.npm.checked > 0 && f.packages.pypi.checked > 0 ? [{
      h: `${n(f.packages.npm.missing)} of ${n(f.packages.npm.listed)} npm packages and ${n(f.packages.pypi.missing)} of ${n(f.packages.pypi.listed)} PyPI packages listed in the registry do not exist`,
      body: <>The package APIs returned 404. Metadata checked for {n(f.packages.npm.checked)} npm and {n(f.packages.pypi.checked)} PyPI packages;
        read {day(f.packages.fetchedAt)}. Unchecked names and network failures are unknown.{f.packages.sample != null && " This is a partial sample."}</>,
    }] : []),
    {
      h: `${pct(p.notAnswering, p.probed)} of remote servers fail the MCP handshake`,
      body: (
        <>
          Of {n(p.probed)} remote endpoints we checked on {day(f.probeUpdatedAt)}, {n(p.answered)} ({pct(p.answered, p.probed)}) completed the MCP handshake,{" "}
          {n(p.authRequired)} ({pct(p.authRequired, p.probed)}) asked for sign-in first, {n(p.paymentRequired)} asked for payment, and {n(p.notAnswering)}{" "}
          did not complete it: no response, an HTTP error, or a reply that is not valid MCP. Failures for a network reason were checked again.
        </>
      ),
    },
    {
      h: `${n(f.repos.missing)} linked repositories no longer resolve`,
      body: (
        <>
          {n(f.repos.missing)} of the {n(f.repos.distinct)} GitHub repositories linked from registry entries ({pct(f.repos.missing ?? 0, f.repos.distinct ?? 0)})
          return “not found”: deleted, renamed away or made private. Another {n(f.repos.archived)} are archived.
        </>
      ),
    },
    {
      h: `${mass.length} publishers account for ${pct(massTotal, f.servers)} of all entries`,
      body: (
        <>
          {mass.map((m, i) => (
            <span key={m.publisher}>
              <code>{m.publisher}</code> ({n(m.n)}){i < mass.length - 1 ? ", " : ""}
            </span>
          ))}
          . Together {n(massTotal)} of {n(f.servers)} entries. We keep their pages but do not ask search engines to index them one by one.
        </>
      ),
    },
    {
      h: `${n(f.flags.test_like)} entries read like tests`,
      body: <>Names such as <code>-test</code>, <code>-demo</code> or <code>-ok</code>. They are listed, flagged, and ranked lower.</>,
    },
    ...(newest
      ? [
          {
            h: `${pct(protocols[newest], answeredTotal)} of answering servers speak protocol ${newest}`,
            body: (
              <>
                Among the {n(answeredTotal)} servers that completed the handshake, the protocol revision they settled on:{" "}
                {Object.entries(protocols).map(([v, c], i, a) => (
                  <span key={v}>
                    {v} {n(c)}
                    {i < a.length - 1 ? " · " : ""}
                  </span>
                ))}
                .
              </>
            ),
          },
        ]
      : []),
    ...(tc
      ? [
          {
            h: `The median server lists ${tc.median} tools; ${n(tc.over50)} list more than 50`,
            body: (
              <>
                Across {n(tc.servers)} servers that returned a tool list: median {tc.median}, 90th percentile {tc.p90}, largest {n(tc.max)}. Every tool
                definition takes room in an agent&apos;s context.
              </>
            ),
          },
        ]
      : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: `State of the MCP registry, ${month(f.probeUpdatedAt)}`,
    datePublished: f.probeUpdatedAt,
    author: { "@type": "Organization", name: ORG, url: SITE_URL },
    isBasedOn: [f.registry, `${SITE_URL}/data`],
  };

  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool prose">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <h1>State of the MCP registry</h1>
        <p className="lede">
          {month(f.probeUpdatedAt)}. The official MCP registry lists {n(f.servers)} servers. We read every entry and checked the ones that run as remote endpoints.
          Here is what we found.
        </p>
        {findings.map((x) => (
          <section key={x.h}>
            <h2>{x.h}</h2>
            <p>{x.body}</p>
          </section>
        ))}
        <h2>What these numbers do not say</h2>
        <p>
          A server that answers the handshake is up; that does not make it safe or correct. Servers that run locally (npm, PyPI, Docker) cannot be checked
          from outside and are not in the percentages. A failed check is a snapshot: a server can be down for an hour.
        </p>
        <p>
          <Link href="/method">Method</Link> · <Link href="/data">Data (CSV, CC BY 4.0)</Link> · Cite:{" "}
          <a href={`https://doi.org/${SNAPSHOT.doi}`}>doi:{SNAPSHOT.doi}</a> · Registry read {day(f.catalogFetchedAt)}, GitHub read{" "}
          {day(f.githubFetchedAt)}, endpoints checked {day(f.probeUpdatedAt)}.
        </p>
      </main>
      <Footer />
    </>
  );
}
