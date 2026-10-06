"""Lay out the NAT e-catalogue PDF from ingest/.cache/ecatalog.json (see scripts/export-catalog.ts).

A4 landscape pages in the style of a furniture brochure: a cover with the logo and a colour
panel, contents, then for each space a divider (colour panel + studio backdrop with a hero
piece), each category opening on a tinted panel with its title and hero piece, product grids
on white (sketch or photo, code, type, sizes in cm), an index of codes and a closing page.
Output: public/e-catalogue.pdf.

Usage: python -m nat_ingest.ecatalog   (normally via `pnpm catalog:pdf`)
"""
from __future__ import annotations

import io
import json
import math
import re
import unicodedata
from datetime import date
from html import escape
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

from .paths import CACHE, ROOT

W, H = 842, 595  # A4 landscape, points
M = 42  # outer margin
FOOT_Y = H - 30
COLS, ROWS = 6, 3
PER_PAGE = COLS * ROWS
INK = (0.137, 0.122, 0.125)
MUTED = (0.435, 0.424, 0.416)
ACCENT = (0.184, 0.196, 0.561)  # NAT logo blue
RED = (0.929, 0.11, 0.141)       # NAT logo red
LINE = (0.2, 0.2, 0.2)
# Each space gets its own muted panel colour, as each series does in a brochure.
TONES = {
    "office": (0.369, 0.431, 0.525),   # slate blue
    "living": (0.69, 0.42, 0.341),     # terracotta
    "dining": (0.451, 0.565, 0.259),   # olive
    "bedroom": (0.58, 0.502, 0.431),   # taupe
}

FONTS = ROOT / "ingest" / "fonts"
LOGO = ROOT / "public" / "brand" / "logo.png"
CSS = """
@font-face { font-family: ml; src: url(Montserrat-Light.ttf); }
@font-face { font-family: mr; src: url(Montserrat-Regular.ttf); }
@font-face { font-family: ms; src: url(Montserrat-SemiBold.ttf); }
@font-face { font-family: tl; src: url(IBMPlexSansThai-Light.ttf); }
@font-face { font-family: tr; src: url(IBMPlexSansThai-Regular.ttf); }
@font-face { font-family: tm; src: url(IBMPlexSansThai-Medium.ttf); }
* { margin: 0; padding: 0; }
body { font-family: tr; color: #231f20; font-size: 9pt; line-height: 1.5; }
.display { font-family: ml; line-height: 1.05; }
.eyebrow { font-family: ms; font-size: 7.5pt; letter-spacing: 1.4pt; }
.head { font-family: ms; line-height: 1.08; letter-spacing: 0.6pt; }
.muted { color: #6f6c6a; }
.accent { color: #2b3990; }
.thl { font-family: tl; }
.thm { font-family: tm; }
.num { font-family: mr; }
"""


