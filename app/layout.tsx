import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import HelpWidget from "./components/help-widget";

export const metadata: Metadata = {
  title: "House Elo",
  description: "Head-to-head rankings for any game, any team size.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[var(--color-line)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5 sm:py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              House<span className="text-[var(--color-accent)]">Elo</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
              <Link href="/" className="hover:text-white">Games</Link>
              <Link href="/players" className="hover:text-white">Players</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
        <HelpWidget />
        <footer className="mx-auto max-w-5xl px-4 pb-24 text-xs sm:px-5 text-[var(--color-muted)]">
          Ratings use{" "}
          <a
            href="https://openskill.me"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-white"
          >
            OpenSkill
          </a>{" "}
          (Weng-Lin / Plackett-Luce). Shown rating is a conservative estimate, so
          it climbs as the system gains confidence.
        </footer>
      </body>
    </html>
  );
}
