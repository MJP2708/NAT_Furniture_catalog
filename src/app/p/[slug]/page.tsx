import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductGrid } from "@/components/product-grid";
import { getAllSlugs, getProduct } from "@/lib/catalog";
import { formatRange } from "@/lib/format";

const DIM_LABELS = { w: "กว้าง W", d: "ลึก D", h: "สูง H", dia: "เส้นผ่านศูนย์กลาง Ø", seat_h: "สูงที่นั่ง", arm_h: "สูงท้าวแขน" } as const;

export async function generateStaticParams() {
  return (await getAllSlugs()).products.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const data = await getProduct((await params).slug);
  if (!data) return { title: "ไม่พบสินค้า" };
  return {
    title: `${data.product.code} ${data.product.typeTh ?? ""}`.trim(),
    description: `${data.brand.name} ${data.product.code} — ${data.product.typeTh ?? ""}`,
    openGraph: data.images[0] ? { images: [data.images[0].url] } : undefined,
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[slug]">) {
  const data = await getProduct((await params).slug);
  if (!data) notFound();
  const { product: p, brand, category, parent, images, siblings } = data;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          หน้าแรก
        </Link>
        {parent && (
          <>
            {" / "}
            <Link href={`/c/${parent.slug}`} className="hover:text-accent">
              {parent.nameTh}
            </Link>
          </>
        )}
        {category && (
          <>
            {" / "}
            <Link href={`/c/${category.slug}`} className="hover:text-accent">
              {category.nameTh}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-4 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        {/* Photos */}
        <div className="space-y-3">
          {images.length ? (
            images.map((im, i) => (
              <div key={im.id} className="flex items-center justify-center rounded-lg border border-line bg-surface p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP */}
                <img
                  src={im.url}
                  alt={`${p.code} รูปที่ ${i + 1}`}
                  width={im.width}
                  height={im.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="h-auto max-h-[520px] w-auto max-w-full object-contain"
                />
              </div>
            ))
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-line bg-surface text-muted">
              ไม่มีรูป
            </div>
          )}
        </div>

        {/* Spec block */}
        <div>
          <Link href={`/brands/${brand.slug}`} className="text-sm font-medium uppercase tracking-wide text-muted hover:text-accent">
            {brand.name}
          </Link>
          <h1 className="text-3xl font-semibold">{p.code}</h1>
          {p.typeTh && <p className="mt-1 text-lg">{p.typeTh}</p>}
          {p.typeEn && p.typeEn !== p.typeTh && <p className="text-muted">{p.typeEn}</p>}

          {p.sizes.length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">ขนาด · Dimensions (mm)</h2>
              <div className="mt-2 space-y-3">
                {p.sizes.map((s, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface p-4">
                    {p.sizes.length > 1 && <div className="mb-2 text-sm font-medium">{s.label_th}</div>}
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      {(Object.keys(DIM_LABELS) as (keyof typeof DIM_LABELS)[])
                        .filter((k) => s.mm?.[k])
                        .map((k) => (
                          <div key={k}>
                            <dt className="text-xs text-muted">{DIM_LABELS[k]}</dt>
                            <dd className="text-lg font-semibold tabular-nums">{formatRange(s.mm![k]!)}</dd>
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
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">รายละเอียดการผลิต · Construction</h2>
              <dl className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                {p.specs.map((row, i) => (
                  <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
                    <dt className="text-sm font-medium">
                      {row.label_th}
                      {row.label_en && <div className="text-xs font-normal text-muted">{row.label_en}</div>}
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
            <section className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">ลักษณะพิเศษ · Features</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {p.featuresTh.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          {p.noteTh && <p className="mt-6 text-xs text-muted">หมายเหตุ: {p.noteTh}</p>}
        </div>
      </div>

      {siblings.length > 0 && data.series && (
        <section className="mt-12">
          <h2 className="mb-3 text-xl font-semibold">
            ซีรีส์ {data.series.name} <span className="text-base font-normal text-muted">รุ่นอื่นในซีรีส์เดียวกัน</span>
          </h2>
          <ProductGrid products={siblings} />
        </section>
      )}
    </main>
  );
}
