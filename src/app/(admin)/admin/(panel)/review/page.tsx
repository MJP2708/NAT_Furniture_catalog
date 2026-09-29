import Link from "next/link";
import { Suspense } from "react";

import { FLAGS, flagCounts, statusCounts } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-session";

export const metadata = { title: "รอตรวจสอบ" };

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Queue />
    </Suspense>
  );
}

async function Queue() {
  await requireAdmin();
  const [flags, statuses] = await Promise.all([flagCounts(), statusCounts()]);
  const review = statuses.find((s) => s.status === "review")?.n ?? 0;
  const items = Object.entries(FLAGS)
    .map(([key, f]) => ({ key, ...f, ...(flags.find((x) => x.flag === key) ?? { total: 0, open: 0 }) }))
    .filter((f) => f.total > 0)
    .sort((a, b) => a.order - b.order);
  const openTotal = items.filter((i) => i.key !== "ocr-import" && i.key !== "image-from-render").reduce((n, i) => n + i.open, 0);

  return (
    <main>
      <h1 className="display text-4xl">รอตรวจสอบ</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Review queue · สินค้าที่ระบบนำเข้าแล้วพบจุดที่ควรให้คนตรวจ เปิดสินค้าแล้วกด “บันทึก” หรือเลือกหลายรายการแล้ว “ทำเครื่องหมายว่าตรวจแล้ว”
        สินค้าจะหายจากคิว และจะไม่ถูกเขียนทับเมื่อนำเข้าข้อมูลใหม่
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-canvas p-4">
          <div className="font-num text-3xl">{openTotal.toLocaleString("en-US")}</div>
          <div className="text-sm text-muted">จุดที่ยังไม่ได้ตรวจ</div>
        </div>
        <Link href="/admin?status=review" className="rounded-lg border border-line bg-canvas p-4 hover:border-accent">
          <div className="font-num text-3xl">{review.toLocaleString("en-US")}</div>
          <div className="text-sm text-muted">สินค้าที่ซ่อนอยู่เพราะรอตรวจ →</div>
        </Link>
        <Link href="/admin?sort=updated" className="rounded-lg border border-line bg-canvas p-4 hover:border-accent">
          <div className="text-3xl">↻</div>
          <div className="text-sm text-muted">ดูสินค้าที่แก้ไขล่าสุด →</div>
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-canvas">
        {items.map((f) => (
          <li key={f.key} className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{f.th}</span>
                {f.hidden && <span className="rounded bg-red-50 px-1.5 text-[11px] text-red-700">ซ่อนจากเว็บไซต์</span>}
              </div>
              <p className="text-sm text-muted">{f.help}</p>
            </div>
            <div className="font-num text-right text-sm">
              <div className={f.open ? "text-ink" : "text-muted"}>{f.open} ยังไม่ตรวจ</div>
              <div className="text-xs text-muted">จาก {f.total}</div>
            </div>
            {f.open > 0 ? (
              <Link href={`/admin?flag=${f.key}&open=1`} className="rounded-full bg-accent px-4 py-1.5 text-sm text-accent-ink">
                เริ่มตรวจ →
              </Link>
            ) : (
              <span className="rounded-full border border-line px-4 py-1.5 text-sm text-muted">เรียบร้อย ✓</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
