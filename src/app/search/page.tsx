import type { Metadata } from "next";
import { Suspense } from "react";

import { ProductGrid } from "@/components/product-grid";
import { SearchBox } from "@/components/search-box";
import { searchProducts } from "@/lib/catalog";

export const metadata: Metadata = { title: "ค้นหา" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
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
      <SearchBox defaultValue={q} className="max-w-xl" />
      <h1 className="mt-6 text-xl font-semibold">
        {q ? (
          <>
            ผลการค้นหา “{q}” <span className="text-base font-normal text-muted">{results.length} รายการ</span>
          </>
        ) : (
          "พิมพ์รหัสสินค้าหรือประเภทเพื่อค้นหา"
        )}
      </h1>
      {q && (
        <div className="mt-4">
          <ProductGrid products={results} />
        </div>
      )}
    </>
  );
}
