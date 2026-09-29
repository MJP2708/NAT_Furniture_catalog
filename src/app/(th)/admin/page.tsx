import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";

import { logout } from "@/app/(th)/admin/actions";
import { db } from "@/db";
import { brands, categories, products } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-session";

const STATUS_LABEL = { published: "เผยแพร่", review: "รอตรวจ", hidden: "ซ่อน" } as const;

export default function AdminHome({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <ProductList searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductList({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const status = typeof sp.status === "string" && sp.status in STATUS_LABEL ? (sp.status as keyof typeof STATUS_LABEL) : null;

  const where = and(
    status ? eq(products.status, status) : undefined,
    q ? or(ilike(products.code, `%${q}%`), ilike(products.typeTh, `%${q}%`), ilike(brands.name, `%${q}%`)) : undefined,
  );
  const [rows, counts] = await Promise.all([
    db
      .select({
        slug: products.slug,
        code: products.code,
        typeTh: products.typeTh,
        status: products.status,
        flags: products.flags,
        editedAt: products.editedAt,
        brand: brands.name,
        category: categories.nameTh,
      })
      .from(products)
      .innerJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(where)
      // Items needing attention first.
      .orderBy(desc(sql`${products.status} = 'review'`), asc(products.code))
      .limit(200),
    db.select({ status: products.status, n: sql<number>`count(*)::int` }).from(products).groupBy(products.status),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;

  return (
    <main>
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl">จัดการสินค้า</h1>
        <form action={logout}>
          <button className="text-sm text-muted hover:text-accent">ออกจากระบบ</button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {([null, "published", "review", "hidden"] as const).map((s) => (
          <Link
            key={s ?? "all"}
            href={{ pathname: "/admin", query: { ...(q && { q }), ...(s && { status: s }) } }}
            className={`rounded-full border px-3 py-1 ${status === s ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"}`}
          >
            {s ? STATUS_LABEL[s] : "ทั้งหมด"} {s ? n(s) : counts.reduce((a, c) => a + c.n, 0)}
          </Link>
        ))}
        <Form action="/admin" className="ml-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="รหัส / ประเภท / ผู้ผลิต"
            className="rounded border border-line px-3 py-1.5 outline-none focus:border-accent"
          />
          <button className="rounded-full bg-accent px-4 text-accent-ink">ค้นหา</button>
        </Form>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="border-b border-line text-left text-muted">
          <tr>
            <th className="py-2 pr-3 font-normal">รหัส</th>
            <th className="py-2 pr-3 font-normal">ประเภท</th>
            <th className="py-2 pr-3 font-normal">หมวดหมู่</th>
            <th className="py-2 pr-3 font-normal">ผู้ผลิต</th>
            <th className="py-2 font-normal">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.slug}>
              <td className="py-2 pr-3">
                <Link href={`/admin/p/${r.slug}`} className="font-medium text-accent hover:underline">
                  {r.code}
                </Link>
              </td>
              <td className="py-2 pr-3">{r.typeTh}</td>
              <td className="py-2 pr-3 text-muted">{r.category ?? "—"}</td>
              <td className="py-2 pr-3 text-muted">{r.brand}</td>
              <td className="py-2">
                {STATUS_LABEL[r.status]}
                {r.editedAt && <span className="ml-1 text-xs text-muted">· แก้ไขแล้ว</span>}
                {r.flags.length > 0 && <div className="text-xs text-amber-700">{r.flags.join(", ")}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 200 && <p className="mt-3 text-sm text-muted">แสดง 200 รายการแรก — ค้นหาเพื่อกรองเพิ่ม</p>}
    </main>
  );
}
