"""Turn product photos into clear line drawings, so the catalog shows drawings rather than
the suppliers' photographs.

Pipeline (per image, at its output size):
  1. smooth texture away (fabric weave, wood grain, JPEG noise) while keeping real edges
  2. find edges two ways -- XDoG for soft form lines, Canny for crisp contours -- and merge
  3. drop tiny speckles, then thicken strokes to a consistent pen weight
  4. trace the product's outer silhouette with a heavier line, so pale furniture on white
     still reads clearly
  5. anti-alias and render dark ink on white

Usage: python -m nat_ingest.sketch [paths...]   (default: every WebP under public/media/p)
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .paths import MEDIA

INK = 28  # near-black, softer than pure black on screen


def _xdog(gray: np.ndarray, sigma: float, k: float = 1.6, tau: float = 0.975, eps: float = -0.01, phi: float = 120.0) -> np.ndarray:
    g = gray.astype(np.float32) / 255
    g1 = cv2.GaussianBlur(g, (0, 0), sigma)
    g2 = cv2.GaussianBlur(g, (0, 0), sigma * k)
    d = g1 - tau * g2
    return np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))  # 1 = paper, 0 = ink


def _silhouette(gray: np.ndarray, edges: np.ndarray, pen: int) -> np.ndarray:
    """Heavy outer outline of the product, drawn as smooth anti-aliased contours.

    The background tone is measured on the image border (some photos sit on grey), faint
    floor shadows are ignored, and pale parts are caught through their detected edges."""
    border = np.concatenate([gray[:4].ravel(), gray[-4:].ravel(), gray[:, :4].ravel(), gray[:, -4:].ravel()])
    bg = float(np.median(border))
    # Clearly darker than the backdrop, or outlined by a detected edge. Soft floor shadows are
    # only slightly darker and have no edges of their own, so they stay out.
    fg = ((np.abs(gray.astype(np.int16) - bg) > 70) | edges).astype(np.uint8)
    k = 3
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    contours, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    min_area = gray.size * 0.003
    canvas = np.zeros(gray.shape, np.uint8)
    for c in contours:
        if cv2.contourArea(c) < min_area:
            continue
        # smooth the pixel staircase before drawing
        c = cv2.approxPolyDP(c, max(1.0, max(gray.shape) / 900), True)
        cv2.drawContours(canvas, [c], -1, 255, thickness=pen, lineType=cv2.LINE_AA)
    return canvas.astype(np.float32) / 255


def sketch(img: Image.Image) -> Image.Image:
    rgb = np.asarray(img.convert("RGB"))
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    # stretch contrast (1% clip) so dark and pale products get similar line strength
    lo, hi = np.percentile(gray, (1, 99))
    gray = np.clip((gray.astype(np.float32) - lo) * 255 / max(1, hi - lo), 0, 255).astype(np.uint8)
    size = max(gray.shape)
    s = max(1.0, size / 700)  # line weights are tuned at ~700 px and scale with the image

    # 1. edge-preserving smoothing removes texture but keeps panel and frame edges
    smooth = cv2.bilateralFilter(gray, d=int(7 * s) | 1, sigmaColor=40, sigmaSpace=4 * s)
    smooth = cv2.bilateralFilter(smooth, d=int(7 * s) | 1, sigmaColor=40, sigmaSpace=4 * s)

    # 2. two edge maps
    xdog = _xdog(smooth, sigma=0.9 * s) < 0.5
    med = float(np.median(smooth[smooth < 240])) if (smooth < 240).any() else 128.0
    canny = cv2.Canny(cv2.GaussianBlur(smooth, (0, 0), 0.8 * s), int(max(15, 0.33 * med)), int(min(255, 0.9 * med + 30))) > 0
    ink = (xdog | canny).astype(np.uint8)
    raw_edges = canny.copy()

    # 3. remove speckles, then set a consistent stroke weight
    n, labels, stats, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    min_len = int(10 * s)
    small = np.zeros(n, bool)
    small[1:] = (np.maximum(stats[1:, cv2.CC_STAT_WIDTH], stats[1:, cv2.CC_STAT_HEIGHT]) < min_len)
    ink[small[labels]] = 0
    # Stroke weight relative to image size, never thinner than 2 px, so small card images
    # read as clearly as the large drawings.
    pen = max(2, round(size / 420))
    ink = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pen, pen)))

    # 5. anti-alias, add the heavier silhouette, render
    alpha = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 0.6 * s)
    alpha = np.maximum(alpha, _silhouette(gray, raw_edges, pen))
    out = 255 - alpha.clip(0, 1) * (255 - INK)
    return Image.fromarray(out.astype(np.uint8)).convert("RGB")


def convert(path: str) -> None:
    p = Path(path)
    img = Image.open(p)
    sketch(img).save(p, "WEBP", quality=82)


def sketch_all(paths: list[str] | None = None) -> int:
    paths = paths or [str(p) for p in sorted((MEDIA / "p").rglob("*.webp"))]
    with ProcessPoolExecutor() as ex:
        list(ex.map(convert, paths, chunksize=16))
    return len(paths)


def main() -> None:
    print(f"sketched {sketch_all(sys.argv[1:])} images")


if __name__ == "__main__":
    main()
