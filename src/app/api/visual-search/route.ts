import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { CLIP_DIMS } from "@/lib/clip";
import { media } from "@/lib/site";

const Body = z.object({ embedding: z.array(z.number().finite()).length(CLIP_DIMS) });

/**
 * Photo search: the browser sends the CLIP vector of the visitor's photo (the photo itself never
 * leaves the device); we return the closest published products, one entry per product.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid embedding" }, { status: 400 });
  const v = parsed.data.embedding;
  const norm = Math.hypot(...v) || 1;
  const vec = `[${v.map((x) => (x / norm).toFixed(6)).join(",")}]`;

  // Nearest images first (HNSW index), then keep each product's best image.
  const { rows } = await db.execute<{
    slug: string;
    code: string;
    type_th: string | null;
    type_en: string | null;
    width_min: number | null;
    width_max: number | null;
    depth_min: number | null;
    depth_max: number | null;
    height_min: number | null;
    height_max: number | null;
    thumb: string | null;
    distance: number;
  }>(sql`
    with near as (
      select pi.product_id, pi.embedding <=> ${vec}::vector as distance
      from product_images pi
      where pi.embedding is not null
      order by pi.embedding <=> ${vec}::vector
      limit 240
    ), best as (
      select product_id, min(distance) as distance from near group by product_id
    )
    select p.slug, p.code, p.type_th, p.type_en, p.width_min, p.width_max, p.depth_min, p.depth_max,
           p.height_min, p.height_max, b.distance,
           (select pi.thumb_url from product_images pi where pi.product_id = p.id order by pi.sort limit 1) as thumb
    from best b join products p on p.id = b.product_id
    where p.status = 'published'
    order by b.distance
    limit 24`);

  return Response.json({
    results: rows.map((r) => ({
      slug: r.slug,
      code: r.code,
      typeTh: r.type_th,
      typeEn: r.type_en,
      widthMin: r.width_min,
      widthMax: r.width_max,
      depthMin: r.depth_min,
      depthMax: r.depth_max,
      heightMin: r.height_min,
      heightMax: r.height_max,
      thumb: media(r.thumb),
      // cosine similarity, 1 = identical
      score: Math.round((1 - Number(r.distance)) * 1000) / 1000,
    })),
  });
}
