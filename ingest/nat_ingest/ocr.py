"""Render every PDF page at 300 dpi and OCR it with Tesseract (tha+eng).

Results are cached per page in .cache/ocr/<folder>/<file>/p<N>.txt, so re-runs only
process new files.
"""
import os
import subprocess
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from .paths import OCR, RAW


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return 0


def ocr_page(pdf: Path, page: int, out: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "p"
        subprocess.run(
            ["pdftoppm", "-r", "300", "-gray", "-png", "-f", str(page), "-l", str(page), "-singlefile", str(pdf), str(base)],
            check=True,
        )
        text = subprocess.run(
            ["tesseract", f"{base}.png", "-", "-l", "tha+eng", "--psm", "6"],
            capture_output=True, text=True, env={**os.environ, "OMP_THREAD_LIMIT": "1"},
        ).stdout
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)


def ocr_pdf(pdf: Path) -> str:
    rel = pdf.relative_to(RAW)
    n = page_count(pdf)
    for p in range(1, n + 1):
        out = OCR / rel.with_suffix("") / f"p{p}.txt"
        if not out.exists():
            ocr_page(pdf, p, out)
    return str(rel)


def ocr_image(img: Path) -> str:
    """Spec sheets that only exist as scanned JPGs: OCR text + TSV (for photo cropping)."""
    rel = img.relative_to(RAW).with_suffix("")
    out = OCR / rel / "p1.txt"
    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
        base = str(out.with_suffix(""))
        subprocess.run(["tesseract", str(img), base, "-l", "tha+eng", "--psm", "6", "txt", "tsv"],
                       capture_output=True, env=env)
    return str(rel)


def main() -> None:
    workers = max(1, (os.cpu_count() or 4) - 2)
    with ProcessPoolExecutor(workers) as ex:
        list(ex.map(ocr_image, sorted(RAW.rglob("*.jpg"))))
    pdfs = sorted(RAW.rglob("*.pdf"))
    workers = max(1, (os.cpu_count() or 4) - 2)
    with ProcessPoolExecutor(workers) as ex:
        for i, done in enumerate(ex.map(ocr_pdf, pdfs), 1):
            if i % 50 == 0 or i == len(pdfs):
                print(f"[{i}/{len(pdfs)}] {done}", flush=True)


if __name__ == "__main__":
    main()
