import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoTestCase Generator",
  description:
    "Generate manual QA test cases from any website URL using Playwright + DeepSeek.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
                AT
              </span>
              <span className="text-lg font-semibold tracking-tight">
                AutoTestCase Generator
              </span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-slate-900">Generate</Link>
              <Link href="/history" className="hover:text-slate-900">History</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto mt-12 max-w-6xl px-6 py-6 text-xs text-slate-500">
          Built with Next.js, Playwright, DeepSeek, and Supabase.
        </footer>
      </body>
    </html>
  );
}
