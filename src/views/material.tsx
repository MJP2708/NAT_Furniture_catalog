import Link from "next/link";

import { ProductGrid } from "@/components/product-grid";
import { getCategoryCounts, getMaterialProducts } from "@/lib/catalog";
import { href, type Lang, t } from "@/lib/i18n";
import { MATERIAL_GROUPS, MATERIAL_KEYS, type MaterialGroup } from "@/lib/material";

/** Every product of one main material, grouped by category (e.g. all steel furniture). */
export async function MaterialView({ material, lang }: { material: MaterialGroup; lang: Lang }) {
  const ui = t(lang);
  const [items, cats] = await Promise.all([getMaterialProducts(material), getCategoryCounts()]);
  const m = MATERIAL_GROUPS[material];
  const groups = cats
    .filter((c) => c.parentId !== null)
    .map((c) => ({ cat: c, items: items.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length);
  return (
    <main>
      <section className="border-b border-line">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-10 sm:px-6">
          <nav className="eyebrow font-normal text-muted">
            <Link href={href(lang, "/")} className="hover:text-accent">
              {ui.home}
            </Link>
            {" / "}
            {lang === "en" ? "Materials" : "วัสดุ"}
          </nav>
          <h1 className="display mt-6 text-4xl sm:text-6xl">{m.en}</h1>
          <div className="mt-1 text-2xl font-light">{m.th}</div>
          <p className="font-num mt-2 text-sm text-muted tabular-nums">{ui.items(items.length)}</p>
          <div className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {MATERIAL_KEYS.map((k) => (
              <Link
                key={k}
                href={href(lang, `/material/${k}`)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${
                  k === material ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"
                }`}
              >
                {MATERIAL_GROUPS[k][lang]}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6">
        {groups.map(({ cat, items: list }) => (
          <section key={cat.slug}>
            <h2 className="mb-6 flex flex-wrap items-baseline gap-3">
              <Link href={href(lang, `/c/${cat.slug}/${material}`)} className="eyebrow text-sm hover:text-accent">
                {cat.nameEn}
              </Link>
              {lang === "th" && <span className="text-muted">{cat.nameTh}</span>}
              <span className="font-num text-sm text-muted">{list.length}</span>
            </h2>
            <ProductGrid products={list} lang={lang} />
          </section>
        ))}
      </div>
    </main>
  );
}
