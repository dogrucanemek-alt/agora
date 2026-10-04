"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/store";
import { liveLabel, toolPath } from "@/lib/site";

type Response = SearchResult & { ms: number };

export default function Search({ tagline }: { tagline?: string }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Response | null>(null);

  async function run(query: string) {
    const r = (await fetch("/api/search?q=" + encodeURIComponent(query)).then((x) => x.json())) as Response;
    setData(r);
    history.replaceState(null, "", "?q=" + encodeURIComponent(query));
  }

  useEffect(() => {
    const initial = new URLSearchParams(location.search).get("q");
    if (initial) {
      setQ(initial);
      void run(initial);
    }
  }, []);

  return (
    <main>
      <section className={data ? "home top" : "home"}>
        <h1>Agora</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) void run(q.trim());
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus placeholder="Search MCP servers: postgres, slack, browser, payments…" aria-label="Search MCP servers" />
        </form>
        {!data && tagline && <p className="tagline">{tagline}</p>}
        {data && (
          <div className="meta">
            {data.total.toLocaleString()} of {data.catalog.toLocaleString()} tools match · {data.ms} ms · {data.withProof} with signed reports
          </div>
        )}
      </section>
      <section className="out">
        {data?.results.map((s) => (
          <div className="r" key={s.name}>
            <h3>
              <Link href={toolPath(s.name)}>{s.title || s.name.split("/").pop()}</Link>
            </h3>
            <div className="n">
              {s.name}
              {s.version ? ` · v${s.version}` : ""}
            </div>
            <p>{s.description}</p>
            {s.repo && (
              <a className="b" href={`https://github.com/${s.repo}`} target="_blank" rel="noopener noreferrer">
                github
              </a>
            )}
            {s.remotes.length > 0 && <span className="b">remote</span>}
            {s.packages.map((p, i) => (
              <span className="b" key={i}>
                {p.registry}
              </span>
            ))}
            {s.status === "deprecated" && <span className="b dep">deprecated</span>}
            {s.live && liveLabel(s.live).tone === "ok" && <span className="b proof ok">answers</span>}
            {s.live && liveLabel(s.live).tone === "auth" && <span className="b">answers · gated</span>}
            {s.live && liveLabel(s.live).tone === "bad" && <span className="b dep">not answering</span>}
            {s.gh && !("missing" in s.gh) && s.gh.stars > 0 && <span className="b">★ {s.gh.stars.toLocaleString("en-US")}</span>}
            {s.proofs.count > 0 ? (
              <span className="b proof ok" title="Signed by the reporting operator's gate key. Shows the call went through that gate; the server link is the reporter's claim.">
                {s.proofs.count} signed report{s.proofs.count > 1 ? "s" : ""} · {s.proofs.works} works · {s.proofs.operators} operator{s.proofs.operators > 1 ? "s" : ""}
              </span>
            ) : (
              <span className="b proof">no signed reports</span>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
