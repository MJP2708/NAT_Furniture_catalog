import { Suspense } from "react";

import { ProductGrid } from "@/components/product-grid";
import { SearchBox } from "@/components/search-box";
import { searchProducts } from "@/lib/catalog";
import { type Lang, t } from "@/lib/i18n";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function SearchView({ lang, searchParams }: { lang: Lang; searchParams: SearchParams }) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-muted">{t(lang).searching}</p>}>
        <Results lang={lang} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ lang, searchParams }: { lang: Lang; searchParams: SearchParams }) {
  const ui = t(lang);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const results = q ? await searchProducts(q) : [];
  return (
    <>
      <div className="text-muted">
        <span className="eyebrow">Search</span>
        {lang === "th" && <span className="ml-2 text-sm">ค้นหา</span>}
      </div>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{q ? `“${q}”` : ui.searchTitle}</h1>
      <p className="font-num mt-2 text-sm text-muted tabular-nums">{q ? ui.items(results.length) : ui.searchHint}</p>
      <SearchBox lang={lang} defaultValue={q} className="mt-6 max-w-xl" />
      {q && (
        <div className="mt-12">
          <ProductGrid products={results} lang={lang} />
        </div>
      )}
    </>
  );
}
