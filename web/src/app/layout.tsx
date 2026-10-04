import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { BRAND, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND}: search MCP servers by what actually works`, template: `%s` },
  description: "Search every server in the official MCP registry. Remote servers are checked: do they answer the MCP handshake, which tools do they list, is the repository alive. Open data.",
  applicationName: BRAND,
  alternates: { types: { "text/plain": "/llms.txt" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
