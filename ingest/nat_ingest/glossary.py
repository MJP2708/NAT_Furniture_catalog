"""Free Thai -> English translation for spec sheets via a phrase glossary.

The sheets reuse a small vocabulary, so longest-match phrase replacement covers
most labels and product types. A value is only returned when *no* Thai remains,
otherwise None (the site then shows the Thai text).
"""
from __future__ import annotations

import re

from .textfix import skel

LABELS = {
    "โครงเก้าอี้": "Chair frame", "วัสดุหุ้ม": "Upholstery", "ขาเก้าอี้": "Chair base", "ฟองน้ำ": "Foam",
    "ท้าวแขน": "Armrests", "ที่ท้าวแขน": "Armrests", "ที่เท้าแขน": "Armrests", "เท้าแขน": "Armrests",
    "ล้อ": "Casters", "ล้อเก้าอี้": "Casters", "ล้อเลื่อน": "Casters", "ลูกล้อ": "Casters",
    "แผ่นท๊อป": "Top", "แผ่นท็อป": "Top", "แผ่นท๊อปโต๊ะ": "Desk top", "แผ่นท็อปโต๊ะ": "Desk top",
    "หน้าท็อปโต๊ะ": "Desk top", "แผ่นหน้าท็อป": "Top", "อุปกรณ์": "Hardware", "การปรับสูง-ต่ำ": "Height adjustment",
    "ปรับสูง-ต่ำ": "Height adjustment", "ใต้เบาะนั่ง": "Under-seat mechanism", "อุปกรณ์ใต้เบาะนั่ง": "Under-seat mechanism",
    "แผ่นบังตา": "Modesty panel", "แผ่นบังตาโต๊ะ": "Modesty panel", "บังตา": "Modesty panel", "แผงบังตา": "Modesty panel",
    "แผ่นข้าง": "Side panels", "แผ่นข้างโต๊ะ": "Desk side panels", "แผ่นข้างตู้": "Cabinet side panels",
    "ปุ่มปรับระดับโต๊ะ": "Levelling feet", "ปุ่มปรับระดับ": "Levelling feet", "ปุ่มรองขาโต๊ะ": "Leg glides",
    "ปุ่มรองขา": "Leg glides", "ขาโต๊ะ": "Desk legs", "โครงขาโต๊ะ": "Desk leg frame", "ที่วางแก้ว": "Cup holder",
    "โครงขา": "Leg frame", "เบาะนั่ง": "Seat", "เบาะที่นั่ง": "Seat", "เบาะเก้าอี้": "Seat cushion", "ที่นั่ง": "Seat",
    "แผ่นหลัง": "Back panel", "แผ่นหลังตู้": "Cabinet back panel", "กล่องในลิ้นชัก": "Drawer box",
    "กล่องลิ้นชัก": "Drawer box", "ไส้กล่องลิ้นชัก": "Drawer box", "หน้าบานลิ้นชัก": "Drawer fronts",
    "แผ่นบานลิ้นชัก": "Drawer fronts", "แผ่นหน้าลิ้นชัก": "Drawer fronts", "แผ่นหน้าบานลิ้นชัก": "Drawer fronts",
    "แผ่นหน้าโต๊ะ": "Front panel", "ไม้ดามขาตู้": "Cabinet plinth", "พนักพิง": "Backrest", "เบาะพิง": "Backrest",
    "เบาะพนักพิง": "Backrest", "หลังพิง": "Backrest", "พื้นลิ้นชัก": "Drawer bottom", "ขาโซฟา": "Sofa legs",
    "ระบบโยก": "Tilt mechanism", "ระบบโยกเอน": "Tilt mechanism", "โครงโซฟา": "Sofa frame",
    "คานรับน้ำหนัก": "Support beam", "คานรับน้ำหนักโต๊ะ": "Support beam", "โครงขากลาง": "Centre leg frame",
    "แผ่นชั้นปรับ": "Adjustable shelves", "ชั้นปรับ": "Adjustable shelves", "ชั้นปรับระดับ": "Adjustable shelves",
    "แผ่นชั้นปรับระดับ": "Adjustable shelves", "โครงขาเก้าอี้": "Chair leg frame", "หมอนรองศรีษะ": "Headrest",
    "หมอนรองศีรษะ": "Headrest", "แผ่นรองเขียน": "Writing tablet", "ที่รองเขียน": "Writing tablet",
    "โครงที่นั่งและพิง": "Seat & back frame", "อุปกรณ์ KD.Fitting": "KD fittings", "อุปกรณ์ KD Fitting": "KD fittings",
    "แกนปรับความสูง": "Gas lift", "แกนปรับสูง-ต่ำ": "Gas lift", "แผ่นท๊อปตู้": "Cabinet top", "แผ่นท็อปตู้": "Cabinet top",
    "โครงไม้": "Wooden frame", "เพรทยึดหน้าโต๊ะ": "Top mounting plate", "โครงที่นั่ง": "Seat frame",
    "โครงสร้าง": "Structure", "โครงเหล็กที่พิง": "Steel back frame", "โครงขาและพนักพิง": "Leg & back frame",
    "โครงโต๊ะ": "Desk frame", "โครงภายใน": "Inner frame", "แกนข้อพับ": "Folding hinge", "ปุ่มรองท๊อป": "Top bumpers",
    "แผ่นหน้าบานเปิดตู้": "Cabinet doors", "แผ่นบานเปิดตู้": "Cabinet doors", "บานเปิดตู้": "Cabinet doors",
    "หน้าบานเปิด": "Doors", "แผ่นบานเปิด": "Doors", "แผ่นคีย์บอร์ด": "Keyboard tray", "ถาดคีย์บอร์ด": "Keyboard tray",
    "อุปกรณ์โต๊ะพับ": "Folding mechanism", "กุญแจ": "Lock", "มือจับ": "Handles", "แกน": "Column", "โครงตู้": "Cabinet carcass",
    "รางลิ้นชัก": "Drawer runners", "รางเลื่อน": "Runners", "โครงขาโซฟา": "Sofa leg frame", "แผ่นชั้น": "Shelves",
    "แผ่นชั้นวางของ": "Shelves", "ชั้นวางของ": "Shelves", "เบาะนั่ง-พนักพิง": "Seat & backrest",
    "เบาะนั่งและพนักพิง": "Seat & backrest", "บานเปิดกระจก": "Glass doors", "โครงไม้ที่นั่ง": "Wooden seat frame",
    "หมอนอิง": "Cushions", "วัสดุ": "Material", "โครงสร้างโซฟา": "Sofa structure", "โครงที่นั่ง-พนักพิง": "Seat & back frame",
    "โครงสร้างขา": "Leg structure", "คานเหล็กรับที่นั่ง": "Seat support beam", "ขาตั้ง": "Stand", "ขาตู้": "Cabinet legs",
    "แผ่นบานเลื่อน": "Sliding doors", "บานเลื่อน": "Sliding doors", "หน้าบานเลื่อน": "Sliding doors",
    "แผ่นหน้าบานเลื่อน": "Sliding doors", "แผงหุ้มผ้า": "Fabric panel", "เสาตั้งด้านข้าง": "Side posts",
    "โครงท้าวแขน": "Armrest frame", "ไม้ปิดท้าวแขน": "Armrest caps", "การประกอบ": "Assembly", "ปลายขา": "Leg tips",
    "อุปกรณ์ Knock-Down": "Knock-down fittings", "กล่องตู้": "Cabinet box", "โครงสร้างเตียง": "Bed structure",
    "หัวเตียงและข้างเตียง": "Headboard & side rails", "พื้นเตียง": "Bed base", "ขา": "Legs", "ขาเตียง": "Bed legs",
    "แผ่นล่าง": "Bottom panel", "โครงหลังพิง": "Back frame", "บานพับ": "Hinges", "แผ่นปิดด้านหน้า": "Front panel",
    "แผ่นข้างเคาน์เตอร์": "Counter side panels", "แผงข้าง": "Side panels", "ฟองน้ำที่นั่ง": "Seat foam",
    "ฟองน้ำเบาะนั่ง": "Seat foam", "ฝาครอบเบาะนั่ง": "Seat cover", "ฝาครอบพนักพิง": "Back cover",
    "กล่องวางซีพียู": "CPU holder", "โครงพลาสติก": "Plastic frame", "โครงขาล่าง": "Base frame", "ขาสตูล": "Stool legs",
    "ที่วางเท้า": "Footrest", "ที่พักเท้า": "Footrest", "ฐานล่าง": "Base", "แผ่นชั้นตู้": "Cabinet shelves",
    "แผ่นเลคเชอร์": "Writing tablet", "แผ่นแลคเชอร์": "Writing tablet", "กล่องปลั๊กไฟ": "Power box",
    "เปลือกเก้าอี้": "Chair shell", "หูเกี่ยว": "Linking hooks", "โครงไม้ภายใน": "Inner wooden frame",
    "แผ่นหน้าบานลิ้นชัก และบานเปิด": "Drawer fronts & doors", "หน้าบานลิ้นชักและบานเปิด": "Drawer fronts & doors",
    "Lumbar Support": "Lumbar support", "โครงเหล็ก": "Steel frame", "ขนาด": "Size", "ขนาดรวม": "Overall size",
    "ขนาดสินค้า": "Size", "ขนาด เตียงนอน": "Bed size", "ขนาด โซฟา": "Sofa size", "ขนาดโซฟา": "Sofa size",
    "ขนาด สตูล": "Stool size", "ขนาดสตูล": "Stool size", "ขนาดโต๊ะ": "Table size", "ขนาด โต๊ะทำงาน": "Desk size",
    "ขนาดตู้": "Cabinet size", "ขนาด เก้าอี้": "Chair size", "ขนาดท่านั่งปกติ": "Size (seated)",
    "ขนาดท่าเอนนอน": "Size (reclined)", "ขนาด เมื่อปรับนั่ง": "Size (seated)", "เมื่อปรับนอน": "Size (reclined)",
    "ฟังก์ชั่นการใช้งาน": "Functions", "ดีไซน์เพื่อสุขภาพ": "Ergonomic design",
}
_LABELS_BY_SKEL = {skel(k): v for k, v in LABELS.items()}

