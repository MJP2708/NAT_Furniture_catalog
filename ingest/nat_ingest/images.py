"""Extract product photos from the spec sheets and write web-ready WebP files.

* Every embedded image on a product's page is extracted with `pdfimages`.
* Images reused across many files (brand logos, badges) are decoration: the most
  common one per brand becomes that brand's logo, the rest are dropped.
* Photos are flattened onto white, trimmed, and saved as
  public/media/p/<slug>/<n>.webp (max 1200px) and <n>-sm.webp (max 480px).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import tempfile
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops

from .paths import IMG_CACHE, MEDIA, RAW

MIN_SIDE = 100
MAX_ASPECT = 6
DECOR_MIN_FILES = 4  # an image appearing in this many source files is decoration


def _list(pdf: Path, page: int) -> list[dict]:
    out = subprocess.run(["pdfimages", "-list", "-f", str(page), "-l", str(page), str(pdf)],
                         capture_output=True, text=True).stdout.splitlines()[2:]
    rows = []
    for line in out:
        cols = line.split()
        if len(cols) >= 5:
            rows.append({"num": int(cols[1]), "type": cols[2], "w": int(cols[3]), "h": int(cols[4])})
    return rows


def extract_page(args: tuple[str, int]) -> tuple[str, int, list[dict]]:
    """Extract one page's images to .cache/images/<rel>/p<page>-<num>.png (cached)."""
    rel, page = args
    pdf = RAW / f"{rel}.pdf"
    dest = IMG_CACHE / rel
    manifest = dest / f"p{page}.json"
    if manifest.exists():
        return rel, page, json.loads(manifest.read_text())
    dest.mkdir(parents=True, exist_ok=True)
    rows = _list(pdf, page)
    items: list[dict] = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-png", "-f", str(page), "-l", str(page), str(pdf), f"{tmp}/i"], check=True)
        files = sorted(Path(tmp).glob("i-*.png"))
        for idx, row in enumerate(rows):
            if row["type"] != "image" or idx >= len(files):
                continue
            img = Image.open(files[idx])
            # A following smask is this image's alpha channel.
            if idx + 1 < len(rows) and rows[idx + 1]["type"] == "smask" and idx + 1 < len(files):
                mask = Image.open(files[idx + 1]).convert("L").resize(img.size)
                img = img.convert("RGB")
                img.putalpha(mask)
            flat = flatten(img)
            out = dest / f"p{page}-{row['num']}.png"
            flat.save(out)
            items.append({"file": str(out.relative_to(IMG_CACHE)), "w": flat.width, "h": flat.height,
                          "hash": hashlib.md5(flat.tobytes()).hexdigest()})
    manifest.write_text(json.dumps(items))
    return rel, page, items


def is_photo(w: int, h: int) -> bool:
    """Reject logos/badges (small and wide) and slivers; keep wide beam-seating photos."""
    aspect = max(w, h) / max(1, min(w, h))
    if min(w, h) < MIN_SIDE or aspect > MAX_ASPECT:
        return False
    return not (max(w, h) < 450 and aspect > 2.0)


def render_photo_region(pdf: Path, page: int) -> Image.Image | None:
    """For vector/tiled artwork: render the band between the header and the first text line."""
    import re

    xml = subprocess.run(["pdftotext", "-bbox-layout", "-f", str(page), "-l", str(page), str(pdf), "-"],
                         capture_output=True, text=True).stdout
    m = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', xml)
    if not m:
        return None
    pw, ph = float(m.group(1)), float(m.group(2))
    lines = [(float(a), float(b)) for a, b in re.findall(r'<line xMin="[\d.]+" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)"', xml)]
    header = [y2 for y1, y2 in lines if y1 < ph * 0.2]
    top = max(header) + 4 if header else ph * 0.08
    below = [y1 for y1, _ in lines if y1 > top + 20]
    bottom = min(below) - 4 if below else ph * 0.6
    if bottom - top < 60:
        return None
    dpi = 200
    k = dpi / 72
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", "-f", str(page), "-l", str(page), "-singlefile",
                        "-x", str(int(0)), "-y", str(int(top * k)), "-W", str(int(pw * k)), "-H", str(int((bottom - top) * k)),
                        str(pdf), f"{tmp}/r"], check=True)
        img = Image.open(f"{tmp}/r.png").convert("RGB")
        img.load()
    cropped = trim(img)
    if min(cropped.size) < 80:
        return None
    return cropped


