/**
 * Load data/extracted/*.json (from `python -m nat_ingest.build`) into Postgres.
 * Idempotent: rows are upserted by slug, and each product's images are replaced.
 *
 * Usage: pnpm db:seed
 */
import { readFileSync } from "node:fs";

import { config } from "dotenv";
import { and, inArray, isNull, sql } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

type Range = [number, number];
type Extracted = {
  brand: string;
  code: string;
  series: string;
  type_th: string | null;
  type_en: string | null;
  category: string | null;
  tags: string[];
  materials: string[];
  seats: number | null;
  sizes: import("../src/db/schema").SizeSet[];
  dimensions_mm: Partial<Record<"w" | "d" | "h" | "dia", Range>> | null;
  specs: import("../src/db/schema").SpecRow[];
  features_th: string[];
  features_en: (string | null)[];
  note_th: string | null;
  note_en: string | null;
  source: { file: string; page: number };
  images: { src: string; thumb: string; w: number; h: number }[];
  flags: string[];
  slug: string;
};

// Products missing any of these need a human look before they go public.
const REVIEW_FLAGS = new Set(["no-code", "no-category", "no-image"]);

const read = <T>(name: string): T => JSON.parse(readFileSync(`data/extracted/${name}`, "utf8"));
const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const excluded = (cols: string[]) =>
  Object.fromEntries(cols.map((c) => [c, sql.raw(`excluded.${c.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())}`)]));

async function main() {
  // Import after dotenv so DATABASE_URL is set when the client is created.
  const { db } = await import("../src/db");
  const { brands, categories, productImages, products, series } = await import("../src/db/schema");

  const brandRows = read<{ slug: string; name: string; logo: string | null }[]>("brands.json");
  const brandIds = new Map(
    (
      await db
        .insert(brands)
        .values(brandRows.map((b) => ({ slug: b.slug, name: b.name, logoUrl: b.logo })))
        .onConflictDoUpdate({ target: brands.slug, set: excluded(["name", "logoUrl"]) })
        .returning({ id: brands.id, slug: brands.slug })
    ).map((r) => [r.slug, r.id]),
  );

  const catRows = read<{ slug: string; parent: string | null; name_th: string; name_en: string; sort: number }[]>(
    "categories.json",
  );
  const catIds = new Map(
    (
      await db
        .insert(categories)
        .values(catRows.map((c) => ({ slug: c.slug, nameTh: c.name_th, nameEn: c.name_en, sort: c.sort })))
        .onConflictDoUpdate({ target: categories.slug, set: excluded(["nameTh", "nameEn", "sort"]) })
        .returning({ id: categories.id, slug: categories.slug })
    ).map((r) => [r.slug, r.id]),
  );
  for (const c of catRows) {
    await db
      .update(categories)
      .set({ parentId: c.parent ? catIds.get(c.parent)! : null })
      .where(sql`${categories.slug} = ${c.slug}`);
  }

  const records = read<Extracted[]>("catalog.json");

  const seriesKeys = [...new Map(records.map((r) => [`${r.brand}/${slugify(r.series)}`, r])).values()];
  const seriesIds = new Map<string, number>();
  for (const part of chunks(seriesKeys, 200)) {
    const rows = await db
      .insert(series)
      .values(part.map((r) => ({ brandId: brandIds.get(r.brand)!, slug: slugify(r.series), name: r.series })))
      .onConflictDoUpdate({ target: [series.brandId, series.slug], set: excluded(["name"]) })
      .returning({ id: series.id, brandId: series.brandId, slug: series.slug });
    const brandSlug = new Map([...brandIds].map(([s, id]) => [id, s]));
    for (const r of rows) seriesIds.set(`${brandSlug.get(r.brandId)}/${r.slug}`, r.id);
  }

  const toProduct = (r: Extracted) => {
    const d = r.dimensions_mm ?? {};
    const w = d.w ?? d.dia;
    const dp = d.d ?? d.dia;
    return {
      slug: r.slug,
      brandId: brandIds.get(r.brand)!,
      seriesId: seriesIds.get(`${r.brand}/${slugify(r.series)}`) ?? null,
      categoryId: r.category ? (catIds.get(r.category) ?? null) : null,
      code: r.code,
      codeNorm: r.code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      typeTh: r.type_th,
      typeEn: r.type_en,
      tags: r.tags,
      materials: r.materials,
      seats: r.seats,
      widthMin: w?.[0] ?? null,
      widthMax: w?.[1] ?? null,
      depthMin: dp?.[0] ?? null,
      depthMax: dp?.[1] ?? null,
      heightMin: d.h?.[0] ?? null,
      heightMax: d.h?.[1] ?? null,
      sizes: r.sizes,
      specs: r.specs,
      featuresTh: r.features_th,
      // Arrays stay aligned with featuresTh; untranslated entries become "".
      featuresEn: r.features_en.map((f) => f ?? ""),
      noteTh: r.note_th,
      noteEn: r.note_en,
      sourceFile: r.source.file,
      sourcePage: r.source.page,
      flags: r.flags,
      status: r.flags.some((f) => REVIEW_FLAGS.has(f)) ? ("review" as const) : ("published" as const),
    };
  };
  const productCols = Object.keys(toProduct(records[0])).filter((c) => c !== "slug");

  let imageCount = 0;
  let skipped = 0;
  for (const part of chunks(records, 100)) {
    const rows = await db
      .insert(products)
      .values(part.map(toProduct))
      // Products edited in /admin keep their edits (and images) across re-imports.
      .onConflictDoUpdate({
        target: products.slug,
        set: { ...excluded(productCols), updatedAt: sql`now()` },
        setWhere: isNull(products.editedAt),
      })
      .returning({ id: products.id, slug: products.slug });
    const ids = new Map(rows.map((r) => [r.slug, r.id]));
    skipped += part.length - rows.length;
    await db.delete(productImages).where(inArray(productImages.productId, [...ids.values()]));
    // Only products the upsert touched; admin-edited ones keep their current images.
    const images = part
      .filter((r) => ids.has(r.slug))
      .flatMap((r) =>
        r.images.map((im, sort) => ({
          productId: ids.get(r.slug)!,
          url: im.src,
          thumbUrl: im.thumb,
          width: im.w,
          height: im.h,
          sort,
        })),
      );
    if (images.length) await db.insert(productImages).values(images);
    imageCount += images.length;
  }

  // Remove products that are no longer in the extraction (e.g. merged duplicates).
  const slugs = records.map((r) => r.slug);
  const stale = await db
    .delete(products)
    .where(and(sql`${products.slug} <> all(${sql.param(slugs)}::text[])`, isNull(products.editedAt)))
    .returning({ slug: products.slug });

  console.log(
    `brands ${brandIds.size} · categories ${catIds.size} · series ${seriesIds.size} · ` +
      `products ${records.length - skipped} (kept ${skipped} admin-edited) · images ${imageCount} · removed ${stale.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
