import Link from "next/link";

import { formatEnvelope } from "@/lib/format";
import { href, type Lang, pick, t } from "@/lib/i18n";
import {
  getOfficeCategory,
  getOfficeContents,
  groupsOf,
  type MainCategory,
  OFFICE_CATALOGUE_PDF,
  OFFICE_TAXONOMY,
  type OfficeCard,
  rangeAnchor,
} from "@/lib/office-catalogue";

const COPY = {
  th: {
    title: "แคตตาล็อกเฟอร์นิเจอร์",
    lead: "เลือกหมวดสินค้า แล้วเลือกการใช้งานและวัสดุ แตะสินค้าเพื่อดูขนาด วัสดุ และสเปกครบทุกชิ้น ใช้รหัสแคตตาล็อก (เช่น CH-TSK-NT-01) เมื่อขอใบเสนอราคา",
    pdf: "ดาวน์โหลด PDF (มีลิงก์และบุ๊กมาร์ก)",
    contents: "สารบัญ",
    products: (n: number) => `${n} รายการ`,
    seeAlso: "ดูเพิ่มเติม · อยู่ในหมวดอื่นด้วย",
    empty: "ยังไม่ได้สร้างแคตตาล็อก",
    prev: "หมวดก่อนหน้า",
    next: "หมวดถัดไป",
    top: "กลับด้านบน",
  },
  en: {
    title: "Furniture E-Catalogue",
    lead: "Pick a category, then a use and a material; tap any product for its sizes, materials and full specification. Quote the catalogue code (e.g. CH-TSK-NT-01) when asking for a price.",
    pdf: "Download the PDF (with links and bookmarks)",
    contents: "Contents",
    products: (n: number) => `${n} products`,
    seeAlso: "See also · also listed under another range",
    empty: "The catalogue has not been generated yet.",
    prev: "Previous category",
    next: "Next category",
    top: "Back to top",
  },
};

/** "Task & Staff Chairs · Net / Mesh" for a range code. */
function fullName(m: MainCategory, code: string, lang: Lang) {
  const r = m.subs.find((s) => s.code === code);
  if (!r) return lang === "en" ? m.en : m.th;
  const g = r.group.code !== r.code ? (lang === "en" ? r.group.en : r.group.th) + " · " : "";
  return g + (lang === "en" ? r.en : r.th);
}

