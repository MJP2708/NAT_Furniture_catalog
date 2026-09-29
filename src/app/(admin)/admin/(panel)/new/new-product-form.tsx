"use client";

import { useActionState } from "react";

import { type FormState, createProduct } from "@/app/(admin)/admin/actions";

const input = "w-full rounded border border-line bg-canvas px-3 py-2 outline-none focus:border-accent";

export function NewProductForm({ brands, categories }: { brands: { slug: string; name: string }[]; categories: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProduct, undefined);
  return (
    <form action={action} className="mt-6 space-y-4 text-sm">
      <label className="block">
        <span className="mb-1 block text-muted">ผู้ผลิต · Supplier</span>
        <select name="brand" required className={input} defaultValue="">
          <option value="" disabled>
            — เลือก —
          </option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-muted">รหัสสินค้า · Code</span>
        <input name="code" required className={input} placeholder="เช่น FG 5" />
      </label>
      <label className="block">
        <span className="mb-1 block text-muted">หมวดหมู่ · Category</span>
        <select name="categoryId" required className={input} defaultValue="">
          <option value="" disabled>
            — เลือก —
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {state?.error && <p className="text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded-full bg-ink px-6 py-2 text-canvas hover:bg-accent disabled:opacity-60">
        {pending ? "กำลังสร้าง…" : "สร้างและแก้ไขรายละเอียด →"}
      </button>
    </form>
  );
}
