"""Build data/extracted/catalog.json from the cached text layers, OCR and images.

Usage: python -m nat_ingest.build [--no-images]
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from .categorize import categorize, derive_tags, seats_of
from .dims import parse_size
from .glossary import translate_label, translate_value
from .paths import BRANDS, OCR, OUT, RAW
from .parse import ParsedPage, parse_lines
from .pdftext import TEXT, load_meta
from .textfix import Corpus, load_corpus, normalize, repair_line

SKIP_FILE = re.compile(r"^ราคา")  # price sheets; prices are entered in the admin instead


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s or "item"


def norm_code(code: str) -> str:
    return re.sub(r"[\s\-_/.]+", "", code.upper())


def series_of(code: str) -> str:
    """Leading model word of a code: "PILOT-H" -> "PILOT", "FG 1L-T" -> "FG"."""
    head = re.split(r"[\s\-/(\[]", code.strip(), maxsplit=1)[0]
    head = re.sub(r"\d+$", "", head) or head
    return head.upper()


def page_ocr(rel: str, page: int) -> str:
    p = OCR / rel / f"p{page}.txt"
    return re.sub(r"\s+", "", normalize(p.read_text())) if p.exists() else ""


def xlsx_pages(path: Path) -> list[list[str]]:
    import openpyxl

    wb = openpyxl.load_workbook(path)
    pages = []
    for ws in wb:
        lines = []
        for row in ws.iter_rows(values_only=True):
            cells = [str(c) for c in row if c not in (None, "")]
            if cells:
                lines.append(" ".join(cells))
        pages.append(lines)
    return pages


def to_record(parsed: ParsedPage, brand: str, rel: str, page: int, kind: str) -> dict:
    sizes = []
    for label, value in parsed.sizes:
        dims = parse_size(value)
        sizes.append({"label_th": label, "label_en": translate_label(label), "text_th": value,
                      "text_en": translate_value(value), "mm": dims})
    primary = next((s["mm"] for s in sizes if s["mm"]), None)
    specs = [
        {"label_th": s.label, "label_en": translate_label(s.label),
         "values_th": s.values, "values_en": [translate_value(v) for v in s.values]}
        for s in parsed.specs
    ]
    code = (parsed.code or Path(rel).name).strip()
    type_th = parsed.type or ""
    category = categorize(type_th, code, " ".join(v for s in parsed.specs for v in s.values))
    tags, materials = derive_tags(" ".join([type_th, *(f"{s.label}: {' '.join(s.values)}" for s in parsed.specs), *parsed.features]))
    flags = []
    if not parsed.code:
        flags.append("no-code")
    if not primary:
        flags.append("no-dimensions")
    if not category:
        flags.append("no-category")
    return {
        "brand": brand,
        "code": code,
        "series": series_of(code),
        "type_th": type_th,
        "type_en": translate_value(type_th),
        "category": category,
        "tags": tags,
        "materials": materials,
        "seats": seats_of(type_th),
        "sizes": sizes,
        "dimensions_mm": primary,
        "specs": specs,
        "features_th": parsed.features,
        "features_en": [translate_value(f) for f in parsed.features],
        "note_th": parsed.note,
        "note_en": translate_value(parsed.note) if parsed.note else None,
        "source": {"file": rel + (".xlsx" if kind == "xlsx" else ".pdf"), "page": page, "kind": kind},
        "images": [],
        "flags": flags,
    }


def build(with_images: bool) -> list[dict]:
    meta = load_meta()
    excel = {rel for rel, m in meta.items() if "Excel" in m["creator"]}
    corpus: Corpus = load_corpus(TEXT, OCR, excel)
    records: list[dict] = []

    for rel, m in sorted(meta.items()):
        folder, name = rel.split("/", 1)
        if SKIP_FILE.match(name):
            continue
        brand = BRANDS[folder]
        for p in range(1, m["pages"] + 1):
            text = (TEXT / rel / f"p{p}.txt").read_text()
            ocr = page_ocr(rel, p)
            lines = [repair_line(line, corpus, ocr, rel in excel) for line in text.splitlines()]
            parsed = parse_lines(lines)
            if parsed:
                records.append(to_record(parsed, brand, rel, p, "pdf"))

    for xlsx in sorted(RAW.rglob("*.xlsx")):
        rel = str(xlsx.relative_to(RAW).with_suffix(""))
        brand = BRANDS[rel.split("/", 1)[0]]
        for i, lines in enumerate(xlsx_pages(xlsx), 1):
            parsed = parse_lines([normalize(line) for line in lines])
            if parsed:
                records.append(to_record(parsed, brand, rel, i, "xlsx"))

    records = dedupe(records)
    assign_slugs(records)
    if with_images:
        from .images import attach_images

        attach_images(records)
    return records


def dedupe(records: list[dict]) -> list[dict]:
    """Same code + same size in the same brand (or re-listed under another brand) -> one product."""
    seen: dict[tuple, dict] = {}
    out = []
    for r in records:
        key = (norm_code(r["code"]), json.dumps(r["dimensions_mm"], sort_keys=True), r["type_th"])
        if key in seen and r["flags"].count("no-code") == 0:
            keep = seen[key]
            keep.setdefault("also_sources", []).append(r["source"])
            if r["brand"] != keep["brand"]:
                keep.setdefault("also_brands", []).append(r["brand"])
            continue
        seen[key] = r
        out.append(r)
    return out


def assign_slugs(records: list[dict]) -> None:
    used: Counter[str] = Counter()
    for r in records:
        base = f"{r['brand']}-{slugify(r['code'])}"
        used[base] += 1
        r["slug"] = base if used[base] == 1 else f"{base}-{used[base]}"


def report(records: list[dict]) -> None:
    flags = Counter(f for r in records for f in r["flags"])
    cats = Counter(r["category"] or "—" for r in records)
    brands = Counter(r["brand"] for r in records)
    print(f"{len(records)} products")
    print("brands:", dict(brands))
    print("flags:", dict(flags))
    print("categories:")
    for c, n in cats.most_common():
        print(f"  {n:4} {c}")


def main() -> None:
    with_images = "--no-images" not in sys.argv
    records = build(with_images)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "catalog.json").write_text(json.dumps(records, ensure_ascii=False, indent=1))
    unmapped = defaultdict(int)
    for r in records:
        if not r["category"]:
            unmapped[r["type_th"]] += 1
    (OUT / "unmapped-types.json").write_text(
        json.dumps(sorted(unmapped.items(), key=lambda x: -x[1]), ensure_ascii=False, indent=1)
    )
    report(records)


if __name__ == "__main__":
    main()
