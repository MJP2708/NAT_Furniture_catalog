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
    def __init__(self) -> None:
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
        path = ROOT / "public" / url.lstrip("/")
        if not path.exists():
            return
        key = f"{path}:{max_px}:{transparent}"
        if key not in self.image_cache:
            img = Image.open(path).convert("L")
            img.thumbnail((max_px, max_px))
            buf = io.BytesIO()
            if transparent:
                ink = Image.new("LA", img.size, 0)
                ink.putalpha(img.point(lambda v: 255 - v))
                ink.save(buf, "PNG", optimize=True)
            else:
                img.save(buf, "JPEG", quality=72, optimize=True)
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


def build() -> Path:
    data = json.loads((CACHE / "ecatalog.json").read_text())
    spaces = data["spaces"]
    doc = Doc()

    # Plan page numbers first so the contents page can list them.
    plan: list[tuple[str, dict, dict | None, list[dict]]] = []  # (kind, space, category, items)
    for space in spaces:
        plan.append(("divider", space, None, []))
        for cat in space["categories"]:
            items = cat["products"]
            for i in range(0, len(items), PER_PAGE):
                plan.append(("line", space, cat, items[i:i + PER_PAGE]))
    first_page = 3  # cover, contents
    page_of_space = {}
    page_of_cat = {}
    for i, (kind, space, cat, _) in enumerate(plan):
        n = first_page + i
        if kind == "divider":
            page_of_space.setdefault(space["slug"], n)
        else:
            page_of_cat.setdefault(cat["slug"], n)

    def cover_of(cat: dict) -> str | None:
        with_image = [p for p in cat["products"] if p["image"]]
        best = sorted(with_image, key=lambda p: (p["rendered"], p["code"]))
        return best[0]["image"] if best else None

    covers = {c["slug"]: cover_of(c) for s in spaces for c in s["categories"]}
    total = sum(len(c["products"]) for s in spaces for c in s["categories"])

    # 1. Cover
    page = doc.page()
    doc.wash(page)
    # Four pieces standing on one "floor" line, like a studio line-up.
    floor, slot = 330, (W - 2 * M) / 4
    for k, slug in enumerate(("armchairs", "office-chairs", "waiting-chairs", "sofas")):
        x0 = M + k * slot
        doc.sketch(page, covers.get(slug), (x0 + 14, 120, x0 + slot - 14, floor), max_px=700, transparent=True)
    doc.html(page, (0, 372, W, 450), '<div class="display" style="font-size:64pt; text-align:center; letter-spacing:22pt">NAT</div>')
    doc.html(page, (0, 452, W, 480), '<div class="eyebrow" style="text-align:center; font-size:10pt; letter-spacing:4pt">E-CATALOGUE</div>')
    doc.html(page, (0, 484, W, 540),
             '<div style="text-align:center">Furniture for every space<br/>'
             '<span class="thl">เฟอร์นิเจอร์สำหรับทุกพื้นที่ ทั้งสำนักงานและบ้าน</span></div>')
    doc.html(page, (M, FOOT_Y - 4, W - M, FOOT_Y + 12),
             f'<div class="num muted" style="text-align:right; font-size:8pt">{date.today():%Y}</div>')

    # 2. Contents
    page = doc.page()
    doc.html(page, (M, 70, 380, 170), '<div class="display" style="font-size:44pt">Contents</div>'
                                      '<div class="thl" style="font-size:16pt">สารบัญ</div>')
    doc.html(page, (M, 190, 330, 300),
             f'<p>แคตตาล็อกรวมเฟอร์นิเจอร์ {total:,} รายการ แยกตามพื้นที่ใช้งาน พร้อมแบบร่างและขนาดของทุกชิ้น</p>'
             f'<p class="muted" style="margin-top:6pt">{total:,} pieces arranged by space, each with a drawing and its sizes.</p>')
    y = 70
    x = 400
    for n, space in enumerate(spaces, 1):
        doc.html(page, (x, y, x + 30, y + 20), f'<div class="num muted" style="font-size:9pt">{n:02d}</div>')
        doc.rule(page, x + 28, y + 7, x + 70, 0.5)
        doc.html(page, (x + 78, y - 3, x + 380, y + 22),
                 f'<div><span class="display" style="font-size:15pt">{escape(space["nameEn"])}</span>'
                 f'&#160;&#160;<span class="thl muted" style="font-size:10pt">{escape(space["nameTh"])}</span></div>')
        doc.html(page, (W - M - 40, y, W - M, y + 20),
                 f'<div class="num" style="text-align:right; font-size:9pt">{page_of_space[space["slug"]]:02d}</div>')
        y += 26
        for cat in space["categories"]:
            doc.html(page, (x + 78, y, x + 360, y + 14),
                     f'<div style="font-size:8pt"><span class="num">{escape(cat["nameEn"])}</span>'
                     f' <span class="muted">{escape(cat["nameTh"])}</span></div>')
            doc.html(page, (W - M - 40, y, W - M, y + 14),
                     f'<div class="num muted" style="text-align:right; font-size:8pt">{page_of_cat[cat["slug"]]:02d}</div>')
            y += 14
        y += 12
    doc.footer(page, 2, "Contents")

    # 3. Spaces
    for i, (kind, space, cat, items) in enumerate(plan):
        number = first_page + i
        page = doc.page()
        if kind == "divider":
            doc.wash(page, (0, 0, W * 0.46, H))
            idx = spaces.index(space) + 1
            doc.html(page, (M, 70, 360, 100), f'<div class="num muted" style="font-size:10pt">{idx:02d}</div>')
            doc.html(page, (M, 96, 380, 250),
                     f'<div class="display" style="font-size:54pt">{escape(space["nameEn"])}</div>'
                     f'<div class="thl" style="font-size:20pt; margin-top:4pt">{escape(space["nameTh"])}</div>')
            if space.get("copy"):
                doc.html(page, (M, 300, 350, 470),
                         f'<p>{escape(space["copy"]["th"])}</p>'
                         f'<p class="muted" style="margin-top:6pt; font-size:8.5pt">{escape(space["copy"]["en"])}</p>')
            # Up to six subcategories with their sketch, on the white side
            cats = space["categories"][:6]
            gx0, gw = W * 0.46 + 30, W - M - (W * 0.46 + 30)
            cols = 3 if len(cats) > 2 else len(cats)
            cw = gw / max(cols, 1)
            rows = math.ceil(len(cats) / max(cols, 1))
            rh = min(200, (FOOT_Y - 60 - 70) / max(rows, 1))
            for j, c in enumerate(cats):
                cx0 = gx0 + (j % cols) * cw
                cy0 = 70 + (j // cols) * rh
                doc.sketch(page, covers.get(c["slug"]), (cx0 + 8, cy0, cx0 + cw - 8, cy0 + rh - 46), max_px=420)
                doc.rule(page, cx0 + 8, cy0 + rh - 40, cx0 + cw - 8, 0.6)
                doc.html(page, (cx0 + 8, cy0 + rh - 36, cx0 + cw - 8, cy0 + rh),
                         f'<div class="thm" style="font-size:8.5pt">{escape(c["nameTh"])}</div>'
                         f'<div class="num muted" style="font-size:7pt">{escape(c["nameEn"])} · {len(c["products"])}</div>')
            doc.footer(page, number, space["nameEn"])
            continue

        # Line page
        doc.html(page, (M, 40, W - M, 64),
                 f'<div><span class="eyebrow" style="font-size:9pt">{escape(cat["nameEn"].upper())}</span>'
                 f'&#160;&#160;&#160;<span class="thl muted" style="font-size:10pt">{escape(cat["nameTh"])}</span></div>')
        top, bottom = 76, FOOT_Y - 18
        cw = (W - 2 * M) / COLS
        rh = (bottom - top) / ROWS
        for j, p in enumerate(items):
            x0 = M + (j % COLS) * cw
            y0 = top + (j // COLS) * rh
            img_bottom = y0 + rh * 0.58
            doc.sketch(page, p["image"], (x0 + 6, y0 + 4, x0 + cw - 10, img_bottom))
            doc.rule(page, x0, img_bottom + 5, x0 + cw - 12, 0.6)
            # Main size only; extra sets (seat size, other widths) are listed on the website.
            lines = [l for l in (size_line(mm) for mm in p["sizes"]) if l]
            size_html = escape(lines[0]) if lines else ""
            if len(lines) > 1:
                size_html += f'<br/>+{len(lines) - 1} size{"s" if len(lines) > 2 else ""}'
            doc.html(page, (x0, img_bottom + 9, x0 + cw - 12, y0 + rh),
                     f'<div class="num" style="font-size:8.5pt">{escape(p["code"])}</div>'
                     f'<div class="muted" style="font-size:7pt">{escape(cut(p["typeTh"] or "", 30))}</div>'
                     f'<div class="num muted" style="font-size:6.5pt; margin-top:1pt">{size_html}</div>')
        doc.footer(page, number, f'{space["nameEn"]} / {cat["nameEn"]}')

    # 4. Closing page
    page = doc.page()
    doc.wash(page)
    doc.html(page, (M, 160, W / 2, 300), '<div class="display" style="font-size:44pt">NAT Furniture</div>'
                                         '<div class="thl" style="font-size:14pt; margin-top:6pt">ขอบคุณที่เลือกชมแคตตาล็อกของเรา</div>')
    doc.html(page, (W / 2 + 20, 170, W - M, 420),
             '<p>ขนาดสินค้าอ้างอิงจากแผ่นสเปกของผู้ผลิต อาจคลาดเคลื่อนเล็กน้อย รายละเอียดและวัสดุอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งให้ทราบล่วงหน้า '
             'ดูข้อมูลล่าสุดและรายละเอียดการผลิตของแต่ละรุ่นได้ที่เว็บไซต์แคตตาล็อก</p>'
             '<p class="muted" style="margin-top:8pt; font-size:8.5pt">Sizes come from the manufacturers\' specification sheets and may vary slightly. '
             'Details and materials may change without notice; see the online catalogue for the latest '
             'information and full construction details of each model.</p>'
             f'<p class="num muted" style="margin-top:14pt; font-size:8pt">Generated {date.today():%d %b %Y}</p>')
    doc.footer(page, doc.pdf.page_count, "NAT Furniture")

    doc.pdf.set_metadata({"title": "NAT Furniture E-Catalogue", "author": "NAT Furniture",
                          "subject": "Furniture catalogue", "creator": "nat_ingest.ecatalog"})
    out = ROOT / "public" / "e-catalogue.pdf"
    doc.pdf.save(out, garbage=4, deflate=True)
    return out


def main() -> None:
    out = build()
    doc = pymupdf.open(out)
    print(f"{out.relative_to(ROOT)}: {doc.page_count} pages, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
