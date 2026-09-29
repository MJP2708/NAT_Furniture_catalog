"""Coloured illustrations for the customer site: flat marker-style colour under our ink lines.

Per photo: smooth away texture, reduce to a few flat colours (k-means in Lab), soften them
toward paper white, keep the backdrop pure white, then lay the line drawing on top.
Output goes to public/media/c/<slug>/... mirroring the line drawings in public/media/p.
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .paths import MEDIA
from .sketch import sketch

COLOURS = 7  # flat tones per product
WASH = 0.18  # how far colours are lifted toward white (marker on paper)


def _product_mask(gray: np.ndarray) -> np.ndarray:
    """Where to put colour: the product's solid shape. Like the line drawing's silhouette,
    it takes clearly-darker areas plus detected edges, so soft floor shadows stay white."""
    border = np.concatenate([gray[:4].ravel(), gray[-4:].ravel(), gray[:, :4].ravel(), gray[:, -4:].ravel()])
    bg = float(np.median(border))
    s = max(1.0, max(gray.shape) / 700)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 1.0 * s), 30, 90) > 0
    fg = ((np.abs(gray.astype(np.int16) - bg) > 45) | edges).astype(np.uint8)
    k = max(3, int(max(gray.shape) * 0.006)) | 1
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    solid = np.zeros(gray.shape, np.uint8)
    min_area = gray.size * 0.002
    cv2.drawContours(solid, [c for c in contours if cv2.contourArea(c) >= min_area], -1, 1, thickness=cv2.FILLED)
    # keep real openings (between chair legs, inside frames): pixels that match the backdrop
    # and are far from any edge are paper, not product
    open_bg = (np.abs(gray.astype(np.int16) - bg) < 8) & (cv2.distanceTransform((~edges).astype(np.uint8), cv2.DIST_L2, 3) > 4 * s)
    solid[open_bg] = 0
    return cv2.GaussianBlur(solid.astype(np.float32), (0, 0), 1.0)


def colorize(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"))
    s = max(1.0, max(rgb.shape[:2]) / 700)
    smooth = rgb
    for _ in range(3):
        smooth = cv2.bilateralFilter(smooth, int(9 * s) | 1, 45, 6 * s)
    lab = cv2.cvtColor(smooth, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
    # k-means on a sample, then assign every pixel to its nearest flat tone
    rng = np.random.default_rng(0)
    sample = lab[rng.choice(len(lab), size=min(len(lab), 40000), replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, _, centers = cv2.kmeans(sample, COLOURS, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    idx = np.argmin(((lab[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
    flat = centers[idx].reshape(rgb.shape).astype(np.uint8)
    flat = cv2.cvtColor(flat, cv2.COLOR_LAB2RGB).astype(np.float32)
    flat = cv2.medianBlur(flat.astype(np.uint8), int(5 * s) | 1).astype(np.float32)
    colour = flat * (1 - WASH) + 255 * WASH

    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # Paint only where the product is clearly darker than the backdrop or clearly coloured:
    # soft grey floor shadows fail both and stay paper-white.
    border = np.concatenate([gray[:4].ravel(), gray[-4:].ravel(), gray[:, :4].ravel(), gray[:, -4:].ravel()])
    bg = float(np.median(border))
    hsv = cv2.cvtColor(smooth, cv2.COLOR_RGB2HSV)
    paint = ((bg - cv2.cvtColor(smooth, cv2.COLOR_RGB2GRAY).astype(np.int16) > 40) | (hsv[..., 1] > 55)).astype(np.uint8)
    paint = cv2.morphologyEx(paint, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    paint = cv2.GaussianBlur(paint.astype(np.float32), (0, 0), 1.2 * s)
    mask = (_product_mask(gray) * paint)[..., None]
    paper = np.full_like(colour, 255.0)
    filled = colour * mask + paper * (1 - mask)

    ink = np.asarray(sketch(img).convert("L"), dtype=np.float32)[..., None] / 255  # 1 = paper
    out = filled * ink
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def convert(pair: tuple[str, str]) -> None:
    src, dest = pair
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    colorize(Image.open(src)).save(dest, "WEBP", quality=80)


def colorize_all(paths: list[str] | None = None) -> int:
    """Colour every product photo under public/media/p into public/media/c (call before the
    line drawings overwrite the photos)."""
    src = paths or [str(p) for p in sorted((MEDIA / "p").rglob("*.webp"))]
    pairs = [(p, str(MEDIA / "c" / Path(p).relative_to(MEDIA / "p"))) for p in src]
    with ProcessPoolExecutor() as ex:
        list(ex.map(convert, pairs, chunksize=8))
    return len(pairs)


if __name__ == "__main__":
    print(f"coloured {colorize_all(sys.argv[1:] or None)} images")
