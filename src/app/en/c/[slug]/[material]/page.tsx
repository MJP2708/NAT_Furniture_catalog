import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isMaterial } from "@/lib/material";
import { CategoryView, categoryMaterialParams, categoryTitle } from "@/views/category";

export async function generateStaticParams() {
  return categoryMaterialParams();
}

export async function generateMetadata({ params }: PageProps<"/en/c/[slug]/[material]">): Promise<Metadata> {
  const { slug, material } = await params;
  return { title: await categoryTitle(slug, "en", isMaterial(material) ? material : undefined) };
}

export default async function CategoryMaterialPage({ params }: PageProps<"/en/c/[slug]/[material]">) {
  const { slug, material } = await params;
  if (!isMaterial(material)) notFound();
  return <CategoryView slug={slug} lang="en" material={material} />;
}
