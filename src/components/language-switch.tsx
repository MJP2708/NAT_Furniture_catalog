"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** TH | EN toggle that keeps the visitor on the same page. */
export function LanguageSwitch() {
  const path = usePathname() ?? "/";
  const isEn = path === "/en" || path.startsWith("/en/");
  const thPath = isEn ? path.slice(3) || "/" : path;
  const enPath = isEn ? path : path === "/" ? "/en" : `/en${path}`;
  const item = (active: boolean) => (active ? "font-semibold text-ink" : "text-muted hover:text-accent");
  // Plain links: each language has its own root layout, so switching is a full page load anyway.
  return (
    <div className="eyebrow flex shrink-0 items-center gap-1.5" aria-label="Language">
      <a href={thPath} lang="th" className={item(!isEn)}>
        TH
      </a>
      <span className="text-line">|</span>
      <a href={enPath} lang="en" className={item(isEn)}>
        EN
      </a>
    </div>
  );
}

/** Shown until the current path is known: links to each language's home page. */
export function LanguageSwitchFallback({ lang }: { lang: "th" | "en" }) {
  return (
    <div className="eyebrow flex shrink-0 items-center gap-1.5" aria-label="Language">
      <Link href="/" lang="th" className={lang === "th" ? "font-semibold" : "text-muted"}>
        TH
      </Link>
      <span className="text-line">|</span>
      <Link href="/en" lang="en" className={lang === "en" ? "font-semibold" : "text-muted"}>
        EN
      </Link>
    </div>
  );
}
