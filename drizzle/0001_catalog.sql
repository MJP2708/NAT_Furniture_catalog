CREATE TYPE "public"."product_status" AS ENUM('published', 'review', 'hidden');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"slug" text NOT NULL,
	"name_th" text NOT NULL,
	"name_en" text NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"url" text NOT NULL,
	"thumb_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"embedding" vector(512)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"brand_id" integer NOT NULL,
	"series_id" integer,
	"category_id" integer,
	"code" text NOT NULL,
	"code_norm" text NOT NULL,
	"type_th" text,
	"type_en" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"materials" text[] DEFAULT '{}'::text[] NOT NULL,
	"seats" smallint,
	"width_min" integer,
	"width_max" integer,
	"depth_min" integer,
	"depth_max" integer,
	"height_min" integer,
	"height_max" integer,
	"sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features_th" text[] DEFAULT '{}'::text[] NOT NULL,
	"features_en" text[] DEFAULT '{}'::text[] NOT NULL,
	"note_th" text,
	"note_en" text,
	"source_file" text NOT NULL,
	"source_page" smallint DEFAULT 1 NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "product_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_id_sort_index" ON "product_images" USING btree ("product_id","sort");--> statement-breakpoint
CREATE INDEX "products_category_id_index" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_id_index" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_series_id_index" ON "products" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "products_tags_index" ON "products" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "products_materials_index" ON "products" USING gin ("materials");--> statement-breakpoint
CREATE INDEX "products_code_norm_trgm_idx" ON "products" USING gin ("code_norm" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "series_brand_id_slug_index" ON "series" USING btree ("brand_id","slug");