import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/product-grid";
import { getProduct } from "@/lib/catalog";
import { formatEnvelope, formatRange } from "@/lib/format";
import { href, type Lang, pick, t } from "@/lib/i18n";

const DIM_LABELS = {
  w: ["Width", "กว้าง"],
  d: ["Depth", "ลึก"],
  h: ["Height", "สูง"],
  dia: ["Diameter", "เส้นผ่านศูนย์กลาง"],
  seat_h: ["Seat height", "สูงที่นั่ง"],
  arm_h: ["Arm height", "สูงท้าวแขน"],
} as const;

/** Small marker for text shown in Thai on the English site (no translation yet). */
function ThaiMark({ show }: { show: boolean }) {
  return show ? (
    <span className="ml-1.5 rounded-sm border border-line px-1 align-middle text-[10px] text-muted" title="Thai only">
      TH
    </span>
  ) : null;
}

function Heading({ lang, en, th }: { lang: Lang; en: string; th: string }) {
  return (
    <h2>
      <span className="eyebrow">{en}</span>
      {lang === "th" && <span className="ml-2 text-sm text-muted">{th}</span>}
    </h2>
  );
}

export async function productMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const data = await getProduct(slug);
  if (!data) return { title: t(lang).notFoundProduct };
  const type = pick(lang, data.product.typeTh ?? "", data.product.typeEn).value;
  return {
    title: `${data.product.code} ${type}`.trim(),
    description: `${data.product.code} — ${type}`,
    openGraph: data.images[0] ? { images: [data.images[0].url] } : undefined,
    alternates: { languages: { th: `/p/${slug}`, en: `/en/p/${slug}` } },
  };
}

