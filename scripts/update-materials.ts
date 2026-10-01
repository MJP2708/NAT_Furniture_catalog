/**
 * Recompute products.material (steel | wood) from data/extracted/catalog.json without a full
 * re-import. Admin-edited products keep their value.  Usage: pnpm exec tsx scripts/update-materials.ts
 */
import { readFileSync } from "node:fs";

import { config } from "dotenv";
import { and, isNull, sql } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

async function main() {
  const { db } = await import("../src/db");
  const { products } = await import("../src/db/schema");
  const { classifyMaterial } = await import("../src/lib/material");
  type R = { slug: string; code: string; category: string | null; type_th: string | null; type_en: string | null;
    specs: { label_th: string; values_th: string[]; values_en: (string | null)[] }[]; features_th: string[]; materials: string[]; source: { file: string } };
  const records: R[] = JSON.parse(readFileSync("data/extracted/catalog.json", "utf8"));
  const by: Record<string, string[]> = { steel: [], wood: [], none: [] };
  for (const r of records) {
    const m = classifyMaterial({
      category: r.category,
      type: `${r.type_th ?? ""} ${r.type_en ?? ""} ${r.code}`,
      specText: [...r.specs.map((s) => `${s.label_th} ${s.values_th.join(" ")} ${s.values_en.filter(Boolean).join(" ")}`), ...r.features_th, ...r.materials].join(" "),
      source: r.source.file,
    });
    by[m ?? "none"].push(r.slug);
  }
  for (const [m, slugs] of Object.entries(by)) {
    for (let i = 0; i < slugs.length; i += 500) {
      await db
        .update(products)
        .set({ material: m === "none" ? null : m })
        .where(and(sql`${products.slug} = any(${sql.param(slugs.slice(i, i + 500))}::text[])`, isNull(products.editedAt)));
    }
    console.log(m, slugs.length);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
