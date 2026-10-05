import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { getFacts } from "@/lib/store";
import { BRAND, CONTACT, REPO, SITE_URL, day, n } from "@/lib/site";

export const metadata: Metadata = {
  title: `How we check MCP servers | ${BRAND}`,
  description: "What the Agora check does and does not do: one MCP handshake and a tool list per server, no tool calls, one connection per host, a named user agent.",
  alternates: { canonical: `${SITE_URL}/method` },
};

export default async function Method() {
  const f = await getFacts();
  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool prose">
        <h1>How we check</h1>
        <p className="lede">Every number on this site comes from one of six sources, and every page says which one and when it was read.</p>

        <h2>1. The official MCP registry</h2>
        <p>
          We read every entry from <a href={f?.registry ?? "https://registry.modelcontextprotocol.io"}>the official MCP registry</a> through its public API.
          Last read: {day(f?.catalogFetchedAt)}, {n(f?.servers)} servers. Names, descriptions, versions, endpoints and packages are shown as the publisher
          wrote them.
        </p>

        <h2>2. The handshake check</h2>
        <p>For each active server that lists a Streamable HTTP endpoint, we open an MCP connection and ask for its tool list. That is all:</p>
        <ul>
          <li>We never call a tool, read a resource or send any user data.</li>
          <li>We try the 2026 protocol first and fall back to the 2025 handshake, the same way a current client does.</li>
          <li>At most one open connection per host, so a host that serves many entries is not flooded.</li>
          <li>
            Requests carry the user agent <code>agora-probe/0.1 (+{SITE_URL}/probe)</code>.
          </li>
          <li>A server gets 12 seconds. Failures for a network reason are checked again before they are counted.</li>
        </ul>
        <p>
          Last check: {day(f?.probeUpdatedAt)}. Of {n(f?.probe.probed)} endpoints checked, {n(f?.probe.answered)} completed the handshake,{" "}
          {n(f?.probe.authRequired)} asked for sign-in, {n(f?.probe.paymentRequired)} asked for payment and {n(f?.probe.notAnswering)} did not complete the handshake (no response, an HTTP error, or a reply that is not valid MCP).{" "}
          {n(f?.probe.rateLimited)} rate-limited us and are counted as unknown.
        </p>
        <p>
          A server that answers the handshake is up. It is not thereby safe, correct or well behaved. Servers that run on your own machine (npm, PyPI,
          Docker packages) cannot be checked from outside and are marked so.
        </p>

        <h2>3. GitHub</h2>
        <p>
          For servers that link a GitHub repository we read stars, last push, licence and whether it is archived, through the GitHub API. Last read:{" "}
          {day(f?.githubFetchedAt)}. {n(f?.repos.missing)} of {n(f?.repos.distinct)} linked repositories did not resolve.
        </p>

        <h2>4. npm</h2>
        <p>
          For listed npm packages we read existence (200 or 404), the latest version and its deprecation flag from the
          <a href="https://registry.npmjs.org/"> npm registry</a>, using its abbreviated metadata. We show the latest version&apos;s
          publish time or modified time when supplied; the abbreviated response may omit both. The npm downloads API supplies
          last-week downloads. Downloads include bots and CI and do not affect ranking. Package existence does not prove a server runs or is safe.
        </p>
        <h2>5. PyPI</h2>
        <p>
          The <a href="https://pypi.org/">PyPI</a> JSON API supplies existence, latest version, the latest release&apos;s upload time
          and whether all its files are yanked. <a href="https://pypistats.org/">PyPI Stats</a> supplies last-week downloads when available.
          We throttle requests and back off on rate limits; missing download counts are unknown. Downloads include bots and CI.
          These signals do not prove safety, correctness or use by people, and do not affect ranking.
        </p>
        {f?.packages && <p>Packages read {day(f.packages.fetchedAt)}: {n(f.packages.npm.checked)} of {n(f.packages.npm.listed)} listed npm packages
          and {n(f.packages.pypi.checked)} of {n(f.packages.pypi.listed)} listed PyPI packages checked. Counts use distinct package names;
          PyPI spelling aliases are normalized.{f.packages.sample != null && " This is a partial sample."}</p>}

        <h2>6. Signed reports</h2>
        <p>
          Anyone who runs a gate that signs its decisions can report that a server works, is broken or is unsafe, and attach the signed record. We verify
          the signature against the reporter&apos;s public key with the open <a href="https://www.npmjs.com/package/@cedulon/core">@cedulon/core</a>{" "}
          verifier. A signed report shows a call went through that gate; today it does not prove which server answered, and the page says so.{" "}
          <Link href="/agents">How to file one</Link>.
        </p>

        <h2>What we hide from search engines</h2>
        <p>
          Every server has a page, but we ask search engines to index only pages where we add something: a successful check or a live repository. Entries
          that look like tests, sit behind temporary tunnels, copy one template many times, come from a namespace with more than 500 entries, or link a
          missing repository are kept out of the index. Today {n(f?.indexable)} of {n(f?.servers)} pages are indexable.
        </p>

        <h2 id="opt-out">If you run a server</h2>
        <p>
          To stop the check against your endpoint, or to correct anything on your page, write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> or open an issue on <a href={REPO}>GitHub</a>.
        </p>
      </main>
      <Footer />
    </>
  );
}