/** Category tabs: one swipeable row on phones, a full row from tablets up. */
function CategoryTabs({ lang, active }: { lang: Lang; active?: MainCategory }) {
  return (
    <nav
      aria-label="Catalogue categories"
      className="no-print border-b border-line bg-canvas"
    >
      <ul className="scrollbar-none mx-auto flex max-w-7xl gap-1.5 overflow-x-auto px-4 py-2 sm:px-6 lg:flex-wrap lg:overflow-visible">
        <li className="shrink-0">
          <Link
            href={href(lang, "/catalogue")}
            className={`block rounded-full border px-3 py-1.5 text-xs whitespace-nowrap sm:text-sm ${
              active ? "border-line hover:border-ink" : "border-ink bg-ink text-canvas"
            }`}
          >
            {COPY[lang].contents}
          </Link>
        </li>
        {OFFICE_TAXONOMY.map((m) => {
          const on = m.code === active?.code;
          return (
            <li key={m.code} className="shrink-0">
              <Link
                href={href(lang, `/catalogue/${m.code.toLowerCase()}`)}
                aria-current={on ? "page" : undefined}
                style={{ borderColor: m.accent, background: on ? m.accent : undefined, color: on ? "#fff" : m.accent }}
                className="block rounded-full border px-3 py-1.5 text-xs whitespace-nowrap hover:opacity-80 sm:text-sm"
              >
                <span className="font-num mr-1.5 opacity-70">{String(m.n).padStart(2, "0")}</span>
                {lang === "en" ? m.tab : m.th}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Card({ p, lang, accent, dashed }: { p: OfficeCard; lang: Lang; accent: string; dashed?: boolean }) {
  const size = formatEnvelope(p);
  return (
    <Link
      href={href(lang, `/p/${p.slug}`)}
      className={`group flex h-full flex-col rounded-lg border bg-surface p-2.5 transition hover:shadow-md sm:p-3 ${
        dashed ? "border-dashed border-muted" : "border-line hover:border-current"
      }`}
      style={{ color: accent }}
    >
      <div className="flex aspect-4/3 items-center justify-center overflow-hidden">
        {p.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP sketches
          <img
            src={p.thumb}
            alt={p.code}
            loading="lazy"
            className="max-h-full max-w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="text-xs text-muted">{t(lang).noImage}</span>
        )}
      </div>
      <div className="mt-2 border-t border-line pt-2">
        <div className="font-num text-sm font-semibold">{p.catalogueCode}</div>
        <div className="truncate text-xs text-ink">{p.code}</div>
        <div className="line-clamp-1 text-xs text-muted">{pick(lang, p.typeTh, p.typeEn).value}</div>
        {size && <div className="font-num mt-0.5 text-[11px] text-muted tabular-nums">{size}</div>}
      </div>
    </Link>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {children}
    </ul>
  );
}

export async function OfficeContentsView({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const tiles = await getOfficeContents();
  const total = tiles.reduce((n, x) => n + x.count, 0);
  return (
    <main>
      <CategoryTabs lang={lang} />
      <section className="mx-auto max-w-7xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12">
        <h1 className="display text-3xl sm:text-5xl">{c.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">{c.lead}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={OFFICE_CATALOGUE_PDF}
            className="inline-flex justify-center rounded-full bg-accent px-5 py-2.5 text-sm text-accent-ink hover:opacity-90"
          >
            {c.pdf}
          </a>
          <span className="font-num text-sm text-muted">{c.products(total)}</span>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        {total === 0 && <p className="py-12 text-center text-muted">{c.empty}</p>}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(({ main: m, count, cover }) => (
            <li key={m.code}>
              <Link
                href={href(lang, `/catalogue/${m.code.toLowerCase()}`)}
                className="group flex h-full flex-col overflow-hidden rounded-xl border-2 bg-surface transition hover:shadow-lg"
                style={{ borderColor: m.accent }}
              >
                <div className="flex aspect-16/10 items-center justify-center p-4 sm:aspect-4/3">
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP sketches
                    <img
                      src={cover}
                      alt=""
                      className="max-h-full max-w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.04]"
                    />
                  )}
                </div>
                <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: m.accent }}>
                  <span className="font-num text-2xl font-semibold">{String(m.n).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold uppercase tracking-wide">{m.en}</span>
                    <span className="block truncate text-xs opacity-90">
                      {m.th} · {m.code} · {c.products(count)}
                    </span>
                  </span>
                  <span aria-hidden className="text-lg transition group-hover:translate-x-1">
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export async function OfficeCategoryView({ main: m, lang }: { main: MainCategory; lang: Lang }) {
  const c = COPY[lang];
  const ranges = await getOfficeCategory(m);
  const total = ranges.reduce((n, r) => n + r.items.length, 0);
  const i = OFFICE_TAXONOMY.indexOf(m);
  const prev = OFFICE_TAXONOMY[i - 1];
  const next = OFFICE_TAXONOMY[i + 1];
  return (
    <main id="top">
      <CategoryTabs lang={lang} active={m} />
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
        <div className="flex flex-col gap-4 rounded-xl p-5 text-white sm:flex-row sm:items-end sm:p-8" style={{ background: m.accent }}>
          <span className="font-num text-5xl leading-none font-semibold sm:text-7xl">{String(m.n).padStart(2, "0")}</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold uppercase tracking-wide break-words sm:text-4xl">{m.en}</h1>
            <p className="text-base opacity-90 sm:text-lg">
              {m.th} · <span className="font-num">{m.code}</span> · {c.products(total)}
            </p>
          </div>
        </div>
        {m.subs.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupsOf(m).map((g) => {
              const inGroup = ranges.filter(({ range }) => g.ranges.some((r) => r.code === range.code));
              const n = inGroup.reduce((k, r) => k + r.items.length, 0);
              if (!n) return null;
              return (
                <div key={g.code} className="rounded-lg border-2 bg-surface p-3" style={{ borderColor: m.accent }}>
                  <a href={`#${rangeAnchor(inGroup[0].range.code)}`} className="block hover:underline">
                    <span className="font-num text-xs font-semibold" style={{ color: m.accent }}>
                      {g.code}
                    </span>{" "}
                    <span className="text-sm font-semibold">{lang === "en" ? g.en : g.th}</span>{" "}
                    <span className="font-num text-xs text-muted">{n}</span>
                  </a>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {inGroup.map(({ range, items }) =>
                      items.length ? (
                        <li key={range.code}>
                          <a
                            href={`#${rangeAnchor(range.code)}`}
                            className="block rounded-full border px-2.5 py-1 text-xs hover:opacity-80"
                            style={{ borderColor: m.accent, color: m.accent }}
                          >
                            {lang === "en" ? range.en : range.th} <span className="font-num opacity-70">{items.length}</span>
                          </a>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 sm:px-6">
        {ranges.map(({ range, items, seeAlso }) =>
          items.length || seeAlso.length ? (
            <section key={range.code} id={rangeAnchor(range.code)} className="scroll-mt-32">
              {m.subs.length > 0 && (
                <h2 className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-4 pl-3" style={{ borderColor: m.accent }}>
                  <span className="font-num text-sm font-semibold" style={{ color: m.accent }}>
                    {range.code}
                  </span>
                  <span className="text-lg font-semibold">{fullName(m, range.code, "en")}</span>
                  <span className="text-sm text-muted">{fullName(m, range.code, "th")}</span>
                  <span className="font-num text-sm text-muted">{items.length}</span>
                </h2>
              )}
              <Grid>
                {items.map((p) => (
                  <li key={p.slug}>
                    <Card p={p} lang={lang} accent={m.accent} />
                  </li>
                ))}
              </Grid>
              {seeAlso.length > 0 && (
                <>
                  <h3 className="mt-8 mb-3 text-sm text-muted">{c.seeAlso}</h3>
                  <Grid>
                    {seeAlso.map((p) => (
                      <li key={p.slug}>
                        <Card p={p} lang={lang} accent={m.accent} dashed />
                      </li>
                    ))}
                  </Grid>
                </>
              )}
            </section>
          ) : null,
        )}
        {total === 0 && <p className="py-12 text-center text-muted">{c.empty}</p>}
        <nav className="no-print grid grid-cols-2 gap-3 border-t border-line pt-6 text-sm sm:grid-cols-3">
          {prev ? (
            <Link href={href(lang, `/catalogue/${prev.code.toLowerCase()}`)} className="rounded-lg border border-line p-3 hover:border-ink">
              <span className="block text-xs text-muted">← {c.prev}</span>
              {lang === "en" ? prev.en : prev.th}
            </Link>
          ) : (
            <span />
          )}
          <a href="#top" className="hidden rounded-lg border border-line p-3 text-center hover:border-ink sm:block">
            ↑ {c.top}
          </a>
          {next ? (
            <Link
              href={href(lang, `/catalogue/${next.code.toLowerCase()}`)}
              className="rounded-lg border border-line p-3 text-right hover:border-ink"
            >
              <span className="block text-xs text-muted">{c.next} →</span>
              {lang === "en" ? next.en : next.th}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </main>
  );
}