export async function ProductView({ slug, lang }: { slug: string; lang: Lang }) {
  const ui = t(lang);
  const data = await getProduct(slug);
  if (!data) notFound();
  const { product: p, category, parent, images, siblings } = data;
  const envelope = formatEnvelope(p);
  const type = pick(lang, p.typeTh ?? "", p.typeEn);
  const summary = pick(lang, p.summaryTh ?? "", p.summaryEn);
  const note = pick(lang, p.noteTh ?? "", p.noteEn);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 print:p-0">
      {/* Letterhead for the printed spec sheet */}
      <div className="mb-6 hidden items-baseline justify-between border-b border-ink pb-2 print:flex">
        <span className="display text-xl tracking-[0.3em]">NAT</span>
        <span className="eyebrow text-muted">Specification sheet</span>
      </div>
      <nav className="no-print eyebrow font-normal text-muted">
        <Link href={href(lang, "/")} className="hover:text-accent">
          {ui.home}
        </Link>
        {parent && (
          <>
            {" / "}
            <Link href={href(lang, `/c/${parent.slug}`)} className="hover:text-accent">
              {parent.nameEn}
            </Link>
          </>
        )}
        {category && (
          <>
            {" / "}
            <Link href={href(lang, `/c/${category.slug}`)} className="hover:text-accent">
              {category.nameEn}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] print:grid-cols-[1fr_1fr]">
        {/* Drawings */}
        <div className="space-y-4">
          {images.length ? (
            images.map((im, i) => (
              <div
                key={im.id}
                className={`flex items-center justify-center bg-panel/60 p-6 sm:p-10 ${i === 0 ? "rounded-tl-[3rem]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP sketch */}
                <img
                  src={im.url}
                  alt={ui.drawing(p.code, i + 1)}
                  width={im.width}
                  height={im.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-auto max-h-140 w-auto max-w-full object-contain mix-blend-multiply"
                />
              </div>
            ))
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-tl-[3rem] bg-panel/60 text-muted">{ui.noImage}</div>
          )}
        </div>

        {/* Specification */}
        <div>
          {category && <div className="eyebrow text-muted">{category.nameEn}</div>}
          <h1 className="display mt-2 text-4xl break-words sm:text-6xl">{p.code}</h1>
          {type.value && (
            <p className="mt-3 text-xl font-light">
              {type.value}
              <ThaiMark show={type.fallback} />
            </p>
          )}
          {lang === "th" && p.typeEn && p.typeEn !== p.typeTh && <p className="text-muted">{p.typeEn}</p>}
          {envelope && <p className="font-num mt-5 text-lg tabular-nums">{envelope}</p>}
          {summary.value && (
            <div className="mt-6 max-w-prose space-y-2 text-sm leading-relaxed">
              {summary.value.split("\n").map((para, i) => (
                <p key={i}>
                  {para}
                  {i === 0 && <ThaiMark show={summary.fallback} />}
                </p>
              ))}
            </div>
          )}

          {p.sizes.some((s) => s.mm) && (
            <section className="mt-8">
              <Heading lang={lang} en="Dimensions (cm)" th="ขนาด" />
              <div className="mt-3 space-y-4">
                {p.sizes
                  .filter((s) => s.mm)
                  .map((s, i) => (
                    <div key={i} className="border-t border-ink/60 pt-3">
                      {p.sizes.length > 1 && (
                        <div className="mb-2 text-sm font-medium">{pick(lang, s.label_th, s.label_en).value}</div>
                      )}
                      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
                        {(Object.keys(DIM_LABELS) as (keyof typeof DIM_LABELS)[])
                          .filter((k) => s.mm![k])
                          .map((k) => (
                            <div key={k}>
                              <dt className="text-xs text-muted">
                                <span className="eyebrow font-normal">{DIM_LABELS[k][0]}</span>
                                {lang === "th" && ` ${DIM_LABELS[k][1]}`}
                              </dt>
                              <dd className="display font-num mt-1 text-2xl tabular-nums sm:text-3xl">{formatRange(s.mm![k]!)}</dd>
                            </div>
                          ))}
                      </dl>
                      {lang === "th" && <p className="mt-2 text-xs text-muted">{s.text_th}</p>}
                    </div>
                  ))}
              </div>
            </section>
          )}

          {p.specs.length > 0 && (
            <section className="mt-10">
              <Heading lang={lang} en="Construction" th="รายละเอียดการผลิต" />
              <dl className="mt-3 border-b border-line">
                {p.specs.map((row, i) => {
                  const label = pick(lang, row.label_th, row.label_en);
                  return (
                    <div key={i} className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_1fr]">
                      <dt>
                        <div className="text-sm font-medium">{label.value}</div>
                        {lang === "th" && row.label_en && <div className="eyebrow font-normal text-muted">{row.label_en}</div>}
                      </dt>
                      <dd className="text-sm">
                        {row.values_th.map((v, j) => {
                          const value = pick(lang, v, row.values_en[j]);
                          return (
                            <p key={j}>
                              {value.value}
                              <ThaiMark show={value.fallback} />
                            </p>
                          );
                        })}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}

          {p.featuresTh.length > 0 && (
            <section className="mt-10">
              <Heading lang={lang} en="Features" th="ลักษณะพิเศษ" />
              <ul className="mt-3 space-y-2">
                {p.featuresTh.map((f, i) => {
                  const feature = pick(lang, f, p.featuresEn[i]);
                  return (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="mt-2.5 h-px w-5 shrink-0 bg-ink" />
                      <span>
                        {feature.value}
                        <ThaiMark show={feature.fallback} />
                        {lang === "th" && p.featuresEn[i] && <span className="block text-muted">{p.featuresEn[i]}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {note.value && (
            <p className="mt-8 text-xs text-muted">
              {ui.note}: {note.value}
              <ThaiMark show={note.fallback} />
            </p>
          )}
          <div className="mt-8">
            <a
              href={`/sheet/${lang}/${p.slug}?print=1`}
              target="_blank"
              className="no-print inline-block rounded-full border border-ink px-5 py-2 text-sm hover:border-accent hover:text-accent"
            >
              {ui.print}
            </a>
          </div>
        </div>
      </div>

      {siblings.length > 0 && data.series && (
        <section className="no-print mt-20">
          <h2 className="mb-6 flex items-baseline gap-3">
            <span className="eyebrow text-sm">Series {data.series.name}</span>
            <span className="text-muted">{ui.seriesOthers}</span>
          </h2>
          <ProductGrid products={siblings} lang={lang} />
        </section>
      )}
    </main>
  );
}
