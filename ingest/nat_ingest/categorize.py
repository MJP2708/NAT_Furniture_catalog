"""Map supplier "product type" text onto NAT's category tree, and derive facet tags."""
from __future__ import annotations

import re

# (slug, parent slug, Thai name, English name). Order is display order.
CATEGORIES: list[tuple[str, str | None, str, str]] = [
    ("office", None, "สำนักงาน", "Office"),
    ("office-chairs", "office", "เก้าอี้สำนักงาน", "Office chairs"),
    ("visitor-chairs", "office", "เก้าอี้ผู้มาติดต่อ", "Visitor chairs"),
    ("training-chairs", "office", "เก้าอี้เอนกประสงค์ & อบรม", "Multipurpose & training chairs"),
    ("waiting-chairs", "office", "เก้าอี้พักคอย", "Waiting & beam seating"),
    ("desks", "office", "โต๊ะทำงาน", "Desks"),
    ("workstations", "office", "ชุดโต๊ะทำงาน & เวิร์คสเตชั่น", "Workstations & desk sets"),
    ("executive-desks", "office", "โต๊ะผู้บริหาร", "Executive desks"),
    ("desk-extensions", "office", "โต๊ะต่อข้าง & ต่อมุม", "Desk returns & connectors"),
    ("meeting-tables", "office", "โต๊ะประชุม", "Meeting tables"),
    ("multipurpose-tables", "office", "โต๊ะเอนกประสงค์", "Multipurpose & folding tables"),
    ("storage", "office", "ตู้เอกสาร & ตู้ลิ้นชัก", "Storage & cabinets"),
    ("counters", "office", "เคาน์เตอร์", "Counters & reception"),
    ("partitions", "office", "แผงกั้น & อุปกรณ์", "Partitions & accessories"),
    ("phone-booths", "office", "ตู้โทรศัพท์ & พ็อด", "Phone booths & pods"),
    ("living", None, "ห้องนั่งเล่น", "Living"),
    ("sofas", "living", "โซฟา", "Sofas"),
    ("sofa-beds", "living", "โซฟาเบด & เดย์เบด", "Sofa beds & daybeds"),
    ("recliners", "living", "โซฟาปรับนอน & เก้าอี้พักผ่อน", "Recliners & lounge chairs"),
    ("armchairs", "living", "อาร์มแชร์ & เก้าอี้รับแขก", "Armchairs & accent chairs"),
    ("coffee-tables", "living", "โต๊ะกลาง & โต๊ะข้าง", "Coffee & side tables"),
    ("stools", "living", "สตูล & ม้านั่ง", "Stools & benches"),
    ("dining", None, "ห้องอาหาร", "Dining"),
    ("dining-tables", "dining", "โต๊ะอาหาร", "Dining tables"),
    ("dining-chairs", "dining", "เก้าอี้อาหาร", "Dining chairs"),
    ("bar", "dining", "โต๊ะบาร์ & เก้าอี้บาร์", "Bar tables & stools"),
    ("bedroom", None, "ห้องนอน", "Bedroom"),
    ("beds", "bedroom", "เตียงนอน & ชุดเครื่องนอน", "Beds & bedding"),
]

# First matching rule wins. Patterns run against "<type> | <code>".
RULES: list[tuple[str, str]] = [
    (r"เตียง|BEDDING|\bBED\b(?!.*SOFA)", "beds"),
    (r"บาร์|BAR\s*STOOL", "bar"),
    (r"เก้าอี้อาหาร|Dining", "dining-chairs"),
    (r"โซฟาเบ็ด|โซฟาเบด|DAY\s*BED|DAYBED", "sofa-beds"),
    (r"ปรับเอน|ปรับนอน|Recliner|เก้าอี้พักผ่อน|โซฟาพักผ่อน", "recliners"),
    (r"พักคอย", "waiting-chairs"),
    (r"ผู้มาติดต่อ", "visitor-chairs"),
    (r"เก้าอี้.*(เอนกประสงค์|แลคเชอร์|เลคเชอร์|แลกเชอร์|ฝึกอบรม|ประชุม|ภาพยนตร์)", "training-chairs"),
    (r"เก้าอี้(สำนักงาน|ทำงาน|คอมพิวเตอร์|พนักพิง|\s*Gaming)|^เก้าอี้\s*$|โครงเหล็กดัด", "office-chairs"),
    (r"สตูล|STOOL|bench|ม้านั่ง", "stools"),
    (r"เก้าอี้รับแขก|ARMCHAIR|EASY CHAIR|เก้าอี้นั่งเล่น", "armchairs"),
    (r"โซฟา|SOFA", "sofas"),
    (r"โต๊ะกลาง|โต๊ะข้าง(?!.*ทำงาน)", "coffee-tables"),
    (r"ผู้บริหาร", "executive-desks"),
    (r"ประชุม", "meeting-tables"),
    (r"โต๊ะเอนกประสงค์|Folding", "multipurpose-tables"),
    (r"เคาน์เตอร์", "counters"),
    (r"ชุดโต๊ะทำงาน|WORK\s*STATION|มุมเอียง", "workstations"),
    (r"โต๊ะต่อ|ต่อมุม|แผ่นต่อท๊อป|เข้ามุม", "desk-extensions"),
    (r"โต๊ะ(ทำงาน|คอมพิวเตอร์|ปริ)", "desks"),
    (r"ตู้|ลิ้นชัก", "storage"),
    (r"แผงกั้น|ฉากกั้น|ถาดคีย์บอร์ด|ชั้นวาง CPU|รถเข็น|ขาปิดข้าง|ขาโต๊ะ", "partitions"),
]

