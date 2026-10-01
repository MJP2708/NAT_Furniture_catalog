import { VisualSearch, type VisualSearchText } from "@/components/visual-search";
import { href, type Lang } from "@/lib/i18n";

const TEXT: Record<Lang, VisualSearchText> = {
  th: {
    title: "ค้นหาด้วยรูปภาพ",
    lead: "ถ่ายรูปหรืออัปโหลดรูปเฟอร์นิเจอร์ที่ต้องการ ระบบจะค้นหาสินค้าที่ใกล้เคียงที่สุดในแคตตาล็อก พร้อมขนาดและสเปก",
    upload: "อัปโหลดรูป",
    camera: "ถ่ายรูป",
    dropHint: "หรือลากรูปมาวางที่นี่",
    privacy: "รูปของคุณถูกวิเคราะห์ในเบราว์เซอร์นี้เท่านั้น ไม่มีการส่งรูปออกไป",
    loadingModel: "กำลังโหลดระบบจดจำภาพ…",
    firstTime: "ครั้งแรกใช้เวลาสักครู่ (ประมาณ 90 MB) ครั้งต่อไปจะเร็วขึ้น",
    analysing: "กำลังวิเคราะห์รูป…",
    searching: "กำลังค้นหาสินค้า…",
    bestMatch: "Best match · ใกล้เคียงที่สุด",
    similar: "Similar · สินค้าที่คล้ายกัน",
    noMatch: "ไม่พบสินค้าที่คล้ายกัน ลองถ่ายรูปให้เห็นเฟอร์นิเจอร์ชัดเจนขึ้น",
    tryAnother: "ลองรูปอื่น",
    error: "ขออภัย เกิดข้อผิดพลาด ลองใหม่อีกครั้ง หรือใช้เบราว์เซอร์อื่น",
    viewProduct: "ดูสเปกสินค้า",
  },
  en: {
    title: "Search by photo",
    lead: "Take or upload a photo of a piece of furniture and we'll find the closest products in the catalogue, with their sizes and specifications.",
    upload: "Upload a photo",
    camera: "Take a photo",
    dropHint: "or drop an image here",
    privacy: "Your photo is analysed in this browser only; it is never uploaded.",
    loadingModel: "Loading image recognition…",
    firstTime: "The first time takes a moment (about 90 MB); later searches are faster.",
    analysing: "Analysing your photo…",
    searching: "Finding products…",
    bestMatch: "Best match",
    similar: "Similar products",
    noMatch: "No similar products found. Try a photo where the furniture is clearly visible.",
    tryAnother: "Try another photo",
    error: "Sorry, something went wrong. Please try again or use another browser.",
    viewProduct: "View specification",
  },
};

export function visualSearchTitle(lang: Lang) {
  return TEXT[lang].title;
}

export function VisualSearchView({ lang }: { lang: Lang }) {
  const text = TEXT[lang];
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="text-muted">
        <span className="eyebrow">Photo search</span>
        {lang === "th" && <span className="ml-2 text-sm">ค้นหาด้วยรูป</span>}
      </div>
      <h1 className="display mt-2 mb-8 text-4xl sm:text-5xl">{text.title}</h1>
      <VisualSearch lang={lang} text={text} productBase={href(lang, "/p")} />
    </main>
  );
}
