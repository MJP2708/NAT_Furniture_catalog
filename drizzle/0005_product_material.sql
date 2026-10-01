ALTER TABLE "products" ADD COLUMN "material" text;--> statement-breakpoint
CREATE INDEX "products_category_id_material_index" ON "products" USING btree ("category_id","material");