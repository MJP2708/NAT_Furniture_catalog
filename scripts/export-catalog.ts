/**
 * Export the published catalogue (including admin edits) for the e-catalogue PDF builder.
 * Writes ingest/.cache/ecatalog.json; `pnpm catalog:pdf` (brochure) and `pnpm catalog:office` (interactive
 * office catalogue) run this and then their Python layout.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { config } from "dotenv";
import { and, asc, eq, isNotNull } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

async function main() {
  const { db } = await import("../src/db");
  const { categories, productImages, products } = await import("../src/db/schema");
  const { SPACE_COPY } = await import("../src/lib/copy");

  const cats = await db.select().from(categories).orderBy(asc(categories.sort));
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      code: products.code,
      typeTh: products.typeTh,
      typeEn: products.typeEn,
      summaryTh: products.summaryTh,
      summaryEn: products.summaryEn,
      featuresTh: products.featuresTh,
      featuresEn: products.featuresEn,
      categoryId: products.categoryId,
      materials: products.materials,
      material: products.material,
      tags: products.tags,
      specs: products.specs,
      sizes: products.sizes,
      flags: products.flags,
    })
    .from(products)
    .where(and(eq(products.status, "published"), isNotNull(products.categoryId)))
    .orderBy(asc(products.code));
  const images = await db
    .select({ productId: productImages.productId, url: productImages.url })
    .from(productImages)
    .where(eq(productImages.sort, 0));
  const imageOf = new Map(images.map((i) => [i.productId, i.url]));

  const spaces = cats
    .filter((c) => c.parentId === null)
    .map((root) => ({
      slug: root.slug,
      nameTh: root.nameTh,
      nameEn: root.nameEn,
      copy: SPACE_COPY[root.slug] ?? null,
      categories: cats
        .filter((c) => c.parentId === root.id)
        .map((c) => ({
          slug: c.slug,
          nameTh: c.nameTh,
          nameEn: c.nameEn,
          products: rows
            .filter((p) => p.categoryId === c.id)
            .map(({ id, flags, slug, code, typeTh, typeEn, summaryTh, summaryEn, featuresTh, featuresEn, sizes, materials, material, tags, specs }) => ({
              slug,
              code,
              typeTh,
              typeEn,
              // Copy for the feature pages (a few lines next to a large picture)
              summaryTh,
              summaryEn,
              featuresTh: featuresTh.slice(0, 6),
              featuresEn: featuresEn.slice(0, 6),
              // For the office catalogue: range (mesh/leather, steel/wood ...), material and colour lines
              materials,
              material,
              tags,
              specs,
              // Drawings rendered from the sheet (vs. a traced photo) make weaker cover images.
              rendered: flags.includes("image-from-render"),
              // Size sets as [w, d, h, dia] mm ranges; the PDF prints one line per set.
              sizes: sizes.filter((s) => s.mm).map((s) => s.mm),
              image: imageOf.get(id) ?? null,
            })),
        }))
        .filter((c) => c.products.length),
    }))
    .filter((s) => s.categories.length);

  mkdirSync("ingest/.cache", { recursive: true });
  writeFileSync("ingest/.cache/ecatalog.json", JSON.stringify({ exportedAt: new Date().toISOString(), spaces }));
  const n = spaces.flatMap((s) => s.categories).reduce((a, c) => a + c.products.length, 0);
  console.log(`exported ${spaces.length} spaces · ${n} products`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
