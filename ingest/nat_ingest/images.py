"""Extract product photos from the spec sheets and write web-ready WebP files.

* Every embedded image on a product's page is extracted with PyMuPDF, upright and in reading order.
* Images reused across many files (brand logos, badges) are decoration: the most
  common one per brand becomes that brand's logo, the rest are dropped.
* Photos are flattened onto white, trimmed, and saved as
  public/media/p/<slug>/<n>.webp (max 1200px) and <n>-sm.webp (max 480px).
"""
from __future__ import annotations

import hashlib
import json
import shutil
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

from .paths import IMG_CACHE, MEDIA, RAW

MIN_SIDE = 100
MAX_ASPECT = 6
DECOR_MIN_FILES = 4  # an image appearing in this many source files is decoration
# mono sheets always carry the m@ss and mono logos together, so votes tie; pin the mono one.
LOGO_PIN = {"mono": "beea223a79b45bf6d31ce21a0a78c855"}


def extract_page(args: tuple[str, int]) -> tuple[str, int, list[dict]]:
    """Extract one page's images to .cache/images/<rel>/p<page>-<n>.png (cached).

    Uses the image's placement matrix so flipped/rotated artwork comes out upright,
    and orders images top-to-bottom, left-to-right as they appear on the sheet.
    """
    import pymupdf

    rel, page = args
    dest = IMG_CACHE / rel
    manifest = dest / f"p{page}.json"
    if manifest.exists():
        return rel, page, json.loads(manifest.read_text())
    dest.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(RAW / f"{rel}.pdf")
    pg = doc[page - 1]
    infos = sorted(pg.get_image_info(xrefs=True), key=lambda i: (round(i["bbox"][1] / 20), i["bbox"][0]))
    placed: list[tuple[list[float], Image.Image]] = []
    done: set[int] = set()
    for info in infos:
        xref = info["xref"]
        if not xref or xref in done:
            continue
        done.add(xref)
        try:
            img = _pixmap_image(doc, xref)
        except Exception:
            continue
        a, b, c, d = info["transform"][:4]
        if abs(b) > abs(a):  # rotated by 90 degrees
            img = img.transpose(Image.ROTATE_90 if b > 0 else Image.ROTATE_270)
        else:
            if a < 0:
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            if d < 0:
                img = img.transpose(Image.FLIP_TOP_BOTTOM)
        placed.append((list(info["bbox"]), flatten(img)))
    items: list[dict] = []
    for n, (_, flat) in enumerate(_join_tiles(placed)):
        out = dest / f"p{page}-{n}.png"
        flat.save(out)
        items.append({"file": str(out.relative_to(IMG_CACHE)), "w": flat.width, "h": flat.height,
                      "hash": hashlib.md5(flat.tobytes()).hexdigest()})
    manifest.write_text(json.dumps(items))
    return rel, page, items


def _join_tiles(placed: list[tuple[list[float], Image.Image]], tol: float = 0.3):
    """Stitch a photo the PDF stores as strips: pieces that abut on the page with an equal-length
    shared edge in pixels (unrelated neighbours such as stacked logos differ in size)."""
    out = list(placed)
    merged = True
    while merged:
        merged = False
        for i, (bi, ii) in enumerate(out):
            for j, (bj, ij) in enumerate(out):
                if i == j:
                    continue
                if ii.width == ij.width and abs(bi[0] - bj[0]) < tol and abs(bi[2] - bj[2]) < tol \
                        and abs(bi[3] - bj[1]) < tol:
                    img = Image.new("RGB", (ii.width, ii.height + ij.height), "white")
                    img.paste(ii, (0, 0))
                    img.paste(ij, (0, ii.height))
                elif ii.height == ij.height and abs(bi[1] - bj[1]) < tol and abs(bi[3] - bj[3]) < tol \
                        and abs(bi[2] - bj[0]) < tol:
                    img = Image.new("RGB", (ii.width + ij.width, ii.height), "white")
                    img.paste(ii, (0, 0))
                    img.paste(ij, (ii.width, 0))
                else:
                    continue
                box = [min(bi[0], bj[0]), min(bi[1], bj[1]), max(bi[2], bj[2]), max(bi[3], bj[3])]
                out = [p for k, p in enumerate(out) if k not in (i, j)]
                out.insert(min(i, j), (box, img))
                merged = True
                break
            if merged:
                break
    return out


