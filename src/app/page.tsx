import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import { getCategoryTree } from "@/lib/catalog";

export default async function Home() {
  const tree = await getCategoryTree();
  const total = tree.reduce((n, r) => n + r.total, 0);
  return (
    <main className="mx-auto max-w-6xl px-4">
      <section className="py-12 sm:py-16">
        <h1 className="text-4xl sm:text-6xl">เฟอร์นิเจอร์สำหรับสำนักงานและบ้าน</h1>
        <p className="mt-2 text-muted">
          {total.toLocaleString("en-US")} รายการ พร้อมแบบร่างและสเปกครบทุกชิ้น
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

    </main>
  );
}
