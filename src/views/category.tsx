import Link from "next/link";
import { notFound } from "next/navigation";

import { FilterableGrid } from "@/components/filterable-grid";
import { ProductCard, ProductGrid } from "@/components/product-grid";
import { getCategory } from "@/lib/catalog";
import { SPACE_COPY } from "@/lib/copy";
import { href, type Lang, t } from "@/lib/i18n";

export async function categoryTitle(slug: string, lang: Lang) {
  const data = await getCategory(slug);
  if (!data) return t(lang).notFoundCategory;
  return lang === "en" ? data.category.nameEn : `${data.category.nameTh} · ${data.category.nameEn}`;
}

export async function CategoryView({ slug, lang }: { slug: string; lang: Lang }) {
  const ui = t(lang);
  const data = await getCategory(slug);
  if (!data) notFound();
  const { category, root, products } = data;
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
              <h1 className="display text-5xl sm:text-6xl">{category.nameEn}</h1>
              <div className="mt-1 text-2xl font-light">{category.nameTh}</div>
            </div>
            <div className="text-sm lg:text-right">
              {isSpace && SPACE_COPY[root.slug] && (
                <p className="lg:ml-auto lg:max-w-md">{lang === "en" ? SPACE_COPY[root.slug].en : SPACE_COPY[root.slug].th}</p>
              )}
              <p className="font-num mt-2 text-muted tabular-nums">{ui.items(products.length)}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link
              href={href(lang, `/c/${root.slug}`)}
              className={`rounded-full border px-3 py-1 text-sm ${isSpace ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`}
            >
              {ui.all}
            </Link>
            {root.children.map((c) => (
              <Link
                key={c.slug}
                href={href(lang, `/c/${c.slug}`)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  c.slug === category.slug ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"
                }`}
              >
                {primary(c)} <span className="font-num opacity-60">{c.products}</span>
              </Link>
            ))}
          </div>
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