def _pixmap_image(doc, xref: int) -> Image.Image:
    import pymupdf

    pix = pymupdf.Pixmap(doc, xref)
    if pix.colorspace and pix.colorspace.n > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    smask = doc.xref_get_key(xref, "SMask")
    if smask[0] == "xref":
        mask = pymupdf.Pixmap(doc, int(smask[1].split()[0]))
        if mask.width == pix.width and mask.height == pix.height and not pix.alpha:
            pix = pymupdf.Pixmap(pix, mask)
    mode = "RGBA" if pix.alpha else ("L" if pix.n == 1 else "RGB")
    return Image.frombytes(mode, (pix.width, pix.height), pix.samples)


def is_photo(w: int, h: int) -> bool:
    """Reject logos/badges (small and wide) and slivers; keep wide beam-seating photos."""
    aspect = max(w, h) / max(1, min(w, h))
    if min(w, h) < MIN_SIDE or aspect > MAX_ASPECT:
        return False
    return not (max(w, h) < 450 and aspect > 2.0)


def render_photo_region(pdf: Path, page: int) -> Image.Image | None:
    """For vector/tiled artwork: render the band between the header and the first text line."""
    import pymupdf

    pg = pymupdf.open(pdf)[page - 1]
    ph, pw = pg.rect.height, pg.rect.width
    blocks = [b for b in pg.get_text("blocks") if b[4].strip()]
    header = [b[3] for b in blocks if b[1] < ph * 0.2]
    top = max(header) + 4 if header else ph * 0.08
    below = [b[1] for b in blocks if b[1] > top + 20]
    bottom = min(below) - 4 if below else ph * 0.6
    if bottom - top < 60:
        return None
    pix = pg.get_pixmap(dpi=200, clip=pymupdf.Rect(0, top, pw, bottom))
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
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
    return img.convert("RGB")


def trim(img: Image.Image, pad: int = 12) -> Image.Image:
    """Crop to content, ignoring thin full-width/height rule lines from the sheet layout."""
    import numpy as np

    ink = np.asarray(img.convert("L")) < 235
    ink[_thin_runs(ink.mean(axis=1) > 0.6), :] = False
    ink[:, _thin_runs(ink.mean(axis=0) > 0.6)] = False
    ys, xs = np.nonzero(ink)
    if len(xs) == 0:
        return img
    l, t, r, b = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    return img.crop((int(l), int(t), int(r), int(b)))


def _thin_runs(dense, max_len: int = 4):
    """Keep only runs of dense rows/columns at most max_len long (rule lines, not solid areas)."""
    import numpy as np

    out = np.zeros_like(dense)
    start = None
    for i, v in enumerate([*dense, False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start <= max_len:
                out[start:i] = True
            start = None
    return out


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

    # Brand logo = the wide decoration image found in the most files of that folder, preferring
    # ones not shared with other folders (mono sheets carry both the m@ss and mono logos).
    logo_votes: dict[str, Counter] = defaultdict(Counter)
    logo_file: dict[str, str] = {}
    for (rel, _), items in extracted.items():
        folder = rel.split("/", 1)[0]
        for it in items:
            if it["hash"] in decor and it["w"] > it["h"] * 1.5:
                logo_votes[folder][it["hash"]] += 1
                logo_file.setdefault(it["hash"], it["file"])
    logo_folders = Counter(h for votes in logo_votes.values() for h in votes)

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
            # Largest photo is the hero; the rest stay in reading order.
            if photos:
                hero = max(photos, key=lambda p: p.width * p.height)
                photos.remove(hero)
                photos.insert(0, hero)
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
    for folder, votes in logo_votes.items():
        best = LOGO_PIN.get(folder) if LOGO_PIN.get(folder) in votes else \
            min(votes, key=lambda h: (logo_folders[h], -votes[h]))
        img = trim(Image.open(IMG_CACHE / logo_file[best]), pad=4)
        from .paths import BRANDS

        img.save(logo_dir / f"{BRANDS[folder]}.png")
