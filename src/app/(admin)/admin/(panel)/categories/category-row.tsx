"use client";

import Link from "next/link";
import { useActionState } from "react";

import { type FormState, saveCategory } from "@/app/(admin)/admin/actions";

type Cat = { id: number; slug: string; nameTh: string; nameEn: string; sort: number; products: number };

const input = "rounded border border-line px-2 py-1.5 outline-none focus:border-accent";

export function CategoryRow({ cat, isRoot = false }: { cat: Cat; isRoot?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCategory, undefined);
  return (
    <form action={action} className={`grid items-center gap-2 p-3 text-sm sm:grid-cols-[1.3fr_1.3fr_5rem_7rem_auto] ${isRoot ? "bg-panel/40" : "pl-8"}`}>
      <input type="hidden" name="id" value={cat.id} />
      <input name="nameTh" defaultValue={cat.nameTh} aria-label="ชื่อภาษาไทย" className={`${input} ${isRoot ? "font-medium" : ""}`} />
      <input name="nameEn" defaultValue={cat.nameEn} aria-label="English name" className={input} />
      <input name="sort" type="number" defaultValue={cat.sort} aria-label="ลำดับ" className={`${input} font-num`} />
      {isRoot ? (
        <span className="text-xs text-muted">{cat.slug}</span>
      ) : (
        <Link href={`/admin?category=${cat.slug}`} className="font-num text-xs text-accent hover:underline">
          {cat.products} สินค้า →
        </Link>
      )}
      <div className="flex items-center gap-2">
        <button disabled={pending} className="rounded-full border border-ink px-3 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-60">
          {pending ? "…" : "บันทึก"}
        </button>
        {state?.saved && !pending && <span className="text-xs text-emerald-700">✓</span>}
        {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
