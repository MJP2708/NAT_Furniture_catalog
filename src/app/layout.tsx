import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import "./globals.css";

const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
});

const siteHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteHost ? `https://${siteHost}` : "http://localhost:3000"),
  title: { default: "NAT Furniture", template: "%s · NAT Furniture" },
  description: "แคตตาล็อกเฟอร์นิเจอร์สำนักงานและที่อยู่อาศัย NAT Furniture",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plexThai.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Link href="/" className="shrink-0 text-lg font-semibold tracking-wide">
              NAT <span className="font-normal text-muted">Furniture</span>
            </Link>
            <SearchBox className="ml-auto w-full max-w-md" />
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted">
            © NAT Furniture · ข้อมูลจากแผ่นสเปกของผู้ผลิต ขนาดอาจคลาดเคลื่อนเล็กน้อย
          </div>
        </footer>
      </body>
    </html>
  );
}
