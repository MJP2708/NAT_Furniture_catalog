"""NAT's own product specification documents (Word .docx), one product per file.

Source folder (default /run/media/matthew/My Passport/New folder, override with NAT_DOCS):
  <GROUP>/<GROUP>/<SUBFOLDER>/<name>.docx   e.g. CHAIR/CHAIR/OFFICE CHAIR/CA-17C.docx

Each document has a title line ("F9 ตู้เอกสารบานเปิด"), usually "คุณลักษณะเฉพาะ" (features),
a size line, then label/value lines ("โครงตู้" + value, or "ขาโซฟา : ..."). Pictures are the
embedded images, minus the letterhead logo that repeats across files. Old .doc files are
listed but skipped (no converter on this machine).
"""
from __future__ import annotations

import hashlib
import html
import io
import json
import os
import re
import zipfile
from collections import Counter
from pathlib import Path

from PIL import Image

from .categorize import categorize
from .dims import parse_size, sanity_fix
from .glossary import translate_label, translate_value
from .paths import CACHE

SOURCE = Path(os.environ.get("NAT_DOCS", "/run/media/matthew/My Passport/New folder"))
OUT = CACHE / "web" / "natdocs"
IMG = OUT / "img"

# Subfolder -> category. "Generic" folders let the product name decide first.
FOLDER = {
    "KITCHEN": "kitchen", "LOCKER": "storage", "STEEL": "storage", "WOOD": "storage", "WARDROBE": "wardrobes",
    "AUDITORIUM": "training-chairs", "LECTURE": "training-chairs", "OFFICE CHAIR": "office-chairs",
    "SITTING CHAIR": "armchairs", "WAITING CHAIR": "waiting-chairs", "PARTITION": "partitions", "SCREEN": "partitions",
    "ขาตั้ง": "partitions", "รางเลื่อน": "partitions", "เสา": "partitions", "SHELF": "shelving", "SOFA": "sofas",
    "COMPUTER DESK": "desks", "CONFERENCE TABLE": "meeting-tables", "DINNER TABLE": "dining-tables",
    "EXECLUTIVE DESK": "executive-desks", "FOLD TABLE": "multipurpose-tables", "OFFICE DESK": "desks",
    "TABLE": "multipurpose-tables",
}
GENERIC = {"TABLE", "SITTING CHAIR", "OFFICE CHAIR", "STEEL", "WOOD"}

FEATURE_HEAD = re.compile(r"^(คุณลักษณะเฉพาะ|รายละเอียด|คุณสมบัติ|Specification)s?\s*:?$", re.I)
SIZE_LINE = re.compile(r"ขนาด|\d\s*[xX×*]\s*\d|[WwDdHh]\s*\d{2,}")
CODE_TOKEN = re.compile(r"^(?=[A-Za-z0-9./-]*\d)(?=[A-Za-z0-9./-]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9./-]{1,}$")


def _paragraphs(xml: str) -> list[str]:
    out = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))
        t = re.sub(r"\s+", " ", html.unescape(t)).strip()
        if t:
            out.append(t)
    return out


def _title_parts(title: str, filename: str) -> tuple[str, str]:
    """("F9", "ตู้เอกสารบานเปิด") from "F9 ตู้เอกสารบานเปิด" / "51.CO-K ชุดครัว" / "19. ตู้ข้าง"."""
    t = re.sub(r"^\d+(\.\d+)*\.?\s*", "", title).strip()  # leading list numbering
    parts = t.split(" ", 1)
    if parts and CODE_TOKEN.match(parts[0]):
        return parts[0].upper(), (parts[1] if len(parts) > 1 else "").strip()
    # code glued to Thai text ("CA-17Cเก้าอี้") or only in the file name
    m = re.match(r"^([A-Za-z][A-Za-z0-9./-]*\d[A-Za-z0-9./-]*)", t)
    if m:
        return m.group(1).upper(), t[m.end():].strip()
    m = re.search(r"(?:รุ่น\s*)?([A-Za-z]{1,5}[- ]?\d[A-Za-z0-9./-]*)", Path(filename).stem)
    if m:
        return m.group(1).replace(" ", "-").upper(), t
    return "", t


# Lines about a component's size (tube, leg, board thickness) are not the product's size.
COMPONENT = re.compile(r"เหล็ก|ท่อ|แป๊บ|หนา|เส้นผ่า|โครงสร้าง|ขาเก้าอี้|ขาโต๊ะ|สกรู|ล้อ|รู")


def _is_size_line(line: str) -> bool:
    mm = parse_size(line)
    if not mm or len(mm) < 2:
        return False
    head = line.split(":", 1)[0] if ":" in line[:30] else line[:25]
    return bool(re.search(r"ขนาด|กว้าง|[Ww]\s*\d|^\s*\d", head)) and not COMPONENT.search(head)


