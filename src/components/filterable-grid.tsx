"use client";

import { useMemo, useState } from "react";

import type { Lang } from "@/lib/i18n";

/** Material names for the filter chips (keys come from the import's material tags). */
const MATERIALS: Record<string, [string, string]> = {
  fabric: ["ผ้า", "Fabric"],
  mesh: ["ผ้าตาข่าย", "Mesh"],
  "pu-leather": ["หนังเทียม", "PU leather"],
  "genuine-leather": ["หนังแท้", "Leather"],
  "solid-wood": ["ไม้จริง", "Solid wood"],
  veneer: ["ไม้วีเนียร์", "Veneer"],
  melamine: ["เมลามีน", "Melamine"],
  hpl: ["HPL", "HPL"],
  "particle-board": ["ปาร์ติเคิลบอร์ด", "Particle board"],
  steel: ["เหล็ก", "Steel"],
  chrome: ["โครเมียม", "Chrome"],
  aluminium: ["อะลูมิเนียม", "Aluminium"],
  glass: ["กระจก", "Glass"],
  plastic: ["พลาสติก", "Plastic"],
};

// Width bands in mm
const WIDTHS: [string, number, number][] = [
  ["< 60 cm", 0, 599],
  ["60–100 cm", 600, 1000],
  ["100–160 cm", 1001, 1600],
  ["160–200 cm", 1601, 2000],
  ["> 200 cm", 2001, 1e9],
];

type Item = { slug: string; materials: string[]; widthMax: number | null; code: string };

/**
 * Filter bar over server-rendered cards: chips for material and width, plus sort.
 * Cards stay server components (passed as children keyed by slug); this only decides
 * which to show and in what order.
 */
export function FilterableGrid({
  items,
  cards,
  lang,
}: {
  items: Item[];
  cards: Record<string, React.ReactNode>;
  lang: Lang;
}) {
  const [materials, setMaterials] = useState<string[]>([]);
  const [width, setWidth] = useState<number | null>(null);
  const [sort, setSort] = useState<"code" | "width-asc" | "width-desc">("code");

  const present = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) for (const m of it.materials) counts.set(m, (counts.get(m) ?? 0) + 1);
    return Object.keys(MATERIALS).filter((m) => counts.get(m));
  }, [items]);
  const widthsPresent = WIDTHS.map((w, i) => [w, i] as const).filter(([[, lo, hi]]) =>
    items.some((it) => it.widthMax != null && it.widthMax >= lo && it.widthMax <= hi),
  );

  const shown = items
    .filter((it) => materials.every((m) => it.materials.includes(m)))
    .filter((it) => {
      if (width === null) return true;
      const [, lo, hi] = WIDTHS[width];
      return it.widthMax != null && it.widthMax >= lo && it.widthMax <= hi;
    })
    .sort((a, b) =>
      sort === "code"
        ? a.code.localeCompare(b.code)
        : ((a.widthMax ?? 0) - (b.widthMax ?? 0)) * (sort === "width-asc" ? 1 : -1),
    );

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${active ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`;
  const en = lang === "en";
  const filtered = materials.length > 0 || width !== null;

  return (
    <div>
      {items.length > 8 && (
        <div className="no-print mb-8 space-y-3">
          {present.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-2 w-20 text-muted">Material</span>
              {present.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={materials.includes(m)}
                  className={chip(materials.includes(m))}
                  onClick={() => setMaterials((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}
                >
                  {MATERIALS[m][en ? 1 : 0]}
                </button>
              ))}
            </div>
          )}
          {widthsPresent.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-2 w-20 text-muted">Width</span>
              {widthsPresent.map(([[label], i]) => (
                <button key={label} type="button" aria-pressed={width === i} className={chip(width === i)} onClick={() => setWidth(width === i ? null : i)}>
                  <span className="font-num">{label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="eyebrow mr-2 w-20 text-muted">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="border-b border-ink/60 bg-transparent py-1 outline-none"
              aria-label={en ? "Sort" : "เรียงลำดับ"}
            >
              <option value="code">{en ? "Code A–Z" : "รหัสสินค้า A–Z"}</option>
              <option value="width-asc">{en ? "Width: small to large" : "ความกว้าง: น้อยไปมาก"}</option>
              <option value="width-desc">{en ? "Width: large to small" : "ความกว้าง: มากไปน้อย"}</option>
            </select>
            <span className="font-num text-muted tabular-nums">
              {shown.length} / {items.length}
            </span>
            {filtered && (
              <button type="button" className="text-accent hover:underline" onClick={() => (setMaterials([]), setWidth(null))}>
                {en ? "Clear filters" : "ล้างตัวกรอง"}
              </button>
            )}
          </div>
        </div>
      )}
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((it) => (
            <li key={it.slug}>{cards[it.slug]}</li>
          ))}
        </ul>
      ) : (
        <p className="py-12 text-center text-muted">{en ? "No products match these filters" : "ไม่พบสินค้าที่ตรงกับตัวกรอง"}</p>
      )}
    </div>
  );
}
