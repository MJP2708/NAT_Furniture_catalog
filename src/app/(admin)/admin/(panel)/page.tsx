import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { FLAGS, type ListFilter, filterOptions, listProducts, statusCounts } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-session";

import { BulkTable } from "./bulk-table";

const STATUS = { published: "เผยแพร่", review: "รอตรวจ", hidden: "ซ่อน" } as const;

export const metadata = { title: "สินค้า" };

export default function ProductsPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Products searchParams={searchParams} />
    </Suspense>
  );
}

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v) || undefined;
}

async function Products({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = one(sp.status);
  const filter: ListFilter = {
    status: status && status in STATUS ? (status as ListFilter["status"]) : undefined,
    brand: one(sp.brand),
    category: one(sp.category),
    flag: one(sp.flag),
    open: one(sp.open) === "1",
    q: one(sp.q)?.trim(),
    page: Number(one(sp.page)) || 1,
    sort: one(sp.sort) === "updated" ? "updated" : "code",
  };
  const [list, counts, options] = await Promise.all([listProducts(filter), statusCounts(), filterOptions()]);
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const all = counts.reduce((a, c) => a + c.n, 0);
  // Query string for links that keep the current filters
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)])), ...patch }))
      if (v !== undefined && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  // Filters (without paging/sort) handed to the editor, for "back" and "save and next"
  const lq = new URLSearchParams();
  for (const k of ["status", "brand", "category", "flag", "q"] as const) if (filter[k]) lq.set(k, String(filter[k]));
  if (filter.open) lq.set("open", "1");
  const listQuery = lq.toString();

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl">สินค้า</h1>
          <p className="text-sm text-muted">Products · {all.toLocaleString("en-US")} รายการ</p>
        </div>
        <Link href="/admin/new" className="rounded-full bg-ink px-5 py-2 text-sm text-canvas hover:bg-accent">
          + เพิ่มสินค้า
        </Link>
      </div>

      {/* Status tabs */}
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        {([undefined, "published", "review", "hidden"] as const).map((s) => (
          <Link
            key={s ?? "all"}
            href={qs({ status: s, page: undefined })}
            className={`rounded-full border px-3 py-1 ${filter.status === s ? "border-ink bg-ink text-canvas" : "border-line bg-canvas hover:border-ink"}`}
          >
            {s ? STATUS[s] : "ทั้งหมด"} <span className="font-num opacity-60">{s ? n(s) : all}</span>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <Form action="/admin" className="mt-4 grid gap-2 rounded-lg border border-line bg-canvas p-3 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1.3fr_1.2fr_auto]">
        {filter.status && <input type="hidden" name="status" value={filter.status} />}
        <input name="q" defaultValue={filter.q} placeholder="ค้นหารหัส / ประเภท" className="rounded border border-line px-3 py-2 outline-none focus:border-accent" />
        <select name="brand" defaultValue={filter.brand ?? ""} className="rounded border border-line px-2 py-2">
          <option value="">ผู้ผลิตทั้งหมด</option>
          {options.brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filter.category ?? ""} className="rounded border border-line px-2 py-2">
          <option value="">หมวดหมู่ทั้งหมด</option>
          {options.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
        <select name="flag" defaultValue={filter.flag ?? ""} className="rounded border border-line px-2 py-2">
          <option value="">ปัญหาทั้งหมด</option>
          {Object.entries(FLAGS)
            .sort((a, b) => a[1].order - b[1].order)
            .map(([k, f]) => (
              <option key={k} value={k}>
                {f.th}
              </option>
            ))}
        </select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 whitespace-nowrap">
            <input type="checkbox" name="open" value="1" defaultChecked={filter.open} /> ยังไม่ตรวจ
          </label>
          <button className="rounded-full bg-accent px-4 py-2 text-accent-ink">กรอง</button>
          <Link href="/admin" className="text-muted hover:text-accent">
            ล้าง
          </Link>
        </div>
      </Form>

      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span className="font-num">
          {list.total.toLocaleString("en-US")} รายการ · หน้า {list.page}/{list.pages}
        </span>
        <span>
          เรียง:{" "}
          <Link href={qs({ sort: undefined })} className={filter.sort === "code" ? "text-ink" : "hover:text-accent"}>
            รหัส
          </Link>{" "}
          ·{" "}
          <Link href={qs({ sort: "updated" })} className={filter.sort === "updated" ? "text-ink" : "hover:text-accent"}>
            แก้ไขล่าสุด
          </Link>
        </span>
      </div>

      <BulkTable
        rows={list.rows.map((r) => ({
          ...r,
          editedAt: r.editedAt?.toISOString() ?? null,
          flagLabels: r.flags.filter((f) => FLAGS[f]).map((f) => ({ key: f, th: FLAGS[f].th, hidden: !!FLAGS[f].hidden })),
        }))}
        categories={options.categories.filter((c) => c.parentId !== null).map((c) => ({ id: c.id, label: c.label }))}
        listQuery={listQuery}
      />

      {list.pages > 1 && (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-1 text-sm">
          {Array.from({ length: list.pages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === list.pages || Math.abs(p - list.page) <= 2)
            .map((p, i, arr) => (
              <span key={p} className="flex items-center gap-1">
                {i > 0 && p - arr[i - 1] > 1 && <span className="px-1 text-muted">…</span>}
                <Link
                  href={qs({ page: p === 1 ? undefined : p })}
                  className={`font-num rounded px-3 py-1 ${p === list.page ? "bg-ink text-canvas" : "bg-canvas hover:bg-panel"}`}
                >
                  {p}
                </Link>
              </span>
            ))}
        </nav>
      )}
    </main>
  );
}