class Doc:
    def __init__(self, color: bool = False) -> None:
        self.color = color  # product photos (customer edition) instead of line drawings
        self.pdf = pymupdf.open()
        self.archive = pymupdf.Archive(str(FONTS))
        self.image_cache: dict[str, bytes] = {}

    def page(self) -> pymupdf.Page:
        return self.pdf.new_page(width=W, height=H)

    def html(self, page: pymupdf.Page, rect: tuple[float, float, float, float], html: str) -> None:
        page.insert_htmlbox(pymupdf.Rect(*rect), html, css=CSS, archive=self.archive)

    def rule(self, page: pymupdf.Page, x0: float, y: float, x1: float, width: float = 0.5, color=LINE) -> None:
        page.draw_line((x0, y), (x1, y), color=color, width=width)

    def sketch(self, page: pymupdf.Page, url: str | None, box: tuple[float, float, float, float],
               align_bottom: bool = True, max_px: int = 300, transparent: bool = False) -> None:
        """Place a sketch (a /media/... WebP) scaled into box, sitting on its bottom edge.

        transparent=True turns the white paper into alpha (ink stays), for pastel pages."""
        if not url:
            return
        if self.color:
            url = url.replace("/media/p/", "/media/photo/", 1)
        path = ROOT / "public" / url.lstrip("/")
        if not path.exists():
            return
        key = f"{path}:{max_px}:{transparent}"
        if key not in self.image_cache:
            img = Image.open(path).convert("RGB" if self.color else "L")
            # Thicken lines before shrinking so they keep their weight at print size.
            ratio = max(img.size) / max_px
            if ratio > 1.5 and min(img.size) > 8 and not self.color:
                import cv2

                k = int(ratio) | 1
                img = Image.fromarray(cv2.erode(np.asarray(img), np.ones((k, k), np.uint8)))
                if self.color:
                    img = img.convert("RGB")
            img.thumbnail((max_px, max_px))
            buf = io.BytesIO()
            if transparent and self.color:
                # white paper -> transparent, colours and ink stay
                a = np.asarray(img).astype(np.int16)
                alpha = np.clip((255 - a.min(axis=2)) * 6, 0, 255).astype(np.uint8)
                rgba = img.convert("RGBA")
                rgba.putalpha(Image.fromarray(alpha))
                rgba.save(buf, "PNG", optimize=True)
            elif transparent:
                ink = Image.new("LA", img.size, 0)
                ink.putalpha(img.point(lambda v: 255 - v))
                ink.save(buf, "PNG", optimize=True)
            else:
                img.save(buf, "JPEG", quality=68 if self.color else 72, optimize=True)
            self.image_cache[key] = buf.getvalue()
            self.image_cache[key + ":size"] = json.dumps(img.size).encode()
        iw, ih = json.loads(self.image_cache[key + ":size"])
        x0, y0, x1, y1 = box
        scale = min((x1 - x0) / iw, (y1 - y0) / ih)
        w, h = iw * scale, ih * scale
        left = x0 + ((x1 - x0) - w) / 2
        top = y1 - h if align_bottom else y0 + ((y1 - y0) - h) / 2
        page.insert_image(pymupdf.Rect(left, top, left + w, top + h), stream=self.image_cache[key])

    def backdrop(self, page: pymupdf.Page, rect: tuple[float, float, float, float], tone=(0.5, 0.5, 0.5),
                 tint: float = 0.12) -> None:
        """Photo-studio backdrop: near white at the top centre, falling off to a light shade of tone."""
        key = f"backdrop:{tone}:{tint}"
        if key not in self.image_cache:
            gw, gh = 240, 300
            y, x = np.mgrid[0:gh, 0:gw] / np.array([gh, gw])[:, None, None]
            t = np.clip(np.hypot((x - 0.5) / 0.95, (y - 0.05) / 1.15), 0, 1)[..., None] ** 1.4
            light = np.array([247, 247, 246], float)
            shade = 255 * ((1 - tint) * np.array([0.86, 0.865, 0.87]) + tint * np.array(tone))
            buf = io.BytesIO()
            Image.fromarray((light * (1 - t) + shade * t).astype(np.uint8)).save(buf, "JPEG", quality=90)
            self.image_cache[key] = buf.getvalue()
        page.insert_image(pymupdf.Rect(*rect), stream=self.image_cache[key], keep_proportion=False)


def cut(text: str, n: int) -> str:
    """Shorten to about n characters without splitting a Thai base letter from its marks."""
    text = (text or "").strip()
    if len(text) <= n:
        return text
    i = n
    while i > 0 and unicodedata.category(text[i]) == "Mn":
        i -= 1
    return text[:i].rstrip() + "…"


def cm(v: int) -> str:
    s = f"{v / 10:.1f}".rstrip("0").rstrip(".")
    return s


def size_line(mm: dict) -> str:
    def rng(k: str) -> str | None:
        r = mm.get(k)
        if not r:
            return None
        return cm(r[1]) if r[0] == r[1] else f"{cm(r[0])}–{cm(r[1])}"

    parts = []
    if rng("dia") and not mm.get("w"):
        parts.append(f"Ø{rng('dia')}")
    for k, label in (("w", "W"), ("d", "D"), ("h", "H")):
        if rng(k):
            parts.append(f"{rng(k)}{label}")
    return " x ".join(parts) + " cm" if parts else ""


GRID_COLS, GRID_ROWS = 4, 2
OPEN_COLS, OPEN_ROWS = 3, 3     # products beside a category's opening panel
PER_OPEN = OPEN_COLS * OPEN_ROWS
# After its opening page a category runs through brochure layouts in turn: (kind, products per page)
LAYOUTS = (("feature", 5), ("lineup", 10), ("showcase", 7), ("grid", GRID_COLS * GRID_ROWS))
TOP = 74        # content top below the running label
INSET = 20      # panels sit this far in from the page edge


def hexc(rgb) -> str:
    return "#" + "".join(f"{round(v * 255):02x}" for v in rgb)


