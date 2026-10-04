import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { getFacts } from "@/lib/store";
import { BRAND, ORG, SITE_URL, day, n, pct } from "@/lib/site";

export const metadata: Metadata = {
  title: `MCP server measurements, open data (CSV) | ${BRAND}`,
  description: "Handshake results, tool counts and repository signals for every server in the official MCP registry. CSV, CC BY 4.0.",
  alternates: { canonical: `${SITE_URL}/data` },
};

export default async function Data() {
  const f = await getFacts();
  const p = f?.probe;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "MCP server measurements",
    description: `Handshake check, tool count and GitHub signals for each of the ${n(f?.servers)} servers in the official MCP registry, measured by ${BRAND}.`,
    url: `${SITE_URL}/data`,
    license: "https://creativecommons.org/licenses/by/4.0/",
    creator: { "@type": "Organization", name: ORG, url: SITE_URL },
    isBasedOn: f?.registry,
    dateModified: f?.probeUpdatedAt ?? undefined,
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}/data/servers.csv` }],
  };
  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool prose">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <h1>Data</h1>
        <p className="lede">
          What we measured about every server in the official MCP registry, in one file. Free to use with attribution (CC BY 4.0).
        </p>
        <p>
          <a className="b" href="/data/servers.csv">
            Download CSV
          </a>
        </p>

        <h2>The registry today</h2>
        <table className="facts">
          <tbody>
            <tr>
              <th scope="row">Servers in the registry</th>
              <td>{n(f?.servers)}</td>
              <td className="src">read {day(f?.catalogFetchedAt)}</td>
            </tr>
            <tr>
              <th scope="row">Remote endpoints checked</th>
              <td>{n(p?.probed)}</td>
              <td className="src">checked {day(f?.probeUpdatedAt)}</td>
            </tr>
            <tr>
              <th scope="row">Completed the MCP handshake</th>
              <td>
                {n(p?.answered)} ({pct(p?.answered ?? 0, p?.probed ?? 0)})
              </td>
              <td className="src">our check</td>
            </tr>
            <tr>
              <th scope="row">Asked for sign-in first</th>
              <td>
                {n(p?.authRequired)} ({pct(p?.authRequired ?? 0, p?.probed ?? 0)})
              </td>
              <td className="src">our check</td>
            </tr>
            <tr>
              <th scope="row">Asked for payment first</th>
              <td>{n(p?.paymentRequired)}</td>
              <td className="src">our check</td>
            </tr>
            <tr>
              <th scope="row">Did not complete the handshake</th>
              <td>
                {n(p?.notAnswering)} ({pct(p?.notAnswering ?? 0, p?.probed ?? 0)})
              </td>
              <td className="src">failures re-checked</td>
            </tr>
            <tr>
              <th scope="row">Linked repositories that no longer resolve</th>
              <td>
                {n(f?.repos.missing)} of {n(f?.repos.distinct)}
              </td>
              <td className="src">GitHub API, {day(f?.githubFetchedAt)}</td>
            </tr>
            <tr>
              <th scope="row">Entries that read like tests</th>
              <td>{n(f?.flags.test_like)}</td>
              <td className="src">name pattern</td>
            </tr>
          </tbody>
        </table>

        <h2>Columns</h2>
        <p>
          <code>name, endpoint, check_result, check_class, checked_at, protocol, tool_count, github_repo, github_stars, github_last_push, github_archived,
          registry_status, flags, indexed</code>
        </p>
        <p>
          Descriptions are not in the file: they belong to their publishers and appear with attribution on each server&apos;s page.{" "}
          <Link href="/method">How each column is measured</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
