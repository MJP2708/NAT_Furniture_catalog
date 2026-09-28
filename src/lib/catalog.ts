import { cacheLife } from "next/cache";
import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, products } from "@/db/schema";

/** Categories with their number of published products, in display order. */
export async function getCategoryCounts() {
  "use cache";
  cacheLife("hours");
  return db
    .select({ slug: categories.slug, parentId: categories.parentId, id: categories.id, nameTh: categories.nameTh, nameEn: categories.nameEn, products: count(products.id) })
    .from(categories)
    .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "published")))
    .groupBy(categories.id)
    .orderBy(asc(categories.sort));
}
