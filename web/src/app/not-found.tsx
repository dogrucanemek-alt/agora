import Link from "next/link";
import { Footer, Header } from "@/components/Chrome";

export default function NotFound() {
  return (
    <>
      <div className="stars" aria-hidden />
      <Header />
      <main className="tool prose">
        <h1>Not here</h1>
        <p className="lede">There is no page at this address. If you were looking for a server, it may have left the registry.</p>
        <p>
          <Link href="/">Search all MCP servers</Link> · <Link href="/topics">Browse by topic</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
