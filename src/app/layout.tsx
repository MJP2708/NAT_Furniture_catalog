import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Montserrat } from "next/font/google";
import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import { E_CATALOGUE_URL } from "@/lib/copy";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
});

const montserrat = Montserrat({
  variable: "--font-latin",
  subsets: ["latin"],
  weight: ["300", "400", "600"],
});

const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteHost ? `https://${siteHost}` : "http://localhost:3000"),
  title: { default: "NAT Furniture", template: "%s · NAT Furniture" },
  description: "แคตตาล็อกเฟอร์นิเจอร์สำนักงานและที่อยู่อาศัย NAT Furniture",
};

const SPACES = [
  ["office", "สำนักงาน"],
  ["living", "ห้องนั่งเล่น"],
  ["dining", "ห้องอาหาร"],
  ["bedroom", "ห้องนอน"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href="/" className="display shrink-0 text-2xl tracking-[0.3em]" aria-label="NAT Furniture หน้าแรก">
              NAT
            </Link>
            <nav className="hidden items-center gap-5 text-sm lg:flex">
              {SPACES.map(([slug, th]) => (
                <Link key={slug} href={`/c/${slug}`} className="hover:text-accent">
                  {th}
                </Link>
              ))}
              <a href={E_CATALOGUE_URL} className="eyebrow text-accent hover:underline">
                E-Catalogue
              </a>
            </nav>
            <SearchBox className="ml-auto w-full max-w-sm" />
          </div>
          {/* Compact space links for small screens */}
          <nav className="flex gap-4 overflow-x-auto border-t border-line px-4 py-2 pr-8 text-sm lg:hidden">
            {SPACES.map(([slug, th]) => (
              <Link key={slug} href={`/c/${slug}`} className="shrink-0 hover:text-accent">
                {th}
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
              <p className="mt-2 max-w-sm text-sm text-muted">
                เฟอร์นิเจอร์สำนักงานและที่อยู่อาศัย พร้อมแบบร่างและสเปกครบทุกชิ้น
                <br />
                Office and home furniture, with a drawing and full specification for every piece.
              </p>
            </div>
            <div>
              <div className="eyebrow text-muted">Spaces</div>
              <ul className="mt-3 space-y-1 text-sm">
                {SPACES.map(([slug, th]) => (
                  <li key={slug}>
                    <Link href={`/c/${slug}`} className="hover:text-accent">
                      {th}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="eyebrow text-muted">E-Catalogue</div>
              <p className="mt-3 text-sm">
                <a href={E_CATALOGUE_URL} className="text-accent hover:underline">
                  ดาวน์โหลดแคตตาล็อก (PDF)
                </a>
              </p>
              <p className="mt-3 text-xs text-muted">ขนาดสินค้าอาจคลาดเคลื่อนเล็กน้อยจากแผ่นสเปกของผู้ผลิต</p>
            </div>
          </div>
          <div className="border-t border-line">
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 text-xs text-muted sm:px-6">
              <span>© NAT Furniture</span>
              <span className="h-px flex-1 max-w-24 bg-line" />
              <span className="eyebrow font-normal">E-Catalogue</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
