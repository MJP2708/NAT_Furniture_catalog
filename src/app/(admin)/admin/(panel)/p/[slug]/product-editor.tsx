"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { type FormState, type ProductPayload, saveProduct } from "@/app/(admin)/admin/actions";

type Category = { id: number; label: string };
type Dim = "w" | "d" | "h" | "dia" | "seat_h" | "arm_h";
const DIMS: [Dim, string][] = [
  ["w", "กว้าง W"],
  ["d", "ลึก D"],
  ["h", "สูง H"],
  ["dia", "Ø"],
  ["seat_h", "สูงที่นั่ง"],
  ["arm_h", "สูงท้าวแขน"],
];

const input = "w-full rounded border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";
const small = "rounded border border-line px-2 py-1 text-xs hover:border-accent";

export function ProductEditor({
  slug,
  initial,
  categories,
  nextHref,
}: {
  slug: string;
  initial: ProductPayload;
  categories: Category[];
  nextHref: string | null;
}) {
  const [p, setP] = useState(initial);
  const [state, action, pending] = useActionState<FormState, FormData>(saveProduct.bind(null, slug), undefined);
  const router = useRouter();
  const goNext = useRef(false);
  // "Save and next": once the save succeeds, open the next product in the same list.
  useEffect(() => {
    if (state?.saved && goNext.current && nextHref) router.push(nextHref);
    goNext.current = false;
  }, [state, nextHref, router]);
  const set = <K extends keyof ProductPayload>(k: K, v: ProductPayload[K]) => setP((cur) => ({ ...cur, [k]: v }));

  return (
    <form action={action} className="space-y-8 rounded-lg border border-line bg-canvas p-4 sm:p-6">
      <input type="hidden" name="payload" value={JSON.stringify(p)} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="รหัสสินค้า · Code">
          <input className={input} value={p.code} onChange={(e) => set("code", e.target.value)} required />
        </Field>
        <Field label="สถานะ · Status">
          <select className={input} value={p.status} onChange={(e) => set("status", e.target.value as ProductPayload["status"])}>
            <option value="published">เผยแพร่ · Published</option>
            <option value="review">รอตรวจ · Needs review (hidden)</option>
            <option value="hidden">ซ่อน · Hidden</option>
          </select>
        </Field>
        <Field label="ประเภท (ไทย) · Type TH">
          <input className={input} value={p.typeTh ?? ""} onChange={(e) => set("typeTh", e.target.value)} />
        </Field>
        <Field label="Type EN">
          <input className={input} value={p.typeEn ?? ""} onChange={(e) => set("typeEn", e.target.value)} />
        </Field>
        <Field label="คำอธิบายสินค้า · Description TH">
          <textarea className={input} rows={4} value={p.summaryTh ?? ""} onChange={(e) => set("summaryTh", e.target.value)} />
        </Field>
        <Field label="Description EN">
          <textarea className={input} rows={4} value={p.summaryEn ?? ""} onChange={(e) => set("summaryEn", e.target.value)} />
        </Field>
        <Field label="หมวดหมู่ · Category">
          <select
            className={input}
            value={p.categoryId ?? ""}
            onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— ไม่ระบุ —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <section>
        <Heading title="ขนาด · Dimensions (mm)" onAdd={() => set("sizes", [...p.sizes, { label_th: "ขนาด", label_en: "Size", text_th: "", text_en: null, mm: {} }])} />
        <div className="space-y-3">
          {p.sizes.map((s, i) => {
            const upd = (next: Partial<(typeof p.sizes)[number]>) =>
              set("sizes", p.sizes.map((x, j) => (j === i ? { ...x, ...next } : x)));
            return (
              <div key={i} className="rounded border border-line p-3">
                <div className="flex gap-2">
                  <input className={input} value={s.label_th} placeholder="ชื่อชุดขนาด" onChange={(e) => upd({ label_th: e.target.value })} />
                  <button type="button" className={small} onClick={() => set("sizes", p.sizes.filter((_, j) => j !== i))}>
                    ลบ
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DIMS.map(([k, label]) => {
                    const r = s.mm?.[k];
                    const setRange = (idx: 0 | 1, v: string) => {
                      const mm = { ...(s.mm ?? {}) };
                      if (!v && (idx === 0 || !r)) {
                        delete mm[k];
                      } else {
                        const n = Math.round(Number(v) || 0);
                        const cur: [number, number] = r ? [...r] : [n, n];
                        cur[idx] = n;
                        if (idx === 0 && (!r || r[0] === r[1])) cur[1] = n; // single value: max follows min
                        mm[k] = cur;
                      }
                      upd({ mm });
                    };
                    return (
                      <label key={k} className="text-xs text-muted">
                        {label}
                        <span className="mt-1 flex items-center gap-1">
                          <input className={input} inputMode="numeric" value={r?.[0] ?? ""} placeholder="min" onChange={(e) => setRange(0, e.target.value)} />
                          –
                          <input className={input} inputMode="numeric" value={r?.[1] ?? ""} placeholder="max" onChange={(e) => setRange(1, e.target.value)} />
                        </span>
                      </label>
                    );
                  })}
                </div>
                <input className={`${input} mt-2`} value={s.text_th} placeholder="ข้อความขนาดตามแผ่นสเปก" onChange={(e) => upd({ text_th: e.target.value })} />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Heading
          title="รายละเอียดการผลิต · Construction"
          onAdd={() => set("specs", [...p.specs, { label_th: "", label_en: null, values_th: [""], values_en: [null] }])}
        />
        <div className="space-y-3">
          {p.specs.map((row, i) => {
            const upd = (next: Partial<(typeof p.specs)[number]>) =>
              set("specs", p.specs.map((x, j) => (j === i ? { ...x, ...next } : x)));
            const move = (d: -1 | 1) => {
              const next = [...p.specs];
              [next[i], next[i + d]] = [next[i + d], next[i]];
              set("specs", next);
            };
            return (
              <div key={i} className="grid gap-2 rounded border border-line p-3 sm:grid-cols-[12rem_1fr]">
                <div className="space-y-1">
                  <input className={input} value={row.label_th} placeholder="หัวข้อ (ไทย)" onChange={(e) => upd({ label_th: e.target.value })} />
                  <input className={input} value={row.label_en ?? ""} placeholder="Label EN" onChange={(e) => upd({ label_en: e.target.value })} />
                  <div className="flex gap-1">
                    <button type="button" className={small} disabled={i === 0} onClick={() => move(-1)}>↑</button>
                    <button type="button" className={small} disabled={i === p.specs.length - 1} onClick={() => move(1)}>↓</button>
                    <button type="button" className={small} onClick={() => set("specs", p.specs.filter((_, j) => j !== i))}>ลบ</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <textarea
                    className={input}
                    rows={Math.max(2, row.values_th.length)}
                    value={row.values_th.join("\n")}
                    placeholder="รายละเอียด (หนึ่งบรรทัดต่อหนึ่งข้อ)"
                    onChange={(e) => upd({ values_th: e.target.value.split("\n") })}
                  />
                  <textarea
                    className={input}
                    rows={Math.max(1, row.values_en.length)}
                    value={row.values_en.map((v) => v ?? "").join("\n")}
                    placeholder="English (optional, same line order)"
                    onChange={(e) => upd({ values_en: e.target.value.split("\n") })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="ลักษณะพิเศษ (หนึ่งบรรทัดต่อข้อ) · Features TH">
          <textarea className={input} rows={4} defaultValue={p.featuresTh.join("\n")} onChange={(e) => set("featuresTh", e.target.value.split("\n"))} />
        </Field>
        <Field label="Features EN (same order)">
          <textarea className={input} rows={4} defaultValue={p.featuresEn.join("\n")} onChange={(e) => set("featuresEn", e.target.value.split("\n"))} />
        </Field>
        <Field label="หมายเหตุ · Note TH">
          <textarea className={input} rows={2} value={p.noteTh ?? ""} onChange={(e) => set("noteTh", e.target.value)} />
        </Field>
        <Field label="Note EN">
          <textarea className={input} rows={2} value={p.noteEn ?? ""} onChange={(e) => set("noteEn", e.target.value)} />
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6">
        <button type="submit" disabled={pending} className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-accent-ink disabled:opacity-60">
          {pending ? "กำลังบันทึก…" : "บันทึก · Save"}
        </button>
        {nextHref && (
          <button
            type="submit"
            disabled={pending}
            onClick={() => (goNext.current = true)}
            className="rounded-full border border-accent px-5 py-2 text-sm text-accent disabled:opacity-60"
          >
            บันทึกแล้วไปรายการถัดไป →
          </button>
        )}
        {state?.saved && !pending && <span className="text-sm text-green-700">บันทึกแล้ว · Saved</span>}
        {state?.error && <span className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}

function Heading({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-lg">{title}</h2>
      <button type="button" className={small} onClick={onAdd}>
        + เพิ่ม
      </button>
    </div>
  );
}
