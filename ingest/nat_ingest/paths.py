import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INGEST = ROOT / "ingest"
CACHE = INGEST / ".cache"
RAW = CACHE / "raw"
OCR = CACHE / "ocr"
IMG_CACHE = CACHE / "images"
OUT = ROOT / "data" / "extracted"
MEDIA = ROOT / "public" / "media"

SOURCE = Path(os.environ.get("NAT_SOURCE", "/run/media/matthew/My Passport/Spec AI/SPEC PERFECT"))

# Folder name inside each ZIP -> brand slug shown in the catalog
BRANDS = {
    "PERFECT": "perfect",
    "mono": "mono",
    "MASS-MONO": "mass-mono",
    "PATARA": "patara",
    "mobelle": "mobelle",
}

# Suppliers imported from their websites (import agreed with each supplier): slug -> display name
WEB_BRANDS = {
    "nat": "NAT",
    "practika": "PRACTIKA",
    "thaitaiyo": "THAI TAIYO",
}
