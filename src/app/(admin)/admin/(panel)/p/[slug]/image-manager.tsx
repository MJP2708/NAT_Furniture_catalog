"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { moveImage, removeImage } from "@/app/(admin)/admin/actions";

type Img = { id: number; url: string; width: number; height: number };

const btn = "rounded border border-line bg-canvas px-2 py-0.5 text-xs hover:border-accent disabled:opacity-40";

/** The product's drawings: first one is the cover (cards, PDF). Reorder or remove wrong crops. */
export function ImageManager({ images, code }: { images: Img[]; code: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) => start(async () => (await fn(), router.refresh()));

  if (!images.length)
    return (
      <div className="flex aspect-4/3 items-center justify-center rounded-lg border border-dashed border-line bg-canvas text-sm text-muted">
        ไม่มีภาพ
      </div>
    );
  return (
    <div className={`space-y-2 ${pending ? "opacity-60" : ""}`}>
      {images.map((im, i) => (
        <figure key={im.id} className="overflow-hidden rounded-lg border border-line bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin preview */}
          <img src={im.url} alt={`${code} ${i + 1}`} className="mx-auto max-h-64 w-auto object-contain p-2" />
          <figcaption className="flex items-center gap-1 border-t border-line px-2 py-1.5">
            <span className="mr-auto text-xs text-muted">{i === 0 ? "ภาพหลัก" : `ภาพที่ ${i + 1}`}</span>
            <button type="button" className={btn} disabled={pending || i === 0} onClick={() => run(() => moveImage(im.id, -1))} aria-label="เลื่อนขึ้น">
              ↑
            </button>
            <button
              type="button"
              className={btn}
              disabled={pending || i === images.length - 1}
              onClick={() => run(() => moveImage(im.id, 1))}
              aria-label="เลื่อนลง"
            >
              ↓
            </button>
            <button
              type="button"
              className={`${btn} text-red-700`}
              disabled={pending}
              onClick={() => confirm("นำภาพนี้ออกจากสินค้า?") && run(() => removeImage(im.id))}
            >
              นำออก
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
