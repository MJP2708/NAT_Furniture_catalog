import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MATERIAL_GROUPS, MATERIAL_KEYS, isMaterial } from "@/lib/material";
import { MaterialView } from "@/views/material";

export function generateStaticParams() {
  return MATERIAL_KEYS.map((material) => ({ material }));
}

export async function generateMetadata({ params }: PageProps<"/material/[material]">): Promise<Metadata> {
  const { material } = await params;
  return { title: isMaterial(material) ? MATERIAL_GROUPS[material].th : "Material" };
}

export default async function MaterialPage({ params }: PageProps<"/material/[material]">) {
  const { material } = await params;
  if (!isMaterial(material)) notFound();
  return <MaterialView material={material} lang="th" />;
}
