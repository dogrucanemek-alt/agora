import Link from "next/link";
import { BRAND, ORG, PRODUCT } from "@/lib/site";

export function Header() {
  return (
    <header className="hdr">
      <Link href="/" className="logo" aria-label={BRAND}>
        {PRODUCT}
      </Link>
      <form action="/" method="get" role="search">
        <input name="q" type="search" placeholder="Search MCP servers" aria-label="Search MCP servers" />
      </form>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <span>
        {BRAND}. Open data on the tools AI agents use.
      </span>
      <nav>
        <Link href="/method">How we check</Link>
        <Link href="/data">Data</Link>
        <Link href="/agents">For agents</Link>
        <a href="/llms.txt">llms.txt</a>
      </nav>
      <span className="muted">{ORG}.com</span>
    </footer>
  );
}
