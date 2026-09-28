import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import { getBrands, getCategoryTree } from "@/lib/catalog";

export default async function Home() {
  const [tree, brandList] = await Promise.all([getCategoryTree(), getBrands()]);
  const total = tree.reduce((n, r) => n + r.total, 0);
  return (
    <main className="mx-auto max-w-6xl px-4">
      <section className="py-12 sm:py-16">
        <h1 className="text-3xl font-semibold sm:text-4xl">เฟอร์นิเจอร์สำหรับสำนักงานและบ้าน</h1>
        <p className="mt-2 text-muted">
          {total.toLocaleString("en-US")} รายการ จาก {brandList.length} แบรนด์ พร้อมขนาดและสเปกครบทุกชิ้น
        </p>
        <SearchBox className="mt-6 max-w-xl" />
      </section>

      <div className="space-y-10">
        {tree
          .filter((r) => r.total > 0)
          .map((root) => (
            <section key={root.slug}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-xl font-semibold">
                  {root.nameTh} <span className="text-base font-normal text-muted">{root.nameEn}</span>
                </h2>
                <Link href={`/c/${root.slug}`} className="text-sm text-accent hover:underline">
                  ดูทั้งหมด {root.total} →
                </Link>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {root.children.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/c/${c.slug}`}
                      className="flex h-full flex-col justify-between rounded-lg border border-line bg-surface p-4 transition hover:border-accent"
                    >
                      <span className="font-medium">{c.nameTh}</span>
                      <span className="mt-1 text-sm text-muted">
                        {c.nameEn} · {c.products}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>

      <section className="mt-14">
        <h2 className="mb-3 text-xl font-semibold">แบรนด์</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {brandList.map((b) => (
            <li key={b.slug}>
              <Link
                href={`/brands/${b.slug}`}
                className="flex h-24 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-surface p-3 transition hover:border-accent"
              >
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small static logo
                  <img src={b.logoUrl} alt={b.name} className="max-h-10 max-w-full object-contain" />
                ) : (
                  <span className="font-semibold tracking-wide">{b.name}</span>
                )}
                <span className="text-xs text-muted">{b.products} รายการ</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
