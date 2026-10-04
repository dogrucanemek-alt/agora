import type { Metadata } from "next";
import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";
import { BRAND, SITE_URL } from "@/lib/site";
import { TOPICS } from "@/lib/topics";

export const metadata: Metadata = {
  title: `MCP servers by topic | ${BRAND}`,
  description: "MCP servers grouped by what they connect to, each group with measured counts: how many answer, how many need sign-in, how many are down.",
  alternates: { canonical: `${SITE_URL}/topics` },
};

export default function Topics() {
  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool">
        <h1>MCP servers by topic</h1>
        <ul className="topics">
          {TOPICS.map((t) => (
            <li key={t.slug}>
              <Link href={`/topics/${t.slug}`}>{t.label}</Link>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </>
  );
}
