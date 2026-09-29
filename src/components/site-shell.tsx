import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { montserrat, plexThai } from "@/app/fonts";
import { LanguageSwitch, LanguageSwitchFallback } from "@/components/language-switch";
import { SearchBox } from "@/components/search-box";
import { E_CATALOGUE_URL } from "@/lib/copy";
import { href, type Lang, t } from "@/lib/i18n";

const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export function siteMetadata(lang: Lang): Metadata {
  return {
    metadataBase: new URL(siteHost ? `https://${siteHost}` : "http://localhost:3000"),
    title: { default: "NAT Furniture", template: "%s · NAT Furniture" },
    description: t(lang).siteDescription,
  };
}

const SPACES = [
  ["office", "สำนักงาน", "Office"],
  ["living", "ห้องนั่งเล่น", "Living"],
  ["dining", "ห้องอาหาร", "Dining"],
  ["bedroom", "ห้องนอน", "Bedroom"],
] as const;

/** <html> for one language: header with space links, search and TH|EN switch; catalogue-style footer. */
export function SiteShell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const ui = t(lang);
  const spaceName = (th: string, en: string) => (lang === "en" ? en : th);
  return (
    <html lang={lang} className={`${plexThai.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href={href(lang, "/")} className="display shrink-0 text-2xl tracking-[0.3em]" aria-label="NAT Furniture">
              NAT
            </Link>
            <nav className="hidden items-center gap-5 text-sm lg:flex">
              {SPACES.map(([slug, th, en]) => (
                <Link key={slug} href={href(lang, `/c/${slug}`)} className="hover:text-accent">
                  {spaceName(th, en)}
                </Link>
              ))}
              <a href={E_CATALOGUE_URL} className="eyebrow text-accent hover:underline">
                E-Catalogue
              </a>
            </nav>
            <SearchBox lang={lang} className="ml-auto w-full max-w-sm" />
            <Suspense fallback={<LanguageSwitchFallback lang={lang} />}>
              <LanguageSwitch />
            </Suspense>
          </div>
          {/* Compact space links for small screens */}
          <nav className="flex gap-4 overflow-x-auto border-t border-line px-4 py-2 pr-8 text-sm lg:hidden">
            {SPACES.map(([slug, th, en]) => (
              <Link key={slug} href={href(lang, `/c/${slug}`)} className="shrink-0 hover:text-accent">
                {spaceName(th, en)}
              </Link>
            ))}
            <a href={E_CATALOGUE_URL} className="eyebrow shrink-0 self-center text-accent">
              E-Catalogue
            </a>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="no-print mt-20 border-t border-line">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="display text-3xl tracking-[0.3em]">NAT</div>
              <p className="mt-2 max-w-sm text-sm text-muted">{ui.footerAbout}</p>
            </div>
            <div>
              <div className="eyebrow text-muted">Spaces</div>
              <ul className="mt-3 space-y-1 text-sm">
                {SPACES.map(([slug, th, en]) => (
                  <li key={slug}>
                    <Link href={href(lang, `/c/${slug}`)} className="hover:text-accent">
                      {spaceName(th, en)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="eyebrow text-muted">E-Catalogue</div>
              <p className="mt-3 text-sm">
                <a href={E_CATALOGUE_URL} className="text-accent hover:underline">
                  {ui.footerDownload}
                </a>
              </p>
              <p className="mt-3 text-xs text-muted">{ui.footerNote}</p>
            </div>
          </div>
          <div className="border-t border-line">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 text-xs text-muted sm:px-6">
              <span>© NAT Furniture</span>
              <span className="h-px max-w-24 flex-1 bg-line" />
              <span className="eyebrow font-normal">E-Catalogue</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
