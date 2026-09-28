"""Cache each PDF's text layer (per page) and metadata in .cache/text and .cache/meta.json."""
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .paths import CACHE, RAW

TEXT = CACHE / "text"
META = CACHE / "meta.json"


def pdf_meta(pdf: Path) -> dict:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True).stdout
    info = dict(line.split(":", 1) for line in out.splitlines() if ":" in line)
    return {"creator": info.get("Creator", "").strip(), "pages": int(info.get("Pages", "0").strip() or 0)}


def extract(pdf: Path) -> tuple[str, dict]:
    rel = str(pdf.relative_to(RAW).with_suffix(""))
    meta = pdf_meta(pdf)
    for p in range(1, meta["pages"] + 1):
        out = TEXT / rel / f"p{p}.txt"
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            text = subprocess.run(
                ["pdftotext", "-layout", "-f", str(p), "-l", str(p), str(pdf), "-"], capture_output=True, text=True
            ).stdout
            out.write_text(text)
    return rel, meta


def load_meta() -> dict[str, dict]:
    return json.loads(META.read_text())


def main() -> None:
    with ThreadPoolExecutor(16) as ex:
        meta = dict(ex.map(extract, sorted(RAW.rglob("*.pdf"))))
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"text layers cached for {len(meta)} PDFs")


if __name__ == "__main__":
    main()
