import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/product-grid";
import { getAllSlugs, getBrand } from "@/lib/catalog";

export async function generateStaticParams() {
  return (await getAllSlugs()).brands.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const data = await getBrand((await params).slug);
  return { title: data ? data.brand.name : "ไม่พบแบรนด์" };
}

export default async function BrandPage({ params }: PageProps<"/brands/[slug]">) {
  const data = await getBrand((await params).slug);
  if (!data) notFound();
  const { brand, products } = data;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          หน้าแรก
        </Link>
        {" / แบรนด์"}
      </nav>
      <div className="mt-3 flex items-center gap-4">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- small static logo
          <img src={brand.logoUrl} alt="" className="h-12 rounded bg-surface object-contain p-1" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{brand.name}</h1>
          <p className="text-sm text-muted">{products.length} รายการ</p>
        </div>
      </div>
      <div className="mt-6">
        <ProductGrid products={products} />
      </div>
    </main>
  );
}
