"""Extract products from Thai Taiyo's catalogue PDFs (import agreed with Thai Taiyo).

The catalogues (downloaded from thaitaiyo.co.th into .cache/web/thaitaiyo/pdf) are designed
brochures, mostly without a text layer. Products are laid out as a grid: picture, then a code
line ("CA 501A เก้าอี้ผู้บริหาร"), a size line ("600(W) x 620(D) x 1070-1170(H) mm.") and a
price (ignored). Per page we read words with positions (text layer, or Tesseract OCR),
find size lines, pair each with the code line above it, and crop the picture above the code.

Stage 1 (slow, cached):  python -m nat_ingest.web_thaitaiyo ocr
Stage 2 (fast):          records() is called by the build
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

from .paths import CACHE

SRC = CACHE / "web" / "thaitaiyo"
PDFS = SRC / "pdf"
WORDS = SRC / "words"  # per-page word boxes (JSON)
PAGES = SRC / "pages"  # per-page rasters used for cropping
CROPS = SRC / "img"
TESSDATA = CACHE / "tessdata"
DPI = 300

THAI = r"฀-๿"


def fix_thai_spacing(s: str) -> str:
    """Tesseract puts spaces between Thai characters; remove spaces between two Thai letters."""
    s = re.sub(rf"(?<=[{THAI}]) (?=[{THAI}])", "", s)
    # OCR writes สระอำ as nikhahit + sara aa
    return s.replace("\u0e4d\u0e32", "\u0e33").replace("\u0e4d \u0e32", "\u0e33")


# ---------------------------------------------------------------- stage 1: words per page

def _page_words(args: tuple[str, int]) -> str:
    pdf_name, pno = args
    out = WORDS / pdf_name / f"p{pno + 1}.json"
    raster = PAGES / pdf_name / f"p{pno + 1}.png"
    if out.exists() and raster.exists():
        return "cached"
    out.parent.mkdir(parents=True, exist_ok=True)
    raster.parent.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDFS / pdf_name)
    page = doc[pno]
    scale = DPI / 72
    pix = page.get_pixmap(dpi=DPI)
    pix.save(raster)
    words = []
    if len(page.get_text().strip()) > 200:
        for x0, y0, x1, y1, w, *_ in page.get_text("words"):
            words.append([round(x0 * scale), round(y0 * scale), round(x1 * scale), round(y1 * scale), w, 99])
    else:
        env = {**os.environ, "TESSDATA_PREFIX": str(TESSDATA), "OMP_THREAD_LIMIT": "1"}
        tsv = subprocess.run(["tesseract", str(raster), "-", "-l", "eng+tha", "--psm", "11", "tsv"],
                             capture_output=True, text=True, env=env).stdout
        for line in tsv.splitlines()[1:]:
            cols = line.split("\t")
            if len(cols) == 12 and cols[11].strip() and float(cols[10]) > 30:
                x, y, w, h = map(int, cols[6:10])
                words.append([x, y, x + w, y + h, cols[11].strip(), round(float(cols[10]))])
    out.write_text(json.dumps({"w": pix.width, "h": pix.height, "words": words}, ensure_ascii=False))
    return "done"


def ocr_all(workers: int = 16) -> None:
    jobs = []
    for pdf in sorted(PDFS.glob("*.pdf")):
        n = pymupdf.open(pdf).page_count
        jobs += [(pdf.name, i) for i in range(n)]
    done = 0
    with ProcessPoolExecutor(workers) as ex:
        for status in ex.map(_page_words, jobs, chunksize=2):
            done += 1
            if done % 50 == 0:
                print(f"{done}/{len(jobs)} pages", flush=True)
    print(f"words for {len(jobs)} pages")


# ---------------------------------------------------------------- stage 2: products

# Size lines: "1600(W) x 800(D) x 750(H) mm", "W600*D600*H750", "600x620x1070-1170 mm"
NUM = r"\d{2,4}(?:[.,]\d)?(?:\s*[-–]\s*\d{2,4})?"
SIZE_RX = re.compile(
    rf"(?:(?P<a>{NUM})\s*\(?\s*[WwLl]\s*\)?\s*[xX×*]\s*(?P<b>{NUM})\s*\(?\s*[DdWw]\s*\)?(?:\s*[xX×*]\s*(?P<c>{NUM})\s*\(?\s*[Hh]\s*\)?)?)"
    rf"|(?:[Ww]\s*(?P<a2>{NUM})\s*[xX×*]?\s*[Dd]\s*(?P<b2>{NUM})(?:\s*[xX×*]?\s*[Hh]\s*(?P<c2>{NUM}))?)"
    rf"|(?:(?P<a3>{NUM})\s*\(\s*[ØøDd]\s*\)\s*[xX×*]\s*(?P<c3>{NUM})\s*\(?\s*[Hh]\s*\)?)"
)
CODE_RX = re.compile(r"^(?=[A-Z0-9./-]*\d)(?=[A-Z0-9./-]*[A-Z])[A-Z0-9][A-Z0-9./-]{2,}$")


def clean_code(code: str) -> str:
    """OCR reads 0 as O inside codes: "SFO11" -> "SF011", "CA5O1A" -> "CA501A"."""
    code = re.sub(r"(?<=[A-Z]{2})O(?=\d)", "0", code)
    code = re.sub(r"(?<=\d)O|O(?=\d{2})", "0", code)
    return code.replace("—", "-").strip(".-")


def _rng(s: str | None) -> list[int] | None:
    if not s:
        return None
    parts = [float(p.replace(",", ".")) for p in re.split(r"\s*[-–]\s*", s.strip())]
    return [round(parts[0]), round(parts[-1])]


def _lines(words: list) -> list[dict]:
    """Group words into text lines (same baseline band, left to right)."""
    words = sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    lines: list[dict] = []
    for w in words:
        cy, hgt = (w[1] + w[3]) / 2, max(8, w[3] - w[1])
        for ln in lines:
            if abs(ln["cy"] - cy) < hgt * 0.55 and w[0] - ln["x1"] < hgt * 1.6 and ln["x0"] - w[2] < hgt * 1.6:
                ln["words"].append(w)
                ln["x0"], ln["x1"] = min(ln["x0"], w[0]), max(ln["x1"], w[2])
                ln["y0"], ln["y1"] = min(ln["y0"], w[1]), max(ln["y1"], w[3])
                break
        else:
            lines.append({"cy": cy, "x0": w[0], "x1": w[2], "y0": w[1], "y1": w[3], "words": [w]})
    for ln in lines:
        ln["words"].sort(key=lambda w: w[0])
        ln["text"] = fix_thai_spacing(" ".join(w[4] for w in ln["words"]))
    return lines


def _crop_above(img: np.ndarray, text_mask: np.ndarray, x0: int, x1: int, y_code: int, page_h: int) -> tuple | None:
    """Picture above a code line, inside the column [x0, x1]: the nearest tall ink block."""
    band = img[:, x0:x1] < 235
    band &= ~text_mask[:, x0:x1]
    rows = band.mean(axis=1) > 0.004
    gap_limit = int(page_h * 0.025)
    y = y_code - 4
    # skip the small W/D/H icon strip and blank space right above the code
    blocks = []
    while y > 0 and len(blocks) < 3:
        while y > 0 and not rows[y]:
            y -= 1
        bottom = y
        gap = 0
        while y > 0 and gap < gap_limit:
            gap = gap + 1 if not rows[y] else 0
            y -= 1
        top = y + gap
        if bottom - top > 4:
            blocks.append((top, bottom))
        if bottom - top > page_h * 0.06:
            break
    tall = [b for b in blocks if b[1] - b[0] > page_h * 0.06]
    if not tall:
        return None
    top, bottom = tall[0]
    cols = band[top:bottom].mean(axis=0) > 0.004
    xs = np.nonzero(cols)[0]
    if len(xs) < 20:
        return None
    return (x0 + int(xs[0]), top, x0 + int(xs[-1]) + 1, bottom)


def _refine(img: np.ndarray, mask: np.ndarray, box: tuple, words: list) -> tuple | None:
    """Keep only the product in a rough crop: the largest solid shape (text masked out),
    and only if it stands on a plain light background (not a room photo)."""
    import cv2

    x0, y0, x1, y1 = box
    region = img[y0:y1, x0:x1]
    ink = ((region < 232) & ~mask[y0:y1, x0:x1]).astype(np.uint8)
    if ink.sum() < 400:
        return None
    k = max(3, int(min(region.shape) * 0.03))
    joined = cv2.dilate(ink, np.ones((k, k), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
    if n < 2:
        return None
    # biggest blob that isn't a thin rule or banner
    cands = [(stats[i, cv2.CC_STAT_AREA], i) for i in range(1, n)
             if max(stats[i, 2], stats[i, 3]) / max(1, min(stats[i, 2], stats[i, 3])) < 6]
    if not cands:
        return None
    area, best = max(cands)
    if area < 0.04 * ink.size:
        return None
    bx, by, bw, bh = stats[best, :4]
    pad = k
    fx0, fy0 = max(0, x0 + bx - pad), max(0, y0 + by - pad)
    fx1, fy1 = min(img.shape[1], x0 + bx + bw + pad), min(img.shape[0], y0 + by + bh + pad)
    # plain background check on a thin ring around the product
    ring = np.concatenate([img[fy0:fy1, max(0, fx0 - 6):fx0].ravel(), img[fy0:fy1, fx1:fx1 + 6].ravel(),
                           img[max(0, fy0 - 6):fy0, fx0:fx1].ravel()])
    if ring.size and ring.mean() < 215:
        return None
    W, H = img.shape[1], img.shape[0]
    if fy1 < H * 0.1:
        return None  # page header: brand logos
    if max(fx1 - fx0, fy1 - fy0) < W * 0.06:
        return None  # a fragment, not a product
    solid = (img[fy0:fy1, fx0:fx1] < 232).mean()
    if solid > 0.9:
        return None  # a colour swatch or photo tile
    inside = sum(1 for w in words if fx0 <= (w[0] + w[2]) / 2 <= fx1 and fy0 <= (w[1] + w[3]) / 2 <= fy1)
    if inside > 8:
        return None  # a spec table or text panel
    return (fx0, fy0, fx1, fy1)


def _page_products(pdf_name: str, pno: int) -> list[dict]:
    wpath = WORDS / pdf_name / f"p{pno}.json"
    if not wpath.exists():
        return []
    data = json.loads(wpath.read_text())
    lines = _lines(data["words"])
    W, H = data["w"], data["h"]
    found = []
    for i, ln in enumerate(lines):
        m = SIZE_RX.search(ln["text"].replace(" ", " "))
        if not m:
            continue
        g = m.groupdict()
        w, d, h = (g["a"] or g["a2"] or g["a3"]), (g["b"] or g["b2"]), (g["c"] or g["c2"] or g["c3"])
        dia = g["a3"]
        # code line: nearest line above, overlapping horizontally, starting with a code token
        above = [c for c in lines[:i] if c["y1"] <= ln["y0"] + 4 and ln["y0"] - c["y1"] < H * 0.05
                 and c["x0"] < ln["x1"] and c["x1"] > ln["x0"] - W * 0.02]
        code_ln = None
        for c in sorted(above, key=lambda c: -c["y1"]):
            first = c["words"][0][4].strip(":").upper()
            second = c["words"][1][4].upper() if len(c["words"]) > 1 else ""
            # codes are sometimes split in two tokens ("CA 501A", "PR-915")
            if CODE_RX.match(first) or (re.match(r"^[A-Z]{1,4}$", first) and CODE_RX.match(second)):
                code_ln = c
                break
        if not code_ln:
            continue
        toks = [w[4] for w in code_ln["words"]]
        if re.match(r"^[A-Z]{1,4}$", toks[0].upper()) and len(toks) > 1 and CODE_RX.match(toks[1].upper()):
            code, rest = f"{toks[0]} {toks[1]}".upper(), toks[2:]
        else:
            code, rest = toks[0].upper().strip(":"), toks[1:]
        name = fix_thai_spacing(" ".join(rest)).strip(" -:")
        mm_unit = 10 if re.search(r"(?i)\bcm\b|ซม", ln["text"]) else 1
        mm = {}
        if dia:
            mm["dia"] = [v * mm_unit for v in _rng(dia)]
        elif w:
            mm["w"] = [v * mm_unit for v in _rng(w)]
        if d and not dia:
            mm["d"] = [v * mm_unit for v in _rng(d)]
        if h:
            mm["h"] = [v * mm_unit for v in _rng(h)]
        found.append({"code": clean_code(code), "name": name, "mm": mm, "size_text": ln["text"],
                      "box": (code_ln["x0"], code_ln["y0"], max(code_ln["x1"], ln["x1"]), ln["y1"])})
    if not found:
        return []

    # Columns: each product owns the horizontal span up to its neighbours on the same row.
    img = np.asarray(Image.open(PAGES / pdf_name / f"p{pno}.png").convert("L"))
    mask = np.zeros_like(img, dtype=bool)
    for w in data["words"]:
        mask[max(0, w[1] - 3):w[3] + 3, max(0, w[0] - 3):w[2] + 3] = True
    for f in found:
        x0, y0, x1, _ = f["box"]
        same_row = sorted(g["box"][0] for g in found if abs(g["box"][1] - y0) < H * 0.04)
        idx = same_row.index(x0)
        left = max(0, x0 - int(W * 0.03))
        if idx > 0:
            left = max(left, same_row[idx - 1] + int(W * 0.05))
        right = same_row[idx + 1] - int(W * 0.015) if idx + 1 < len(same_row) else min(W, x0 + int(W * 0.34))
        rough = _crop_above(img, mask, max(0, left), min(W, right), y0, H)
        f["crop"] = _refine(img, mask, rough, data["words"]) if rough else None
        f["page"] = pno
    return found


def _series_of(pdf_name: str) -> str:
    stem = Path(pdf_name).stem.replace("_brochure", "").replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", stem).strip().upper()


def extract() -> list[dict]:
    """All products found in the cached pages, with picture crops saved under img/."""
    CROPS.mkdir(parents=True, exist_ok=True)
    out = []
    for pdf in sorted(PDFS.glob("*.pdf")):
        n = pymupdf.open(pdf).page_count
        for p in range(1, n + 1):
            for f in _page_products(pdf.name, p):
                img_rel = None
                if f["crop"]:
                    name = f"{pdf.stem}-p{p}-{re.sub(r'[^A-Za-z0-9]+', '', f['code'])}.png"
                    Image.open(PAGES / pdf.name / f"p{p}.png").crop(f["crop"]).save(CROPS / name)
                    img_rel = f"web/thaitaiyo/img/{name}"
                out.append({**f, "pdf": pdf.name, "series_name": _series_of(pdf.name), "image": img_rel})
    return out


if __name__ == "__main__":
    if sys.argv[1:] == ["ocr"]:
        ocr_all()
    else:
        items = extract()
        print(f"{len(items)} products; {sum(1 for i in items if i['image'])} with a picture")


# ---------------------------------------------------------------- stage 3: catalogue records

# Fallback category when the product name doesn't say (per brochure)
PDF_CATEGORY = {
    "TAIYO_CHAIR": "office-chairs", "TAIYO_STEEL": "storage", "TAIYO_SAFE": "storage", "CPT": "storage",
    "SMARTFORM": "storage", "TAIYO_SMARTFORM_STEEL_TIS": "storage", "MOTECH": "desks", "MO-TECH_ACE_SERIES": "desks",
    "TAIYO_HYBRIDA": "desks", "HYBRIDA_CTS_SERIES": "desks", "HYBRIDA_HYDE_SERIES": "desks", "hybridaairon": "desks",
    "hybrida-seminar-and-conference-solution": "meeting-tables", "TAIYO_PODIUM": "counters",
    "sunon_tea_table_brochure": "coffee-tables", "sunon_mixcube_brochure": "sofas", "sunon_tetris_brochure": "sofas",
}


# Forgiving stems for OCR'd names (vowels and tone marks are often lost)
NOISY_RULES = [
    (r"ประช|CONFERENCE|MEETING", "meeting-tables"),
    (r"ผู้บริหาร|ผูบริหาร|EXECUTIVE", "executive-desks"),
    (r"โซฟ|SOFA|SEAT\b", "sofas"),
    (r"เก้า|ก้าอ|เกาอ|CHAIR", "office-chairs"),
    (r"เคาน์เตอร์|เคาเตอ|COUNTER|โพเดียม|PODIUM", "counters"),
    (r"ล็อกเกอร์|LOCKER|ตู้|ตู\b|ลิ้นชัก|ลนชก|ชั้นวาง|CABINET|SAFE|นิรภัย", "storage"),
    (r"ฉาก|แผงกั้น|PARTITION|SCREEN", "partitions"),
    (r"โต๊ะ|โตะ|DESK|TABLE", "desks"),
]


# Thai Taiyo code families (from their catalogue conventions), used when the name is unreadable
CODE_RULES = [
    (r"(^|-)\d?CFS?\d|-CF\d|^CNN-CF|^HB-CF", "meeting-tables"),
    (r"(^|-)\d?WS|^MT-WS", "workstations"),
    (r"^HB-MS|^\dMS", "partitions"),
    (r"GTF|^\dFT", "multipurpose-tables"),
    (r"^(FC|SD|RD|LK|LKM|CPT|MD|MCB|WDSD|CB|R|FR|FO|K\dC|K\dN)-?[\dA-Z]?\d|^CPT-|^\dC[MLITJS]\d|^HB-C[LMI]|^HB-P(D|ET)|^\dPD|^\dRL", "storage"),
    (r"DK\d|^HB-ARDK|^HB-DK|^CNN-DK", "desks"),
    (r"^\dCC\d|^\dCFC\d", "counters"),
    (r"^HB-EX|^\dEX\d|^CNN-EX", "executive-desks"),
    (r"^(CH|CA|BB|PRIME|CAL|CDK|CP|M)\d|^PRIME|^C-\d", "office-chairs"),
    (r"^HB-WSD|^\dWSTD|^\dDS|^\dD\d", "desks"),
]


def _thai_ok(name: str) -> bool:
    """Keep an OCR'd Thai name only if nearly all of it is real dictionary words."""
    from pythainlp.corpus import thai_words
    from pythainlp.tokenize import word_tokenize

    words = [w for w in word_tokenize(name, engine="newmm") if re.search(f"[{THAI}]", w)]
    if not words:
        return False
    vocab = _thai_ok.vocab = getattr(_thai_ok, "vocab", None) or set(thai_words())
    return sum(w in vocab for w in words) / len(words) >= 0.9 and not re.search(r"[๐-๙]", name)


