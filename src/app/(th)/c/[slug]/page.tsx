import type { Metadata } from "next";

import { getAllSlugs } from "@/lib/catalog";
import { CategoryView, categoryTitle } from "@/views/category";

export async function generateStaticParams() {
  return (await getAllSlugs()).categories.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: await categoryTitle(slug, "th"), alternates: { languages: { en: `/en/c/${slug}` } } };
}

export default async function CategoryPage({ params }: PageProps<"/c/[slug]">) {
  return <CategoryView slug={(await params).slug} lang="th" />;
}
