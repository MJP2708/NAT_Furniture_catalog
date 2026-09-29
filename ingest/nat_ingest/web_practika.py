"""Turn crawled Practika product pages (scripts/crawl-practika.ts) into catalogue records.

Practika pages are English "label : value" blocks: Material, Colour, Seating Function, Other,
and one "Dimension : <variant>" block per size. Labels are translated to Thai; values stay
in English (the supplier publishes no Thai). Photos are only used to draw our sketches.
"""
from __future__ import annotations

import json
import re

from .paths import CACHE

SRC = CACHE / "web" / "practika"

# Practika subcategory -> our category slug. Anything unlisted falls back to keyword rules.
SUBCATEGORY = {
    "Executive Table": "executive-desks",
    "Workstations & Hot Desks": "workstations",
    "Height Adjustable Tables": "desks",
    "Training & Folding Tables": "multipurpose-tables",
    "Classroom Desks & Teacher Podiums": "multipurpose-tables",
    "Tables & Dining Tables": "dining-tables",
    "Meeting Tables": "meeting-tables",
    "Meeting & Boardroom Tables": "meeting-tables",
    "High Tables": "bar",
    "Shelves & Library Stacks": "storage",
    "Conference Tables": "meeting-tables",
    "Coffee & Side Tables": "coffee-tables",
    "Cabinets": "storage",
    "Shelves": "storage",
    "Lockers": "storage",
    "Executive Chairs": "office-chairs",
    "Excutive Chairs": "office-chairs",
    "Office Chairs": "office-chairs",
    "Dining & Side Chairs": "dining-chairs",
    "Sofas & Recliners": "sofas",
    "Lounge Seating": "armchairs",
    "Quiet Sofas & Pods": "phone-booths",
    "Stacking Chairs": "training-chairs",
    "Stools & Bar Stools": "stools",
    "Classroom Chairs & Seating Pads": "training-chairs",
    "Training Chairs & Auditorium Seats": "training-chairs",
    "Benches & Row Chairs": "waiting-chairs",
}
UNIT = {"PARTITION, SCREEN & MODESTY": "partitions", "PHONE BOOTH POD": "phone-booths"}
KEYWORDS = [
    (r"BOOTH|POD\b", "phone-booths"),
    (r"BAR STOOL|BAR TABLE", "bar"),
    (r"SOFA", "sofas"),
    (r"STOOL|BENCH|OTTOMAN", "stools"),
    (r"LOUNGE|ARMCHAIR|EASY CHAIR", "armchairs"),
    (r"CHAIR", "office-chairs"),
    (r"MEETING|CONFERENCE", "meeting-tables"),
    (r"COFFEE|SIDE TABLE", "coffee-tables"),
    (r"TABLE|DESK", "desks"),
    (r"CABINET|SHELF|LOCKER|STORAGE", "storage"),
    (r"PARTITION|SCREEN|MODESTY", "partitions"),
]

# Thai type shown on cards, per category
TYPE_TH = {
    "executive-desks": "โต๊ะผู้บริหาร", "workstations": "ชุดโต๊ะทำงาน", "desks": "โต๊ะทำงาน",
    "multipurpose-tables": "โต๊ะเอนกประสงค์", "dining-tables": "โต๊ะอาหาร", "meeting-tables": "โต๊ะประชุม",
    "coffee-tables": "โต๊ะกลาง / โต๊ะข้าง", "storage": "ตู้เก็บของ", "office-chairs": "เก้าอี้สำนักงาน",
    "dining-chairs": "เก้าอี้อาหาร", "sofas": "โซฟา", "armchairs": "เก้าอี้พักผ่อน", "phone-booths": "ตู้โทรศัพท์ / พ็อด",
    "training-chairs": "เก้าอี้อบรม", "stools": "สตูล / ม้านั่ง", "waiting-chairs": "เก้าอี้แถว",
    "partitions": "แผงกั้น", "bar": "เก้าอี้บาร์",
}

