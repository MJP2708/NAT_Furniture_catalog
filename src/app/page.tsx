import { getCategoryCounts } from "@/lib/catalog";

// Placeholder until the phase 2 designs are signed off: proves the app reads the catalog from Neon.
export default async function Home() {
  const cats = await getCategoryCounts();
  const total = cats.reduce((n, c) => n + c.products, 0);
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">NAT Furniture</h1>
      <p className="mt-1 text-zinc-600">{total} สินค้า / products</p>
      <ul className="mt-6 divide-y divide-zinc-200">
        {cats.map((c) => (
          <li key={c.slug} className="flex justify-between py-2">
            <span>
              {c.nameTh} <span className="text-zinc-500">· {c.nameEn}</span>
            </span>
            <span className="tabular-nums">{c.products}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
