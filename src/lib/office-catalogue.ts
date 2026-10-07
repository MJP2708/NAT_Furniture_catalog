import { cacheLife, cacheTag } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import listing from "../../data/e-catalogue.json";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CATALOG_TAG } from "@/lib/catalog";
import { E_CATALOGUE_PDF, media } from "@/lib/site";

/**
 * The e-catalogue on the web: the same categories, ranges and codes (CH-TSK-NT-01 ...) as the PDF.
 * Categories are split by type, then function, then material (and a key feature where customers
 * choose by it, e.g. door type). data/e-catalogue.json holds the tree and every product's code;
 * it is generated together with the PDF, commit it to publish a new order here.
 */
export type Range = { code: string; en: string; th: string };
/** A range's function group ("Task & Staff Chairs") — ranges below it differ by material or feature. */
export type SubRange = Range & { group: Range };
export type MainCategory = Range & { n: number; tab: string; accent: string; subs: SubRange[] };

export const OFFICE_TAXONOMY: MainCategory[] = (listing as unknown as { taxonomy: MainCategory[] }).taxonomy;

/** Sub-categories; a category without any is one range carrying the category code. */
export function rangesOf(m: MainCategory): Range[] {
  return m.subs.length ? m.subs : [{ code: m.code, en: m.en, th: m.th }];
}

/** The function groups of a category, each with its material / feature ranges, in catalogue order. */
export function groupsOf(m: MainCategory): (Range & { ranges: SubRange[] })[] {
  const out = new Map<string, Range & { ranges: SubRange[] }>();
  for (const s of m.subs) {
    const g = out.get(s.group.code) ?? { ...s.group, ranges: [] };
    g.ranges.push(s);
    out.set(s.group.code, g);
  }
  return [...out.values()];
}

export function findMain(code: string) {
  return OFFICE_TAXONOMY.find((m) => m.code.toLowerCase() === code.toLowerCase()) ?? null;
}

/** /catalogue/ch#ch-nt */
export function rangeAnchor(range: string) {
  return range.toLowerCase();
}

type Entry = { slug: string; code: string; range: string; also: string[] };
const ENTRIES = (listing as unknown as { products: Entry[] }).products;
const BY_SLUG = new Map(ENTRIES.map((e) => [e.slug, e]));
const mainOfRange = (range: string) => OFFICE_TAXONOMY.find((m) => rangesOf(m).some((r) => r.code === range))!;

export const OFFICE_CATALOGUE_PDF = E_CATALOGUE_PDF;

/** Catalogue code and where it sits, for the product page ("CH-TSK-NT-01 · Task & Staff Chairs · Net / Mesh"). */
export function officeEntry(slug: string) {
  const e = BY_SLUG.get(slug);
  if (!e) return null;
  const main = mainOfRange(e.range);
  const r = rangesOf(main).find((x) => x.code === e.range)! as Range & { group?: Range };
  const g = r.group && r.group.code !== r.code ? r.group : null;
  return {
    ...e,
    main,
    range: { code: r.code, en: g ? `${g.en} · ${r.en}` : r.en, th: g ? `${g.th} · ${r.th}` : r.th },
  };
}

export type OfficeCard = {
  slug: string;
  catalogueCode: string;
  code: string;
  typeTh: string | null;
  typeEn: string | null;
  widthMin: number | null;
  widthMax: number | null;
  depthMin: number | null;
  depthMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  thumb: string | null;
};

/** Number of products per main category and a cover picture (contents tiles). */
export async function getOfficeContents() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const cards = await cardsFor(ENTRIES.map((e) => e.slug));
  return OFFICE_TAXONOMY.map((m) => {
    const ranges = new Set(rangesOf(m).map((r) => r.code));
    const items = ENTRIES.filter((e) => ranges.has(e.range) && cards.has(e.slug));
    const cover = items.map((e) => cards.get(e.slug)!.thumb).find(Boolean) ?? null;
    return { main: m, count: items.length, cover };
  });
}

/** One main category: its ranges in catalogue order, each with its own and its cross-listed products. */
export async function getOfficeCategory(main: MainCategory) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);
  const codes = new Set(rangesOf(main).map((r) => r.code));
  const mine = ENTRIES.filter((e) => codes.has(e.range) || e.also.some((a) => codes.has(a)));
  const cards = await cardsFor(mine.map((e) => e.slug));
  const card = (e: Entry) => cards.get(e.slug);
  return rangesOf(main).map((range) => ({
    range,
    items: ENTRIES.filter((e) => e.range === range.code).map(card).filter((c): c is OfficeCard => !!c),
    seeAlso: ENTRIES.filter((e) => e.also.includes(range.code)).map(card).filter((c): c is OfficeCard => !!c),
  }));
}

/** Published products by slug, with their catalogue code; hidden products drop out. */
async function cardsFor(slugs: string[]): Promise<Map<string, OfficeCard>> {
  if (!slugs.length) return new Map();
  const rows = await db
    .select({
      slug: products.slug,
      code: products.code,
      typeTh: products.typeTh,
      typeEn: products.typeEn,
      widthMin: products.widthMin,
      widthMax: products.widthMax,
      depthMin: products.depthMin,
      depthMax: products.depthMax,
      heightMin: products.heightMin,
      heightMax: products.heightMax,
      thumb: sql<string | null>`(select pi.thumb_url from product_images pi
        where pi.product_id = "products"."id" order by pi.sort limit 1)`,
    })
    .from(products)
    .where(and(eq(products.status, "published"), inArray(products.slug, slugs)));
  return new Map(
    rows.map((r) => [r.slug, { ...r, thumb: media(r.thumb), catalogueCode: BY_SLUG.get(r.slug)!.code }]),
  );
}
