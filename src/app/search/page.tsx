import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductGrid } from "@/components/product-grid";
import { SearchBox } from "@/components/search-box";
import { searchProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "ค้นหา" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-muted">กำลังค้นหา…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const results = q ? await searchProducts(q) : [];
  return (
    <>
      <div className="text-muted"><span className="eyebrow">Search</span> <span className="ml-1 text-sm">ค้นหา</span></div>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{q ? `“${q}”` : "ค้นหาสินค้า"}</h1>
      <p className="font-num mt-2 text-sm text-muted tabular-nums">
        {q ? `${results.length} items` : "พิมพ์รหัสสินค้าหรือประเภท เช่น FG 1, โซฟา"}
      </p>
      <SearchBox defaultValue={q} className="mt-6 max-w-xl" />
      {q && (
        <div className="mt-12">
          <ProductGrid products={results} />
        </div>
      )}
    </>
  );
}
