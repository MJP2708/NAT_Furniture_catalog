import Link from "next/link";
import { notFound } from "next/navigation";

import { FilterableGrid } from "@/components/filterable-grid";
import { ProductCard, ProductGrid } from "@/components/product-grid";
import { getCategory } from "@/lib/catalog";
import { SPACE_COPY } from "@/lib/copy";
import { href, type Lang, t } from "@/lib/i18n";
import { MATERIAL_GROUPS, MATERIAL_KEYS, type MaterialGroup } from "@/lib/material";

export async function categoryTitle(slug: string, lang: Lang, material?: MaterialGroup) {
  const data = await getCategory(slug);
  if (!data) return t(lang).notFoundCategory;
  const m = material ? MATERIAL_GROUPS[material] : null;
  return lang === "en"
    ? `${data.category.nameEn}${m ? ` — ${m.en}` : ""}`
    : `${data.category.nameTh}${m ? ` · ${m.th}` : ""} · ${data.category.nameEn}`;
}

/** Category slugs paired with each material they contain, for prerendering /c/[slug]/[material]. */
export async function categoryMaterialParams() {
  const { getAllSlugs } = await import("@/lib/catalog");
  const out: { slug: string; material: string }[] = [];
  for (const slug of (await getAllSlugs()).categories) {
    const data = await getCategory(slug);
    if (!data) continue;
    for (const m of new Set(data.products.map((p) => p.material).filter(Boolean))) out.push({ slug, material: m! });
  }
  return out;
}

export async function CategoryView({ slug, lang, material }: { slug: string; lang: Lang; material?: MaterialGroup }) {
  const ui = t(lang);
  const data = await getCategory(slug);
  if (!data) notFound();
  const { category, root } = data;
  // material tabs: which materials this category has, and how many of each
  const counts = new Map<MaterialGroup, number>();
  for (const p of data.products) if (p.material) counts.set(p.material as MaterialGroup, (counts.get(p.material as MaterialGroup) ?? 0) + 1);
  const materials = MATERIAL_KEYS.filter((m) => counts.get(m));
  if (material && !counts.get(material)) notFound();
  const products = material ? data.products.filter((p) => p.material === material) : data.products;
  const mat = material ? MATERIAL_GROUPS[material] : null;
  const isSpace = category.id === root.id;
  const primary = (c: { nameTh: string; nameEn: string }) => (lang === "en" ? c.nameEn : c.nameTh);
  // A whole space is laid out like the catalogue's line pages: one titled block per subcategory.
  const groups = isSpace
    ? root.children.map((c) => ({ cat: c, items: products.filter((p) => p.categoryId === c.id) })).filter((g) => g.items.length)
    : [{ cat: category, items: products }];

  return (
    <main>
      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-10 sm:px-6">
          <nav className="eyebrow font-normal text-muted">
            <Link href={href(lang, "/")} className="hover:text-accent">
              {ui.home}
            </Link>
            {!isSpace && (
              <>
                {" / "}
                <Link href={href(lang, `/c/${root.slug}`)} className="hover:text-accent">
                  {root.nameEn}
                </Link>
              </>
            )}
          </nav>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <div>
              <h1 className="display text-4xl sm:text-6xl">
                {category.nameEn}
                {mat && <span className="text-muted"> — {mat.en}</span>}
              </h1>
              <div className="mt-1 text-2xl font-light">
                {category.nameTh}
                {mat && ` · ${mat.th}`}
              </div>
            </div>
            <div className="text-sm lg:text-right">
              {isSpace && SPACE_COPY[root.slug] && (
                <p className="lg:ml-auto lg:max-w-md">{lang === "en" ? SPACE_COPY[root.slug].en : SPACE_COPY[root.slug].th}</p>
              )}
              <p className="font-num mt-2 text-muted tabular-nums">{ui.items(products.length)}</p>
            </div>
          </div>
          {/* subcategory chips: one swipeable row on phones, wrapping on larger screens */}
          <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <Link
              href={href(lang, `/c/${root.slug}`)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${isSpace ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`}
            >
              {ui.all}
            </Link>
            {root.children.map((c) => (
              <Link
                key={c.slug}
                href={href(lang, `/c/${c.slug}`)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${
                  c.slug === category.slug ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"
                }`}
              >
                {primary(c)} <span className="font-num opacity-60">{c.products}</span>
              </Link>
            ))}
          </div>
          {/* material tabs: e.g. Storage → Steel / Wood */}
          {materials.length > 1 && (
            <div className="scrollbar-none -mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <span className="eyebrow mr-1 shrink-0 text-muted">{lang === "en" ? "Material" : "วัสดุ"}</span>
              <Link
                href={href(lang, `/c/${category.slug}`)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${!material ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"}`}
              >
                {lang === "en" ? "All materials" : "ทุกวัสดุ"}
              </Link>
              {materials.map((m) => (
                <Link
                  key={m}
                  href={href(lang, `/c/${category.slug}/${m}`)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${
                    m === material ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"
                  }`}
                >
                  {MATERIAL_GROUPS[m][lang]} <span className="font-num opacity-60">{counts.get(m)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6">
        {groups.map(({ cat, items }) => (
          <section key={cat.slug}>
            {isSpace && (
              <h2 className="mb-6 flex items-baseline gap-3">
                <Link href={href(lang, `/c/${cat.slug}`)} className="eyebrow text-sm hover:text-accent">
                  {cat.nameEn}
                </Link>
                {lang === "th" && <span className="text-muted">{cat.nameTh}</span>}
              </h2>
            )}
            {isSpace ? (
              <ProductGrid products={items} lang={lang} />
            ) : (
              <FilterableGrid
                lang={lang}
                items={items.map(({ slug, materials, widthMax, code }) => ({ slug, materials, widthMax, code }))}
                cards={Object.fromEntries(items.map((p) => [p.slug, <ProductCard key={p.slug} p={p} lang={lang} />]))}
              />
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
