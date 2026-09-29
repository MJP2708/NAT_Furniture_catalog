"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { products } from "@/db/schema";
import { endSession, passwordMatches, requireAdmin, startSession } from "@/lib/admin-session";
import { CATALOG_TAG } from "@/lib/catalog";

export type FormState = { error?: string; saved?: boolean } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!process.env.ADMIN_PASSWORD) return { error: "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บนเซิร์ฟเวอร์" };
  if (!passwordMatches(String(form.get("password") ?? ""))) return { error: "รหัสผ่านไม่ถูกต้อง" };
  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}

const range = z.tuple([z.number().int().min(0).max(100000), z.number().int().min(0).max(100000)]).refine(([a, b]) => a <= b, "ค่าต่ำสุดต้องไม่เกินค่าสูงสุด");
const text = z.string().trim().max(2000);
const optText = text.nullable().transform((s) => s || null);

const Payload = z.object({
  code: z.string().trim().min(1, "ต้องมีรหัสสินค้า").max(80),
  typeTh: optText,
  typeEn: optText,
  categoryId: z.number().int().positive().nullable(),
  status: z.enum(["published", "review", "hidden"]),
  noteTh: optText,
  noteEn: optText,
  featuresTh: z.array(text).max(50),
  featuresEn: z.array(text).max(50),
  sizes: z
    .array(
      z.object({
        label_th: text,
        label_en: optText,
        text_th: text,
        text_en: optText,
        mm: z.object({ w: range, d: range, h: range, dia: range, seat_h: range, arm_h: range }).partial().nullable(),
      }),
    )
    .max(10),
  specs: z
    .array(
      z.object({
        label_th: text.pipe(z.string().min(1, "หัวข้อสเปกห้ามว่าง")),
        label_en: optText,
        values_th: z.array(text).max(20),
        values_en: z.array(optText).max(20),
      }),
    )
    .max(40),
});

export type ProductPayload = z.input<typeof Payload>;

/** Overall envelope across size sets (a round top's diameter counts as width and depth). */
function envelope(sizes: z.output<typeof Payload>["sizes"]) {
  const pick = (keys: ("w" | "d" | "h" | "dia")[]) => {
    const rs = sizes.flatMap((s) => keys.map((k) => s.mm?.[k]).filter((r): r is [number, number] => !!r));
    return rs.length ? [Math.min(...rs.map((r) => r[0])), Math.max(...rs.map((r) => r[1]))] : [null, null];
  };
  const [widthMin, widthMax] = pick(["w", "dia"]);
  const [depthMin, depthMax] = pick(["d", "dia"]);
  const [heightMin, heightMax] = pick(["h"]);
  return { widthMin, widthMax, depthMin, depthMax, heightMin, heightMax };
}

export async function saveProduct(slug: string, _: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
  }
  const parsed = Payload.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `${issue.path.join(" › ") || "ข้อมูล"}: ${issue.message}` };
  }
  const p = parsed.data;
  // Text areas are one entry per line: drop blank Thai lines and keep English paired by position.
  const features = p.featuresTh.map((th, i) => [th, p.featuresEn[i] ?? ""] as const).filter(([th]) => th);
  const specs = p.specs.map((row) => {
    const keep = row.values_th.map((v, i) => [v, row.values_en[i] ?? null] as const).filter(([v]) => v);
    return { ...row, values_th: keep.map(([v]) => v), values_en: keep.map(([, e]) => e) };
  });
  const updated = await db
    .update(products)
    .set({
      ...p,
      specs,
      featuresTh: features.map(([th]) => th),
      featuresEn: features.map(([, en]) => en),
      codeNorm: p.code.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      ...envelope(p.sizes),
      editedAt: new Date(),
    })
    .where(eq(products.slug, slug))
    .returning({ id: products.id });
  if (!updated.length) return { error: "ไม่พบสินค้านี้" };
  updateTag(CATALOG_TAG);
  return { saved: true };
}