def darker(rgb, k: float = 0.72):
    return tuple(v * k for v in rgb)


def _running_label(doc: "Doc", page, small: str, big: str, sub: str) -> None:
    """Stacked label in the top right corner: space, category, Thai name over a short rule."""
    doc.html(page, (W / 2, 22, W - M, 64),
             f'<div style="text-align:right; line-height:1.2">'
             f'<div class="num muted" style="font-size:6pt">{escape(small)}</div>'
             f'<div class="head" style="font-size:9.5pt">{escape(big.upper())}</div>'
             f'<div class="thl muted" style="font-size:7pt">{escape(sub)}</div></div>')
    doc.rule(page, W - M - 34, 66, W - M, 0.6, INK)


def _footer(doc: "Doc", page, number: int, brand: bool = True) -> None:
    if brand:
        doc.html(page, (M, FOOT_Y - 2, W / 2, FOOT_Y + 12),
                 '<div><span class="eyebrow accent" style="font-size:6pt">NAT FURNITURE</span>'
                 '&#160;&#160;<span class="eyebrow muted" style="font-size:6pt">E-CATALOGUE</span></div>')
    doc.html(page, (W - M - 60, FOOT_Y - 3, W - M, FOOT_Y + 12),
             f'<div class="head" style="text-align:right; font-size:7.5pt">{number:02d}</div>')


def _dims(mm: dict) -> str:
    """W 120 · D 60 · H 75 cm"""
    def rng(r):
        return cm(r[1]) if r[0] == r[1] else f"{cm(r[0])}–{cm(r[1])}"
    parts = []
    if mm.get("dia") and not mm.get("w"):
        parts.append(f"Ø {rng(mm['dia'])}")
    for k, lab in (("w", "W"), ("d", "D"), ("h", "H")):
        if mm.get(k):
            parts.append(f'<span class="muted">{lab}</span> {rng(mm[k])}')
    return " &#160;".join(parts) + ' <span class="muted">cm</span>' if parts else ""


def _sizes(p: dict) -> list[str]:
    return [x for x in (_dims(mm) for mm in p["sizes"]) if x]


def _caption(doc: "Doc", page, p: dict, x0: float, y0: float, x1: float, y1: float, big: bool = False) -> None:
    """Code, Thai type and first size set, centred."""
    sizes = _sizes(p)
    more = f' <span class="muted">+{len(sizes) - 1}</span>' if len(sizes) > 1 else ""
    k = 1.15 if big else 1
    doc.html(page, (x0, y0, x1, y1),
             f'<div style="text-align:center">'
             f'<div class="head" style="font-size:{7.5 * k}pt">{escape(cut(p["code"], 24))}</div>'
             f'<div class="muted" style="font-size:{6.3 * k}pt; line-height:1.3">{escape(cut(p["typeTh"] or "", 34))}</div>'
             f'<div class="num" style="font-size:{5.8 * k}pt; margin-top:1pt">{sizes[0] if sizes else ""}{more}</div></div>')


def _card(doc: "Doc", page, p: dict, x0: float, y0: float, w: float, h: float, on_tint: bool = False) -> None:
    """A product standing on the page, caption centred underneath."""
    img_h = h * 0.7
    doc.sketch(page, p["image"], (x0 + 8, y0 + 4, x0 + w - 8, y0 + img_h - 2), max_px=320 if doc.color else 300,
               transparent=on_tint or not doc.color)
    _caption(doc, page, p, x0, y0 + img_h + 5, x0 + w, y0 + h)