def records() -> list[dict]:
    from .categorize import CATEGORIES, categorize

    if not WORDS.exists():
        return []
    cat_th = {slug: th for slug, _, th, _ in CATEGORIES}
    by_code: dict[str, dict] = {}
    for it in extract():
        key = re.sub(r"[^A-Z0-9]", "", it["code"])
        # the same product can appear on overview and price pages; keep the first with a picture
        if key in by_code and (by_code[key]["image"] or not it["image"]):
            continue
        by_code[key] = it
    def prefix(code: str) -> str:
        """Code family: "FC-634" -> "FC", "2CL850A" -> "2CL", "HB-WSD15060" -> "HB-WSD"."""
        m = re.match(r"^\d?[A-Z]+(?:-[A-Z]+)?", code.replace(" ", ""))
        return m.group(0) if m else ""

    def named_category(it: dict) -> str | None:
        name = re.sub(r"^[^\u0E00-\u0E7FA-Za-z]+", "", it["name"]).strip()
        return categorize(name, it["code"], "") or next(
            (slug for rx, slug in NOISY_RULES if re.search(rx, name, re.I)), None)

    # Learn each code family's category from products whose names were readable.
    from collections import Counter, defaultdict

    votes: dict[str, Counter] = defaultdict(Counter)
    for it in by_code.values():
        cat = named_category(it)
        if cat and len(prefix(it["code"])) >= 2:
            votes[prefix(it["code"])][cat] += 1
    family = {p: c.most_common(1)[0][0] for p, c in votes.items() if c.most_common(1)[0][1] >= 2
              and c.most_common(1)[0][1] / sum(c.values()) >= 0.7}

    out = []
    for it in by_code.values():
        if not it["image"]:
            continue  # nothing to draw: mostly spec-table rows and OCR noise
        name = re.sub(r"^[^฀-๿A-Za-z]+", "", it["name"]).strip()
        stem = Path(it["pdf"]).stem
        code_nospace = it["code"].replace(" ", "")
        by_rule = next((slug for rx, slug in CODE_RULES if re.search(rx, code_nospace)), None)
        cat = named_category(it) or family.get(prefix(it["code"])) or by_rule
        from_code = cat is not None and cat == by_rule and not named_category(it)
        guessed = cat is None
        cat = cat or PDF_CATEGORY.get(stem) or ("office-chairs" if stem.startswith("sunon") else None)
        good_name = len(name) >= 4 and _thai_ok(name)
        type_th = name if good_name else cat_th.get(cat or "", "")
        mm = it["mm"]
        th = {"w": "กว้าง", "d": "ลึก", "h": "สูง", "dia": "Ø"}
        text_th = " x ".join(f"{th[k]} {v[0] if v[0] == v[1] else f'{v[0]}-{v[1]}'}" for k, v in mm.items()) + " มม."
        flags = (["ocr-import"] + (["category-guessed"] if guessed else [])
                 + (["category-from-code"] if from_code else []) + ([] if cat else ["no-category"]))
        out.append({
            "brand": "thaitaiyo",
            "code": it["code"],
            "series": it["series_name"],
            "type_th": type_th,
            "type_en": None,
            "category": cat,
            "tags": [],
            "materials": [],
            "seats": None,
            "sizes": [{"label_th": "ขนาด", "label_en": "Size", "text_th": text_th, "text_en": it["size_text"], "mm": mm}],
            "dimensions_mm": mm,
            "specs": [],
            "features_th": [],
            "features_en": [],
            "note_th": None,
            "note_en": None,
            "source": {"file": f"thaitaiyo/{it['pdf']}", "page": it["page"], "kind": "web",
                       "images": [it["image"]] if it["image"] else [], "prechecked": True},
            "flags": flags,
        })
    return out
