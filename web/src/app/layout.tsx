import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "commons",
  description: "Find tools agents use, ranked by signed reports instead of votes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
