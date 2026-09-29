"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { brands, categories, productImages, products } from "@/db/schema";
import { endSession, passwordMatches, requireAdmin, startSession } from "@/lib/admin-session";
import { CATALOG_TAG } from "@/lib/catalog";

export type FormState = { error?: string; saved?: boolean } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์" };
  if (!passwordMatches(String(form.get("password") ?? ""))) return { error: "รหัสผ่านไม่ถูกต้อง" };
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

const range = z.tuple([z.number().int().min(0).max(100000), z.number().int().min(0).max(100000)]).refine(([a, b]) => a <= b, "ค่าต่ำสุดต้องไม่เกินค่าสูงสุด");
const text = z.string().trim().max(2000);
const optText = text.nullable().transform((s) => s || null);

const Payload = z.object({
  code: z.string().trim().min(1, "ต้องมีรหัสสินค้า").max(80),
  typeTh: optText,
  typeEn: optText,
  summaryTh: z.string().trim().max(4000).nullable().transform((s) => s || null),
  summaryEn: z.string().trim().max(4000).nullable().transform((s) => s || null),
  categoryId: z.number().int().positive().nullable(),
  status: z.enum(["published", "review", "hidden"]),
  noteTh: optText,
  noteEn: optText,
  featuresTh: z.array(text).max(50),
  featuresEn: z.array(text).max(50),
  sizes: z
    .array(
      z.object({
        label_th: text,
        label_en: optText,
        text_th: text,
        text_en: optText,
        mm: z.object({ w: range, d: range, h: range, dia: range, seat_h: range, arm_h: range }).partial().nullable(),
      }),
    )
    .max(10),
  specs: z
    .array(
      z.object({
        label_th: text.pipe(z.string().min(1, "หัวข้อสเปกห้ามว่าง")),
        label_en: optText,
        values_th: z.array(text).max(20),
        values_en: z.array(optText).max(20),
      }),
    )
    .max(40),
});

export type ProductPayload = z.input<typeof Payload>;

/** Overall envelope across size sets (a round top's diameter counts as width and depth). */
function envelope(sizes: z.output<typeof Payload>["sizes"]) {
  const pick = (keys: ("w" | "d" | "h" | "dia")[]) => {
    const rs = sizes.flatMap((s) => keys.map((k) => s.mm?.[k]).filter((r): r is [number, number] => !!r));
    return rs.length ? [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))] : [null, null];
  };
  const [widthMin, widthMax] = pick(["w", "dia"]);
  const [depthMin, depthMax] = pick(["d", "dia"]);
  const [heightMin, heightMax] = pick(["h"]);
  return { widthMin, widthMax, depthMin, depthMax, heightMin, heightMax };
}

