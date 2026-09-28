"""Turn product photos into line sketches (XDoG edge drawing), so the catalog shows
drawings rather than the suppliers' photographs.

Usage: python -m nat_ingest.sketch [paths...]   (default: every WebP under public/media/p)
"""
from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .paths import MEDIA


def sketch(img: Image.Image, sigma: float = 1.0, k: float = 1.6, tau: float = 0.97,
           eps: float = -0.005, phi: float = 200.0) -> Image.Image:
    """Extended difference-of-Gaussians: dark, pen-like lines on white."""
    gray = ImageOps.autocontrast(img.convert("L"), cutoff=1)
    scale = max(1.0, max(gray.size) / 600)  # keep line weight similar across sizes
    g1 = np.asarray(gray.filter(ImageFilter.GaussianBlur(sigma * scale)), dtype=np.float32) / 255
    g2 = np.asarray(gray.filter(ImageFilter.GaussianBlur(sigma * k * scale)), dtype=np.float32) / 255
    d = g1 - tau * g2
    out = np.where(d >= eps, 1.0, 1.0 + np.tanh(phi * (d - eps)))
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).convert("RGB")


def convert(path: str) -> None:
    p = Path(path)
    img = Image.open(p)
    sketch(img).save(p, "WEBP", quality=80)


def main() -> None:
    paths = sys.argv[1:] or [str(p) for p in sorted((MEDIA / "p").rglob("*.webp"))]
    with ProcessPoolExecutor() as ex:
        list(ex.map(convert, paths, chunksize=16))
    print(f"sketched {len(paths)} images")


if __name__ == "__main__":
    main()
