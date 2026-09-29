import { Suspense } from "react";

import { filterOptions } from "@/lib/admin-data";
import { requireAdmin } from "@/lib/admin-session";

import { NewProductForm } from "./new-product-form";

export const metadata = { title: "เพิ่มสินค้า" };

export default function NewProductPage() {
  return (
    <Suspense fallback={<p className="text-muted">กำลังโหลด…</p>}>
      <NewProduct />
    </Suspense>
  );
}

async function NewProduct() {
  await requireAdmin();
  const { brands, categories } = await filterOptions();
  return (
    <main className="max-w-xl">
      <h1 className="display text-4xl">เพิ่มสินค้า</h1>
      <p className="mt-1 text-sm text-muted">
        New product · กรอกข้อมูลเบื้องต้น แล้วเติมขนาดและรายละเอียดในหน้าถัดไป สินค้าใหม่จะอยู่ในสถานะ “รอตรวจ” จนกว่าจะเปลี่ยนเป็นเผยแพร่
        (ยังเพิ่มรูปภาพไม่ได้ จนกว่าจะตั้งค่าที่เก็บไฟล์)
      </p>
      <NewProductForm brands={brands} categories={categories.filter((c) => c.parentId !== null).map((c) => ({ id: c.id, label: c.label }))} />
    </main>
  );
}
