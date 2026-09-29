import type { Metadata } from "next";

import { getAllSlugs } from "@/lib/catalog";
import { CategoryView, categoryTitle } from "@/views/category";

export async function generateStaticParams() {
  return (await getAllSlugs()).categories.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/en/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: await categoryTitle(slug, "en"), alternates: { languages: { th: `/c/${slug}` } } };
}

export default async function CategoryPage({ params }: PageProps<"/en/c/[slug]">) {
  return <CategoryView slug={(await params).slug} lang="en" />;
}
