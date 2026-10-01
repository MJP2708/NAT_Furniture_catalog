import "server-only";

import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { brands, categories, productImages, products } from "@/db/schema";
import { media } from "@/lib/site";

/** Import warnings, explained for staff. `hidden` ones keep the product off the site until fixed. */
export const FLAGS: Record<string, { th: string; help: string; hidden?: boolean; order: number }> = {
  "category-guessed": {
    th: "ยังไม่ทราบหมวดหมู่",
    help: "ระบบอ่านประเภทสินค้าไม่ออก สินค้าถูกซ่อนไว้จนกว่าจะเลือกหมวดหมู่ให้ถูกต้อง",
    hidden: true,
    order: 1,
  },
  "no-category": { th: "ไม่มีหมวดหมู่", help: "สินค้าไม่มีหมวดหมู่ จึงยังไม่แสดงบนเว็บไซต์", hidden: true, order: 2 },
  "no-image": { th: "ไม่มีภาพ", help: "ไม่พบภาพสินค้าในแผ่นสเปก สินค้าถูกซ่อนไว้", hidden: true, order: 3 },
  "no-code": { th: "ไม่พบรหัสสินค้า", help: "ใช้ชื่อไฟล์แทนรหัส ควรตรวจและแก้รหัสให้ถูกต้อง", hidden: true, order: 4 },
  "dims-suspect": { th: "ขนาดดูผิดปกติ", help: "ตัวเลขขนาดดูไม่สมเหตุสมผล (เช่น สูง 11 ซม.) ควรตรวจกับแผ่นสเปก", order: 5 },
  "category-from-code": {
    th: "หมวดหมู่เดาจากรหัส",
    help: "ชื่อสินค้าอ่านไม่ชัด ระบบเลือกหมวดหมู่จากกลุ่มรหัสสินค้า ควรตรวจว่าถูกต้อง",
    order: 6,
  },
  "no-dimensions": { th: "ไม่มีขนาด", help: "แหล่งข้อมูลไม่มีขนาดสินค้า เพิ่มขนาดได้ถ้ามีข้อมูล", order: 7 },
  "dims-fixed": { th: "แก้หน่วยขนาดอัตโนมัติ", help: "แผ่นสเปกระบุหน่วยผิด ระบบปรับให้แล้ว ควรตรวจอีกครั้ง", order: 8 },
  "ocr-import": { th: "อ่านจากแคตตาล็อก (OCR)", help: "ข้อมูลอ่านจากภาพแคตตาล็อก อาจมีรหัสหรือชื่อผิดเล็กน้อย", order: 9 },
  "image-from-render": { th: "ภาพจากหน้าเอกสาร", help: "ไม่มีรูปถ่ายในไฟล์ ใช้ภาพจากหน้าแผ่นสเปกแทน", order: 10 },
};

export const PAGE_SIZE = 50;

export type ListFilter = {
  status?: "published" | "review" | "hidden";
  brand?: string;
  category?: string; // slug; a top-level space includes its subcategories
  flag?: string;
  open?: boolean; // only products nobody has checked yet
  q?: string;
  page?: number;
  sort?: "code" | "updated";
};

const thumb = sql<string | null>`(select pi.thumb_url from product_images pi
  where pi.product_id = "products"."id" order by pi.sort limit 1)`;

async function whereOf(f: ListFilter): Promise<SQL | undefined> {
  const conds: (SQL | undefined)[] = [];
  if (f.status) conds.push(eq(products.status, f.status));
  if (f.brand) conds.push(eq(brands.slug, f.brand));
  if (f.flag) conds.push(sql`${f.flag} = any(${products.flags})`);
  if (f.open) conds.push(isNull(products.editedAt));
  if (f.q) {
    const like = `%${f.q}%`;
    conds.push(or(ilike(products.code, like), ilike(products.typeTh, like), ilike(products.typeEn, like)));
  }
  if (f.category) {
    const [cat] = await db.select().from(categories).where(eq(categories.slug, f.category));
    if (cat) {
      const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, cat.id));
      conds.push(inArray(products.categoryId, [cat.id, ...kids.map((k) => k.id)]));
    }
  }
  return and(...conds);
}

export async function listProducts(f: ListFilter) {
  const where = await whereOf(f);
  const page = Math.max(1, f.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        slug: products.slug,
        code: products.code,
        typeTh: products.typeTh,
        status: products.status,
        flags: products.flags,
        editedAt: products.editedAt,
        updatedAt: products.updatedAt,
        brand: brands.name,
        category: categories.nameTh,
        thumb,
      })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      .orderBy(...(f.sort === "updated" ? [desc(products.updatedAt)] : [asc(products.code)]))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .where(where),
  ]);
  return { rows: rows.map((r) => ({ ...r, thumb: media(r.thumb) })), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** The product after `slug` in the same filtered list (for "save and next"). */
export async function nextInList(f: ListFilter, code: string, slug: string) {
  const where = await whereOf(f);
  const [row] = await db
    .select({ slug: products.slug })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(and(where, sql`(${products.code}, ${products.slug}) > (${code}, ${slug})`))
    .orderBy(asc(products.code), asc(products.slug))
    .limit(1);
  return row?.slug ?? null;
}

export async function statusCounts() {
  return db.select({ status: products.status, n: sql<number>`count(*)::int` }).from(products).groupBy(products.status);
}

/** Per warning: all products carrying it, and those nobody has checked yet. */
export async function flagCounts() {
  const rows = await db.execute<{ flag: string; total: number; open: number }>(sql`
    select f as flag, count(*)::int as total, count(*) filter (where edited_at is null)::int as open
    from products, unnest(flags) as f group by f`);
  return rows.rows;
}

export async function filterOptions() {
  const [brandRows, catRows] = await Promise.all([
    db.select({ slug: brands.slug, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select().from(categories).orderBy(asc(categories.sort)),
  ]);
  const cats = catRows.map((c) => ({
    ...c,
    label: c.parentId ? `${catRows.find((p) => p.id === c.parentId)?.nameTh} › ${c.nameTh}` : c.nameTh,
  }));
  return { brands: brandRows, categories: cats };
}

export async function categoriesWithCounts() {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      parentId: categories.parentId,
      nameTh: categories.nameTh,
      nameEn: categories.nameEn,
      sort: categories.sort,
      products: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sort));
}

export async function productImagesOf(productId: number) {
  const rows = await db
    .select({ id: productImages.id, url: productImages.url, width: productImages.width, height: productImages.height, sort: productImages.sort })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sort));
  return rows.map((r) => ({ ...r, url: media(r.url) }));
}