def flatten(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, "white")
        bg.paste(img, mask=img.split()[-1])
        return bg
    if img.mode == "CMYK":
        # pdfimages writes CMYK JPEGs inverted.
        return ImageChops.invert(img).convert("RGB")
    return img.convert("RGB")


def trim(img: Image.Image, pad: int = 12) -> Image.Image:
    gray = img.convert("L").point(lambda p: 255 if p < 245 else 0)
    box = gray.getbbox()
    if not box:
        return img
    l, t, r, b = box
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((l, t, r, b))


def save_webp(img: Image.Image, dest: Path, stem: str) -> dict:
    dest.mkdir(parents=True, exist_ok=True)
    big = img.copy()
    big.thumbnail((1200, 1200), Image.LANCZOS)
    big.save(dest / f"{stem}.webp", "WEBP", quality=86, method=6)
    small = img.copy()
    small.thumbnail((480, 480), Image.LANCZOS)
    small.save(dest / f"{stem}-sm.webp", "WEBP", quality=80, method=6)
    return {"w": big.width, "h": big.height}


def xlsx_images(path: Path) -> list[list[Image.Image]]:
    import io

    import openpyxl

    wb = openpyxl.load_workbook(path)
    return [[flatten(Image.open(io.BytesIO(img._data()))) for img in ws._images] for ws in wb]


def attach_images(records: list[dict]) -> None:
    pages = sorted({(r["source"]["file"].rsplit(".", 1)[0], r["source"]["page"])
                    for r in records if r["source"]["kind"] == "pdf"})
    with ProcessPoolExecutor() as ex:
        extracted = {(rel, page): items for rel, page, items in ex.map(extract_page, pages, chunksize=8)}

    # Decoration = same pixels in several different source files.
    files_by_hash: dict[str, set[str]] = defaultdict(set)
    for (rel, _), items in extracted.items():
        for it in items:
            files_by_hash[it["hash"]].add(rel)
    decor = {h for h, files in files_by_hash.items() if len(files) >= DECOR_MIN_FILES}

    brand_logo_votes: dict[str, Counter] = defaultdict(Counter)
    for (rel, _), items in extracted.items():
        folder = rel.split("/", 1)[0]
        for it in items:
            if it["hash"] in decor and it["w"] > it["h"] * 1.5:
                brand_logo_votes[folder][it["file"]] += 1

    if (MEDIA / "p").exists():
        shutil.rmtree(MEDIA / "p")
    xlsx_cache: dict[str, list[list[Image.Image]]] = {}

    for r in records:
        src = r["source"]
        rel = src["file"].rsplit(".", 1)[0]
        photos: list[Image.Image] = []
        if src["kind"] == "pdf":
            seen: set[str] = set()
            for it in extracted.get((rel, src["page"]), []):
                if it["hash"] in decor or it["hash"] in seen:
                    continue
                if not is_photo(it["w"], it["h"]):
                    continue
                seen.add(it["hash"])
                photos.append(Image.open(IMG_CACHE / it["file"]))
            if not photos:
                region = render_photo_region(RAW / src["file"], src["page"])
                if region is not None:
                    photos.append(region)
                    r["flags"].append("image-from-render")
        elif src["kind"] == "xlsx":
            if rel not in xlsx_cache:
                xlsx_cache[rel] = xlsx_images(RAW / src["file"])
            sheets = xlsx_cache[rel]
            photos = [p for p in sheets[src["page"] - 1] if min(p.size) >= MIN_SIDE] if src["page"] <= len(sheets) else []

        r["images"] = []
        for n, photo in enumerate(photos):
            size = save_webp(trim(photo), MEDIA / "p" / r["slug"], str(n))
            r["images"].append({"src": f"/media/p/{r['slug']}/{n}.webp",
                                "thumb": f"/media/p/{r['slug']}/{n}-sm.webp", **size,
                                "cache": f"p/{r['slug']}/{n}.webp"})
        if not r["images"]:
            r["flags"].append("no-image")

    logo_dir = MEDIA / "brands"
    logo_dir.mkdir(parents=True, exist_ok=True)
    for folder, votes in brand_logo_votes.items():
        best = votes.most_common(1)[0][0]
        img = trim(Image.open(IMG_CACHE / best), pad=4)
        from .paths import BRANDS

        img.save(logo_dir / f"{BRANDS[folder]}.png")