# Phrase glossary, applied longest first.
PHRASES = {
    "เก้าอี้สำนักงาน": "office chair", "เก้าอี้ทำงาน": "task chair", "เก้าอี้คอมพิวเตอร์": "computer chair",
    "เก้าอี้พักคอย": "waiting chair", "เก้าอี้สำหรับนั่งพักคอย": "waiting chair", "เก้าอี้รับแขก": "guest chair",
    "เก้าอี้เอนกประสงค์": "multipurpose chair", "เก้าอี้อาหาร": "dining chair", "เก้าอี้นั่งเล่น": "lounge chair",
    "เก้าอี้พักผ่อน": "lounge chair", "เก้าอี้ผู้มาติดต่อ": "visitor chair", "เก้าอี้สำหรับผู้มาติดต่อ": "visitor chair",
    "เก้าอี้ปรับเอนนอน": "reclining chair", "เก้าอี้ห้องฝึกอบรม": "training chair", "เก้าอี้แลคเชอร์": "lecture chair",
    "เก้าอี้สำหรับประชุม หรือนั่งชมภาพยนตร์": "auditorium chair", "เก้าอี้": "chair", "เก้าอี้โครงเหล็กดัด": "steel-frame chair",
    "พนักพิงสูง": "high back", "พนักพิงกลาง": "mid back", "พนักพิงเตี้ย": "low back", "พนักสูง": "high back",
    "พนักกลาง": "mid back", "พนักเตี้ย": "low back", "พนักพิงระดับศรีษะ": "head-height back",
    "พนักพิงระดับไหล่": "shoulder-height back", "พนักระดับไหล่": "shoulder-height back",
    "พนักพิงระดับกลางหลัง": "mid back", "พนักพิงระดับเตี้ย": "low back", "ระดับศรีษะ": "head height", "ระดับไหล่": "shoulder height",
    "มีที่ท้าวแขน": "with armrests", "มีท้าวแขน": "with armrests", "มีที่เท้าแขน": "with armrests", "มีทีเท้าแขน": "with armrests",
    "ไม่มีที่ท้าวแขน": "without armrests", "ไม่มีท้าวแขน": "without armrests", "แบบมีที่ท้าวแขน": "with armrests",
    "แบบไม่มีที่ท้าวแขน": "without armrests", "มีหมอนรองศรีษะ": "with headrest", "มีหมอนรองศีรษะ": "with headrest",
    "หมอนรองศรีษะ": "headrest", "หมอนรองศีรษะ": "headrest", "โครงเหล็กดัด": "bent steel frame", "ขาดัด": "bent-leg",
    "โซฟาเบ็ด": "sofa bed", "โซฟาเบด": "sofa bed", "โซฟารับแขก": "reception sofa", "โซฟารักแขก": "reception sofa",
    "โซฟาพักผ่อน": "lounge sofa", "โซฟาเด็ก": "kids' sofa", "โซฟาเดี่ยว": "single sofa", "โซฟาผ้า": "fabric sofa",
    "โซฟาปรับนอนได้": "reclining sofa", "โซฟาเข้ามุม": "corner sofa", "โซฟา": "sofa",
    "ขนาด": "", "ที่นั่ง": "-seater", "ทรงสามเหลี่ยม": "triangular",
    "โต๊ะทำงานสำหรับผู้บริหาร": "executive desk", "โต๊ะทำงาน": "desk", "โต๊ะคอมพิวเตอร์": "computer desk",
    "โต๊ะประชุม": "meeting table", "โต๊ะเอนกประสงค์": "multipurpose table", "โต๊ะกลาง": "coffee table",
    "โต๊ะข้าง": "side table", "โต๊ะต่อข้าง": "desk return", "โต๊ะต่อมุมโค้ง": "curved corner connector",
    "โต๊ะเข้ามุมโค้ง": "curved corner desk", "โต๊ะเข้ามุม": "corner desk", "โต๊ะบาร์": "bar table",
    "โต๊ะปรินทเตอร": "printer table", "ชุดโต๊ะทำงาน": "desk set", "โต๊ะ": "table",
    "รูปตัว L": "L-shaped", "รูปตัว R": "R-shaped", "รูปตัวแอล": "L-shaped", "รูปท้องเรือ": "boat-shaped",
    "ทรงกลม": "round", "ทรงวงรี": "oval", "โล่ง": "open", "ตรง": "straight", "แบบ": "", "มีบังตา": "with modesty panel",
    "ไม่มีบังตา": "without modesty panel", "แบบไม่มีลิ้นชัก": "without drawers", "ไม่มีลิ้นชัก": "without drawers",
    "สามารถพับขาเก็บได้": "folding legs", "ขาพับได้": "folding legs", "สามารถพับหน้าโต๊ะได้": "flip top",
    "ตู้ไซด์บอร์ดด้านหลังโต๊ะทำงาน": "credenza", "ตู้ไซด์บอร์ด": "sideboard", "ตู้ข้างโต๊ะทำงาน": "desk pedestal",
    "ตู้ข้าง": "side cabinet", "ตู้วางแฟ้มเอกสาร": "file cabinet", "ตู้เก็บเอกสาร": "document cabinet",
    "ตู้เอกสาร": "document cabinet", "ตู้ลิ้นชัก": "drawer pedestal", "แบบมีล้อเลื่อน": "mobile", "มีล้อเลื่อน": "mobile",
    "ชั้น": "-tier", "ลิ้นชัก": "drawer", "เคาน์เตอร์สูง": "high counter", "เคาน์เตอร์": "counter",
    "เตียงนอน": "bed", "ฟุต": "ft", "สตูล": "stool", "สตูลที่วางเท้า": "footstool", "เก้าอี้สตูลรองขา": "footstool",
    "แผงกั้นส่วน": "partition", "ด้านซ้ายมือ": "left", "ด้านขวามือ": "right", "ซ้ายมือ": "left", "ขวามือ": "right",
    "ตรงกลาง": "centre", "มีที่วางแก้วอยู่": "with cup holder,", "มีที่วางแก้ว": "with cup holder", "มี": "with",
    "และ": "and", "พร้อม": "with", "อยู่": "", "ด้าน": "",
    # materials
    "หนังเทียม": "PU leather", "หนังแท้": "genuine leather", "ผ้าตาข่าย": "mesh", "ผ้า": "fabric",
    "ไม้จริง": "solid wood", "ไม้": "wood", "เหล็ก": "steel", "ชุบโครเมี่ยม": "chrome plated", "โครเมี่ยม": "chrome",
    "ฉีดขึ้นรูป": "injection moulded", "ขึ้นรูป": "formed", "พลาสติก": "plastic", "สีดำ": "black", "สีเทา": "grey",
    "สีขาว": "white", "สีเงิน": "silver", "สีทอง": "gold", "สีน้ำตาล": "brown", "สี": "colour", "หนา": "thick",
    "มม.": "mm", "ซม.": "cm", "ซม": "cm", "มม": "mm", "กว้าง": "W", "ลึก": "D", "สูง": "H", "ยาว": "L",
    "ขนาดของเก้าอี้ที่ระบุ อาจมีค่าแตกต่างจากมาตรฐาน": "Stated dimensions may vary from standard by",
    "ขนาดของเฟอร์นิเจอร์ที่ระบุ อาจมีค่าแตกต่างจากมาตรฐาน": "Stated dimensions may vary from standard by",
    "ขนาดของโต๊ะที่ระบุ อาจมีค่าแตกต่างจากมาตรฐาน": "Stated dimensions may vary from standard by",
    "ไม่เกิน": "no more than",
}
_PHRASES = sorted(PHRASES.items(), key=lambda kv: -len(kv[0]))
_THAI = re.compile(r"[฀-๿]")


def translate_label(label: str) -> str | None:
    if not _THAI.search(label):
        return label
    return _LABELS_BY_SKEL.get(skel(label)) or translate_value(label)


def translate_value(text: str | None) -> str | None:
    if not text:
        return None
    if not _THAI.search(text):
        return text
    out = text
    for th, en in _PHRASES:
        if th in out:
            out = out.replace(th, f" {en} ")
    if _THAI.search(out):
        return None
    out = re.sub(r"\s+-seater", "-seater", out)
    out = re.sub(r"(\d)\s+-tier", r"\1-tier", out)
    out = re.sub(r"\s+([,.)\]])", r"\1", out)
    out = re.sub(r"([(\[])\s+", r"\1", out)
    out = re.sub(r"\s{2,}", " ", out).strip(" ,")
    return out[:1].upper() + out[1:] if out else None
