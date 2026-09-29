import type { Metadata } from "next";

import { getAllSlugs } from "@/lib/catalog";
import { ProductView, productMetadata } from "@/views/product";

export async function generateStaticParams() {
  return (await getAllSlugs()).products.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  return productMetadata((await params).slug, "th");
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  return <ProductView slug={(await params).slug} lang="th" />;
}
