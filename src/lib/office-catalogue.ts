import { cacheLife, cacheTag } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";

import listing from "../../data/office-catalogue.json";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CATALOG_TAG } from "@/lib/catalog";
import { E_CATALOGUE_PDF, media } from "@/lib/site";

/**
 * The office e-catalogue on the web: the same seven categories, ranges and codes (CH-NT-01 ...)
 * as the interactive PDF. `pnpm catalog:office` sorts the products and writes the order and codes
 * to data/office-catalogue.json; commit that file to publish a new order here.
 * The taxonomy mirrors TAXONOMY in ingest/nat_ingest/office_catalogue.py.
 */
export type Range = { code: string; en: string; th: string };
export type MainCategory = Range & { n: number; tab: string; accent: string; subs: Range[] };

export const OFFICE_TAXONOMY: MainCategory[] = [
  {
    n: 1, code: "CH", en: "Chairs", th: "เก้าอี้", tab: "Chairs", accent: "#2a5d9e",
    subs: [
      { code: "CH-NT", en: "Mesh / Net Chairs", th: "เก้าอี้ตาข่าย" },
      { code: "CH-LT", en: "Leather Chairs", th: "เก้าอี้หนัง" },
      { code: "CH-MP", en: "Multipurpose Chairs", th: "เก้าอี้เอนกประสงค์ (ไม่มีล้อ)" },
      { code: "CH-MW", en: "Multipurpose Chairs with Wheels", th: "เก้าอี้เอนกประสงค์ (มีล้อ)" },
    ],
  },
  {
    n: 2, code: "CB", en: "Cupboards", th: "ตู้", tab: "Cupboards", accent: "#007d7d",
    subs: [
      { code: "CB-WD", en: "Wooden Cupboards", th: "ตู้ไม้" },
      { code: "CB-ST", en: "Steel Cupboards", th: "ตู้เหล็ก" },
    ],
  },
  {
    n: 3, code: "SH", en: "Shelves", th: "ชั้นวาง", tab: "Shelves", accent: "#4a873b",
    subs: [
      { code: "SH-WD", en: "Wooden Shelves", th: "ชั้นวางไม้" },
      { code: "SH-ST", en: "Steel Shelves", th: "ชั้นวางเหล็ก" },
    ],
  },
  {
    n: 4, code: "ST", en: "Sliding Track Cabinets / Mobile Shelving", th: "ตู้รางเลื่อน", tab: "Mobile shelving",
    accent: "#704a99", subs: [],
  },
  {
    n: 5, code: "TB", en: "Tables", th: "โต๊ะ", tab: "Tables", accent: "#c7661c",
    subs: [
      { code: "TB-WD", en: "Wooden Tables", th: "โต๊ะไม้" },
      { code: "TB-ST", en: "Full Steel Tables", th: "โต๊ะเหล็ก" },
      { code: "TB-WS", en: "Wood + Steel Tables", th: "โต๊ะไม้ขาเหล็ก" },
      { code: "TB-MT", en: "Meeting Tables", th: "โต๊ะประชุม" },
    ],
  },
  { n: 6, code: "PT", en: "Partition Screens", th: "พาร์ทิชั่น & ฉากกั้น", tab: "Partitions", accent: "#b33359", subs: [] },
  { n: 7, code: "GR", en: "Guest Room Sets", th: "ชุดรับแขก", tab: "Guest room", accent: "#94731a", subs: [] },
];

/** Sub-categories; a category without any is one range carrying the category code. */
export function rangesOf(m: MainCategory): Range[] {
  return m.subs.length ? m.subs : [{ code: m.code, en: m.en, th: m.th }];
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

/** Catalogue code and where it sits, for the product page ("CH-NT-01 · Mesh / Net Chairs"). */
export function officeEntry(slug: string) {
  const e = BY_SLUG.get(slug);
  if (!e) return null;
  const main = mainOfRange(e.range);
  return { ...e, main, range: rangesOf(main).find((r) => r.code === e.range)! };
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
