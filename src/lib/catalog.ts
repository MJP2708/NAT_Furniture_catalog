import { cacheLife, cacheTag } from "next/cache";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, productImages, products, series } from "@/db/schema";
import { media } from "@/lib/site";

/** Every cached catalog read carries this tag; admin edits expire it with updateTag. */
export const CATALOG_TAG = "catalog";

const published = eq(products.status, "published");

const cardFields = {
  slug: products.slug,
  code: products.code,
  typeTh: products.typeTh,
  typeEn: products.typeEn,
  materials: products.materials,
  material: products.material,
  widthMin: products.widthMin,
  widthMax: products.widthMax,
  depthMin: products.depthMin,
  depthMax: products.depthMax,
  heightMin: products.heightMin,
  heightMax: products.heightMax,
  // Written out with explicit qualifiers: Drizzle leaves column names unqualified in single-table
  // selects, which would make "id" here resolve to product_images.id.
  thumb: sql<string | null>`(select pi.thumb_url from product_images pi
    where pi.product_id = "products"."id" order by pi.sort limit 1)`,
};

export type ProductCard = Awaited<ReturnType<typeof searchProducts>>[number];

/** Card rows with drawing URLs for this site variant. */
function cards<T extends { thumb: string | null }>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, thumb: media(r.thumb) }));
}

/** Categories with their number of published products, in display order. */
export async function getCategoryCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      parentId: categories.parentId,
      nameTh: categories.nameTh,
      nameEn: categories.nameEn,
      products: count(products.id),
      // A representative sketch: prefer products whose image came from a real photo (not a
      // rendered drawing), then the lowest code, so the pick is stable between builds.
      cover: sql<string | null>`(select pi.url from product_images pi join products p2 on p2.id = pi.product_id
        where p2.category_id = "categories"."id" and p2.status = 'published' and pi.sort = 0
        order by ('image-from-render' = any(p2.flags)), p2.code limit 1)`,
    })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), published))
    .groupBy(categories.id)
    .orderBy(asc(categories.sort));
  return rows.map((r) => ({ ...r, cover: media(r.cover) }));
}

/** Top-level spaces (Office, Living, ...) with their subcategories and totals. */
export async function getCategoryTree() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const cats = await getCategoryCounts();
  return cats
    .filter((c) => c.parentId === null)
    .map((root) => {
      const children = cats.filter((c) => c.parentId === root.id && c.products > 0);
      const cover = root.cover ?? children.find((c) => c.cover)?.cover ?? null;
      return { ...root, cover, children, total: children.reduce((n, c) => n + c.products, 0) };
    });
}

export async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const tree = await getCategoryTree();
  const all = tree.flatMap((r) => [r, ...r.children]);
  const cat = all.find((c) => c.slug === slug);
  if (!cat) return null;
  const root = cat.parentId === null ? tree.find((r) => r.id === cat.id)! : tree.find((r) => r.id === cat.parentId)!;
  const ids = cat.parentId === null ? root.children.map((c) => c.id) : [cat.id];
  const rows = ids.length
    ? await db
        .select({ ...cardFields, categoryId: products.categoryId })
        .from(products)
        .where(and(published, inArray(products.categoryId, ids)))
        .orderBy(asc(products.code))
    : [];
  return { category: cat, root, products: cards(rows) };
}

export async function getProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const [row] = await db
    .select({ product: products, category: categories, series: series })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(series, eq(series.id, products.seriesId))
    .where(and(published, eq(products.slug, slug)));
  if (!row) return null;
  const [images, parent, siblings] = await Promise.all([
    db
      .select({
        id: productImages.id,
        url: productImages.url,
        width: productImages.width,
        height: productImages.height,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.product.id))
      .orderBy(asc(productImages.sort)),
    row.category?.parentId
      ? db
          .select()
          .from(categories)
          .where(eq(categories.id, row.category.parentId))
          .then((r) => r[0] ?? null)
      : null,
    row.series
      ? db
          .select(cardFields)
          .from(products)
            .where(and(published, eq(products.seriesId, row.series.id), sql`${products.id} <> ${row.product.id}`))
          .orderBy(asc(products.code))
          .limit(12)
      : [],
  ]);
  return { ...row, images: images.map((im) => ({ ...im, url: media(im.url) })), parent, siblings: cards(siblings) };
}

/** Code search tolerant of spacing/punctuation ("fg1" finds "FG 1"), plus Thai/English type text. */
export async function searchProducts(q: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const norm = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const like = `%${q.trim()}%`;
  const conds = [ilike(products.typeTh, like), ilike(products.typeEn, like), ilike(products.code, like)];
  if (norm) conds.push(sql`${products.codeNorm} like ${norm + "%"}`, sql`${products.codeNorm} % ${norm}`);
  const rows = await db
    .select(cardFields)
    .from(products)
    .where(and(published, or(...conds)))
    .orderBy(
      norm ? sql`(${products.codeNorm} like ${norm + "%"}) desc, similarity(${products.codeNorm}, ${norm}) desc` : asc(products.code),
      asc(products.code),
    )
    .limit(60);
  return cards(rows);
}

/** Count and a representative image per main material (home page tiles). */
export async function getMaterialCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const rows = await db
    .select({
      material: products.material,
      count: count(),
      cover: sql<string | null>`(select pi.url from product_images pi join products p2 on p2.id = pi.product_id
        where p2.material = "products"."material" and p2.status = 'published' and pi.sort = 0
        order by ('image-from-render' = any(p2.flags)), p2.code limit 1)`,
    })
    .from(products)
    .where(and(published, sql`${products.material} is not null`))
    .groupBy(products.material);
  return rows.map((r) => ({ ...r, cover: media(r.cover) }));
}

/** All published products of one main material, with their category, for /material/[m]. */
export async function getMaterialProducts(material: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const rows = await db
    .select({ ...cardFields, categoryId: products.categoryId })
    .from(products)
    .where(and(published, eq(products.material, material)))
    .orderBy(asc(products.code));
  return cards(rows);
}

/** Slugs to prerender at build. Products are a sample: the rest render on first visit and are
 * then cached, which keeps builds from firing ~1k page renders at the database at once. */
export async function getAllSlugs() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const [prods, cats] = await Promise.all([
    db.select({ slug: products.slug }).from(products).where(published).orderBy(asc(products.id)).limit(24),
    db.select({ slug: categories.slug }).from(categories),
  ]);
  return { products: prods.map((p) => p.slug), categories: cats.map((c) => c.slug) };
}