def _grid(doc: "Doc", page, items: list, x0: float, x1: float, top: float, cols: int, rows: int,
          bottom: float = FOOT_Y - 16) -> None:
    gap_x, gap_y = 14, 12
    cw = (x1 - x0 - gap_x * (cols - 1)) / cols
    rh = (bottom - top - gap_y * (rows - 1)) / rows
    for j, p in enumerate(items[:cols * rows]):
        _card(doc, page, p, x0 + (j % cols) * (cw + gap_x), top + (j // cols) * (rh + gap_y), cw, rh)


def _row(doc: "Doc", page, items: list, x0: float, x1: float, top: float, bottom: float, slots: int,
         on_tint: bool = False) -> None:
    """One row of products, centred when there are fewer than slots."""
    gap = 14
    cw = (x1 - x0 - gap * (slots - 1)) / slots
    left = x0 + (slots - len(items)) * (cw + gap) / 2
    for j, p in enumerate(items):
        _card(doc, page, p, left + j * (cw + gap), top, cw, bottom - top, on_tint)


def _hero_first(items: list) -> list:
    """Put the product with the strongest picture first (traced photo before a rendered sheet drawing)."""
    best = min(range(len(items)), key=lambda j: (not items[j]["image"], items[j]["rendered"], j))
    return [items[best]] + items[:best] + items[best + 1:]


def paginate(items: list) -> list[tuple[str, list]]:
    """Split a category's products over its opening page and the rotating brochure layouts."""
    pages = [("open", items[:PER_OPEN])]
    rest, k = items[PER_OPEN:], 0
    while rest:
        kind, n = LAYOUTS[k % len(LAYOUTS)]
        chunk, rest = rest[:n], rest[n:]
        if kind in ("feature", "showcase"):
            chunk = _hero_first(chunk)
            if not chunk[0]["image"]:
                kind = "grid"  # nothing to show large
            elif kind == "showcase" and len(chunk) < 3:
                kind = "feature"
        pages.append((kind, chunk))
        k += 1
    return pages


def _feature(doc: "Doc", page, items: list, t) -> None:
    """Tinted panel with one product large and its code as the headline; the rest beside it (ref. series page)."""
    p, px1 = items[0], W * 0.47
    doc.backdrop(page, (INSET, INSET, px1, H - INSET), t, tint=0.3)
    sizes = _sizes(p)
    doc.html(page, (INSET + 24, INSET + 26, px1 - 20, INSET + 130),
             f'<div class="head" style="font-size:28pt; color:{hexc(darker(t, 0.6))}">{escape(cut(p["code"], 20))}</div>'
             f'<div class="thm" style="font-size:10pt; margin-top:3pt">{escape(cut(p["typeTh"] or "", 60))}</div>'
             f'<div class="num" style="font-size:7.5pt; margin-top:2pt">{"<br>".join(sizes[:2])}</div>')
    doc.sketch(page, p["image"], (INSET + 40, INSET + 140, px1 - 40, H - INSET - 28), max_px=900, transparent=True)
    _grid(doc, page, items[1:], px1 + 30, W - M, TOP + 8, 2, 2)


def _lineup(doc: "Doc", page, items: list, t, cat: dict) -> None:
    """Big heading, five pieces standing on one studio floor, a smaller row below (ref. line-up page)."""
    doc.html(page, (M, 30, W * 0.62, 100),
             f'<div class="head" style="font-size:20pt">{escape(cat["nameEn"].upper())}</div>'
             f'<div style="font-family:ml; font-size:11pt; letter-spacing:6pt; color:{hexc(darker(t))}">'
             f'COLLECTION</div>')
    page.draw_rect(pymupdf.Rect(M, 84, M + 30, 86.5), color=None, fill=RED)
    doc.backdrop(page, (M, 100, W - M, 344), t, tint=0.15)
    _row(doc, page, items[:5], M + 10, W - M - 10, 110, 340, 5, on_tint=True)
    if items[5:]:
        _row(doc, page, items[5:10], M, W - M, 360, FOOT_Y - 16, 5)


def _showcase(doc: "Doc", page, items: list, t, cat: dict) -> None:
    """Wide studio band with three pieces, a row of small ones and a text block on the main one
    (ref. "ERGONOMIC DESIGN•" page)."""
    band_y0, band_y1 = TOP + 4, 352
    doc.backdrop(page, (M, band_y0, W - M, band_y1), t, tint=0.18)
    p = items[0]
    hw = (W - 2 * M) * 0.42
    doc.sketch(page, p["image"], (M + 30, band_y0 + 12, M + 30 + hw, band_y1 - 42), max_px=900, transparent=True)
    _caption(doc, page, p, M + 30, band_y1 - 39, M + 30 + hw, band_y1, big=True)
    side = items[1:3]
    sx0 = M + 30 + hw + 20
    _row(doc, page, side, sx0, W - M - 20, band_y0 + 60, band_y1, 2, on_tint=True)
    # small row and the text block
    small = items[3:7]
    tx0 = W * 0.66
    if small:
        _row(doc, page, small, M, tx0 - 24, band_y1 + 18, FOOT_Y - 16, 4)
    feats = [f for f in (p.get("featuresTh") or []) if f][:3]
    body = "".join(f'<p style="font-size:7pt; margin-bottom:2pt"><span style="color:{hexc(RED)}">•</span>&#160; '
                   f'{escape(cut(f, 90))}</p>' for f in feats)
    if not body and p.get("summaryTh"):
        body = f'<p style="font-size:7pt">{escape(cut(p["summaryTh"], 220))}</p>'
    sizes = "<br>".join(_sizes(p)[:3])
    doc.html(page, (tx0, band_y1 + 22, W - M, band_y1 + 74),
             f'<div class="head" style="font-size:8pt">{escape(cat["nameEn"].upper())}</div>'
             f'<div style="font-family:ml; font-size:20pt; line-height:1.15; color:{hexc(darker(t))}">'
             f'{escape(cut(p["code"], 18))}<span style="color:{hexc(RED)}">•</span></div>')
    doc.rule(page, tx0, band_y1 + 76, W - M, 0.4, MUTED)
    doc.html(page, (tx0, band_y1 + 82, W - M, FOOT_Y - 14),
             f'<div class="thm" style="font-size:8pt">{escape(cut(p["typeTh"] or "", 70))}</div>'
             f'<div class="muted" style="font-size:7pt">{escape(cut(p.get("typeEn") or "", 70))}</div>'
             f'<div class="num" style="font-size:7pt; margin:3pt 0 4pt 0">{sizes}</div>{body}')


def _logo(page, x0: float, y0: float, width: float) -> None:
    page.insert_image(pymupdf.Rect(x0, y0, x0 + width, y0 + width * 93 / 334), filename=str(LOGO))


def build(color: bool = False) -> Path:
    data = json.loads((CACHE / "ecatalog.json").read_text())
    spaces = data["spaces"]
    doc = Doc(color)
    total = sum(len(c["products"]) for s in spaces for c in s["categories"])

    def picks(cat: dict) -> list[str]:
        """Best hero images of a category, traced photos before drawings rendered from the sheet."""
        with_image = [p for p in cat["products"] if p["image"]]
        return [p["image"] for p in sorted(with_image, key=lambda p: (p["rendered"], p["code"]))]

    heroes = {c["slug"]: picks(c) for s in spaces for c in s["categories"]}

    def hero(slug: str, k: int = 0) -> str | None:
        h = heroes.get(slug) or []
        return h[min(k, len(h) - 1)] if h else None

    def tone(space: dict):
        return TONES.get(space["slug"], ACCENT)

    # ---- plan pages: each category opens on a panel page, then runs through the brochure layouts
    plan: list[tuple] = []  # ("divider", space) | (kind, space, cat, items)
    for space in spaces:
        plan.append(("divider", space))
        for cat in space["categories"]:
            plan += [(kind, space, cat, chunk) for kind, chunk in paginate(cat["products"])]
    first = 3  # cover, contents
    page_of_space, page_of_cat, page_of_code = {}, {}, []
    for i, entry in enumerate(plan):
        n = first + i
        if entry[0] == "divider":
            page_of_space[entry[1]["slug"]] = n
        else:
            page_of_cat.setdefault(entry[2]["slug"], n)
            page_of_code += [(p["code"], n) for p in entry[3]]

    # ---- 1. cover: logo on white, colour panel with a rounded corner carrying the title
    page = doc.page()
    px0, py1, r = W * 0.473, H * 0.765, 46
    # rounded rect whose top corners sit off the page; square off the bottom left corner
    page.draw_rect(pymupdf.Rect(px0, -2 * r, W, py1), color=None, fill=ACCENT, radius=(r / (W - px0), r / (py1 + 2 * r)))
    page.draw_rect(pymupdf.Rect(px0, py1 - r, px0 + r, py1), color=None, fill=ACCENT)
    lw = 210
    lx = (px0 - lw) / 2
    _logo(page, lx, H * 0.40, lw)
    doc.html(page, (lx, H * 0.40 + lw * 93 / 334 + 14, px0 - 20, H * 0.40 + 140),
             '<div class="head" style="font-size:10pt; letter-spacing:1.6pt">NAT FURNITURE CO., LTD.</div>'
             '<div class="thl muted" style="font-size:9pt">บริษัท แน๊ตเฟอร์นิเจอร์ จำกัด</div>')
    page.draw_rect(pymupdf.Rect(px0 + 26, py1 - 104, px0 + 56, py1 - 101), color=None, fill=RED)
    doc.html(page, (px0 + 26, py1 - 92, W - 20, py1 - 44),
             '<div class="head" style="font-size:36pt; color:#ffffff; letter-spacing:2.5pt">E-CATALOGUE</div>')
    doc.html(page, (px0 + 26, py1 - 44, W - 20, py1 - 14),
             '<div class="thl" style="font-size:12pt; color:#dcdde8">แคตตาล็อกเฟอร์นิเจอร์ · Furniture for every space</div>')
    doc.html(page, (px0 + 26, py1 + 36, W - M, py1 + 60),
             f'<div class="num" style="font-size:8.5pt">{date.today():%Y} furniture catalogue'
             f'&#160;&#160;·&#160;&#160;{total:,} items</div>')

    # ---- 2. contents (two columns, dotted leaders)
    page = doc.page()
    doc.html(page, (M, 50, 300, 130), '<div class="head" style="font-size:30pt">CONTENTS</div>'
                                      '<div class="thl muted" style="font-size:13pt; margin-top:2pt">สารบัญ</div>')
    page.draw_rect(pymupdf.Rect(M, 128, M + 30, 131), color=None, fill=RED)
    doc.html(page, (M, 146, 250, 280),
             f'<p style="font-size:8.5pt">แคตตาล็อกรวมเฟอร์นิเจอร์ {total:,} รายการ แยกตามพื้นที่ใช้งาน '
             f'พร้อม{"รูปสินค้า" if color else "แบบร่าง"}และขนาดของทุกชิ้น</p>'
             f'<p class="muted" style="margin-top:6pt; font-size:8pt">{total:,} pieces arranged by space, each with '
             f'{"a photo" if color else "a drawing"} and its sizes. An index of product codes is at the back.</p>')
    col_x = [290, 290 + (W - M - 290) / 2 + 10]
    col_w = (W - M - 290) / 2 - 10
    col, y = 0, 50
    def leader(x, y, w, left_html, num, big=False):
        doc.html(page, (x, y, x + w - 30, y + 16), left_html)
        doc.html(page, (x + w - 30, y + (1 if big else 0), x + w, y + 16),
                 f'<div class="{"head" if big else "num"}" style="text-align:right; font-size:{9 if big else 7.5}pt">{num}</div>')
        line_y = y + (19 if big else 13)
        page.draw_line((x, line_y), (x + w, line_y), color=(0.85, 0.84, 0.82) if not big else INK, width=0.4 if not big else 0.6)
    for n, space in enumerate(spaces, 1):
        need = 30 + 15 * len(space["categories"])
        if y + need > FOOT_Y - 20 and col == 0:
            col, y = 1, 50
        x = col_x[col]
        page.draw_rect(pymupdf.Rect(x, y + 1, x + 18, y + 15), color=None, fill=tone(space))
        doc.html(page, (x, y + 2.5, x + 18, y + 16),
                 f'<div class="head" style="text-align:center; font-size:7pt; color:#ffffff">{n:02d}</div>')
        leader(x + 26, y - 2, col_w - 26,
               f'<div><span class="head" style="font-size:12pt">{escape(space["nameEn"].upper())}</span>'
               f'&#160;&#160;<span class="thl muted" style="font-size:9pt">{escape(space["nameTh"])}</span></div>',
               page_of_space[space["slug"]], big=True)
        y += 24
        for cat in space["categories"]:
            leader(x + 26, y, col_w - 26,
                   f'<div style="font-size:7.5pt"><span class="num">{escape(cat["nameEn"])}</span>'
                   f'&#160;<span class="muted">{escape(cat["nameTh"])}</span></div>', page_of_cat[cat["slug"]])
            y += 15
        y += 14
    _footer(doc, page, 2)

    # ---- 3. sections
    for i, entry in enumerate(plan):
        number = first + i
        page = doc.page()
        if entry[0] == "divider":
            # colour panel with the space name | studio backdrop with number and a hero piece
            space = entry[1]
            idx = spaces.index(space) + 1
            t = tone(space)
            page.draw_rect(pymupdf.Rect(0, 0, W / 2, H), color=None, fill=t)
            doc.backdrop(page, (W / 2, 0, W, H), t)
            doc.html(page, (M, H * 0.30, W / 2 - M, H * 0.30 + 60),
                     f'<div style="text-align:center"><div class="head" style="font-size:20pt; color:#ffffff; '
                     f'letter-spacing:3pt">{escape(space["nameEn"].upper())}</div>'
                     f'<div class="thl" style="font-size:12pt; color:#ffffff">{escape(space["nameTh"])}</div></div>')
            if space.get("copy"):
                doc.html(page, (M + 30, H * 0.30 + 66, W / 2 - M - 30, H * 0.30 + 150),
                         f'<div style="text-align:center"><p style="color:#ffffff; font-size:8pt">{escape(space["copy"]["th"])}</p>'
                         f'<p style="color:#ffffff; margin-top:4pt; font-size:7pt">{escape(space["copy"]["en"])}</p></div>')
            # categories with page numbers along the bottom of the panel
            cats = space["categories"]
            ncol = 2 if len(cats) > 6 else 1
            per_col = math.ceil(len(cats) / ncol)
            cw = (W / 2 - 2 * M - 20 * (ncol - 1)) / ncol
            y0 = H - 46 - per_col * 13
            doc.rule(page, M, y0 - 10, W / 2 - M, 0.5, (1, 1, 1))
            for j, c in enumerate(cats):
                cx0 = M + (j // per_col) * (cw + 20)
                cy = y0 + (j % per_col) * 13
                doc.html(page, (cx0, cy, cx0 + cw - 24, cy + 13),
                         f'<div style="font-size:7pt; color:#ffffff">{escape(c["nameEn"])}</div>')
                doc.html(page, (cx0 + cw - 24, cy, cx0 + cw, cy + 13),
                         f'<div class="num" style="font-size:7pt; color:#ffffff; text-align:right">{page_of_cat[c["slug"]]}</div>')
            ink = hexc(darker(t))
            doc.html(page, (W / 2 + 46, 52, W - M, 160),
                     f'<div class="head" style="font-size:54pt; color:{ink}">{idx:02d}</div>'
                     f'<div class="head" style="font-size:15pt; color:{ink}; letter-spacing:2pt">{escape(space["nameEn"].upper())}</div>')
            page.draw_rect(pymupdf.Rect(W / 2 + 48, 168, W / 2 + 72, 170.5), color=None, fill=(0.6, 0.6, 0.6))
            doc.sketch(page, hero(cats[0]["slug"], 1), (W / 2 + 70, 150, W - 40, H - 34), max_px=900, transparent=True)
            continue

        kind, space, cat, items = entry
        t = tone(space)
        _running_label(doc, page, space["nameEn"], cat["nameEn"], cat["nameTh"])
        if kind == "open":
            # tinted panel with the category title and its hero piece, first products beside it
            px1 = W * 0.47
            doc.backdrop(page, (INSET, INSET, px1, H - INSET), t, tint=0.3)
            doc.html(page, (INSET + 24, INSET + 26, px1 - 20, INSET + 150),
                     f'<div class="head" style="font-size:24pt; color:{hexc(darker(t, 0.6))}">{escape(cat["nameEn"].upper())}</div>'
                     f'<div class="thm" style="font-size:12pt; margin-top:3pt">{escape(cat["nameTh"])}</div>'
                     f'<div class="num muted" style="font-size:8pt; margin-top:2pt">{len(cat["products"])} items</div>')
            doc.sketch(page, hero(cat["slug"]), (INSET + 40, INSET + 150, px1 - 40, H - INSET - 28), max_px=900,
                       transparent=True)
            _grid(doc, page, items, px1 + 30, W - M, TOP + 8, OPEN_COLS, OPEN_ROWS)
        elif kind == "feature":
            _feature(doc, page, items, t)
        elif kind == "lineup":
            _lineup(doc, page, items, t, cat)
        elif kind == "showcase":
            _showcase(doc, page, items, t, cat)
        else:
            _grid(doc, page, items, M, W - M, TOP + 8, GRID_COLS, GRID_ROWS)
        # panels on the left run down to the footer
        _footer(doc, page, number, brand=kind not in ("open", "feature"))

    # ---- 4. index of codes
    entries = sorted(page_of_code, key=lambda e: (re.sub(r"[^A-Z0-9]", "", e[0].upper()) or "~", e[0]))
    per_col, cols_per_page = 44, 5
    col_w = (W - 2 * M) / cols_per_page
    for start in range(0, len(entries), per_col * cols_per_page):
        page = doc.page()
        _running_label(doc, page, "Index", "Product codes", "ดัชนีรหัสสินค้า")
        if start == 0:
            doc.html(page, (M, 30, W / 2, 70), '<div class="head" style="font-size:20pt">INDEX</div>')
        chunk = entries[start:start + per_col * cols_per_page]
        for c in range(cols_per_page):
            col_items = chunk[c * per_col:(c + 1) * per_col]
            if not col_items:
                break
            rows_html = "".join(
                f'<tr><td class="num" style="font-size:6.5pt; padding:0.6pt 0">{escape(cut(code, 22))}</td>'
                f'<td class="num muted" style="font-size:6.5pt; text-align:right">{n}</td></tr>' for code, n in col_items)
            doc.html(page, (M + c * col_w, TOP + 6, M + (c + 1) * col_w - 10, FOOT_Y - 12),
                     f'<table style="width:100%; border-collapse:collapse">{rows_html}</table>')
        _footer(doc, page, doc.pdf.page_count)

    # ---- 5. back cover: hairline frame, logo and company details centred
    page = doc.page()
    page.draw_rect(pymupdf.Rect(14, 14, W - 14, H - 14), color=ACCENT, width=0.8)
    lw = 190
    _logo(page, (W - lw) / 2, 92, lw)
    doc.html(page, (M, 160, W - M, 330),
             '<div style="text-align:center; line-height:1.9">'
             '<div class="thm" style="font-size:12pt">บริษัท แน๊ตเฟอร์นิเจอร์ จำกัด</div>'
             '<div class="head" style="font-size:12pt; letter-spacing:1.6pt">NAT FURNITURE CO., LTD.</div>'
             '<div class="num" style="font-size:9pt; margin-top:6pt">64/4 Moo 7, Rai Khing, Sam Phran, Nakhon Pathom, Thailand 73210</div>'
             '<div class="num" style="font-size:9pt"><span class="muted">Tax ID</span>&#160; 0735551000056</div>'
             '<div class="head" style="font-size:9pt; letter-spacing:1.4pt">ISO 9001&#160;&#160;·&#160;&#160;ISO 14001</div></div>')
    page.draw_rect(pymupdf.Rect(W / 2 - 15, 318, W / 2 + 15, 320.5), color=None, fill=RED)
    doc.html(page, (W * 0.2, 338, W * 0.8, 470),
             '<div style="text-align:center">'
             '<p class="muted" style="font-size:8pt">ขนาดสินค้าอ้างอิงจากแผ่นสเปกของผู้ผลิต อาจคลาดเคลื่อนเล็กน้อย '
             'รายละเอียด วัสดุ และสีอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า '
             'ดูข้อมูลล่าสุดและรายละเอียดการผลิตของแต่ละรุ่นได้ที่เว็บไซต์แคตตาล็อก</p>'
             '<p class="muted" style="margin-top:6pt; font-size:7pt">Sizes come from the manufacturers\' specification sheets '
             'and may vary slightly. Details, materials and finishes may change without notice; see the online catalogue '
             'for the latest information and full construction details of each model.</p></div>')
    doc.html(page, (M, H - 62, W - M, H - 40),
             f'<div class="num muted" style="text-align:center; font-size:7pt">NAT Furniture E-Catalogue&#160;&#160;·&#160;&#160;'
             f'{date.today():%B %Y}&#160;&#160;·&#160;&#160;{total:,} items</div>')

    doc.pdf.set_metadata({"title": "NAT Furniture E-Catalogue", "author": "NAT Furniture",
                          "subject": "Furniture catalogue", "creator": "nat_ingest.ecatalog"})
    # clickable bookmarks for PDF readers
    toc = [[1, "Contents", 2]]
    for space in spaces:
        toc.append([1, f'{space["nameEn"]} · {space["nameTh"]}', page_of_space[space["slug"]]])
        for cat in space["categories"]:
            toc.append([2, f'{cat["nameEn"]} · {cat["nameTh"]}', page_of_cat[cat["slug"]]])
    doc.pdf.set_toc(toc)
    # Served from storage like the images: public/media/catalogue/ is synced by nat_ingest.upload
    out = ROOT / "public" / "media" / "catalogue" / ("e-catalogue-photo.pdf" if color else "e-catalogue.pdf")
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.pdf.save(out, garbage=4, deflate=True)
    return out


def main() -> None:
    import sys

    # Line-drawing edition always; add the photo (customer) edition with --color / --all.
    editions = [False, True] if "--all" in sys.argv else [("--color" in sys.argv)]
    for color in editions:
        out = build(color)
        doc = pymupdf.open(out)
        print(f"{out.relative_to(ROOT)}: {doc.page_count} pages, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
