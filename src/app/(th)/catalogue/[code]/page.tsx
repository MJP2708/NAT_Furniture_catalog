import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findMain, OFFICE_TAXONOMY } from "@/lib/office-catalogue";
import { OfficeCategoryView } from "@/views/office-catalogue";

export function generateStaticParams() {
  return OFFICE_TAXONOMY.map((m) => ({ code: m.code.toLowerCase() }));
}

export async function generateMetadata({ params }: PageProps<"/catalogue/[code]">): Promise<Metadata> {
  const { code } = await params;
  const m = findMain(code);
  return { title: m ? `${m.code} ${m.th}` : "Catalogue" };
}

export default async function OfficeCategoryPage({ params }: PageProps<"/catalogue/[code]">) {
  const { code } = await params;
  const m = findMain(code);
  if (!m) notFound();
  return <OfficeCategoryView main={m} lang="th" />;
}