export async function saveProduct(slug: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(" › ") || "ข้อมูล"}: ${issue.message}` };
  }
  const p = parsed.data;
  // Text areas are one entry per line: drop blank Thai lines and keep English paired by position.
  const features = p.featuresTh.map((th, i) => [th, p.featuresEn[i] ?? ""] as const).filter(([th]) => th);
  const specs = p.specs.map((row) => {
    const keep = row.values_th.map((v, i) => [v, row.values_en[i] ?? null] as const).filter(([v]) => v);
    return { ...row, values_th: keep.map(([v]) => v), values_en: keep.map(([, e]) => e) };
  });
  const updated = await db
    .update(products)
    .set({
      ...p,
      specs,
      featuresTh: features.map(([th]) => th),
      featuresEn: features.map(([, en]) => en),
      codeNorm: p.code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ...envelope(p.sizes),
      editedAt: new Date(),
    })
    .where(eq(products.slug, slug))
    .returning({ id: products.id });
  if (!updated.length) return { error: "ไม่พบสินค้านี้" };
  updateTag(CATALOG_TAG);
  return { saved: true };
}


// ---------------------------------------------------------------- bulk actions (product list)

const Bulk = z.object({
  slugs: z.array(z.string().min(1)).min(1, "เลือกสินค้าอย่างน้อย 1 รายการ").max(500),
  op: z.enum(["publish", "hide", "review", "checked", "category"]),
  categoryId: z.coerce.number().int().positive().optional(),
});

export type BulkState = { error?: string; done?: string } | undefined;

/** Apply one change to many products. Every change also marks them as checked by staff
 * (edited_at), which takes them off the review queue and protects them from re-imports. */
export async function bulkUpdate(_: BulkState, form: FormData): Promise<BulkState> {
  await requireAdmin();
  const parsed = Bulk.safeParse({
    slugs: form.getAll("slug").map(String),
    op: form.get("op"),
    categoryId: form.get("categoryId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { slugs, op, categoryId } = parsed.data;
  if (op === "category" && !categoryId) return { error: "เลือกหมวดหมู่ก่อน" };
  const set = {
    editedAt: new Date(),
    ...(op === "publish" && { status: "published" as const }),
    ...(op === "hide" && { status: "hidden" as const }),
    ...(op === "review" && { status: "review" as const }),
    ...(op === "category" && { categoryId }),
  };
  const rows = await db.update(products).set(set).where(inArray(products.slug, slugs)).returning({ id: products.id });
  updateTag(CATALOG_TAG);
  const verb = { publish: "เผยแพร่", hide: "ซ่อน", review: "ย้ายไปรอตรวจ", checked: "ทำเครื่องหมายว่าตรวจแล้ว", category: "เปลี่ยนหมวดหมู่" }[op];
  return { done: `${verb} ${rows.length} รายการ` };
}

// ---------------------------------------------------------------- images (product editor)

async function touchProduct(productId: number) {
  await db.update(products).set({ editedAt: new Date() }).where(eq(products.id, productId));
  updateTag(CATALOG_TAG);
}

/** Remove a drawing from a product (the file stays on disk; the product stops showing it). */
export async function removeImage(imageId: number) {
  await requireAdmin();
  const [img] = await db.delete(productImages).where(eq(productImages.id, imageId)).returning({ productId: productImages.productId });
  if (!img) return;
  // Close the gap so the first remaining drawing is the cover.
  const rest = await db.select({ id: productImages.id }).from(productImages).where(eq(productImages.productId, img.productId)).orderBy(productImages.sort);
  for (const [i, r] of rest.entries()) await db.update(productImages).set({ sort: i }).where(eq(productImages.id, r.id));
  await touchProduct(img.productId);
}

/** Move a drawing earlier or later; position 0 is the cover used on cards and in the PDF. */
export async function moveImage(imageId: number, direction: -1 | 1) {
  await requireAdmin();
  const [img] = await db.select().from(productImages).where(eq(productImages.id, imageId));
  if (!img) return;
  const all = await db.select().from(productImages).where(eq(productImages.productId, img.productId)).orderBy(productImages.sort);
  const i = all.findIndex((r) => r.id === imageId);
  const j = i + direction;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  for (const [k, r] of all.entries()) await db.update(productImages).set({ sort: k }).where(eq(productImages.id, r.id));
  await touchProduct(img.productId);
}

// ---------------------------------------------------------------- categories

const Category = z.object({
  id: z.coerce.number().int().positive(),
  nameTh: z.string().trim().min(1, "ต้องมีชื่อภาษาไทย").max(120),
  nameEn: z.string().trim().min(1, "English name is required").max(120),
  sort: z.coerce.number().int().min(0).max(999),
});

export async function saveCategory(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = Category.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  await db.update(categories).set(values).where(eq(categories.id, id));
  updateTag(CATALOG_TAG);
  return { saved: true };
}

// ---------------------------------------------------------------- new product

const NewProduct = z.object({
  brand: z.string().min(1, "เลือกผู้ผลิต"),
  code: z.string().trim().min(1, "ต้องมีรหัสสินค้า").max(80),
  categoryId: z.coerce.number().int().positive("เลือกหมวดหมู่"),
});

/** Create a product by hand. It starts as "needs review" until its details are filled in. */
export async function createProduct(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = NewProduct.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { brand, code, categoryId } = parsed.data;
  const [b] = await db.select().from(brands).where(eq(brands.slug, brand));
  if (!b) return { error: "ไม่พบผู้ผลิต" };
  const base = `${b.slug}-${code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const taken = await db.select({ slug: products.slug }).from(products).where(sql`${products.slug} like ${base + "%"}`);
  const slug = taken.some((t) => t.slug === base) ? `${base}-${taken.length + 1}` : base;
  await db.insert(products).values({
    slug,
    brandId: b.id,
    categoryId,
    code,
    codeNorm: code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    sourceFile: "admin",
    status: "review",
    editedAt: new Date(),
  });
  redirect(`/admin/p/${slug}`);
}



