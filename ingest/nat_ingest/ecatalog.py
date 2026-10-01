"""Lay out the NAT e-catalogue PDF from ingest/.cache/ecatalog.json (see scripts/export-catalog.ts).

A4 landscape pages: cover, contents, then for each space a divider page followed by
"line" pages (sketch, hairline rule, code, type, sizes in cm), and a closing page.
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
ACCENT = (0.169, 0.224, 0.565)
LINE = (0.2, 0.2, 0.2)

FONTS = ROOT / "ingest" / "fonts"
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

    def wash(self, page: pymupdf.Page, rect: tuple[float, float, float, float] = (0, 0, W, H)) -> None:
        """Soft pastel gradient (pink left, cream middle, sky blue right), as on the website."""
        if "wash" not in self.image_cache:
            gw, gh = 420, 297
            y, x = np.mgrid[0:gh, 0:gw] / np.array([gh, gw])[:, None, None]
            base = np.array([244, 239, 231], float)
            pink, sky = np.array([249, 227, 230], float), np.array([214, 237, 247], float)
            a = np.clip(1 - np.hypot((x - 0.12) / 0.6, (y - 0.3) / 0.8), 0, 1)[..., None]
            b = np.clip(1 - np.hypot((x - 0.92) / 0.55, (y - 0.2) / 0.75), 0, 1)[..., None]
            rgb = base * (1 - a) + pink * a
            rgb = rgb * (1 - b) + sky * b
            buf = io.BytesIO()
            Image.fromarray(rgb.astype(np.uint8)).save(buf, "JPEG", quality=90)
            self.image_cache["wash"] = buf.getvalue()
        page.insert_image(pymupdf.Rect(*rect), stream=self.image_cache["wash"], keep_proportion=False)

    def footer(self, page: pymupdf.Page, number: int, section: str) -> None:
        self.html(page, (M, FOOT_Y - 4, M + 200, FOOT_Y + 12), '<div class="eyebrow accent">NAT FURNITURE</div>')
        cx = W / 2
        self.html(page, (cx - 150, FOOT_Y - 4, cx - 30, FOOT_Y + 12),
                  '<div class="eyebrow muted" style="text-align:right">E-CATALOGUE</div>')
        self.rule(page, cx - 22, FOOT_Y + 2.5, cx + 22, 0.4, MUTED)
        self.html(page, (cx + 30, FOOT_Y - 4, cx + 300, FOOT_Y + 12), f'<div class="eyebrow muted">{escape(section.upper())}</div>')
        self.html(page, (W - M - 60, FOOT_Y - 4, W - M, FOOT_Y + 12),
                  f'<div class="num muted" style="text-align:right; font-size:8pt">{number:02d}</div>')


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


PANEL = (0.957, 0.957, 0.953)   # image panel
BAND = (0.137, 0.122, 0.125)    # dark band (ink)
GRID_COLS, GRID_ROWS = 5, 3
PER = GRID_COLS * GRID_ROWS
TOP = 64        # content top on product pages (below the running header)
CAT_HEAD = 46   # height of a category title strip


def _band(page, y0, y1, color=BAND):
    page.draw_rect(pymupdf.Rect(0, y0, W, y1), color=None, fill=color)


def _running_header(doc: "Doc", page, left: str, right_th: str, right_en: str) -> None:
    page.draw_rect(pymupdf.Rect(M, 30, M + 18, 33), color=None, fill=ACCENT)
    doc.html(page, (M + 26, 24, W / 2, 40), f'<div class="eyebrow" style="font-size:7pt">{escape(left.upper())}</div>')
    doc.html(page, (W / 2, 23, W - M, 40),
             f'<div style="text-align:right; font-size:8pt"><span class="num">{escape(right_en)}</span>'
             f'&#160;&#160;<span class="muted">{escape(right_th)}</span></div>')
    doc.rule(page, M, 44, W - M, 0.4, MUTED)


def _footer(doc: "Doc", page, number: int) -> None:
    doc.rule(page, M, FOOT_Y - 8, W - M, 0.4, MUTED)
    doc.html(page, (M, FOOT_Y - 3, W / 2, FOOT_Y + 12),
             '<div><span class="eyebrow accent" style="font-size:6.5pt">NAT FURNITURE</span>'
             '&#160;&#160;<span class="eyebrow muted" style="font-size:6.5pt">E-CATALOGUE</span></div>')
    page.draw_rect(pymupdf.Rect(W - M - 26, FOOT_Y - 4, W - M, FOOT_Y + 10), color=None, fill=BAND)
    doc.html(page, (W - M - 26, FOOT_Y - 2.5, W - M, FOOT_Y + 10),
             f'<div class="num" style="text-align:center; font-size:7.5pt; color:#ffffff">{number}</div>')


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


def _card(doc: "Doc", page, p: dict, x0: float, y0: float, w: float, h: float) -> None:
    img_h = h * 0.7
    pad = 5
    if doc.color:
        # photos: white panel with a hairline frame (JPEG keeps the file small)
        page.draw_rect(pymupdf.Rect(x0, y0, x0 + w, y0 + img_h), color=(0.86, 0.85, 0.83), fill=(1, 1, 1), width=0.4)
        doc.sketch(page, p["image"], (x0 + pad, y0 + pad, x0 + w - pad, y0 + img_h - pad), align_bottom=False, max_px=320)
    else:
        page.draw_rect(pymupdf.Rect(x0, y0, x0 + w, y0 + img_h), color=None, fill=PANEL)
        doc.sketch(page, p["image"], (x0 + pad, y0 + pad, x0 + w - pad, y0 + img_h - pad), align_bottom=False, max_px=300,
                   transparent=True)
    ty = y0 + img_h + 5
    sizes = [_dims(mm) for mm in p["sizes"]]
    sizes = [x for x in sizes if x]
    more = f' <span class="muted">+{len(sizes) - 1}</span>' if len(sizes) > 1 else ""
    doc.html(page, (x0, ty, x0 + w, y0 + h),
             f'<div class="num" style="font-size:8pt; line-height:1.15">{escape(cut(p["code"], 24))}</div>'
             f'<div class="muted" style="font-size:6.5pt; line-height:1.3">{escape(cut(p["typeTh"] or "", 34))}</div>'
             f'<div class="num" style="font-size:6pt; margin-top:1pt">{sizes[0] if sizes else ""}{more}</div>')


def build(color: bool = False) -> Path:
    data = json.loads((CACHE / "ecatalog.json").read_text())
    spaces = data["spaces"]
    doc = Doc(color)
    total = sum(len(c["products"]) for s in spaces for c in s["categories"])

    def cover_of(cat: dict) -> str | None:
        with_image = [p for p in cat["products"] if p["image"]]
        best = sorted(with_image, key=lambda p: (p["rendered"], p["code"]))
        return best[0]["image"] if best else None

    covers = {c["slug"]: cover_of(c) for s in spaces for c in s["categories"]}

    # ---- plan pages: each category starts on a fresh page with a title strip (one row fewer)
    plan: list[tuple] = []  # ("divider", space) | ("grid", space, cat, items, is_first)
    for space in spaces:
        plan.append(("divider", space))
        for cat in space["categories"]:
            items = cat["products"]
            chunks = [items[i:i + PER] for i in range(0, len(items), PER)]
            for k, ch in enumerate(chunks):
                if ch:
                    plan.append(("grid", space, cat, ch, k == 0))
    first = 3  # cover, contents
    page_of_space, page_of_cat, page_of_code = {}, {}, []
    for i, entry in enumerate(plan):
        n = first + i
        if entry[0] == "divider":
            page_of_space[entry[1]["slug"]] = n
        else:
            page_of_cat.setdefault(entry[2]["slug"], n)
            page_of_code += [(p["code"], n) for p in entry[3]]

    # ---- 1. cover
    page = doc.page()
    _band(page, 0, H * 0.38)
    doc.html(page, (M, 54, W - M, 140),
             '<div class="display" style="font-size:66pt; letter-spacing:24pt; color:#ffffff">NAT</div>')
    doc.html(page, (M, 140, W - M, 170),
             '<div class="eyebrow" style="font-size:9pt; letter-spacing:4pt; color:#ffffff">FURNITURE&#160;&#160;·&#160;&#160;E-CATALOGUE</div>')
    doc.html(page, (W - M - 260, 150, W - M, 200),
             f'<div class="num" style="text-align:right; font-size:9pt; color:#bdbab5">{date.today():%Y}&#160;&#160;·&#160;&#160;{total:,} items</div>')
    page.draw_rect(pymupdf.Rect(M, H * 0.38 - 3, M + 60, H * 0.38), color=None, fill=ACCENT)
    floor, slot = H - 92, (W - 2 * M) / 4
    for k, slug in enumerate(("armchairs", "office-chairs", "meeting-tables", "sofas")):
        x0 = M + k * slot
        doc.sketch(page, covers.get(slug), (x0 + 16, H * 0.38 + 40, x0 + slot - 16, floor), max_px=700)
    doc.rule(page, M, floor + 6, W - M, 0.6, INK)
    doc.html(page, (M, floor + 14, W - M, H - 30),
             '<div><span class="display" style="font-size:15pt">Furniture for every space</span>'
             '&#160;&#160;&#160;<span class="thl muted" style="font-size:11pt">เฟอร์นิเจอร์สำหรับทุกพื้นที่ ทั้งสำนักงานและบ้าน</span></div>')

    # ---- 2. contents (two columns, dotted leaders)
    page = doc.page()
    doc.html(page, (M, 46, 300, 120), '<div class="display" style="font-size:40pt">Contents</div>'
                                      '<div class="thl muted" style="font-size:13pt">สารบัญ</div>')
    doc.html(page, (M, 130, 250, 260),
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
                 f'<div class="num" style="text-align:right; font-size:{9 if big else 7.5}pt">{num}</div>')
        line_y = y + (19 if big else 13)
        page.draw_line((x, line_y), (x + w, line_y), color=(0.85, 0.84, 0.82) if not big else INK, width=0.4 if not big else 0.6)
    for n, space in enumerate(spaces, 1):
        need = 30 + 15 * len(space["categories"])
        if y + need > FOOT_Y - 20 and col == 0:
            col, y = 1, 50
        x = col_x[col]
        doc.html(page, (x, y, x + 30, y + 18), f'<div class="num accent" style="font-size:9pt">{n:02d}</div>')
        leader(x + 24, y - 2, col_w - 24,
               f'<div><span class="display" style="font-size:13pt">{escape(space["nameEn"])}</span>'
               f'&#160;&#160;<span class="thl muted" style="font-size:9pt">{escape(space["nameTh"])}</span></div>',
               page_of_space[space["slug"]], big=True)
        y += 24
        for cat in space["categories"]:
            leader(x + 24, y, col_w - 24,
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
            space = entry[1]
            idx = spaces.index(space) + 1
            _band(page, 0, H, PANEL)
            page.draw_rect(pymupdf.Rect(0, 0, W * 0.36, H), color=None, fill=BAND)
            doc.html(page, (M, 60, W * 0.36 - 20, 160),
                     f'<div class="display" style="font-size:72pt; color:#ffffff">{idx:02d}</div>')
            doc.html(page, (M, 190, W * 0.36 - 20, 300),
                     f'<div class="display" style="font-size:30pt; color:#ffffff">{escape(space["nameEn"])}</div>'
                     f'<div class="thl" style="font-size:15pt; color:#d9d6d1; margin-top:4pt">{escape(space["nameTh"])}</div>')
            page.draw_rect(pymupdf.Rect(M, 300, M + 40, 302.5), color=None, fill=ACCENT)
            if space.get("copy"):
                doc.html(page, (M, 316, W * 0.36 - 24, 470),
                         f'<p style="color:#ffffff; font-size:8.5pt">{escape(space["copy"]["th"])}</p>'
                         f'<p style="color:#bdbab5; margin-top:6pt; font-size:7.5pt">{escape(space["copy"]["en"])}</p>')
            cats = space["categories"][:6]
            gx0 = W * 0.36 + 28
            gw = W - M - gx0
            cols = 3 if len(cats) > 4 else 2 if len(cats) > 1 else 1
            rows = math.ceil(len(cats) / cols)
            cw = gw / cols
            rh = min(230, (H - 2 * 54) / max(rows, 1))
            for j, c in enumerate(cats):
                cx0 = gx0 + (j % cols) * cw
                cy0 = 54 + (j // cols) * rh
                page.draw_rect(pymupdf.Rect(cx0 + 6, cy0, cx0 + cw - 6, cy0 + rh - 44), color=None, fill=(1, 1, 1))
                doc.sketch(page, covers.get(c["slug"]), (cx0 + 16, cy0 + 10, cx0 + cw - 16, cy0 + rh - 54), align_bottom=False, max_px=480)
                doc.html(page, (cx0 + 6, cy0 + rh - 38, cx0 + cw - 6, cy0 + rh),
                         f'<div class="thm" style="font-size:8.5pt">{escape(c["nameTh"])}</div>'
                         f'<div class="num muted" style="font-size:7pt">{escape(c["nameEn"])}&#160;·&#160;'
                         f'{len(c["products"])} items&#160;·&#160;p.{page_of_cat[c["slug"]]}</div>')
            continue

        _, space, cat, items, is_first = entry
        _running_header(doc, page, space["nameEn"], cat["nameTh"], cat["nameEn"])
        top = TOP
        if is_first:
            doc.html(page, (M, 54, W - M, 96),
                     f'<div><span class="display" style="font-size:22pt">{escape(cat["nameEn"])}</span>'
                     f'&#160;&#160;&#160;<span class="thl" style="font-size:13pt">{escape(cat["nameTh"])}</span>'
                     f'&#160;&#160;&#160;<span class="num muted" style="font-size:8pt">{len(cat["products"])} items</span></div>')
            top = 54 + 34
        gap_x, gap_y = 12, 10
        cw = (W - 2 * M - gap_x * (GRID_COLS - 1)) / GRID_COLS
        rh = (FOOT_Y - 14 - top - gap_y * (GRID_ROWS - 1)) / GRID_ROWS
        for j, p in enumerate(items[:PER]):
            x0 = M + (j % GRID_COLS) * (cw + gap_x)
            y0 = top + (j // GRID_COLS) * (rh + gap_y)
            _card(doc, page, p, x0, y0, cw, rh)
        _footer(doc, page, number)

    # ---- 4. index of codes
    entries = sorted(page_of_code, key=lambda e: (re.sub(r"[^A-Z0-9]", "", e[0].upper()) or "~", e[0]))
    per_col, cols_per_page = 46, 5
    col_w = (W - 2 * M) / cols_per_page
    for start in range(0, len(entries), per_col * cols_per_page):
        page = doc.page()
        _running_header(doc, page, "Index", "ดัชนีรหัสสินค้า", "Product codes")
        chunk = entries[start:start + per_col * cols_per_page]
        for c in range(cols_per_page):
            col_items = chunk[c * per_col:(c + 1) * per_col]
            if not col_items:
                break
            rows_html = "".join(
                f'<tr><td class="num" style="font-size:6.5pt; padding:0.6pt 0">{escape(cut(code, 22))}</td>'
                f'<td class="num muted" style="font-size:6.5pt; text-align:right">{n}</td></tr>' for code, n in col_items)
            doc.html(page, (M + c * col_w, 56, M + (c + 1) * col_w - 10, FOOT_Y - 12),
                     f'<table style="width:100%; border-collapse:collapse">{rows_html}</table>')
        _footer(doc, page, doc.pdf.page_count)

    # ---- 5. back cover
    page = doc.page()
    _band(page, 0, H)
    doc.html(page, (M, 70, W - M, 160), '<div class="display" style="font-size:54pt; letter-spacing:20pt; color:#ffffff">NAT</div>'
                                        '<div class="eyebrow" style="font-size:8pt; letter-spacing:4pt; color:#bdbab5; margin-top:6pt">FURNITURE</div>')
    page.draw_rect(pymupdf.Rect(M, 200, M + 60, 203), color=None, fill=ACCENT)
    doc.html(page, (M, 220, W * 0.55, 420),
             '<p style="color:#ffffff; font-size:9pt">ขนาดสินค้าอ้างอิงจากแผ่นสเปกของผู้ผลิต อาจคลาดเคลื่อนเล็กน้อย '
             'รายละเอียด วัสดุ และสีอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า '
             'ดูข้อมูลล่าสุดและรายละเอียดการผลิตของแต่ละรุ่นได้ที่เว็บไซต์แคตตาล็อก</p>'
             '<p style="color:#bdbab5; margin-top:8pt; font-size:8pt">Sizes come from the manufacturers\' specification sheets '
             'and may vary slightly. Details, materials and finishes may change without notice; see the online catalogue '
             'for the latest information and full construction details of each model.</p>')
    doc.html(page, (M, H - 60, W - M, H - 36),
             f'<div class="num" style="font-size:7.5pt; color:#8d8a85">NAT Furniture E-Catalogue&#160;&#160;·&#160;&#160;'
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
    out = ROOT / "public" / ("e-catalogue-photo.pdf" if color else "e-catalogue.pdf")
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
