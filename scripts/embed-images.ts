/**
 * Compute photo-search vectors for product images (CLIP, same model as the browser) and store
 * them in product_images.embedding. Uses the product photos (public/media/photo/...), which look
 * like what customers photograph. Only images without a vector are processed; --all redoes all.
 *
 * Usage: pnpm embed:images [--all]
 */
import { existsSync } from "node:fs";

import { config } from "dotenv";
import { eq, isNull, sql } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

async function main() {
  const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import("@huggingface/transformers");
  const { db } = await import("../src/db");
  const { productImages } = await import("../src/db/schema");
  const { CLIP_DTYPE, CLIP_MODEL } = await import("../src/lib/clip");
  env.cacheDir = ".cache/hf";

  const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
  const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: CLIP_DTYPE });

  const rows = await db
    .select({ id: productImages.id, url: productImages.url })
    .from(productImages)
    .where(process.argv.includes("--all") ? undefined : isNull(productImages.embedding));
  console.log(`${rows.length} images to embed`);

  let done = 0;
  let missing = 0;
  const t0 = Date.now();
  for (const r of rows) {
    const photo = "public" + r.url.replace(/^\/media\/p\//, "/media/photo/");
    const file = existsSync(photo) ? photo : "public" + r.url;
    if (!existsSync(file)) {
      missing++;
      continue;
    }
    const { image_embeds } = await model(await processor(await RawImage.read(file)));
    const v = Array.from(image_embeds.data as Float32Array);
    const norm = Math.hypot(...v);
    const vec = `[${v.map((x) => (x / norm).toFixed(6)).join(",")}]`;
    for (let attempt = 1; ; attempt++) {
      try {
        await db.update(productImages).set({ embedding: sql`${vec}::vector` }).where(eq(productImages.id, r.id));
        break;
      } catch (e) {
        // flaky network: retry a few times before giving up
        if (attempt >= 5) throw e;
        await new Promise((res) => setTimeout(res, 3000 * attempt));
      }
    }
    if (++done % 200 === 0) console.log(`  ${done}/${rows.length}  ${((Date.now() - t0) / done).toFixed(0)} ms/image`);
  }
  console.log(`embedded ${done}, missing files ${missing}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
