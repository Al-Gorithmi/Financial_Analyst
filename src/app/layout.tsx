import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { listAnalyses } from "@/lib/analysis-storage";
import { loadRecurring } from "@/lib/recurring";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finance Analyzer",
  description: "Local CIBC statement analyzer",
};

const NAV = [
  { href: "/upload",      label: "Upload" },
  { href: "/analyses",    label: "Analyses" },
  { href: "/recurring",   label: "Recurring" },
  { href: "/statements",  label: "Statements" },
  { href: "/settings",    label: "Settings" },
  { href: "/metrics",     label: "Metrics" },
] as const;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let analysisCount = 0;
  let recurringCount = 0;
  try {
    analysisCount = (await listAnalyses()).length;
    recurringCount = (await loadRecurring()).filter(r => !r.dismissed).length;
  } catch { /* ignore on first run */ }

  const badges: Record<string, number> = {
    "/analyses":  analysisCount,
    "/recurring": recurringCount,
  };

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}>
        <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-8">
          <div className="flex h-12 items-center gap-6">
            <Link href="/" className="text-sm font-semibold text-zinc-100 hover:text-white transition-colors">
              Finance
            </Link>
            <nav className="flex items-center gap-0.5">
              {NAV.map(({ href, label }) => {
                const badge = badges[href];
                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    {label}
                    {badge ? (
                      <span className="rounded-full bg-zinc-700 px-1.5 py-px text-[10px] font-semibold tabular-nums text-zinc-300 leading-none">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
