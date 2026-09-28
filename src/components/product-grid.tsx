import Link from "next/link";

import type { ProductCard } from "@/lib/catalog";
import { formatEnvelope } from "@/lib/format";

export function ProductGrid({ products }: { products: ProductCard[] }) {
  if (!products.length) return <p className="py-12 text-center text-muted">ไม่พบสินค้า</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/p/${p.slug}`}
            className="group block h-full rounded-lg border border-line bg-surface p-3 transition hover:border-accent"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden">
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- pre-sized WebP thumbnails
                <img src={p.thumb} alt={p.code} loading="lazy" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-muted">ไม่มีรูป</span>
              )}
            </div>
            <div className="mt-2 text-xs uppercase tracking-wide text-muted">{p.brand}</div>
            <div className="font-medium group-hover:text-accent">{p.code}</div>
            <div className="line-clamp-2 text-sm text-muted">{p.typeTh}</div>
            {formatEnvelope(p) && <div className="mt-1 text-xs tabular-nums text-muted">{formatEnvelope(p)}</div>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
