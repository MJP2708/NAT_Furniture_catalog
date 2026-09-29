"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { type BulkState, bulkUpdate } from "@/app/(admin)/admin/actions";

type Row = {
  slug: string;
  code: string;
  typeTh: string | null;
  status: "published" | "review" | "hidden";
  editedAt: string | null;
  brand: string;
  category: string | null;
  thumb: string | null;
  flagLabels: { key: string; th: string; hidden: boolean }[];
};

const STATUS = {
  published: ["เผยแพร่", "bg-emerald-50 text-emerald-800"],
  review: ["รอตรวจ", "bg-amber-50 text-amber-800"],
  hidden: ["ซ่อน", "bg-zinc-100 text-zinc-600"],
} as const;

export function BulkTable({ rows, categories, listQuery }: { rows: Row[]; categories: { id: number; label: string }[]; listQuery: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [op, setOp] = useState("checked");
  const router = useRouter();
  const [state, action, pending] = useActionState<BulkState, FormData>(async (prev, form) => {
    const result = await bulkUpdate(prev, form);
    if (result?.done) {
      setSelected([]);
      router.refresh();
    }
    return result;
  }, undefined);

  const all = rows.length > 0 && selected.length === rows.length;
  const toggle = (slug: string) => setSelected((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  return (
    <form action={action} className="mt-3">
      {selected.map((s) => (
        <input key={s} type="hidden" name="slug" value={s} />
      ))}

      {/* Bulk bar appears once something is selected */}
      <div
        className={`sticky top-[57px] z-10 mb-2 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm transition ${
          selected.length ? "border-accent bg-canvas shadow-sm" : "border-transparent"
        }`}
      >
        <span className="font-num px-2 text-muted">{selected.length ? `เลือก ${selected.length} รายการ` : "เลือกรายการเพื่อแก้ไขพร้อมกัน"}</span>
        {selected.length > 0 && (
          <>
            <select name="op" value={op} onChange={(e) => setOp(e.target.value)} className="rounded border border-line px-2 py-1.5">
              <option value="checked">ทำเครื่องหมายว่าตรวจแล้ว</option>
              <option value="publish">เผยแพร่</option>
              <option value="hide">ซ่อน</option>
              <option value="review">ย้ายไปรอตรวจ</option>
              <option value="category">เปลี่ยนหมวดหมู่…</option>
            </select>
            {op === "category" && (
              <select name="categoryId" className="rounded border border-line px-2 py-1.5">
                <option value="">— เลือกหมวดหมู่ —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
            <button disabled={pending} className="rounded-full bg-accent px-4 py-1.5 text-accent-ink disabled:opacity-60">
              {pending ? "กำลังบันทึก…" : "ใช้กับที่เลือก"}
            </button>
            <button type="button" onClick={() => setSelected([])} className="text-muted hover:text-accent">
              ยกเลิก
            </button>
          </>
        )}
        {state?.done && !selected.length && <span className="text-emerald-700">✓ {state.done}</span>}
        {state?.error && <span className="text-red-700">{state.error}</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-canvas">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหน้า"
                  checked={all}
                  onChange={() => setSelected(all ? [] : rows.map((r) => r.slug))}
                />
              </th>
              <th className="w-16 p-3 font-normal" />
              <th className="p-3 font-normal">รหัส / ประเภท</th>
              <th className="p-3 font-normal">หมวดหมู่</th>
              <th className="p-3 font-normal">ผู้ผลิต</th>
              <th className="p-3 font-normal">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.slug} className={selected.includes(r.slug) ? "bg-accent/5" : "hover:bg-panel/50"}>
                <td className="p-3">
                  <input type="checkbox" aria-label={`เลือก ${r.code}`} checked={selected.includes(r.slug)} onChange={() => toggle(r.slug)} />
                </td>
                <td className="p-2">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded bg-canvas">
                    {r.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail
                      <img src={r.thumb} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-muted">ไม่มีภาพ</span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <Link href={`/admin/p/${r.slug}${listQuery ? `?${listQuery}` : ""}`} className="font-medium text-accent hover:underline">
                    {r.code}
                  </Link>
                  <div className="line-clamp-1 text-muted">{r.typeTh}</div>
                </td>
                <td className="p-3 text-muted">{r.category ?? <span className="text-red-700">—</span>}</td>
                <td className="p-3 text-muted">{r.brand}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                  {r.editedAt && <span className="ml-1 text-xs text-muted">· ตรวจแล้ว</span>}
                  {r.flagLabels.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.flagLabels.map((f) => (
                        <span key={f.key} className={`rounded px-1.5 text-[11px] ${f.hidden ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                          {f.th}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-muted">
                  ไม่พบสินค้าที่ตรงกับตัวกรอง
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </form>
  );
}