# Spec-text based fallback for sheets with an empty type field.
FALLBACK: list[tuple[str, str]] = [
    (r"ท้าวแขน|ล้อ|ระบบโยก|แกนปรับ", "office-chairs"),
    (r"แผ่นท๊อป|แผ่นท็อป|บังตา", "desks"),
    (r"โซฟา|หมอนอิง", "sofas"),
]


def categorize(type_th: str, code: str, spec_text: str) -> str | None:
    subject = f"{type_th} | {code}"
    for pattern, slug in RULES:
        if re.search(pattern, subject, re.I):
            return slug
    if not type_th.strip():
        for pattern, slug in FALLBACK:
            if re.search(pattern, spec_text, re.I):
                return slug
    return None


# (tag, Thai label, English label, pattern over type + specs)
TAGS: list[tuple[str, str, str, str]] = [
    ("high-back", "พนักพิงสูง", "High back", r"พนัก(พิง)?(ระดับ)?(สูง|ศรีษะ|ศีรษะ)"),
    ("mid-back", "พนักพิงกลาง", "Mid back", r"พนัก(พิง)?(ระดับ)?(กลาง|ไหล่)"),
    ("low-back", "พนักพิงเตี้ย", "Low back", r"พนัก(พิง)?(ระดับ)?เตี้ย"),
    ("armrests", "มีที่ท้าวแขน", "Armrests", r"(?<!ไม่)มี(ที่)?(ท้าว|เท้า)แขน|ท้าวแขน\s*:|Armrest"),
    ("headrest", "มีหมอนรองศีรษะ", "Headrest", r"หมอนรอง(ศรีษะ|ศีรษะ)|Headrest"),
    ("height-adjustable", "ปรับสูง-ต่ำได้", "Height adjustable", r"ปรับสูง|แกนปรับความสูง|Gas\s*Lift|โช๊คแก๊ส"),
    ("casters", "มีล้อ", "Casters", r"ล้อ(?!ม)|Caster|Castor"),
    ("stackable", "วางซ้อนได้", "Stackable", r"ซ้อน"),
    ("foldable", "พับได้", "Foldable", r"พับ(ขา|หน้า|เก็บ|ได้)"),
    ("reclining", "ปรับเอนได้", "Reclining", r"ปรับเอน|ปรับนอน|ระบบโยกเอน|Recline"),
    ("electric", "ระบบไฟฟ้า", "Electric", r"ไฟฟ้า|มอเตอร์|Motor"),
    ("writing-tablet", "มีแผ่นรองเขียน", "Writing tablet", r"แผ่นรองเขียน|แลคเชอร์|เลคเชอร์|แลกเชอร์"),
    ("drawers", "มีลิ้นชัก", "Drawers", r"ลิ้นชัก"),
    ("lockable", "มีกุญแจ", "Lockable", r"กุญแจ|Central Lock|Key Lock"),
]

MATERIALS: list[tuple[str, str, str, str]] = [
    ("mesh", "ผ้าตาข่าย", "Mesh", r"ตาข่าย|Mesh"),
    ("pu-leather", "หนังเทียม / PU", "PU leather", r"หนังเทียม|หนัง\s*PU|PU\s*Leather|พียู|หนัง\s*QK|PVC\s*Leather"),
    ("genuine-leather", "หนังแท้", "Genuine leather", r"หนังแท้|Genuine Leather"),
    ("fabric", "ผ้า", "Fabric", r"หุ้ม(ด้วย)?ผ้า|ผ้า(กำมะหยี่|ฝ้าย|บุ)|Fabric|ผ้า\s*[A-Z]{2,}"),
    ("melamine", "เมลามีน", "Melamine", r"Melamine|เมลามีน"),
    ("hpl", "HPL", "HPL laminate", r"High Pressure Laminate|HPL"),
    ("solid-wood", "ไม้จริง", "Solid wood", r"ไม้จริง|Rubber\s*Wood|ไม้ยางพารา|Solid Wood|ไม้เบญจพรรณ"),
    ("veneer", "ไม้วีเนียร์", "Veneer", r"วีเนียร์|Veneer"),
    ("steel", "เหล็ก", "Steel", r"เหล็ก|Steel"),
    ("chrome", "ชุบโครเมี่ยม", "Chrome", r"โครเมี่ยม|โครเมียม|Chrome"),
    ("aluminium", "อะลูมิเนียม", "Aluminium", r"อลูมิเนียม|อะลูมิเนียม|Alumin"),
    ("glass", "กระจก", "Glass", r"กระจก|Glass"),
    ("plastic", "พลาสติก / PP", "Plastic (PP/Nylon)", r"Polypropylene|พลาสติก|Nylon|ไนลอน"),
    ("particle-board", "ไม้ปาร์ติเกิล / MDF", "Particle board / MDF", r"Particle|MDF"),
]


def derive_tags(text: str) -> tuple[list[str], list[str]]:
    tags = [t for t, _, _, p in TAGS if re.search(p, text, re.I)]
    mats = [m for m, _, _, p in MATERIALS if re.search(p, text, re.I)]
    # Back height is mutually exclusive; keep the first one mentioned in the type.
    backs = [t for t in tags if t.endswith("-back")]
    if len(backs) > 1:
        for b in backs[1:]:
            tags.remove(b)
    return tags, mats


def seats_of(type_th: str) -> int | None:
    m = re.search(r"(\d+)\s*ที่นั่ง|(\d+)[-\s]*SEAT", type_th, re.I)
    return int(m.group(1) or m.group(2)) if m else None
