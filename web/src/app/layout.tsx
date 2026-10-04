import type { Metadata } from "next";
import { BRAND, SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND}: search MCP servers by what actually works`, template: `%s` },
  description: "Search every server in the official MCP registry. Each one is checked: does it answer, what tools does it list, is its repository alive. Open data.",
  applicationName: BRAND,
  alternates: { types: { "text/plain": "/llms.txt" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
