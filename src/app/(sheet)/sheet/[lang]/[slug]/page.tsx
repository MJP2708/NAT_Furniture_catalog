import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PrintButton } from "@/components/print-button";
import { SpecSheet } from "@/components/spec-sheet/spec-sheet";
import { getAllSlugs, getProduct } from "@/lib/catalog";
import type { Lang } from "@/lib/i18n";

export async function generateStaticParams() {
  return (await getAllSlugs()).products.slice(0, 4).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/sheet/[lang]/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduct(slug);
  return { title: data ? `${data.product.code} · Specification sheet · NAT Furniture` : "NAT Furniture" };
}

export default async function SheetPage({ params, searchParams }: PageProps<"/sheet/[lang]/[slug]">) {
  const { lang: raw, slug } = await params;
  if (raw !== "th" && raw !== "en") notFound();
  const lang = raw as Lang;
  const data = await getProduct(slug);
  if (!data) notFound();
  const back = `${lang === "en" ? "/en" : ""}/p/${slug}`;
  return (
    <main className="sheet-page flex min-h-screen flex-col items-center gap-4 px-4 py-6">
      {/* Toolbar (screen only) */}
      <div className="no-print flex w-[210mm] max-w-full flex-wrap items-center gap-3 text-sm">
        <Link href={back} className="text-muted hover:text-accent">
          ← {lang === "en" ? "Back to product" : "กลับไปหน้าสินค้า"}
        </Link>
        <span className="ml-auto text-xs text-muted">
          {lang === "en" ? "Choose “Save as PDF” in the print dialog" : "เลือก “บันทึกเป็น PDF” ในหน้าต่างพิมพ์"}
        </span>
        <Link href={`/sheet/${lang === "en" ? "th" : "en"}/${slug}`} className="text-muted hover:text-accent">
          {lang === "en" ? "ภาษาไทย" : "English"}
        </Link>
        <PrintButton label={lang === "en" ? "Print / Save PDF" : "พิมพ์ / บันทึก PDF"} />
      </div>
      <Suspense>
        <Sheet data={data} lang={lang} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Sheet({
  data,
  lang,
  searchParams,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getProduct>>>;
  lang: Lang;
  searchParams: PageProps<"/sheet/[lang]/[slug]">["searchParams"];
}) {
  const autoPrint = (await searchParams).print === "1";
  return <SpecSheet data={data} lang={lang} autoPrint={autoPrint} />;
}
