import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/product-grid";
import { getAllSlugs, getCategory } from "@/lib/catalog";

export async function generateStaticParams() {
  return (await getAllSlugs()).categories.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const data = await getCategory((await params).slug);
  return { title: data ? data.category.nameTh : "ไม่พบหมวดหมู่" };
}

export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  const data = await getCategory((await params).slug);
  if (!data) notFound();
  const { category, root, products } = data;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          หน้าแรก
        </Link>
        {category.id !== root.id && (
          <>
            {" / "}
            <Link href={`/c/${root.slug}`} className="hover:text-accent">
              {root.nameTh}
            </Link>
          </>
        )}
      </nav>
      <h1 className="mt-2 text-2xl font-semibold">
        {category.nameTh} <span className="text-lg font-normal text-muted">{category.nameEn}</span>
      </h1>
      <p className="text-sm text-muted">{products.length} รายการ</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {root.children.map((c) => (
          <Link
            key={c.slug}
            href={`/c/${c.slug}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              c.slug === category.slug ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface hover:border-accent"
            }`}
          >
            {c.nameTh} <span className="opacity-70">{c.products}</span>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </main>
  );
}