def _parse(paras: list[str]) -> tuple[list[dict], list[str], list[str]]:
    """Spec rows (label/value), feature sentences, and size lines, from the body paragraphs."""
    rows, features, sizes = [], [], []
    body = paras[1:]
    i = 0
    while i < len(body):
        line = body[i]
        if FEATURE_HEAD.match(line):
            i += 1
            continue
        if _is_size_line(line):
            sizes.append(line)
            i += 1
            continue
        m = re.match(r"^([^:：]{2,40})\s*[:：]\s*(.+)$", line)
        if m and not re.search(r"ISO|มาตรฐาน", m.group(1)):
            label, value = m.group(1).strip(), m.group(2).strip()
            if label.startswith(("รหัส", "ประเภทสินค้า")):
                i += 1
                continue
            rows.append({"label": label, "value": value})
            i += 1
            continue
        # short label paragraph followed by a longer value paragraph
        nxt = body[i + 1] if i + 1 < len(body) else ""
        if (len(line) <= 28 and not re.search(r"\d{2,}", line) and nxt and len(nxt) > len(line)
                and not FEATURE_HEAD.match(nxt) and not _is_size_line(nxt)):
            rows.append({"label": line, "value": nxt})
            i += 2
            continue
        features.append(line)
        i += 1
    return rows, features, sizes


def _images(z: zipfile.ZipFile) -> list[tuple[str, bytes]]:
    out = []
    for name in z.namelist():
        if name.startswith("word/media/") and re.search(r"\.(png|jpe?g|gif|bmp|tiff?)$", name, re.I):
            data = z.read(name)
            if len(data) > 3000:
                out.append((name, data))
    return out


def extract() -> list[dict]:
    """Read every .docx into a raw record (cached pictures under img/)."""
    IMG.mkdir(parents=True, exist_ok=True)
    docs = sorted(SOURCE.rglob("*.docx"))
    raw, skipped = [], sorted(str(p.relative_to(SOURCE)) for p in SOURCE.rglob("*.doc"))
    logo_count: Counter[str] = Counter()
    for f in docs:
        try:
            z = zipfile.ZipFile(f)
            xml = z.read("word/document.xml").decode("utf8")
        except (zipfile.BadZipFile, KeyError):
            skipped.append(str(f.relative_to(SOURCE)))
            continue
        imgs = [(n, d, hashlib.md5(d).hexdigest()) for n, d in _images(z)]
        for _, _, h in imgs:
            logo_count[h] += 1
        raw.append({"path": f, "paras": _paragraphs(xml), "imgs": imgs})

    records = []
    for r in raw:
        f: Path = r["path"]
        rel = f.relative_to(SOURCE)
        folder = rel.parts[-2]
        paras = r["paras"] or [f.stem]
        code, name = _title_parts(paras[0], f.name)
        rows, features, size_lines = _parse(paras)
        if not size_lines and parse_size(f.stem):
            size_lines = [f.stem]
        # pictures: skip the letterhead (repeats across many files), keep the largest two
        pics = []
        for n, d, h in r["imgs"]:
            if logo_count[h] >= 3:
                continue  # letterhead / badge reused across documents
            try:
                im = Image.open(io.BytesIO(d))
            except OSError:
                continue
            w, hgt = im.size
            if w / max(1, hgt) > 3.2 or hgt / max(1, w) > 4:
                continue  # letterhead banners and strips, not products
            pics.append((w * hgt, h, d, im.format))
        pics.sort(reverse=True)
        saved = []
        for _, h, d, fmt in pics[:2]:
            dest = IMG / f"{h}.png"
            if not dest.exists():
                Image.open(io.BytesIO(d)).convert("RGBA").save(dest)
            saved.append(f"web/natdocs/img/{h}.png")
        records.append({"file": str(rel), "folder": folder, "code": code, "name": name, "title": paras[0],
                        "rows": rows, "features": features, "sizes": size_lines, "images": saved})
    (OUT / "skipped.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=1))
    return records


def records() -> list[dict]:
    """Catalogue records in the build's format (brand "nat")."""
    if not SOURCE.exists():
        return []
    out = []
    for i, r in enumerate(extract()):
        sizes, flags = [], []
        seen = set()
        for line in r["sizes"]:
            mm = parse_size(line)
            if not mm:
                continue
            mm, flag = sanity_fix(mm)
            if flag:
                flags.append(flag)
            key = json.dumps(mm, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            sizes.append({"label_th": "ขนาด", "label_en": "Size", "text_th": line, "text_en": translate_value(line), "mm": mm})
        name = r["name"] or r["title"]
        cat = FOLDER.get(r["folder"])
        if r["folder"] in GENERIC or not cat:
            cat = categorize(name, r["code"], " ".join(x["value"] for x in r["rows"])) or cat
        code = r["code"] or name
        specs = [{"label_th": x["label"], "label_en": translate_label(x["label"]),
                  "values_th": [x["value"]], "values_en": [translate_value(x["value"])]} for x in r["rows"]]
        feats = [f for f in r["features"] if f != name and len(f) > 3]
        if not sizes:
            flags.append("no-dimensions")
        if not r["images"]:
            flags.append("no-image")
        out.append({
            "brand": "nat",
            "code": code,
            "series": (r["code"].split("-")[0] if r["code"] else r["folder"]).upper(),
            "type_th": name,
            "type_en": translate_value(name),
            "category": cat,
            "tags": [],
            "materials": [],
            "seats": None,
            "sizes": sizes,
            "dimensions_mm": sizes[0]["mm"] if sizes else None,
            "specs": specs,
            "features_th": feats,
            "features_en": [translate_value(f) for f in feats],
            "note_th": None,
            "note_en": None,
            "source": {"file": f"natdocs/{r['file']}", "page": 1, "kind": "web", "images": r["images"], "prechecked": True},
            "flags": sorted(set(flags)),
        })
    return out
