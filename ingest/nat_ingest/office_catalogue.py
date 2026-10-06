"""Interactive office-furniture e-catalogue: A4 landscape PDF with internal links and bookmarks.

Reads ingest/.cache/ecatalog.json (scripts/export-catalog.ts) and sorts the office range into seven
main categories with their own codes (CH, CB, SH, ST, TB, PT, GR) and sub-categories (CH-NT,
CB-WD, ...). Every product gets a catalogue code such as CH-NT-01 and a page of its own.

  cover → contents (7 clickable tiles) → per category: overview pages (sub-category tiles, then
  thumbnails of every product, each linking to its page) → one page per product (photo, code,
  dimensions, material, colours, features, price on request, quote buttons, back/home/prev/next)

A category tab bar runs along the top of every page, the PDF outline mirrors category →
sub-category → product, and contact details are tel:/mailto:/LINE/web links. After saving, every
link and bookmark is checked against the finished file (the build fails if one is wrong), and the
products missing a photo or specification fields are listed in data/office-catalogue-missing.csv.
data/office-catalogue.json carries the same order and codes to the responsive web version (/catalogue).

Catalogue codes are kept in data/catalogue-codes.json (commit it): a product keeps its code across
rebuilds, new products get the next free number in their range, and numbers are never reused.

Usage: python -m nat_ingest.office_catalogue [--color | --all] [--data FILE] [--out DIR] [--codes FILE]
                                              [--reports DIR]
       (normally via `pnpm catalog:office`)
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from html import escape
from pathlib import Path
from urllib.parse import quote

import pymupdf

from .ecatalog import CSS, FONTS, INK, LOGO, MUTED, RED, Doc, cm, cut, hexc
from .paths import CACHE, ROOT

W, H = 842, 595  # A4 landscape, points
M = 28           # side margin
TAB_Y0, TAB_Y1 = 8, 30
TOP = 44         # content top below the tab bar
NAV_Y0, NAV_Y1 = 527, 549
FOOT_Y = H - 16
PAPER = (1, 1, 1)
RULE = (0.86, 0.85, 0.84)
LINE_GREEN = (0.024, 0.78, 0.333)  # LINE brand green for the LINE quote button
CHUNK = 200      # pages drawn and deduplicated together (see Catalogue.render)

# Contact details printed on the cover and contents and used by the links. Fill these in (or set
# NAT_PHONE / NAT_EMAIL / NAT_LINE / NAT_WEBSITE in .env.local); an empty value leaves its link out.
CONTACT = {
    "phone": "",    # e.g. "+66 34 123 456"
    "email": "",    # e.g. "sales@natfurniture.co.th"
    "line": "",     # LINE Official Account ID, e.g. "@natfurniture"
    "website": "",  # the public catalogue, e.g. "https://catalog.natfurniture.co.th"
}
ADDRESS = "64/4 Moo 7, Rai Khing, Sam Phran, Nakhon Pathom 73210, Thailand"


# ---------------------------------------------------------------- taxonomy

@dataclass
class Sub:
    code: str
    en: str
    th: str


@dataclass
class Main:
    n: int
    code: str
    en: str
    th: str
    tab: str
    accent: tuple
    subs: list[Sub] = field(default_factory=list)

    @property
    def ranges(self) -> list[Sub]:
        """Sub-categories; a category without any is one range carrying the category code."""
        return self.subs or [Sub(self.code, self.en, self.th)]


TAXONOMY = [
    Main(1, "CH", "Chairs", "เก้าอี้", "CHAIRS", (0.165, 0.365, 0.62), [
        Sub("CH-NT", "Mesh / Net Chairs", "เก้าอี้ตาข่าย"),
        Sub("CH-LT", "Leather Chairs", "เก้าอี้หนัง"),
        Sub("CH-MP", "Multipurpose Chairs", "เก้าอี้เอนกประสงค์ (ไม่มีล้อ)"),
        Sub("CH-MW", "Multipurpose Chairs with Wheels", "เก้าอี้เอนกประสงค์ (มีล้อ)"),
    ]),
    Main(2, "CB", "Cupboards", "ตู้", "CUPBOARDS", (0.0, 0.49, 0.49), [
        Sub("CB-WD", "Wooden Cupboards", "ตู้ไม้"),
        Sub("CB-ST", "Steel Cupboards", "ตู้เหล็ก"),
    ]),
    Main(3, "SH", "Shelves", "ชั้นวาง", "SHELVES", (0.29, 0.53, 0.23), [
        Sub("SH-WD", "Wooden Shelves", "ชั้นวางไม้"),
        Sub("SH-ST", "Steel Shelves", "ชั้นวางเหล็ก"),
    ]),
    Main(4, "ST", "Sliding Track Cabinets / Mobile Shelving", "ตู้รางเลื่อน", "MOBILE SHELVING",
         (0.44, 0.29, 0.6)),
    Main(5, "TB", "Tables", "โต๊ะ", "TABLES", (0.78, 0.4, 0.11), [
        Sub("TB-WD", "Wooden Tables", "โต๊ะไม้"),
        Sub("TB-ST", "Full Steel Tables", "โต๊ะเหล็ก"),
        Sub("TB-WS", "Wood + Steel Tables", "โต๊ะไม้ขาเหล็ก"),
        Sub("TB-MT", "Meeting Tables", "โต๊ะประชุม"),
    ]),
    Main(6, "PT", "Partition Screens", "พาร์ทิชั่น & ฉากกั้น", "PARTITIONS", (0.7, 0.2, 0.35)),
    Main(7, "GR", "Guest Room Sets", "ชุดรับแขก", "GUEST ROOM", (0.58, 0.45, 0.1)),
]
MAIN_OF = {r.code: m for m in TAXONOMY for r in m.ranges}
RANGE_OF = {r.code: r for m in TAXONOMY for r in m.ranges}

CHAIRS = {"office-chairs", "visitor-chairs", "training-chairs", "waiting-chairs"}
TABLES = {"desks", "workstations", "executive-desks", "desk-extensions", "multipurpose-tables"}
WOOD_BOARD = {"particle-board", "melamine", "veneer", "hpl", "solid-wood"}
LEATHER = {"pu-leather", "genuine-leather"}

RX_MOBILE = re.compile(r"ตู้รางเลื่อน|รางเลื่อน\s*รุ่น|ตู้เอกสารแบบมีรางเลื่อน|mobile\s*(storage|shelv)|sliding\s*track|"
                       r"compactus|mobile\s*cabinet", re.I)
RX_MESH = re.compile(r"ตาข่าย|เน็ท|เน็ต|mesh|\bnet\b", re.I)
RX_LEATHER = re.compile(r"หนัง|leather", re.I)
RX_SHELF = re.compile(r"^\s*(ชั้น|shelf|shelv|rack)", re.I)
RX_PARTITION = re.compile(r"partition|patition|พาร์ทิชั่น|พาทิชั่น|ฉากกั้น|แผงกั้น|ผนังกั้น|สกรีน|screen|บังตา|เสาจับ", re.I)
RX_RECEPTION = re.compile(r"ประชาสัมพันธ์|ต้อนรับ|reception|เคาน์เตอร์สูง|จำหน่ายบัตร|^\s*เคาน์เตอร์\s*$", re.I)
RX_NOT_OFFICE = re.compile(r"อาหาร|ทานข้าว|ครัว|แต่งตัว|เครื่องแป้ง|คนไข้|ผู้ป่วย|dining|kitchen|dressing", re.I)
RX_STEEL = re.compile(r"เหล็ก|steel|metal|สแตนเลส|stainless", re.I)
RX_WOOD = re.compile(r"ไม้|wood|melamine|เมลามีน|particle|MDF|veneer|วีเนียร์|HPL|laminate|ลามิเนต", re.I)


def _type(p: dict) -> str:
    return f'{p.get("typeTh") or ""} {p.get("typeEn") or ""}'.strip()


def _spec_text(p: dict) -> str:
    return " ".join(" ".join([s.get("label_th") or ""] + [v or "" for v in s.get("values_th") or []])
                    for s in p.get("specs") or [])


def _case_material(p: dict) -> tuple[str, bool]:
    """steel | wood for a cupboard or shelf, and whether it was a guess."""
    if p.get("material") in ("steel", "wood"):
        return p["material"], False
    mats = set(p.get("materials") or [])
    if mats & WOOD_BOARD:
        return "wood", False
    if "steel" in mats or RX_STEEL.search(_type(p)):
        return "steel", False
    return "wood", True


def _table_range(p: dict) -> tuple[str, bool]:
    """TB-ST (all steel), TB-WS (wooden top on a steel frame) or TB-WD, and whether it was a guess."""
    mats = set(p.get("materials") or [])
    text = f"{_type(p)} {_spec_text(p)}"
    wood = p.get("material") == "wood" or bool(mats & WOOD_BOARD) or bool(RX_WOOD.search(text))
    steel = bool(mats & {"steel", "chrome"}) or bool(RX_STEEL.search(text))
    if p.get("material") == "steel" and not mats & WOOD_BOARD:
        return "TB-ST", False
    if wood and steel:
        return "TB-WS", False
    if wood:
        return "TB-WD", False
    if steel:
        return "TB-ST", False
    return "TB-WD", True


def classify(p: dict) -> tuple[str, list[str], bool] | None:
    """(range code, other ranges it should be cross-listed in, material guessed) or None when the
    product is not part of the office catalogue."""
    cat, t = p["category"], _type(p)
    mats, tags = set(p.get("materials") or []), set(p.get("tags") or [])
    if RX_MOBILE.search(t) and not re.search(r"ลิ้นชัก|drawer|keyboard|คีย์บอร์ด", t, re.I):
        return "ST", [], False
    if cat in CHAIRS:
        mesh = "mesh" in mats or bool(RX_MESH.search(t))
        leather = bool(mats & LEATHER) or bool(RX_LEATHER.search(t))
        specs = _spec_text(p)
        fixed = re.search(r"ไม่มีล้อ|ขาตาย|ขาเหล็กดัด|ขาตัว\s*[CcUu]|4\s*ขา|sled|cantilever", f"{t} {specs}", re.I)
        wheels = "casters" in tags or (bool(re.search(r"ล้อ|caster|castor|wheel", f"{t} {specs}", re.I)) and not fixed)
        if cat == "office-chairs" and not fixed:
            wheels = True  # task and executive chairs stand on castors unless the sheet says otherwise
        plain = "CH-MW" if wheels else "CH-MP"
        if mesh:
            return "CH-NT", ["CH-LT"] if leather else [], False
        if leather:
            # an office chair in leather is a leather chair; a leather visitor/training chair is
            # also a multipurpose one
            return "CH-LT", [] if cat == "office-chairs" else [plain], False
        return plain, [], False
    if cat in ("sofas", "sofa-beds", "coffee-tables"):
        return "GR", [], False
    if cat == "armchairs":
        return None if RX_NOT_OFFICE.search(t) else ("GR", [], False)
    if cat == "counters":
        return ("GR", [], False) if RX_RECEPTION.search(t) and not RX_NOT_OFFICE.search(t) else None
    if cat == "partitions":
        return ("PT", [], False) if RX_PARTITION.search(t) else None
    if cat == "shelving" or (cat == "storage" and RX_SHELF.search(t)):
        m, guessed = _case_material(p)
        return ("SH-ST" if m == "steel" else "SH-WD"), [], guessed
    if cat == "storage" or (cat == "wardrobes" and re.search(r"เหล็ก|steel|ล็อคเกอร์|ล็อกเกอร์|locker", t, re.I)):
        m, guessed = _case_material(p)
        return ("CB-ST" if m == "steel" else "CB-WD"), [], guessed
    if cat == "meeting-tables" or (cat in TABLES and re.search(r"โต๊ะประชุม|meeting|conference", t, re.I)):
        rng, guessed = _table_range(p)
        return "TB-MT", [rng], guessed
    if cat in TABLES:
        if RX_NOT_OFFICE.search(t):
            return None
        if re.match(r"\s*ตู้", t):  # side cabinets and sideboards listed with desks
            m, guessed = _case_material(p)
            return ("CB-ST" if m == "steel" else "CB-WD"), [], guessed
        rng, guessed = _table_range(p)
        return rng, [], guessed
    return None


# ---------------------------------------------------------------- product text

MATERIAL_EN = {
    "steel": "Steel", "chrome": "Chrome-plated steel", "aluminium": "Aluminium", "plastic": "Plastic (PP)",
    "mesh": "Mesh", "pu-leather": "PU leather", "genuine-leather": "Genuine leather", "fabric": "Fabric",
    "particle-board": "Particle board", "melamine": "Melamine", "veneer": "Wood veneer", "hpl": "HPL laminate",
    "solid-wood": "Solid wood", "glass": "Glass",
}
TAG_EN = {
    "casters": "Castors", "armrests": "Armrests", "height-adjustable": "Height adjustable", "drawers": "Drawers",
    "lockable": "Lockable", "high-back": "High back", "mid-back": "Mid back", "low-back": "Low back",
    "headrest": "Headrest", "reclining": "Reclining", "foldable": "Foldable", "writing-tablet": "Writing tablet",
    "stackable": "Stackable", "electric": "Electric",
}
COLOURS = [  # Thai or English spelling in the spec text -> colour name
    (r"สีดำ|\bblack\b", "Black"), (r"สีขาว|\bwhite\b", "White"), (r"สีเทา|\bgr[ae]y\b", "Grey"),
    (r"สีน้ำตาล|\bbrown\b", "Brown"), (r"สีครีม|\bcream\b", "Cream"), (r"สีเบจ|\bbeige\b", "Beige"),
    (r"สีแดง|\bred\b", "Red"), (r"สีน้ำเงิน|\bnavy\b", "Navy blue"), (r"สีฟ้า|\bblue\b", "Blue"),
    (r"สีเขียว|\bgreen\b", "Green"), (r"สีเหลือง|\byellow\b", "Yellow"), (r"สีส้ม|\borange\b", "Orange"),
    (r"สีชมพู|\bpink\b", "Pink"), (r"สีม่วง|\bpurple\b", "Purple"), (r"สีเงิน|\bsilver\b", "Silver"),
    (r"สีทอง|\bgold\b", "Gold"), (r"บีช|\bbeech\b", "Beech"), (r"โอ๊ค|\boak\b", "Oak"),
    (r"วอลนัท|\bwalnut\b", "Walnut"), (r"เชอร์รี่|\bcherry\b", "Cherry"),
]
RX_COLOUR_TO_ORDER = re.compile(r"ระบุ(สี)?ภายหลัง|สีมาตร(ฐ|ร)?าน|สีตามมาตรฐาน|standard colou?r", re.I)


def colours(p: dict) -> list[str]:
    text = " ".join([_type(p), _spec_text(p)] + [v or "" for s in p.get("specs") or [] for v in s.get("values_en") or []])
    found = [name for rx, name in COLOURS if re.search(rx, text, re.I)]
    if RX_COLOUR_TO_ORDER.search(text):
        found.append("standard colours to order")
    return found


# What a range implies when the import found no material words on the sheet
RANGE_MATERIAL = {
    "CH-NT": ["Mesh"], "CH-LT": ["Leather / PU leather"], "CB-WD": ["Wood"], "CB-ST": ["Steel"],
    "SH-WD": ["Wood"], "SH-ST": ["Steel"], "TB-WD": ["Wood"], "TB-ST": ["Steel"],
    "TB-WS": ["Wooden top", "Steel frame"],
}


def materials(p: dict) -> list[str]:
    found = [MATERIAL_EN.get(m, m) for m in p.get("materials") or []]
    if not found and not p.get("guessed"):
        rng = p.get("range", "")
        found = RANGE_MATERIAL.get(p["also"][0] if rng == "TB-MT" and p.get("also") else rng, [])
    return found


def features(p: dict) -> list[str]:
    out = []
    for en, th in zip(p.get("featuresEn") or [], p.get("featuresTh") or []):
        text = en or th
        if text and not re.search(r"ISO\s*9001|ผลิตในประเทศไทย", text):  # supplier boilerplate
            out.append(text)
    return out[:5]


def size_rows(p: dict) -> list[str]:
    """W 120 × D 60 × H 75 cm, one line per size set."""
    def rng(r):
        return cm(r[1]) if r[0] == r[1] else f"{cm(r[0])}–{cm(r[1])}"
    rows = []
    for mm in p.get("sizes") or []:
        parts = []
        if mm.get("dia") and not mm.get("w"):
            parts.append(f"Ø {rng(mm['dia'])}")
        parts += [f"{k.upper()} {rng(mm[k])}" for k in ("w", "d", "h") if mm.get(k)]
        if parts:
            rows.append(" × ".join(parts) + " cm")
    return rows


def name_of(p: dict) -> str:
    return p.get("typeEn") or p.get("typeTh") or p["code"]


# ---------------------------------------------------------------- codes

def assign_codes(items: list[dict], path: Path) -> None:
    """Give every product a code like CH-NT-07: kept from the registry, else the next free number."""
    registry: dict[str, str] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    used: dict[str, set[int]] = defaultdict(set)
    for code in registry.values():
        head, _, num = code.rpartition("-")
        if num.isdigit():
            used[head].add(int(num))
    by_range = defaultdict(list)
    for p in items:
        by_range[p["range"]].append(p)
    for rng, ps in by_range.items():
        for p in sorted(ps, key=lambda p: (re.sub(r"[^A-Z0-9]", "", p["code"].upper()), p["slug"])):
            code = registry.get(p["slug"])
            if not code or code.rpartition("-")[0] != rng:
                n = max(used[rng], default=0) + 1
                used[rng].add(n)
                code = f"{rng}-{n:02d}"
                registry[p["slug"]] = code
            p["cat_code"] = code
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(sorted(registry.items())), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def code_num(code: str) -> int:
    return int(code.rpartition("-")[2])


# ---------------------------------------------------------------- drawing helpers

def mix(rgb, k: float, base=PAPER):
    """k of rgb over base (a light tint for k ~ 0.1)."""
    return tuple(b + (c - b) * k for c, b in zip(rgb, base))


class Pen:
    """Latin text with insert_text (fast; Montserrat, embedded once per document), Thai through HTML
    boxes (shaped). TextWriter is avoided: it embeds the font again on every call."""

    def __init__(self, doc: Doc) -> None:
        self.doc = doc
        self.files = {"l": "Montserrat-Light.ttf", "r": "Montserrat-Regular.ttf", "s": "Montserrat-SemiBold.ttf"}
        self.fonts = {k: pymupdf.Font(fontfile=str(FONTS / f)) for k, f in self.files.items()}
        self._ok: dict[str, bool] = {}

    def latin(self, s: str) -> bool:
        if s not in self._ok:
            f = self.fonts["r"]
            self._ok[s] = all(f.has_glyph(ord(ch)) for ch in s)
        return self._ok[s]

    def width(self, s: str, size: float, font: str = "r") -> float:
        return self.fonts[font].text_length(s, fontsize=size)

    def fit(self, s: str, size: float, maxw: float, font: str = "r") -> str:
        if self.width(s, size, font) <= maxw:
            return s
        while s and self.width(s + "…", size, font) > maxw:
            s = s[:-1]
        return s.rstrip() + "…"

    def text(self, page, x: float, y: float, s: str, size: float = 8, font: str = "r", color=INK,
             align: str = "left", maxw: float | None = None) -> None:
        """Baseline at y; x is the left edge, centre or right edge depending on align."""
        if not s:
            return
        if not self.latin(s):
            w = maxw or 300
            x0 = x if align == "left" else x - w / 2 if align == "center" else x - w
            fam = {"l": "tl", "r": "tr", "s": "tm"}[font]
            self.doc.html(page, (x0, y - size * 1.25, x0 + w, y + size * 0.6),
                          f'<div class="{fam}" style="font-size:{size}pt; line-height:1.1; text-align:{align}; '
                          f'color:{hexc(color)}; white-space:nowrap">{escape(s)}</div>')
            return
        if maxw:
            s = self.fit(s, size, maxw, font)
        w = self.width(s, size, font)
        x0 = x if align == "left" else x - w / 2 if align == "center" else x - w
        page.insert_text((x0, y), s, fontsize=size, fontname=f"m{font}", fontfile=str(FONTS / self.files[font]),
                         color=color)


def button(pen: Pen, page, rect, label: str, accent, solid: bool = False, enabled: bool = True,
           size: float = 7.2) -> None:
    r = pymupdf.Rect(*rect)
    if not enabled:
        page.draw_rect(r, color=RULE, fill=(0.97, 0.97, 0.96), width=0.6, radius=0.3)
        pen.text(page, r.x0 + r.width / 2, r.y1 - r.height / 2 + size * 0.36, label, size, "s", (0.72, 0.71, 0.7),
                 "center", r.width - 10)
        return
    page.draw_rect(r, color=accent, fill=accent if solid else mix(accent, 0.08), width=0.8, radius=0.3)
    pen.text(page, r.x0 + r.width / 2, r.y1 - r.height / 2 + size * 0.36, label, size, "s",
             PAPER if solid else accent, "center", r.width - 10)


def logo(page, x0: float, y0: float, width: float) -> None:
    page.insert_image(pymupdf.Rect(x0, y0, x0 + width, y0 + width * 93 / 334), filename=str(LOGO))


def contact_links() -> list[tuple[str, str, str]]:
    """(kind, label, uri) for every configured contact channel."""
    c, out = CONTACT, []
    if c["phone"]:
        out.append(("phone", f"Tel {c['phone']}", "tel:" + re.sub(r"[^\d+]", "", c["phone"])))
    if c["email"]:
        out.append(("email", c["email"], f"mailto:{c['email']}"))
    if c["line"]:
        lid = c["line"] if c["line"].startswith("@") else "@" + c["line"]
        out.append(("line", f"LINE {lid}", f"https://line.me/R/ti/p/{quote(lid)}"))
    if c["website"]:
        out.append(("web", re.sub(r"^https?://", "", c["website"]).rstrip("/"), c["website"]))
    return out


def quote_links(p: dict) -> list[tuple[str, str]]:
    """(label, uri) for the "Request a quote" buttons, with the codes filled in."""
    msg = (f"Hello NAT Furniture, please send a quotation for {p['cat_code']} "
           f"(model {p['code']}). Quantity: ")
    out = []
    if CONTACT["line"]:
        lid = CONTACT["line"] if CONTACT["line"].startswith("@") else "@" + CONTACT["line"]
        out.append(("Request a quote · LINE", f"https://line.me/R/oaMessage/{quote(lid, safe='')}/?{quote(msg)}"))
    if CONTACT["email"]:
        subject = f"Quote request: {p['cat_code']} ({p['code']})"
        out.append(("Request a quote · Email",
                    f"mailto:{CONTACT['email']}?subject={quote(subject)}&body={quote(msg)}"))
    return out


# ---------------------------------------------------------------- page plan

GAP = 8
THUMB_COLS = 9
THUMB_W = (W - 2 * M - GAP * (THUMB_COLS - 1)) / THUMB_COLS
THUMB_H = 100
HEAD_H = 24
FLOW_BOTTOM = FOOT_Y - 14
BAND_Y1 = 196  # overview header band (category block + sub-category tiles)


@dataclass
class Overview:
    main: Main
    first: bool
    elements: list  # ("head", range, y, continued, see_also) | ("thumb", product, x, y, see_also)


def flow(main: Main, ranges: list[tuple[Sub, list, list]]) -> list[Overview]:
    """Lay the category's thumbnails out over overview pages: per range a heading, its products,
    then its cross-listed ("see also") products."""
    pages = [Overview(main, True, [])]
    y = BAND_Y1 + 14

    def new_page():
        nonlocal y
        pages.append(Overview(main, False, []))
        y = TOP + 10

    for rng, items, also in ranges:
        for see_also, group in ((False, items), (True, also)):
            if not group:
                continue
            col = 0
            if y + HEAD_H + THUMB_H > FLOW_BOTTOM:
                new_page()
            pages[-1].elements.append(("head", rng, y, False, see_also))
            y += HEAD_H
            for p in group:
                if col == THUMB_COLS:
                    col, y = 0, y + THUMB_H + GAP
                if y + THUMB_H > FLOW_BOTTOM:
                    new_page()
                    pages[-1].elements.append(("head", rng, y, True, see_also))
                    y += HEAD_H
                    col = 0
                pages[-1].elements.append(("thumb", p, M + col * (THUMB_W + GAP), y, see_also))
                col += 1
            y += THUMB_H + GAP + 6
    return pages


# ---------------------------------------------------------------- build

class Catalogue:
    def __init__(self, data: dict, color: bool, codes: Path) -> None:
        self.doc = Doc(color)
        self.pen = Pen(self.doc)
        self.color = color
        self.links: list[tuple[int, tuple, int | str]] = []  # (page, rect, target page or uri)
        self.excluded: list[dict] = []
        items, seen = [], set()
        for space in data["spaces"]:
            for cat in space["categories"]:
                for p in cat["products"]:
                    if p["slug"] in seen:  # one page per product
                        continue
                    seen.add(p["slug"])
                    p = dict(p, category=cat["slug"], categoryEn=cat["nameEn"])
                    got = classify(p)
                    if got is None:
                        self.excluded.append(p)
                        continue
                    p["range"], p["also"], p["guessed"] = got
                    p["also"] = [a for a in p["also"] if a != p["range"] and MAIN_OF[a] is MAIN_OF[p["range"]]]
                    items.append(p)
        assign_codes(items, codes)
        self.by_range: dict[str, list] = defaultdict(list)
        self.also: dict[str, list] = defaultdict(list)
        for p in items:
            self.by_range[p["range"]].append(p)
            for a in p["also"]:
                self.also[a].append(p)
        for lst in (*self.by_range.values(), *self.also.values()):
            lst.sort(key=lambda p: (p["range"], code_num(p["cat_code"])))
        self.mains = [m for m in TAXONOMY if any(self.by_range[r.code] for r in m.ranges)]
        self.products = [p for m in self.mains for r in m.ranges for p in self.by_range[r.code]]
        self.plan()

    # ---- numbering: every page is known before anything is drawn, so links can point forward
    def plan(self) -> None:
        self.pages: list[tuple] = [("cover",), ("contents",)]
        self.main_page: dict[str, int] = {}
        self.range_page: dict[str, int] = {}
        self.thumb_page: dict[str, int] = {}  # slug -> overview page with its own thumbnail
        self.product_page: dict[str, int] = {}
        for m in self.mains:
            self.main_page[m.code] = len(self.pages)
            ranges = [(r, self.by_range[r.code], self.also[r.code]) for r in m.ranges
                      if self.by_range[r.code] or self.also[r.code]]
            for ov in flow(m, ranges):
                for el in ov.elements:
                    if el[0] == "head" and not el[3] and not el[4]:
                        self.range_page.setdefault(el[1].code, len(self.pages))
                    if el[0] == "thumb" and not el[4]:
                        self.thumb_page[el[1]["slug"]] = len(self.pages)
                self.pages.append(("overview", ov))
            for r in m.ranges:
                for p in self.by_range[r.code]:
                    self.product_page[p["slug"]] = len(self.pages)
                    self.pages.append(("product", m, r, p))

    def link(self, page_no: int, rect, target: int | str) -> None:
        self.links.append((page_no, tuple(rect), target))

    # ---- shared chrome
    def tab_bar(self, page, no: int, active: Main | None) -> None:
        pen, x = self.pen, M
        home_w = 74
        tab_w = (W - 2 * M - home_w - 3 * len(TAXONOMY)) / len(TAXONOMY)
        home = (x, TAB_Y0, x + home_w, TAB_Y1)
        on = no == 1
        page.draw_rect(pymupdf.Rect(*home), color=INK, fill=INK if on else (0.95, 0.95, 0.94), width=0.6, radius=0.25)
        pen.text(page, x + home_w / 2, TAB_Y1 - 8, "CONTENTS", 6.6, "s", PAPER if on else INK, "center")
        self.link(no, home, 1)
        x += home_w + 3
        for m in TAXONOMY:
            r = (x, TAB_Y0 + (0 if m is active else 2), x + tab_w, TAB_Y1)
            present = m.code in self.main_page
            fill = m.accent if m is active else mix(m.accent, 0.12) if present else (0.96, 0.96, 0.95)
            page.draw_rect(pymupdf.Rect(*r), color=m.accent if present else RULE, fill=fill, width=0.6, radius=0.25)
            ink = PAPER if m is active else m.accent if present else (0.7, 0.7, 0.7)
            pen.text(page, x + 5, TAB_Y1 - 8, f"{m.n:02d}", 5.6, "r", ink)
            pen.text(page, x + 16, TAB_Y1 - 8, m.tab, 6.6, "s", ink, maxw=tab_w - 20)
            if present:
                self.link(no, r, self.main_page[m.code])
            x += tab_w + 3
        page.draw_rect(pymupdf.Rect(M, TAB_Y1, W - M, TAB_Y1 + 2), color=None, fill=active.accent if active else INK)

    def footer(self, page, no: int) -> None:
        pen = self.pen
        pen.text(page, M, FOOT_Y, f"NAT FURNITURE  ·  OFFICE FURNITURE E-CATALOGUE {date.today():%Y}", 6, "s", MUTED)
        total = f" / {len(self.pages)}"
        pen.text(page, W - M, FOOT_Y, total, 6, "r", MUTED, "right")
        x = W - M - pen.width(total, 6, "r")
        pen.text(page, x, FOOT_Y, f"{no + 1}", 7.5, "s", INK, "right")
        pen.text(page, x - pen.width(f"{no + 1}", 7.5, "s") - 4, FOOT_Y, "PAGE", 6, "r", MUTED, "right")

    def image(self, page, p: dict | None, box, max_px: int) -> bool:
        """Product picture into box; a quiet placeholder when there is none."""
        url = p and p.get("image")
        path = url and ROOT / "public" / (url.replace("/media/p/", "/media/photo/", 1) if self.color else url).lstrip("/")
        if path and path.exists():
            self.doc.sketch(page, url, box, align_bottom=False, max_px=max_px)
            return True
        r = pymupdf.Rect(*box)
        page.draw_rect(r, color=None, fill=(0.965, 0.962, 0.958))
        self.pen.text(page, r.x0 + r.width / 2, r.y0 + r.height / 2 + 2, "PHOTO TO FOLLOW", 5.5 if r.width < 120 else 8,
                      "s", (0.7, 0.69, 0.68), "center")
        return False

    # ---- pages
    def cover(self, page) -> None:
        pen, doc = self.pen, self.doc
        page.draw_rect(pymupdf.Rect(W * 0.46, 0, W, H), color=None, fill=(0.184, 0.196, 0.561))
        # the seven category colours as a strip down the panel edge
        sh = H / len(TAXONOMY)
        for i, m in enumerate(TAXONOMY):
            page.draw_rect(pymupdf.Rect(W * 0.46, i * sh, W * 0.46 + 10, (i + 1) * sh), color=None, fill=m.accent)
        logo(page, 70, 150, 230)
        doc.html(page, (70, 222, W * 0.46 - 20, 270),
                 '<div class="head" style="font-size:10pt; letter-spacing:1.6pt">NAT FURNITURE CO., LTD.</div>'
                 '<div class="thl muted" style="font-size:9pt">บริษัท แน๊ตเฟอร์นิเจอร์ จำกัด</div>')
        x0 = W * 0.46 + 46
        page.draw_rect(pymupdf.Rect(x0, 176, x0 + 30, 179), color=None, fill=RED)
        pen.text(page, x0, 222, "OFFICE FURNITURE", 30, "s", PAPER)
        pen.text(page, x0, 262, "E-CATALOGUE", 30, "l", PAPER)
        pen.text(page, x0, 300, f"{date.today():%Y}", 22, "s", (0.86, 0.87, 0.93))
        doc.html(page, (x0, 312, W - 30, 340),
                 '<div class="thl" style="font-size:11pt; color:#dcdde8">แคตตาล็อกเฟอร์นิเจอร์สำนักงาน</div>')
        pen.text(page, x0, 356, f"{len(self.products):,} products  ·  {len(self.mains)} categories", 8.5, "r",
                 (0.86, 0.87, 0.93))
        # contact block, every line a link
        y = 420
        pen.text(page, 70, y, "CONTACT", 7, "s", MUTED)
        y += 16
        self.doc.html(page, (70, y - 10, W * 0.46 - 20, y + 16),
                      f'<div class="num" style="font-size:7.5pt">{escape(ADDRESS)}</div>')
        y += 22
        for kind, label, uri in contact_links():
            w = pen.width(label, 8, "s") + 22
            r = (70, y - 11, 70 + w, y + 5)
            button(pen, page, r, label, (0.184, 0.196, 0.561), size=7.5)
            self.link(0, r, uri)
            y += 21
        # the way in
        r = (x0, 470, x0 + 170, 496)
        page.draw_rect(pymupdf.Rect(*r), color=None, fill=PAPER, radius=0.3)
        pen.text(page, x0 + 85, 487, "OPEN CONTENTS  →", 8, "s", (0.184, 0.196, 0.561), "center")
        self.link(0, r, 1)
        pen.text(page, W - M, FOOT_Y, "1", 7.5, "s", PAPER, "right")

    def contents(self, page) -> None:
        pen = self.pen
        pen.text(page, M, TOP + 26, "CONTENTS", 22, "s")
        self.doc.html(page, (M + pen.width("CONTENTS", 22, "s") + 14, TOP + 8, W / 2 + 60, TOP + 32),
                      '<div class="thl muted" style="font-size:12pt">สารบัญ</div>')
        pen.text(page, W - M, TOP + 26, "Tap a category to open it", 7.5, "r", MUTED, "right")
        page.draw_rect(pymupdf.Rect(M, TOP + 34, M + 30, TOP + 37), color=None, fill=RED)
        # 4 tiles over 3: every tile is a photo above a colour band, the whole tile a link
        top, gap = TOP + 50, 12
        rows = [TAXONOMY[:4], TAXONOMY[4:]]
        th = (NAV_Y1 - 6 - top - gap) / 2
        for ri, row in enumerate(rows):
            tw = (W - 2 * M - gap * 3) / 4
            x = M + (W - 2 * M - len(row) * tw - (len(row) - 1) * gap) / 2
            y = top + ri * (th + gap)
            for m in row:
                r = pymupdf.Rect(x, y, x + tw, y + th)
                present = m.code in self.main_page
                page.draw_rect(r, color=m.accent if present else RULE, fill=PAPER, width=1, radius=0.04)
                band = pymupdf.Rect(x, y + th - 62, x + tw, y + th)
                page.draw_rect(band, color=None, fill=m.accent if present else (0.8, 0.8, 0.8))
                hero = self.hero(m)
                self.image(page, hero, (x + 14, y + 10, x + tw - 14, y + th - 70), 360)
                pen.text(page, x + 12, y + th - 38, f"{m.n:02d}", 16, "s", PAPER)
                pen.text(page, x + 46, y + th - 44, m.tab, 9.5, "s", PAPER, maxw=tw - 56)
                n = sum(len(self.by_range[r_.code]) for r_ in m.ranges)
                pen.text(page, x + 46, y + th - 31, f"{m.code}  ·  {n} products" if present else f"{m.code}  ·  coming soon",
                         7, "r", PAPER)
                self.doc.html(page, (x + 46, y + th - 26, x + tw - 8, y + th - 6),
                              f'<div class="thl" style="font-size:7pt; color:#ffffff">{escape(m.th)}</div>')
                if present:
                    pen.text(page, x + tw - 10, y + 18, "OPEN  →", 6.5, "s", m.accent, "right")
                    self.link(1, r, self.main_page[m.code])
                x += tw + gap
        # contact line, each item a link
        x = M
        for kind, label, uri in contact_links():
            w = pen.width(label, 7, "s") + 18
            r = (x, NAV_Y0 + 8, x + w, NAV_Y1 + 6)
            button(pen, page, r, label, INK, size=7)
            self.link(1, r, uri)
            x += w + 6

    def hero(self, m: Main) -> dict | None:
        ps = [p for r in m.ranges for p in self.by_range[r.code] if p.get("image")]
        ps.sort(key=lambda p: (p.get("rendered", False), code_num(p["cat_code"])))
        return ps[0] if ps else None

    def overview(self, page, no: int, ov: Overview) -> None:
        pen, m = self.pen, ov.main
        if ov.first:
            block = pymupdf.Rect(M, TOP + 2, M + 214, BAND_Y1)
            page.draw_rect(block, color=None, fill=m.accent)
            pen.text(page, M + 16, TOP + 46, f"{m.n:02d}", 34, "s", PAPER)
            pen.text(page, M + 16, TOP + 72, m.tab, 13, "s", PAPER, maxw=190)
            self.doc.html(page, (M + 16, TOP + 78, M + 206, TOP + 100),
                          f'<div class="thl" style="font-size:10pt; color:#ffffff">{escape(m.th)}</div>')
            n = sum(len(self.by_range[r.code]) for r in m.ranges)
            pen.text(page, M + 16, BAND_Y1 - 30, f"CODE {m.code}", 7, "s", PAPER)
            pen.text(page, M + 16, BAND_Y1 - 16, f"{n} products" + (f"  ·  {len(m.subs)} ranges" if m.subs else ""),
                     7, "r", PAPER)
            x0 = M + 214 + 12
            if m.subs:
                tw = (W - M - x0 - GAP * (len(m.subs) - 1)) / len(m.subs)
                for i, s in enumerate(m.subs):
                    r = pymupdf.Rect(x0 + i * (tw + GAP), TOP + 2, x0 + i * (tw + GAP) + tw, BAND_Y1)
                    items = self.by_range[s.code]
                    target = self.range_page.get(s.code)
                    page.draw_rect(r, color=m.accent if target else RULE, fill=mix(m.accent, 0.07), width=0.9, radius=0.05)
                    first = next((p for p in items if p.get("image")), items[0] if items else None)
                    self.image(page, first, (r.x0 + 12, r.y0 + 10, r.x1 - 12, r.y1 - 54), 260)
                    pen.text(page, r.x0 + 10, r.y1 - 38, s.code, 7, "s", m.accent)
                    pen.text(page, r.x0 + 10, r.y1 - 26, s.en, 8, "s", INK, maxw=tw - 20)
                    pen.text(page, r.x0 + 10, r.y1 - 12, f"{len(items)} products", 6.5, "r", MUTED)
                    if target:
                        pen.text(page, r.x1 - 10, r.y1 - 12, "VIEW  →", 6.5, "s", m.accent, "right")
                        self.link(no, r, target)
            else:
                r = pymupdf.Rect(x0, TOP + 2, W - M, BAND_Y1)
                page.draw_rect(r, color=None, fill=mix(m.accent, 0.07))
                self.image(page, self.hero(m), (r.x0 + 20, r.y0 + 10, r.x0 + 300, r.y1 - 10), 400)
                self.doc.html(page, (r.x0 + 320, r.y0 + 20, r.x1 - 20, r.y1 - 16),
                              f'<div class="head" style="font-size:14pt; color:{hexc(m.accent)}">{escape(m.en.upper())}</div>'
                              f'<div class="thl" style="font-size:10pt">{escape(m.th)}</div>'
                              f'<p class="muted" style="font-size:7.5pt; margin-top:8pt">Tap any product below to open '
                              f'its page with sizes, materials and colours.</p>')
        else:
            pen.text(page, M, TOP + 2 + 9, f"{m.n:02d}  {m.en.upper()}", 9, "s", m.accent)
        for el in ov.elements:
            if el[0] == "head":
                _, rng, y, cont, see_also = el
                page.draw_rect(pymupdf.Rect(M, y + 3, M + 3, y + 15), color=None, fill=m.accent)
                if see_also:
                    label = f"SEE ALSO  ·  also listed under {rng.en}" + ("  (continued)" if cont else "")
                    pen.text(page, M + 9, y + 13, label, 8, "s", MUTED)
                else:
                    head = rng.code if m.subs else m.code
                    pen.text(page, M + 9, y + 13, head, 8.5, "s", m.accent)
                    x = M + 9 + pen.width(head, 8.5, "s") + 8
                    title = rng.en + ("  (continued)" if cont else "")
                    pen.text(page, x, y + 13, title, 8.5, "s")
                    x += pen.width(title, 8.5, "s") + 8
                    self.doc.html(page, (x, y + 2, x + 200, y + 18),
                                  f'<div class="thl muted" style="font-size:7.5pt">{escape(rng.th)}</div>')
                    pen.text(page, W - M, y + 13, f"{len(self.by_range[rng.code])} products", 7, "r", MUTED, "right")
                page.draw_line((M, y + 19), (W - M, y + 19), color=RULE, width=0.4)
            else:
                _, p, x, y, see_also = el
                r = pymupdf.Rect(x, y, x + THUMB_W, y + THUMB_H)
                page.draw_rect(r, color=m.accent if not see_also else MUTED, fill=PAPER, width=0.6, radius=0.06,
                               dashes="[2 2] 0" if see_also else None)
                self.image(page, p, (x + 6, y + 6, x + THUMB_W - 6, y + THUMB_H - 30), 200)
                pen.text(page, x + THUMB_W / 2, y + THUMB_H - 18, p["cat_code"], 7, "s", m.accent, "center",
                         THUMB_W - 6)
                pen.text(page, x + THUMB_W / 2, y + THUMB_H - 8, cut(p["code"], 22), 5.8, "r", MUTED, "center",
                         THUMB_W - 6)
                self.link(no, r, self.product_page[p["slug"]])

    def product(self, page, no: int, m: Main, rng: Sub, p: dict) -> None:
        pen, accent = self.pen, m.accent
        # breadcrumb: category › range, both links
        crumb_y = TOP + 12
        a = f"{m.n:02d}  {m.tab}"
        pen.text(page, M, crumb_y, a, 7.5, "s", accent)
        self.link(no, (M, crumb_y - 9, M + pen.width(a, 7.5, "s"), crumb_y + 3), self.main_page[m.code])
        if m.subs:
            x = M + pen.width(a, 7.5, "s") + 6
            pen.text(page, x, crumb_y, "›", 7.5, "s", MUTED)
            x += 10
            b = rng.en.upper()
            pen.text(page, x, crumb_y, b, 7.5, "s", accent)
            self.link(no, (x, crumb_y - 9, x + pen.width(b, 7.5, "s"), crumb_y + 3), self.range_page[rng.code])
        # photo panel
        panel = pymupdf.Rect(M, TOP + 22, 452, NAV_Y0 - 12)
        page.draw_rect(panel, color=RULE, fill=PAPER, width=0.6)
        page.draw_rect(pymupdf.Rect(panel.x0, panel.y0, panel.x0 + 4, panel.y1), color=None, fill=accent)
        self.image(page, p, (panel.x0 + 26, panel.y0 + 18, panel.x1 - 22, panel.y1 - 18), 640)
        # details column
        x0, x1 = 474, W - M
        pen.text(page, x0, TOP + 44, p["cat_code"], 24, "s", accent)
        name = name_of(p)
        sizes = size_rows(p) or ["—"]
        mats = materials(p)
        cols = colours(p)
        feats = features(p)
        chips = [TAG_EN[t] for t in p.get("tags") or [] if t in TAG_EN]
        construction = [(s.get("label_en") or s.get("label_th") or "",
                         (s.get("values_en") or [None])[0] or (s.get("values_th") or [""])[0])
                        for s in p.get("specs") or []
                        if not (s.get("label_th") or "").startswith("สี ·") and (s.get("values_th") or [""])[0]
                        and not re.search(r"หมายเหตุ|ISO\s*9001", (s.get("label_th") or "") + (s.get("values_th") or [""])[0])][:4]

        def row(label: str, body: str) -> str:
            return (f'<tr><td class="eyebrow muted" style="font-size:6.3pt; padding:4pt 8pt 4pt 0; vertical-align:top; '
                    f'width:74pt; border-top:0.5pt solid #dcd9d6">{label}</td>'
                    f'<td style="font-size:8pt; padding:3pt 0; border-top:0.5pt solid #dcd9d6">{body}</td></tr>')

        rows = [row("DIMENSIONS", '<span class="num">' + "<br>".join(escape(s) for s in sizes[:4]) + "</span>"
                    + (f' <span class="muted">+{len(sizes) - 4} more</span>' if len(sizes) > 4 else ""))]
        rows.append(row("MATERIAL", escape(", ".join(mats)) if mats else '<span class="muted">See construction / on request</span>'))
        rows.append(row("COLOURS", escape(", ".join(cols)).capitalize() if cols else '<span class="muted">On request</span>'))
        if feats or chips:
            body = "".join(f'<div><span style="color:{hexc(accent)}">•</span>&#160; {escape(cut(f, 110))}</div>' for f in feats)
            if chips:
                body += f'<div class="muted" style="font-size:7pt; margin-top:2pt">{escape("  ·  ".join(chips))}</div>'
            rows.append(row("KEY FEATURES", body))
        if construction:
            rows.append(row("CONSTRUCTION", "".join(
                f'<div style="font-size:7pt"><span class="thm">{escape(cut(lab, 30))}</span>&#160; '
                f'{escape(cut(val, 120))}</div>' for lab, val in construction)))
        rows.append(row("PRICE", '<span class="thm">Price on request</span> <span class="muted">· สอบถามราคา</span>'))
        html = (f'<div class="thm" style="font-size:12pt; line-height:1.3">{escape(cut(name, 90))}</div>'
                + (f'<div class="thl muted" style="font-size:8.5pt">{escape(cut(p["typeTh"], 90))}</div>'
                   if p.get("typeEn") and p.get("typeTh") else "")
                + f'<div class="num" style="font-size:8pt; margin:3pt 0 8pt 0"><span class="muted">Model</span>&#160; '
                  f'{escape(p["code"])}</div>'
                + f'<table style="width:100%; border-collapse:collapse">{"".join(rows)}</table>')
        qlinks = quote_links(p)
        bottom = NAV_Y0 - 12 - (30 if qlinks else 0) - (16 if p["also"] or CONTACT["website"] else 0)
        page.insert_htmlbox(pymupdf.Rect(x0, TOP + 52, x1, bottom), html, css=CSS, archive=self.doc.archive, scale_low=0.45)
        y = bottom + 4
        if p["also"] or CONTACT["website"]:
            x = x0
            for a in p["also"]:
                lab = f"Also in {RANGE_OF[a].en}  →"
                pen.text(page, x, y + 8, lab, 6.8, "s", accent)
                self.link(no, (x, y - 2, x + pen.width(lab, 6.8, "s"), y + 11), self.range_page.get(a, self.main_page[m.code]))
                x += pen.width(lab, 6.8, "s") + 14
            if CONTACT["website"]:
                lab = "View online  ↗"
                pen.text(page, x1, y + 8, lab, 6.8, "s", MUTED, "right")
                self.link(no, (x1 - pen.width(lab, 6.8, "s"), y - 2, x1, y + 11),
                          CONTACT["website"].rstrip("/") + f"/en/p/{p['slug']}")
            y += 16
        if qlinks:
            bw = (x1 - x0 - 8 * (len(qlinks) - 1)) / len(qlinks)
            for i, (label, uri) in enumerate(qlinks):
                r = (x0 + i * (bw + 8), y + 2, x0 + i * (bw + 8) + bw, y + 24)
                button(pen, page, r, label, LINE_GREEN if "LINE" in label else accent, solid=True, size=7.2)
                self.link(no, r, uri)
        # navigation
        i = p["_i"]
        prev_p = self.products[i - 1] if i > 0 else None
        next_p = self.products[i + 1] if i + 1 < len(self.products) else None
        widths = [0.34, 0.2, 0.23, 0.23]
        total = W - 2 * M - 3 * 8
        x = M
        specs = [
            (f"←  Back to {m.en}", self.thumb_page[p["slug"]], True),
            ("⌂  Home / Contents" if self.pen.latin("⌂") else "Home / Contents", 1, True),
            (f"‹  Previous product{'  ·  ' + prev_p['cat_code'] if prev_p else ''}",
             self.product_page[prev_p["slug"]] if prev_p else None, prev_p is not None),
            (f"Next product{'  ·  ' + next_p['cat_code'] if next_p else ''}  ›",
             self.product_page[next_p["slug"]] if next_p else None, next_p is not None),
        ]
        for wk, (label, target, enabled) in zip(widths, specs):
            r = (x, NAV_Y0, x + total * wk, NAV_Y1)
            button(self.pen, page, r, label, accent, enabled=enabled)
            if enabled:
                self.link(no, r, target)
            x += total * wk + 8

    def render(self) -> pymupdf.Document:
        for i, p in enumerate(self.products):
            p["_i"] = i
        # Every HTML box embeds its own copy of the fonts, and merging duplicates (garbage=4) slows
        # down sharply with the object count. So pages are drawn in chunks, each chunk deduplicated
        # on its own, then joined; links and bookmarks go on afterwards, across the whole file.
        final = pymupdf.open()

        def flush() -> None:
            chunk = pymupdf.open("pdf", self.doc.pdf.tobytes(garbage=4, deflate=True))
            final.insert_pdf(chunk, links=False, annots=False)
            self.doc.pdf = pymupdf.open()

        for no, entry in enumerate(self.pages):
            if no and no % CHUNK == 0:
                flush()
            page = self.doc.page()
            kind = entry[0]
            if kind == "cover":
                self.cover(page)
                continue
            if kind == "contents":
                self.tab_bar(page, no, None)
                self.contents(page)
            elif kind == "overview":
                self.tab_bar(page, no, entry[1].main)
                self.overview(page, no, entry[1])
            else:
                _, m, rng, p = entry
                self.tab_bar(page, no, m)
                self.product(page, no, m, rng, p)
            self.footer(page, no)
        flush()
        pdf = self.doc.pdf = final
        for no, rect, target in self.links:
            if isinstance(target, int):
                pdf[no].insert_link({"kind": pymupdf.LINK_GOTO, "from": pymupdf.Rect(*rect), "page": target,
                                     "to": pymupdf.Point(0, 0), "zoom": 0})
            else:
                pdf[no].insert_link({"kind": pymupdf.LINK_URI, "from": pymupdf.Rect(*rect), "uri": target})
        pdf.set_toc(self.toc())
        pdf.set_metadata({"title": f"NAT Furniture Office E-Catalogue {date.today():%Y}", "author": "NAT Furniture",
                          "subject": "Office furniture catalogue", "creator": "nat_ingest.office_catalogue"})
        return pdf

    def toc(self) -> list:
        toc = [[1, "Contents · สารบัญ", 2]]
        for m in self.mains:
            toc.append([1, f"{m.n:02d}  {m.en} ({m.code})", self.main_page[m.code] + 1])
            for r in m.ranges:
                items = self.by_range[r.code]
                if not items:
                    continue
                level = 2
                if m.subs:
                    toc.append([2, f"{r.en} ({r.code})", self.range_page[r.code] + 1])
                    level = 3
                toc += [[level, f"{p['cat_code']}  ·  {p['code']}", self.product_page[p["slug"]] + 1] for p in items]
        return toc


# ---------------------------------------------------------------- checks and reports

def verify(path: Path, cat: Catalogue) -> list[str]:
    """Open the saved PDF and test every link and bookmark against what the layout intended."""
    doc = pymupdf.open(path)
    problems: list[str] = []
    if doc.page_count != len(cat.pages):
        problems.append(f"page count {doc.page_count}, planned {len(cat.pages)}")
    actual: dict[int, list] = defaultdict(list)
    for no in range(doc.page_count):
        for ln in doc[no].get_links():
            if ln["kind"] == pymupdf.LINK_GOTO:
                if not 0 <= ln["page"] < doc.page_count:
                    problems.append(f"p{no + 1}: link to missing page {ln['page'] + 1}")
                actual[no].append((ln["from"], ln["page"]))
            elif ln["kind"] == pymupdf.LINK_URI:
                uri = ln["uri"]
                if not re.match(r"(tel:\+?\d{6,}|mailto:[^@\s]+@[^@\s]+|https://\S+)$", uri):
                    problems.append(f"p{no + 1}: malformed link {uri!r}")
                actual[no].append((ln["from"], uri))
            else:
                problems.append(f"p{no + 1}: unexpected link kind {ln['kind']}")
    # every intended link is in the file, at its place, with its target
    for no, rect, target in cat.links:
        r = pymupdf.Rect(*rect)
        if not any(t == target and abs(f.x0 - r.x0) < 1.5 and abs(f.y0 - r.y0) < 1.5 for f, t in actual[no]):
            problems.append(f"p{no + 1}: missing link to {target if isinstance(target, str) else f'page {target + 1}'}")
    # internal links land on the right page: products by their code, categories by their tab
    text_cache: dict[int, str] = {}

    def text(no: int) -> str:
        if no not in text_cache:
            text_cache[no] = doc[no].get_text()
        return text_cache[no]

    targets = {t for lst in actual.values() for _, t in lst}
    for p in cat.products:
        no = cat.product_page[p["slug"]]
        if p["cat_code"] not in text(no):
            problems.append(f"{p['cat_code']}: its page {no + 1} does not show the code")
        if no not in targets:
            problems.append(f"{p['cat_code']}: no thumbnail links to its page")
        nav = [t for _, t in actual[no] if isinstance(t, int)]
        if 1 not in nav or cat.thumb_page[p["slug"]] not in nav:
            problems.append(f"{p['cat_code']}: back/home buttons missing")
        if p["_i"] > 0 and cat.product_page[cat.products[p["_i"] - 1]["slug"]] not in nav:
            problems.append(f"{p['cat_code']}: previous button missing")
        if p["_i"] + 1 < len(cat.products) and cat.product_page[cat.products[p["_i"] + 1]["slug"]] not in nav:
            problems.append(f"{p['cat_code']}: next button missing")
    for m in cat.mains:
        no = cat.main_page[m.code]
        if m.tab not in text(no) or not any(t == no for _, t in actual[1]):
            problems.append(f"{m.code}: contents tile or overview page wrong")
    for no in range(1, doc.page_count):
        tabs = {t for _, t in actual[no] if isinstance(t, int)}
        if not set(cat.main_page.values()) | {1} <= tabs:
            problems.append(f"p{no + 1}: tab bar links incomplete")
    # bookmarks
    toc = doc.get_toc()
    if len(toc) != len(cat.toc()):
        problems.append(f"outline has {len(toc)} entries, expected {len(cat.toc())}")
    for lvl, title, pno in toc:
        if not 1 <= pno <= doc.page_count:
            problems.append(f"bookmark {title!r} points to page {pno}")
        elif lvl == 3 or (lvl == 2 and "·" in title):
            code = title.split("·")[0].strip()
            if code not in text(pno - 1):
                problems.append(f"bookmark {title!r} lands on page {pno} without that product")
    return problems


def missing_report(cat: Catalogue, path: Path) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    rows = []
    for p in cat.products:
        url = p.get("image")
        img = url and ROOT / "public" / (url.replace("/media/p/", "/media/photo/", 1) if cat.color else url).lstrip("/")
        gaps = []
        if not (img and img.exists()):
            gaps.append("photo")
        if not size_rows(p):
            gaps.append("dimensions")
        if not materials(p):
            gaps.append("material")
        if not colours(p):
            gaps.append("colours")
        if not features(p) and not any(t in TAG_EN for t in p.get("tags") or []):
            gaps.append("features")
        if p["guessed"]:
            gaps.append("range-guessed")
        for g in gaps:
            counts[g] += 1
        if gaps:
            rows.append([p["cat_code"], p["code"], RANGE_OF[p["range"]].en, " ".join(gaps), name_of(p),
                         f"/admin/p/{p['slug']}"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:  # BOM so Excel shows the Thai
        w = csv.writer(f)
        w.writerow(["catalogue_code", "model", "range", "missing", "name", "admin"])
        w.writerows(sorted(rows, key=lambda r: (r[0].rpartition("-")[0], code_num(r[0]))))
    return dict(counts)


def write_listing(cat: Catalogue, path: Path) -> None:
    """The catalogue order and codes for the web version (/catalogue, src/lib/office-catalogue.ts)."""
    rows = [{"slug": p["slug"], "code": p["cat_code"], "range": p["range"], "also": p["also"]} for p in cat.products]
    path.write_text(json.dumps({"generatedAt": date.today().isoformat(), "products": rows}, indent=1,
                               ensure_ascii=False) + "\n", encoding="utf-8")


def excluded_report(cat: Catalogue, path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["model", "site_category", "name", "admin"])
        for p in sorted(cat.excluded, key=lambda p: (p["category"], p["code"])):
            w.writerow([p["code"], p["category"], name_of(p), f"/admin/p/{p['slug']}"])


# ---------------------------------------------------------------- main

def load_contact() -> None:
    try:
        from dotenv import dotenv_values
        env = {**dotenv_values(ROOT / ".env.local"), **os.environ}
    except ImportError:
        env = dict(os.environ)
    for k in CONTACT:
        CONTACT[k] = (env.get(f"NAT_{k.upper()}") or CONTACT[k] or "").strip()


def arg(name: str, default: Path) -> Path:
    if name in sys.argv:
        return Path(sys.argv[sys.argv.index(name) + 1]).resolve()
    return default


def main() -> None:
    load_contact()
    data_path = arg("--data", CACHE / "ecatalog.json")
    out_dir = arg("--out", ROOT / "public" / "media" / "catalogue")
    codes = arg("--codes", ROOT / "data" / "catalogue-codes.json")
    reports = arg("--reports", ROOT / "data")
    data = json.loads(data_path.read_text(encoding="utf-8"))
    editions = [False, True] if "--all" in sys.argv else [("--color" in sys.argv)]
    failed = False
    for color in editions:
        cat = Catalogue(data, color, codes)
        pdf = cat.render()
        out = out_dir / ("office-catalogue-photo.pdf" if color else "office-catalogue.pdf")
        out.parent.mkdir(parents=True, exist_ok=True)
        pdf.save(out, garbage=4, deflate=True)
        pdf.close()
        problems = verify(out, cat)
        print(f"{out}: {len(cat.pages)} pages, {len(cat.products)} products, {len(cat.links):,} links, "
              f"{out.stat().st_size / 1e6:.1f} MB")
        for m in cat.mains:
            print(f"  {m.code} {m.en}: " + ", ".join(f"{r.code} {len(cat.by_range[r.code])}" for r in m.ranges))
        if problems:
            failed = True
            print(f"  LINK CHECK FAILED ({len(problems)}):")
            for pr in problems[:40]:
                print("   ", pr)
        else:
            print("  link check: every link and bookmark OK")
        if not color:
            counts = missing_report(cat, reports / "office-catalogue-missing.csv")
            excluded_report(cat, reports / "office-catalogue-excluded.csv")
            write_listing(cat, reports / "office-catalogue.json")
            print("  missing: " + (", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "nothing")
                  + " → data/office-catalogue-missing.csv")
            print(f"  not in the office catalogue: {len(cat.excluded)} products → data/office-catalogue-excluded.csv")
    if not any(CONTACT.values()):
        print("  note: no contact details set (CONTACT in office_catalogue.py or NAT_PHONE/NAT_EMAIL/NAT_LINE/"
              "NAT_WEBSITE in .env.local); contact and quote buttons were left out")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
