import type { Metadata } from "next";

import { montserrat, plexThai } from "@/app/fonts";
import "../../../globals.css";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export function generateStaticParams() {
  return [{ lang: "th" }, { lang: "en" }];
}

/** Bare root layout for printable spec sheets: no site chrome, correct language. */
export default async function SheetLayout({ children, params }: LayoutProps<"/sheet/[lang]">) {
  const { lang } = await params;
  return (
    <html lang={lang === "en" ? "en" : "th"} className={`${plexThai.variable} ${montserrat.variable} antialiased`}>
      <head>
        <style>{"@page { size: A4; margin: 0; }"}</style>
      </head>
      <body className="bg-panel font-sans">{children}</body>
    </html>
  );
}
