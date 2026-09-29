import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { brands, categories, productImages, products } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-session";

import { ProductEditor } from "./product-editor";

export default function EditProductPage({ params }: PageProps<"/admin/p/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/p/[slug]">, "params">) {
  await requireAdmin();
  const { slug } = await params;
  const [row] = await db
    .select({ product: products, brand: brands.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.slug, slug));
  if (!row) notFound();
  const [cats, image] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sort)),
    db
      .select({ url: productImages.thumbUrl })
      .from(productImages)
      .where(eq(productImages.productId, row.product.id))
      .orderBy(asc(productImages.sort))
      .limit(1)
      .then((r) => r[0]),
  ]);
  const p = row.product;
  // Parent spaces (Office, Living, ...) aren't assignable; label children "Space › Category".
  const catOptions = cats
    .filter((c) => c.parentId !== null)
    .map((c) => ({ id: c.id, label: `${cats.find((x) => x.id === c.parentId)?.nameTh} › ${c.nameTh}` }));

  return (
    <main>
      <Link href="/admin" className="text-sm text-muted hover:text-accent">
        ← รายการสินค้า
      </Link>
      <div className="mt-3 flex items-start gap-4">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
          <img src={image.url} alt="" className="h-24 w-24 rounded border border-line object-contain" />
        )}
        <div>
          <h1 className="text-3xl">{p.code}</h1>
          <p className="text-sm text-muted">
            ผู้ผลิต {row.brand} · ต้นฉบับ {p.sourceFile}
            {p.editedAt && ` · แก้ไขล่าสุด ${p.editedAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`}
          </p>
          {p.flags.length > 0 && <p className="text-sm text-amber-700">คำเตือนจากการนำเข้า: {p.flags.join(", ")}</p>}
        </div>
      </div>
      <div className="mt-6">
        <ProductEditor
          slug={p.slug}
          categories={catOptions}
          initial={{
            code: p.code,
            typeTh: p.typeTh ?? "",
            typeEn: p.typeEn ?? "",
            summaryTh: p.summaryTh ?? "",
            summaryEn: p.summaryEn ?? "",
            categoryId: p.categoryId,
            status: p.status,
            noteTh: p.noteTh ?? "",
            noteEn: p.noteEn ?? "",
            featuresTh: p.featuresTh,
            featuresEn: p.featuresEn,
            sizes: p.sizes.map((s) => ({ ...s, mm: s.mm ?? {} })),
            specs: p.specs,
          }}
        />
      </div>
    </main>
  );
}
