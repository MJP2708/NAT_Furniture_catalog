import { isCustomerSite } from "@/lib/site";

/** Short bilingual introductions for the four spaces (keyed by top-level category slug). */
export const SPACE_COPY: Record<string, { th: string; en: string }> = {
  office: {
    th: "เฟอร์นิเจอร์สำนักงานสำหรับทุกมุมของการทำงาน ตั้งแต่โต๊ะส่วนบุคคล ห้องประชุม ไปจนถึงพื้นที่พักคอย แข็งแรง ใช้งานได้จริง และดูแลรักษาง่าย",
    en: "Furniture for every corner of the workplace, from personal desks and meeting rooms to waiting areas. Sturdy, practical and easy to look after.",
  },
  living: {
    th: "โซฟา เก้าอี้พักผ่อน และโต๊ะกลาง สำหรับห้องนั่งเล่นและพื้นที่รับรอง นั่งสบาย และเข้ากับการตกแต่งได้หลากหลาย",
    en: "Sofas, lounge chairs and coffee tables for living rooms and reception areas. Comfortable to sit in and easy to style.",
  },
  dining: {
    th: "เก้าอี้และโต๊ะสำหรับมุมรับประทานอาหารและเคาน์เตอร์บาร์",
    en: "Chairs and tables for dining corners and bar counters.",
  },
  bedroom: {
    th: "เตียงและชุดเครื่องนอน สำหรับห้องนอนที่พักผ่อนได้เต็มที่",
    en: "Beds and bedding for a properly restful bedroom.",
  },
};


/** The customer site links to the photo edition of the catalogue. */
export const E_CATALOGUE_URL = isCustomerSite ? "/e-catalogue-photo.pdf" : "/e-catalogue.pdf";
