import type { Metadata } from "next";

import { montserrat, plexThai } from "@/app/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · NAT Admin" },
  robots: { index: false, follow: false },
};

/** Separate root layout: the back office has its own chrome, not the public site's. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plexThai.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full bg-panel/40 font-sans">{children}</body>
    </html>
  );
}
