/** Thai is the default at "/", English lives under "/en". */
export type Lang = "th" | "en";

export const LANGS: Lang[] = ["th", "en"];

/** Prefix an app path for a language: href("en", "/c/sofas") -> "/en/c/sofas". */
export function href(lang: Lang, path: string) {
  if (lang === "th") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/** Pick the language's value, falling back to Thai (the source language of the spec sheets). */
export function pick<T>(lang: Lang, th: T, en: T | null | undefined): { value: T; fallback: boolean } {
  if (lang === "en" && en != null && en !== "") return { value: en, fallback: false };
  return { value: th, fallback: lang === "en" };
}

const UI = {
  th: {
    siteDescription: "แคตตาล็อกเฟอร์นิเจอร์สำนักงานและที่อยู่อาศัย NAT Furniture",
    searchPlaceholder: "ค้นหารหัสหรือประเภทสินค้า",
    searchLabel: "ค้นหาสินค้า",
    heroTitle: "Furniture for\nevery space",
    heroLead: "เฟอร์นิเจอร์สำหรับทุกพื้นที่ ทั้งสำนักงานและบ้าน พร้อมแบบร่างและสเปกครบทุกชิ้น",
    heroSub: (n: number) => `${n.toLocaleString("en-US")} pieces for offices and homes, each with a drawing and full specification.`,
    browseAll: "ดูสินค้าทั้งหมด",
    downloadCatalogue: "ดาวน์โหลด E-Catalogue",
    spacesTitle: "เลือกตามพื้นที่",
    spacesLead: "สินค้าจัดกลุ่มตามพื้นที่ใช้งาน เช่นเดียวกับในแคตตาล็อก PDF",
    viewAll: (n: number) => `ดูทั้งหมด ${n} รายการ →`,
    catalogueLead: "แคตตาล็อกฉบับเต็มในรูปแบบ PDF รวมแบบร่างและขนาดของสินค้าทุกรายการ แยกตามพื้นที่ใช้งาน เหมาะสำหรับพิมพ์หรือส่งต่อ",
    downloadPdf: "ดาวน์โหลด PDF",
    home: "Home",
    all: "ทั้งหมด",
    items: (n: number) => `${n} items`,
    noImage: "ไม่มีภาพ",
    noProducts: "ไม่พบสินค้า",
    dimensions: "ขนาด",
    construction: "รายละเอียดการผลิต",
    features: "ลักษณะพิเศษ",
    note: "หมายเหตุ",
    print: "ใบสเปก PDF · Spec sheet",
    seriesOthers: "รุ่นอื่นในซีรีส์เดียวกัน",
    searchTitle: "ค้นหาสินค้า",
    searchHint: "พิมพ์รหัสสินค้าหรือประเภท เช่น FG 1, โซฟา",
    searching: "กำลังค้นหา…",
    footerAbout: "เฟอร์นิเจอร์สำนักงานและที่อยู่อาศัย พร้อมแบบร่างและสเปกครบทุกชิ้น",
    footerDownload: "ดาวน์โหลดแคตตาล็อก (PDF)",
    footerNote: "ขนาดสินค้าอาจคลาดเคลื่อนเล็กน้อยจากแผ่นสเปกของผู้ผลิต",
    thaiOnly: "",
    notFoundProduct: "ไม่พบสินค้า",
    notFoundCategory: "ไม่พบหมวดหมู่",
    drawing: (code: string, i: number) => `${code} แบบร่างที่ ${i}`,
  },
  en: {
    siteDescription: "NAT Furniture catalogue of office and home furniture",
    searchPlaceholder: "Search by product code or type",
    searchLabel: "Search products",
    heroTitle: "Furniture for\nevery space",
    heroLead: "Furniture for offices and homes, with a drawing and full specification for every piece.",
    heroSub: (n: number) => `${n.toLocaleString("en-US")} pieces, arranged by space.`,
    browseAll: "Browse all products",
    downloadCatalogue: "Download E-Catalogue",
    spacesTitle: "Browse by space",
    spacesLead: "Products are grouped by where they are used, in the same order as the PDF catalogue.",
    viewAll: (n: number) => `View all ${n} →`,
    catalogueLead: "The full catalogue as a PDF: a drawing and the sizes of every piece, arranged by space. Ready to print or share.",
    downloadPdf: "Download PDF",
    home: "Home",
    all: "All",
    items: (n: number) => `${n} items`,
    noImage: "No drawing",
    noProducts: "No products found",
    dimensions: "",
    construction: "",
    features: "",
    note: "Note",
    print: "Spec sheet (PDF)",
    seriesOthers: "Other models in this series",
    searchTitle: "Search products",
    searchHint: "Type a product code or type, e.g. FG 1, sofa",
    searching: "Searching…",
    footerAbout: "Office and home furniture, with a drawing and full specification for every piece.",
    footerDownload: "Download the catalogue (PDF)",
    footerNote: "Sizes may differ slightly from the manufacturers' specification sheets.",
    thaiOnly: "Thai",
    notFoundProduct: "Product not found",
    notFoundCategory: "Category not found",
    drawing: (code: string, i: number) => `${code} drawing ${i}`,
  },
} as const;

export function t(lang: Lang) {
  return UI[lang];
}
