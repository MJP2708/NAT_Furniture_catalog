import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/product-grid";
import { getAllSlugs, getCategory } from "@/lib/catalog";
import { SPACE_COPY } from "@/lib/copy";

export async function generateStaticParams() {
  return (await getAllSlugs()).categories.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const data = await getCategory((await params).slug);
  return { title: data ? `${data.category.nameTh} · ${data.category.nameEn}` : "ไม่พบหมวดหมู่" };
}

export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const data = await getCategory((await params).slug);
  if (!data) notFound();
  const { category, root, products } = data;
  const isSpace = category.id === root.id;
  // A whole space is laid out like the catalogue's line pages: one titled block per subcategory.
  const groups = isSpace
    ? root.children.map((c) => ({ cat: c, items: products.filter((p) => p.categoryId === c.id) })).filter((g) => g.items.length)
    : [{ cat: category, items: products }];

  return (
    <main>
      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-10 sm:px-6">
          <nav className="eyebrow font-normal text-muted">
            <Link href="/" className="hover:text-accent">
              Home
            </Link>
            {!isSpace && (
              <>
                {" / "}
                <Link href={`/c/${root.slug}`} className="hover:text-accent">
                  {root.nameEn}
                </Link>
              </>
            )}
          </nav>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <h1 className="display text-5xl sm:text-6xl">{category.nameEn}</h1>
              <div className="mt-1 text-2xl font-light">{category.nameTh}</div>
            </div>
            <div className="text-sm lg:text-right">
              {isSpace && SPACE_COPY[root.slug] && <p className="lg:ml-auto lg:max-w-md">{SPACE_COPY[root.slug].th}</p>}
              <p className="font-num mt-2 text-muted tabular-nums">{products.length} items</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link
              href={`/c/${root.slug}`}
              className={`rounded-full border px-3 py-1 text-sm ${isSpace ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`}
            >
              ทั้งหมด
            </Link>
            {root.children.map((c) => (
              <Link
                key={c.slug}
                href={`/c/${c.slug}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  c.slug === category.slug ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"
                }`}
              >
                {c.nameTh} <span className="font-num opacity-60">{c.products}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6">
        {groups.map(({ cat, items }) => (
          <section key={cat.slug}>
            {isSpace && (
              <h2 className="mb-6 flex items-baseline gap-3">
                <Link href={`/c/${cat.slug}`} className="eyebrow text-sm hover:text-accent">
                  {cat.nameEn}
                </Link>
                <span className="text-muted">{cat.nameTh}</span>
              </h2>
            )}
            <ProductGrid products={items} />
          </section>
        ))}
      </div>
    </main>
  );
}
