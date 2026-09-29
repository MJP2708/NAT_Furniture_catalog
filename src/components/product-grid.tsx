import Link from "next/link";

import type { ProductCard } from "@/lib/catalog";
import { formatEnvelope } from "@/lib/format";

/** Catalogue "line" layout: sketch, hairline rule, code, type and size in cm. */
export function ProductGrid({ products }: { products: ProductCard[] }) {
  if (!products.length) return <p className="py-12 text-center text-muted">ไม่พบสินค้า</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p) => (
        <li key={p.slug}>
          <Link href={`/p/${p.slug}`} className="group block">
            <div className="flex aspect-4/3 items-end justify-center overflow-hidden pb-3">
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP sketches
                <img
                  src={p.thumb}
                  alt={p.code}
                  loading="lazy"
                  className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="self-center text-sm text-muted">ไม่มีภาพ</span>
              )}
            </div>
            <div className="border-t border-ink/60 pt-2">
              <div className="display text-base font-normal group-hover:text-accent">{p.code}</div>
              <div className="line-clamp-1 text-sm text-muted">{p.typeTh}</div>
              {formatEnvelope(p) && (
                <div className="mt-0.5 font-num text-xs tabular-nums text-muted">
                  {formatEnvelope(p)}
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