LABEL_TH = {
    "material": "วัสดุ", "colour": "สี", "color": "สี", "structure": "โครงสร้าง", "frame": "โครง",
    "upholstery": "วัสดุหุ้ม", "backrest": "พนักพิง", "backrest and headrest": "พนักพิงและพนักพิงศีรษะ",
    "headrest": "พนักพิงศีรษะ", "seat": "ที่นั่ง", "armrest": "ท้าวแขน", "armrests": "ท้าวแขน",
    "base": "ฐาน", "casters": "ล้อ", "castors": "ล้อ", "glides": "ปุ่มรองขา", "leg": "ขา", "legs": "ขา",
    "mechanical unit": "กลไกปรับ", "mechanism": "กลไกปรับ", "certification": "มาตรฐานรับรอง",
    "gas lift": "โช้คปรับระดับ", "adjustable seat": "ปรับเลื่อนที่นั่ง", "adjustable lumbar": "ปรับระดับรองรับหลัง",
    "adjustable headrest": "ปรับพนักพิงศีรษะ", "adjustable armrests": "ปรับท้าวแขน", "top": "แผ่นท็อป",
    "table top": "แผ่นท็อป", "tabletop": "แผ่นท็อป", "edge": "ขอบ", "finish": "ผิวสำเร็จ", "glass": "กระจก",
    "drawer": "ลิ้นชัก", "drawers": "ลิ้นชัก", "door": "บานประตู", "doors": "บานประตู", "handle": "มือจับ",
    "panel": "แผ่น", "panels": "แผ่น", "shelf": "ชั้นวาง", "shelves": "ชั้นวาง", "lock": "กุญแจ",
    "wire management": "ระบบจัดเก็บสายไฟ", "cable management": "ระบบจัดเก็บสายไฟ", "power": "ปลั๊กไฟ",
    "foam": "ฟองน้ำ", "cushion": "เบาะ", "fabric": "ผ้า", "writing tablet": "แผ่นรองเขียน",
    "tablet": "แผ่นรองเขียน", "other": "อื่นๆ", "backrest function": "ฟังก์ชันพนักพิง", "tilt": "ปรับเอน",
    "stacking": "การซ้อน", "linking": "การต่อแถว", "ventilation": "ระบบระบายอากาศ", "lighting": "แสงสว่าง",
    "acoustic": "ซับเสียง", "sound absorption": "ซับเสียง",
}
SECTIONS = {"material", "colour", "color", "seating function", "other", "function", "features", "feature"}
DIM_AXES = {"width": "w", "depth": "d", "height": "h", "length": "w", "diameter": "dia", "dia": "dia",
            "seat height": "seat_h", "arm height": "arm_h"}


def label_th(en: str) -> str:
    return LABEL_TH.get(en.strip().lower().rstrip(":"), en.strip())


def category_of(p: dict) -> str | None:
    if p["subcategory"] in SUBCATEGORY:
        return SUBCATEGORY[p["subcategory"]]
    if p["unit"] in UNIT:
        return UNIT[p["unit"]]
    name = p["name"].upper()
    return next((slug for rx, slug in KEYWORDS if re.search(rx, name)), None)


def parse_blocks(text: str, name: str) -> tuple[list[tuple[str, str, str]], list[tuple[str, dict]]]:
    """Return (spec rows as (section, label, value), size sets as (variant, {axis: mm})).

    The page flattens to lines like: "Material", "Seat", ":", "Moulded plywood ...", ... and
    "Dimension : Rely-M", "Width", ":", "700   mm".
    """
    start = text.find(name.strip()) if name.strip() in text else text.find("Share")
    end = text.find("เรื่องน่าสนใจ")
    body = text[start:end if end > 0 else None]
    lines = [l.strip() for l in body.splitlines()]
    lines = [l for l in lines if l and l not in ("Download", "Web 360", "Share")]
    rows: list[tuple[str, str, str]] = []
    sizes: list[tuple[str, dict]] = []
    section, variant = "", None
    i = 0
    while i < len(lines):
        line = lines[i]
        m = re.match(r"(?i)dimensions?\s*:?\s*(.*)$", line)
        if m and not (i + 1 < len(lines) and lines[i + 1] == ":"):
            # "Rely-M", "Executive Set : Width x Depth x Height" -> "Executive Set"
            variant = re.sub(r"\s*:?\s*Width\s*x\s*Depth.*$", "", m.group(1).replace("\xa0", " ")).strip() or name
            sizes.append((variant, {}))
            section = "dimension"
            i += 1
            continue
        if line.lower() in SECTIONS and not (i + 1 < len(lines) and lines[i + 1] == ":"):
            section, variant = line.lower(), None
            i += 1
            continue
        if i + 1 < len(lines) and lines[i + 1] == ":":
            key = line
            j = i + 2
            vals = []
            while j < len(lines) and not (j + 1 < len(lines) and lines[j + 1] == ":") \
                    and lines[j].lower() not in SECTIONS and not re.match(r"(?i)dimensions?\s*:", lines[j]):
                vals.append(lines[j])
                j += 1
            value = " ".join(vals).strip()
            axis = DIM_AXES.get(key.lower())
            triple = re.match(r"([\d.]+)\s*[x×X]\s*([\d.]+)(?:\s*[x×X]\s*([\d.]+))?\s*(mm|cm)?", value.replace(",", ""))
            if section == "dimension" and not axis and triple:
                # "Overall : 2900 x 2450 x 750 mm", "Desk : ...": one size set per part
                f = 10 if (triple.group(4) or "").lower() == "cm" else 1
                vals = [round(float(v) * f) for v in triple.groups()[:3] if v]
                mm = dict(zip(("w", "d", "h"), ([v, v] for v in vals)))
                label = f"{variant} · {key}" if variant and variant != name else key
                if sizes and not sizes[-1][1]:
                    sizes.pop()  # the bare "Dimension : ..." header had no axes of its own
                sizes.append((label, mm))
            elif section == "dimension" and axis and sizes:
                nm = re.match(r"([\d.,]+)\s*(?:[-–]\s*([\d.,]+))?\s*(mm|cm|m)?", value.replace(",", ""))
                if nm:
                    f = {"mm": 1, "cm": 10, "m": 1000}.get((nm.group(3) or "mm").lower(), 1)
                    lo = float(nm.group(1)) * f
                    hi = float(nm.group(2)) * f if nm.group(2) else lo
                    sizes[-1][1][axis] = [round(lo), round(hi)]
            elif value:
                rows.append((section, key, value))
            i = j
            continue
        i += 1
    return rows, [s for s in sizes if s[1]]


