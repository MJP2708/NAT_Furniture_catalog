import Form from "next/form";

import { href, type Lang, t } from "@/lib/i18n";

/** Plain GET form to /search, so it works before any JavaScript loads. */
export function SearchBox({ lang, className = "", defaultValue = "" }: { lang: Lang; className?: string; defaultValue?: string }) {
  const ui = t(lang);
  return (
    <Form action={href(lang, "/search")} className={`flex items-center border-b border-ink/70 ${className}`} role="search">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={ui.searchPlaceholder}
        aria-label={ui.searchLabel}
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted sm:text-sm"
      />
      <a
        href={href(lang, "/visual-search")}
        className="flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:text-accent"
        aria-label={lang === "en" ? "Search by photo" : "ค้นหาด้วยรูปภาพ"}
        title={lang === "en" ? "Search by photo" : "ค้นหาด้วยรูปภาพ"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </a>
      <button type="submit" className="eyebrow flex h-10 shrink-0 items-center px-1 hover:text-accent">
        Search
      </button>
    </Form>
  );
}
