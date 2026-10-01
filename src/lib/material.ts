/** Main-material groups for case goods: "steel cabinets", "wooden desks" etc. */
export const MATERIAL_GROUPS = {
  steel: { th: "เหล็ก", en: "Steel" },
  wood: { th: "ไม้", en: "Wood" },
} as const;

export type MaterialGroup = keyof typeof MATERIAL_GROUPS;
export const MATERIAL_KEYS = Object.keys(MATERIAL_GROUPS) as MaterialGroup[];

export function isMaterial(s: string): s is MaterialGroup {
  return s in MATERIAL_GROUPS;
}

const SEATING = new Set([
  "office-chairs", "visitor-chairs", "training-chairs", "waiting-chairs", "dining-chairs", "stools", "bar",
]);
const SOFT = new Set(["sofas", "sofa-beds", "recliners", "armchairs", "beds"]);

const RX = {
  steel: /เหล็ก|steel|metal|SPCC|stainless|สแตนเลส|locker|ล็อกเกอร์|ล็อคเกอร์|ตู้นิรภัย|safe\b/i,
  wood: /ไม้|wood|particle|MDF|melamine|เมลามีน|veneer|วีเนียร์|HPL|laminate|ลามิเนต|plywood|ไม้อัด|\bPB\b|oak|beech/i,
};

/**
 * Pick a product's main material from its type, specification text and source (folder names such
 * as NAT's STEEL/WOOD documents or Thai Taiyo's TAIYO_STEEL catalogue are strong hints).
 * Returns null when nothing points clearly to one group.
 */
export function classifyMaterial(p: {
  category: string | null;
  type: string;
  specText: string;
  source: string;
}): MaterialGroup | null {
  const type = p.type;
  const all = `${type} ${p.specText}`;
  const src = p.source.toUpperCase();
  const cat = p.category ?? "";

  // Only case goods (cabinets, desks, tables, shelving, partitions ...) get a material group;
  // seating and upholstered pieces are fabric/leather/mesh even when their frame is steel.
  if (SEATING.has(cat) || SOFT.has(cat)) return null;

  // 1. the product type says it outright ("ตู้เหล็ก", "โต๊ะไม้")
  if (/เหล็ก|steel/i.test(type) && !/ขาเหล็ก|steel leg|steel frame/i.test(type)) return "steel";
  if (/ไม้|wood/i.test(type) && !/ขาไม้|wood leg/i.test(type)) return "wood";

  // 2. the source folder or catalogue line
  if (/\/STEEL\/|TAIYO_STEEL|SMARTFORM|CPT|TAIYO_SAFE|STEEL_TIS|LOCKER/.test(src)) return "steel";
  if (/\/WOOD\/|\/WARDROBE\/|\/KITCHEN\//.test(src)) return "wood";

  // 3. the board material decides; steel legs or frames under a wooden top don't make it steel
  if (RX.wood.test(all)) return "wood";
  if (RX.steel.test(all)) return "steel";
  if (/MOTECH|HYBRIDA|MO-TECH/.test(src)) return "wood"; // Thai Taiyo melamine desk ranges
  return null;
}