def description(text: str, name: str) -> str:
    """The Thai introduction between the product name and the "Download" link."""
    lines = text.splitlines()
    heads = [i for i, l in enumerate(lines) if l.strip() == name.strip()]
    if not heads:
        return ""
    body = []
    for l in lines[heads[-1] + 1:]:
        if l.strip() in ("Download", "Web 360", "Material"):
            break
        if l.strip():
            body.append(l.strip())
    return "\n".join(body)


def size_text(mm: dict) -> str:
    th = {"w": "กว้าง", "d": "ลึก", "h": "สูง", "dia": "Ø", "seat_h": "สูงที่นั่ง", "arm_h": "สูงท้าวแขน"}
    parts = [f"{th[k]} {v[0] if v[0] == v[1] else f'{v[0]}-{v[1]}'}" for k, v in mm.items() if k in th]
    return " x ".join(parts) + " มม." if parts else ""


def records() -> list[dict]:
    path = SRC / "products.json"
    if not path.exists():
        return []
    out = []
    for p in json.loads(path.read_text()):
        name = re.sub(r"\s+", " ", p["name"]).strip()
        rows, sizes = parse_blocks(p["text"], name)
        cat = category_of(p)
        size_sets = [{"label_th": f"ขนาด {v}" if v and v != name else "ขนาด", "label_en": f"Size {v}" if v and v != name else "Size",
                      "text_th": size_text(mm), "text_en": None, "mm": mm or None} for v, mm in sizes if mm]
        # Rows grouped by label; section headers become part of the label when useful ("Colour · Structure").
        specs = []
        for section, key, value in rows:
            en = key if section in ("", "material", "other") else f"{section.title()} · {key}"
            th = label_th(key) if section in ("", "material", "other") else f"{label_th(section)} · {label_th(key)}"
            specs.append({"label_th": th, "label_en": en, "values_th": [value], "values_en": [value]})
        materials = sorted({m for m, rx in (("mesh", r"mesh"), ("fabric", r"fabric"), ("pu-leather", r"PU|leather"),
                                                ("steel", r"steel|metal"), ("aluminium", r"alumin"), ("solid-wood", r"solid wood|oak|ash"),
                                                ("melamine", r"melamine"), ("hpl", r"HPL|laminate"), ("plastic", r"polypropylene|nylon|plastic"))
                            if any(re.search(rx, v, re.I) for _, _, v in rows)})
        flags = []
        if not size_sets:
            flags.append("no-dimensions")
        if not cat:
            flags.append("no-category")
        primary = size_sets[0]["mm"] if size_sets else None
        out.append({
            "brand": "practika",
            "code": name.upper(),
            "series": name.split()[0].upper(),
            "type_th": TYPE_TH.get(cat or "", p["subcategory"]),
            "type_en": p["subcategory"],
            "category": cat,
            "tags": [],
            "materials": materials,
            "seats": None,
            "sizes": size_sets,
            "dimensions_mm": primary,
            "specs": specs,
            "summary_th": description(p["text"], name) or None,
            "features_th": [],
            "features_en": [],
            "note_th": "ขนาดและวัสดุอาจปรับเปลี่ยนได้ตามการสั่งผลิต",
            "note_en": "Sizes and materials can be customised to order.",
            "source": {"file": p["url"], "page": 1, "kind": "web", "images": [f"web/practika/img/{i}" for i in p["images"]]},
            "flags": flags,
        })
    return out
