import type { Metadata } from "next";

import { getAllSlugs } from "@/lib/catalog";
import { ProductView, productMetadata } from "@/views/product";

export async function generateStaticParams() {
  return (await getAllSlugs()).products.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/en/p/[slug]">): Promise<Metadata> {
  return productMetadata((await params).slug, "en");
}

export default async function ProductPage({ params }: PageProps<"/en/p/[slug]">) {
  return <ProductView slug={(await params).slug} lang="en" />;
}
