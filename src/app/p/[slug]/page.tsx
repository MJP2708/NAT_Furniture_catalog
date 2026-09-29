import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { ProductGrid } from "@/components/product-grid";
import { getAllSlugs, getProduct } from "@/lib/catalog";
import { formatEnvelope, formatRange } from "@/lib/format";

const DIM_LABELS = {
  w: ["Width", "กว้าง"],
  d: ["Depth", "ลึก"],
  h: ["Height", "สูง"],
  dia: ["Diameter", "เส้นผ่านศูนย์กลาง"],
  seat_h: ["Seat height", "สูงที่นั่ง"],
  arm_h: ["Arm height", "สูงท้าวแขน"],
} as const;

export async function generateStaticParams() {
  return (await getAllSlugs()).products.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const data = await getProduct((await params).slug);
  if (!data) return { title: "ไม่พบสินค้า" };
  return {
    title: `${data.product.code} ${data.product.typeTh ?? ""}`.trim(),
    description: `${data.product.code} — ${data.product.typeTh ?? ""}`,
    openGraph: data.images[0] ? { images: [data.images[0].url] } : undefined,
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const data = await getProduct((await params).slug);
  if (!data) notFound();
  const { product: p, category, parent, images, siblings } = data;
  const envelope = formatEnvelope(p);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 print:p-0">
      {/* Letterhead for the printed spec sheet */}
      <div className="mb-6 hidden items-baseline justify-between border-b border-ink pb-2 print:flex">
        <span className="display text-xl tracking-[0.3em]">NAT</span>
        <span className="eyebrow text-muted">Specification sheet</span>
      </div>
      <nav className="no-print eyebrow font-normal text-muted">
        <Link href="/" className="hover:text-accent">
          Home
        </Link>
        {parent && (
          <>
            {" / "}
            <Link href={`/c/${parent.slug}`} className="hover:text-accent">
              {parent.nameEn}
            </Link>
          </>
        )}
        {category && (
          <>
            {" / "}
            <Link href={`/c/${category.slug}`} className="hover:text-accent">
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
                  alt={`${p.code} แบบร่างที่ ${i + 1}`}
                  width={im.width}
                  height={im.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-auto max-h-140 w-auto max-w-full object-contain mix-blend-multiply"
                />
              </div>
            ))
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-tl-[3rem] bg-panel/60 text-muted">ไม่มีภาพ</div>
          )}
        </div>

        {/* Specification */}
        <div>
          {category && <div className="eyebrow text-muted">{category.nameEn}</div>}
          <h1 className="display mt-2 text-5xl sm:text-6xl">{p.code}</h1>
          {p.typeTh && <p className="mt-3 text-xl font-light">{p.typeTh}</p>}
          {p.typeEn && p.typeEn !== p.typeTh && <p className="text-muted">{p.typeEn}</p>}
          {envelope && <p className="font-num mt-5 text-lg tabular-nums">{envelope}</p>}

          {p.sizes.some((s) => s.mm) && (
            <section className="mt-8">
              <h2><span className="eyebrow">Dimensions (cm)</span> <span className="ml-1 text-sm text-muted">ขนาด</span></h2>
              <div className="mt-3 space-y-4">
                {p.sizes
                  .filter((s) => s.mm)
                  .map((s, i) => (
                    <div key={i} className="border-t border-ink/60 pt-3">
                      {p.sizes.length > 1 && <div className="mb-2 text-sm font-medium">{s.label_th}</div>}
                      <dl className="grid grid-cols-3 gap-4">
                        {(Object.keys(DIM_LABELS) as (keyof typeof DIM_LABELS)[])
                          .filter((k) => s.mm![k])
                          .map((k) => (
                            <div key={k}>
                              <dt className="text-xs text-muted">
                                <span className="eyebrow font-normal">{DIM_LABELS[k][0]}</span> {DIM_LABELS[k][1]}
                              </dt>
                              <dd className="display font-num mt-1 text-3xl tabular-nums">{formatRange(s.mm![k]!)}</dd>
                            </div>
                          ))}
                      </dl>
                      <p className="mt-2 text-xs text-muted">{s.text_th}</p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {p.specs.length > 0 && (
            <section className="mt-10">
              <h2><span className="eyebrow">Construction</span> <span className="ml-1 text-sm text-muted">รายละเอียดการผลิต</span></h2>
              <dl className="mt-3 border-b border-line">
                {p.specs.map((row, i) => (
                  <div key={i} className="grid gap-1 border-t border-line py-3 sm:grid-cols-[10rem_1fr]">
                    <dt>
                      <div className="text-sm font-medium">{row.label_th}</div>
                      {row.label_en && <div className="eyebrow font-normal text-muted">{row.label_en}</div>}
                    </dt>
                    <dd className="text-sm">
                      {row.values_th.map((v, j) => (
                        <p key={j}>{v}</p>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {p.featuresTh.length > 0 && (
            <section className="mt-10">
              <h2><span className="eyebrow">Features</span> <span className="ml-1 text-sm text-muted">ลักษณะพิเศษ</span></h2>
              <ul className="mt-3 space-y-2">
                {p.featuresTh.map((f, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-2.5 h-px w-5 shrink-0 bg-ink" />
                    <span>
                      {f}
                      {p.featuresEn[i] && <span className="block text-muted">{p.featuresEn[i]}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.noteTh && <p className="mt-8 text-xs text-muted">หมายเหตุ: {p.noteTh}</p>}
          <div className="mt-8">
            <PrintButton />
          </div>
        </div>
      </div>

      {siblings.length > 0 && data.series && (
        <section className="no-print mt-20">
          <h2 className="mb-6 flex items-baseline gap-3">
            <span className="eyebrow text-sm">Series {data.series.name}</span>
            <span className="text-muted">รุ่นอื่นในซีรีส์เดียวกัน</span>
          </h2>
          <ProductGrid products={siblings} />
        </section>
      )}
    </main>
  );
}
