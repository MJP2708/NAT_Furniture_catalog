import { Suspense } from "react";

import { categoriesWithCounts } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-session";

import { CategoryRow } from "./category-row";

export const metadata = { title: "หมวดหมู่" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await requireAdmin();
  const cats = await categoriesWithCounts();
  const roots = cats.filter((c) => c.parentId === null);
  return (
    <main>
      <h1 className="display text-4xl">หมวดหมู่</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Categories · แก้ชื่อภาษาไทย/อังกฤษและลำดับการแสดงผล (เลขน้อยแสดงก่อน) การนำเข้าข้อมูลครั้งต่อไปจะไม่เขียนทับชื่อที่แก้ไว้
      </p>
      <div className="mt-6 space-y-6">
        {roots.map((root) => (
          <section key={root.id} className="rounded-lg border border-line bg-canvas">
            <CategoryRow cat={root} isRoot />
            <div className="divide-y divide-line border-t border-line">
              {cats
                .filter((c) => c.parentId === root.id)
                .map((c) => (
                  <CategoryRow key={c.id} cat={c} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
