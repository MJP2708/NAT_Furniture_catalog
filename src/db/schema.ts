import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** A size set from the spec sheet, e.g. {label_th: "ขนาด", mm: {w: [870, 870], ...}}. */
export type SizeSet = {
  label_th: string;
  label_en: string | null;
  text_th: string;
  text_en: string | null;
  mm: Partial<Record<"w" | "d" | "h" | "seat_h" | "arm_h" | "dia", [number, number]>> | null;
};

/** One construction row, e.g. โครงขา → ["เหล็กชุบโครเมียม"]. values_en[i] may be null (untranslated). */
export type SpecRow = {
  label_th: string;
  label_en: string | null;
  values_th: string[];
  values_en: (string | null)[];
};

export const productStatus = pgEnum("product_status", ["published", "review", "hidden"]);

export const brands = pgTable("brands", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  logoUrl: text(),
});

export const categories = pgTable("categories", {
  id: serial().primaryKey(),
  parentId: integer().references((): AnyPgColumn => categories.id),
  slug: text().notNull().unique(),
  nameTh: text().notNull(),
  nameEn: text().notNull(),
  sort: smallint().notNull().default(0),
});

export const series = pgTable(
  "series",
  {
    id: serial().primaryKey(),
    brandId: integer()
      .notNull()
      .references(() => brands.id),
    slug: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.brandId, t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: serial().primaryKey(),
    slug: text().notNull().unique(),
    brandId: integer()
      .notNull()
      .references(() => brands.id),
    seriesId: integer().references(() => series.id),
    categoryId: integer().references(() => categories.id),
    code: text().notNull(),
    /** Upper-case letters and digits only, so "FG 1", "fg-1" and "FG1" all match. */
    codeNorm: text().notNull(),
    typeTh: text(),
    typeEn: text(),
    /** Short product introduction (from the supplier where available). */
    summaryTh: text(),
    summaryEn: text(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    materials: text().array().notNull().default(sql`'{}'::text[]`),
    seats: smallint(),
    /** Main material group for case goods (steel | wood); see lib/material.ts */
    material: text(),
    // Overall envelope in mm across all size sets, for range facets.
    widthMin: integer(),
    widthMax: integer(),
    depthMin: integer(),
    depthMax: integer(),
    heightMin: integer(),
    heightMax: integer(),
    sizes: jsonb().$type<SizeSet[]>().notNull().default([]),
    specs: jsonb().$type<SpecRow[]>().notNull().default([]),
    featuresTh: text().array().notNull().default(sql`'{}'::text[]`),
    featuresEn: text().array().notNull().default(sql`'{}'::text[]`),
    noteTh: text(),
    noteEn: text(),
    sourceFile: text().notNull(),
    sourcePage: smallint().notNull().default(1),
    /** Extraction warnings from the import (no-image, no-dimensions, ...). */
    flags: text().array().notNull().default(sql`'{}'::text[]`),
    status: productStatus().notNull().default("published"),
    /** Set when staff edit the product in /admin; the import then leaves the row alone. */
    editedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.categoryId),
    index().on(t.brandId),
    index().on(t.seriesId),
    index().on(t.categoryId, t.material),
    index().using("gin", t.tags),
    index().using("gin", t.materials),
    index("products_code_norm_trgm_idx").using("gin", sql`${t.codeNorm} gin_trgm_ops`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: serial().primaryKey(),
    productId: integer()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Path under the media base, e.g. /media/p/<slug>/0.webp */
    url: text().notNull(),
    thumbUrl: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    sort: smallint().notNull().default(0),
    /** CLIP image embedding for photo search (filled in phase 4). */
    embedding: vector({ dimensions: 512 }),
  },
  (t) => [index().on(t.productId, t.sort), index("product_images_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops"))],
);
