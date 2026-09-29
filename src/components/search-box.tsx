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
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted"
      />
      <button type="submit" className="eyebrow px-1 py-2 hover:text-accent">
        Search
      </button>
    </Form>
  );
}
