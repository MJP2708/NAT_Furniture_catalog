import Link from "next/link";

import { SearchBox } from "@/components/search-box";
import { getCategoryTree } from "@/lib/catalog";
import { E_CATALOGUE_URL, SPACE_COPY } from "@/lib/copy";
import { href, type Lang, t } from "@/lib/i18n";

const HERO_CATEGORIES = ["office-chairs", "sofas", "waiting-chairs", "armchairs"];

// Staggered 2x2 arrangement, like furniture set out across a studio floor.
const HERO_SLOTS: React.CSSProperties[] = [
  { left: "0%", top: "0%", width: "44%", height: "52%" },
  { left: "48%", top: "6%", width: "52%", height: "44%" },
  { left: "4%", top: "56%", width: "50%", height: "44%" },
  { left: "58%", top: "52%", width: "38%", height: "48%" },
];

export async function HomeView({ lang }: { lang: Lang }) {
  const ui = t(lang);
  const tree = (await getCategoryTree()).filter((r) => r.total > 0);
  const total = tree.reduce((n, r) => n + r.total, 0);
  const subcats = tree.flatMap((r) => r.children);
  const heroSketches = HERO_CATEGORIES.map((slug) => subcats.find((c) => c.slug === slug)?.cover)
    .filter((c): c is string => !!c)
    .slice(0, 4);
  // Primary / secondary names: the page language first, the other one quietly beside it.
  const names = (c: { nameTh: string; nameEn: string }) => (lang === "en" ? [c.nameEn, c.nameTh] : [c.nameTh, c.nameEn]);

  return (
    <main>
      {/* Hero */}
      <section className="wash relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-24">
          <div>
            <div className="eyebrow text-muted">NAT Furniture · E-Catalogue</div>
            <h1 className="display mt-4 text-[2.6rem] whitespace-pre-line sm:text-7xl">{ui.heroTitle}</h1>
            <p className="mt-6 max-w-md text-lg">{ui.heroLead}</p>
            <p className="mt-2 max-w-md text-sm text-muted">{ui.heroSub(total)}</p>
            <SearchBox lang={lang} className="mt-8 max-w-md" />
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href={href(lang, "/c/office")} className="rounded-full bg-ink px-5 py-2 text-canvas hover:bg-accent">
                {ui.browseAll}
              </Link>
              <a href={E_CATALOGUE_URL} className="rounded-full border border-ink px-5 py-2 hover:border-accent hover:text-accent">
                {ui.downloadCatalogue}
              </a>
            </div>
          </div>
          <div className="relative hidden h-105 lg:block" aria-hidden>
            {heroSketches.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- decorative sketch collage
              <img key={src} src={src} alt="" className="absolute object-contain mix-blend-multiply" style={HERO_SLOTS[i]} />
            ))}
          </div>
        </div>
      </section>

      {/* Index, numbered like a catalogue contents page */}
      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="eyebrow text-muted">Spaces</div>
          <h2 className="display mt-2 text-4xl">{ui.spacesTitle}</h2>
          <p className="mt-3 max-w-sm text-sm text-muted">{ui.spacesLead}</p>
        </div>
        <ol className="space-y-3">
          {tree.map((root, i) => {
            const [primary, secondary] = names(root);
            return (
              <li key={root.slug}>
                <Link href={`#${root.slug}`} className="group flex items-baseline gap-4">
                  <span className="font-num w-8 text-sm tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="hidden h-px w-16 -translate-y-1 bg-ink/50 transition-all group-hover:w-24 group-hover:bg-accent sm:block" />
                  <span className="display text-xl group-hover:text-accent">{lang === "en" ? primary : root.nameEn}</span>
                  <span className="whitespace-nowrap text-muted">{lang === "en" ? secondary : root.nameTh}</span>
                  <span className="font-num ml-auto text-sm tabular-nums text-muted">{root.total}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* One section per space */}
      {tree.map((root, i) => {
        const copy = SPACE_COPY[root.slug];
        return (
          <section key={root.slug} id={root.slug} className={i % 2 ? "bg-panel" : ""}>
            <div className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
                <div>
                  <div className="font-num text-sm tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</div>
                  <h2 className="display mt-2 text-4xl sm:text-6xl">{root.nameEn}</h2>
                  <div className="mt-1 text-2xl font-light">{root.nameTh}</div>
                </div>
                <div className="lg:pt-8">
                  {copy && (
                    <>
                      <p>{lang === "en" ? copy.en : copy.th}</p>
                      <p className="mt-3 text-sm text-muted">{lang === "en" ? copy.th : copy.en}</p>
                    </>
                  )}
                  <Link href={href(lang, `/c/${root.slug}`)} className="mt-5 inline-block text-sm font-medium text-accent hover:underline">
                    {ui.viewAll(root.total)}
                  </Link>
                </div>
              </div>
              <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                {root.children.map((c) => {
                  const [primary, secondary] = names(c);
                  return (
                    <li key={c.slug}>
                      <Link href={href(lang, `/c/${c.slug}`)} className="group block">
                        <div className="flex aspect-4/3 items-end justify-center pb-3">
                          {c.cover && (
                            // eslint-disable-next-line @next/next/no-img-element -- category sketch
                            <img
                              src={c.cover}
                              alt=""
                              loading="lazy"
                              className="max-h-full max-w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-[1.03]"
                            />
                          )}
                        </div>
                        <div className="border-t border-ink/60 pt-2">
                          <div className="font-medium group-hover:text-accent">{primary}</div>
                          <div className="flex justify-between text-sm text-muted">
                            <span className={lang === "en" ? "" : "eyebrow font-normal"}>{secondary}</span>
                            <span className="font-num tabular-nums">{c.products}</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}

      {/* E-catalogue panel */}
      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-6">
        <div className="grid overflow-hidden rounded-tr-[4rem] md:grid-cols-2">
          <div className="wash flex min-h-64 flex-col justify-end p-8 sm:p-12">
            <div className="eyebrow text-muted">Download</div>
            <h2 className="display mt-2 text-5xl">E-Catalogue</h2>
          </div>
          <div className="flex flex-col justify-center bg-panel p-8 sm:p-12">
            <p>{ui.catalogueLead}</p>
            <a href={E_CATALOGUE_URL} className="mt-6 self-start rounded-full bg-ink px-6 py-2 text-sm text-canvas hover:bg-accent">
              {ui.downloadPdf}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
