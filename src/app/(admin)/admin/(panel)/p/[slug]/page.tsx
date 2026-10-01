import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { FLAGS, type ListFilter, nextInList, productImagesOf } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-session";

import { ImageManager } from "./image-manager";
import { ProductEditor } from "./product-editor";

export const metadata = { title: "แก้ไขสินค้า" };

export default function EditProductPage({ params, searchParams }: PageProps<"/admin/p/[slug]">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Where the supplier's original is, for checking the data against it. */
function sourceLink(file: string, page: number): { label: string; href?: string } {
  if (file.startsWith("http")) return { label: "หน้าสินค้าบนเว็บไซต์ผู้ผลิต", href: file };
  if (file.startsWith("thaitaiyo/"))
    return { label: `แคตตาล็อก ${file.slice(10)} หน้า ${page}`, href: `https://www.thaitaiyo.co.th/download/catalog/${file.slice(10)}#page=${page}` };
  if (file === "admin") return { label: "เพิ่มโดยผู้ดูแลระบบ" };
  return { label: `แผ่นสเปก ${file}${page > 1 ? ` หน้า ${page}` : ""}` };
}

async function Editor({ params, searchParams }: Pick<PageProps<"/admin/p/[slug]">, "params" | "searchParams">) {
  await requireAdmin();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [row] = await db
    .select({ product: products, brand: brands.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.slug, slug));
  if (!row) notFound();
  const p = row.product;

  // The list the editor was opened from, so "back" and "save and next" stay in it.
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const filter: ListFilter = {
    status: one(sp.status) as ListFilter["status"],
    brand: one(sp.brand),
    category: one(sp.category),
    flag: one(sp.flag),
    open: one(sp.open) === "1",
    q: one(sp.q),
  };
  const listQuery = new URLSearchParams(
    Object.entries(filter).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => [k, v === true ? "1" : String(v)]),
  ).toString();
  const [cats, images, next] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.sort)),
    productImagesOf(p.id),
    nextInList(filter, p.code, p.slug),
  ]);
  // Parent spaces (Office, Living, ...) aren't assignable; label children "Space › Category".
  const catOptions = cats
    .filter((c) => c.parentId !== null)
    .map((c) => ({ id: c.id, label: `${cats.find((x) => x.id === c.parentId)?.nameTh} › ${c.nameTh}` }));
  const source = sourceLink(p.sourceFile, p.sourcePage);
  const back = `/admin${listQuery ? `?${listQuery}` : ""}`;

  return (
    <main>
      <div className="flex items-center justify-between text-sm">
        <Link href={back} className="text-muted hover:text-accent">
          ← รายการสินค้า{filter.flag && FLAGS[filter.flag] ? ` · ${FLAGS[filter.flag].th}` : ""}
        </Link>
        {next && (
          <Link href={`/admin/p/${next}${listQuery ? `?${listQuery}` : ""}`} className="text-muted hover:text-accent">
            ข้ามไปรายการถัดไป →
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-8 lg:grid-cols-[22rem_1fr]">
        {/* Left: drawings, source, warnings */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div>
            <div className="text-xs text-muted">{row.brand}</div>
            <h1 className="display text-4xl">{p.code}</h1>
            <div className="mt-2 flex gap-3 text-sm">
              <a href={`/p/${p.slug}`} target="_blank" className="text-accent hover:underline">
                ดูหน้าเว็บ TH ↗
              </a>
              <a href={`/en/p/${p.slug}`} target="_blank" className="text-accent hover:underline">
                EN ↗
              </a>
              <a href={`/sheet/th/${p.slug}`} target="_blank" className="text-accent hover:underline">
                ใบสเปก ↗
              </a>
              <a href={`/sheet/th/${p.slug}/docx`} download className="text-accent hover:underline">
                Word ↓
              </a>
            </div>
            {p.status !== "published" && <p className="mt-1 text-xs text-amber-700">ยังไม่แสดงบนเว็บไซต์จนกว่าจะเปลี่ยนสถานะเป็น “เผยแพร่”</p>}
          </div>

          <ImageManager images={images} code={p.code} />

          <div className="rounded-lg border border-line bg-canvas p-3 text-sm">
            <div className="text-xs text-muted">ข้อมูลต้นฉบับ</div>
            {source.href ? (
              <a href={source.href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {source.label} ↗
              </a>
            ) : (
              <div>{source.label}</div>
            )}
            <div className="mt-2 text-xs text-muted">
              {p.editedAt
                ? `ตรวจ/แก้ไขล่าสุด ${p.editedAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · การนำเข้าครั้งถัดไปจะไม่เขียนทับ`
                : "ยังไม่มีคนตรวจ · การนำเข้าครั้งถัดไปอาจเขียนทับข้อมูลนี้"}
            </div>
          </div>

          {p.flags.some((f) => FLAGS[f]) && (
            <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm">
              {p.flags
                .filter((f) => FLAGS[f])
                .map((f) => (
                  <li key={f}>
                    <div className="font-medium text-amber-900">{FLAGS[f].th}</div>
                    <div className="text-xs text-amber-900/80">{FLAGS[f].help}</div>
                  </li>
                ))}
            </ul>
          )}
        </aside>

        {/* Right: the editable specification */}
        <ProductEditor
          slug={p.slug}
          categories={catOptions}
          nextHref={next ? `/admin/p/${next}${listQuery ? `?${listQuery}` : ""}` : null}
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
