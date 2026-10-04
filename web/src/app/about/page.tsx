import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { BRAND, CONTACT, REPO, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: `About and privacy | ${BRAND}`,
  description: "Who runs Agora, how to reach us, and what we record about visitors: no accounts, no cookies, aggregate page views only.",
  alternates: { canonical: `${SITE_URL}/about` },
};

export default function About() {
  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool prose">
        <h1>About</h1>
        <p className="lede">
          Agora is a search engine for the tools AI agents use, built so that people and agents can find what works. openforallofus is the
          project behind it. It was founded by the team behind <a href="https://verax-ai.com">Verax</a>, and is operated by VERAX Teknoloji Limited Şirketi.
        </p>
        <p>
          The ranking does not favour any product. Signed reports are accepted from any gate that produces the open Cedulon record format, not only
          from Verax. The code is open source under Apache-2.0: <a href={REPO}>{REPO.replace("https://", "")}</a>.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. If you run a server listed here and want something corrected, or want our check to stop
          calling your endpoint, see <Link href="/method#opt-out">how we check</Link>.
        </p>

        <h2>Privacy</h2>
        <ul>
          <li>There are no accounts and no cookies.</li>
          <li>We count page views with Vercel Web Analytics, which records aggregate visits without cookies or cross-site tracking.</li>
          <li>Searches are answered on the server and are not stored with any identifier.</li>
          <li>Our hosting provider keeps standard request logs for operating the service.</li>
        </ul>
      </main>
      <Footer />
    </>
  );
}
