import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "House Elo",
  description: "Head-to-head rankings for any game, any team size.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[var(--color-line)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
            <Link href="/" className="text-lg font-bold tracking-tight">
              House<span className="text-[var(--color-accent)]">Elo</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-[var(--color-muted)]">
              <Link href="/" className="hover:text-white">Games</Link>
              <Link href="/players" className="hover:text-white">Players</Link>
              <Link href="/games/new" className="hover:text-white">New game</Link>
              <Link href="/tickets" className="hover:text-white">Tickets</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-5 pb-10 text-xs text-[var(--color-muted)]">
          Ratings use OpenSkill (Weng-Lin / Plackett-Luce). Shown rating is a
          conservative estimate, so it climbs as the system gains confidence.
        </footer>
      </body>
    </html>
  );
}
