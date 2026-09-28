"""Parse size strings like "กว้าง 120 x ลึก 60-74 x สูง 105 ซม." into millimetre ranges."""
from __future__ import annotations

import re

NUM = r"(\d+(?:[.,]\d+)?)"
RANGE = rf"{NUM}(?:\s*[-–~]\s*{NUM})?"
AXES = {
    "w": r"(?:กว้าง|กว้า|กวาง|ก\.|W\.?|Width)",
    "d": r"(?:ลึก|ลก|ยาว|D\.?|Depth|L\.?)",
    "h": r"(?:สูง|สง|H\.?|Height)",
    "dia": r"(?:ø|Ø|⌀|เส้นผ่า(?:น)?ศูนย์กลาง|Dia\.?|DIA\.?)",
}
UNIT_MM = re.compile(r"(มม|mm)", re.I)
UNIT_CM = re.compile(r"(ซม|cm)", re.I)
UNIT_M = re.compile(r"(?<![ซมก])ม\.|\bm\b")


def _f(x: str | None) -> float | None:
    return float(x.replace(",", ".")) if x else None


def parse_size(text: str) -> dict | None:
    """Return {"w": [min, max], "d": ..., "h": ..., "dia": ...} in mm, or None."""
    found: dict[str, list[float]] = {}
    for axis, kw in AXES.items():
        m = re.search(rf"{kw}\s*[:=]?\s*{RANGE}", text, re.I)
        if m:
            lo, hi = _f(m.group(1)), _f(m.group(2))
            found[axis] = [lo, hi if hi is not None else lo]
    if not found:
        # Bare "120 x 60 x 75"
        m = re.search(rf"{RANGE}\s*[xX×*]\s*{RANGE}(?:\s*[xX×*]\s*{RANGE})?", text)
        if not m:
            return None
        vals = [(_f(m.group(i)), _f(m.group(i + 1))) for i in (1, 3, 5)]
        for axis, (lo, hi) in zip(("w", "d", "h"), vals):
            if lo is not None:
                found[axis] = [lo, hi if hi is not None else lo]

    biggest = max(v for pair in found.values() for v in pair)
    if UNIT_MM.search(text):
        factor = 1
    elif UNIT_CM.search(text):
        factor = 10
    elif UNIT_M.search(text):
        # "ม." is almost always a typo for ซม. on these sheets; trust magnitude.
        factor = 1 if biggest > 400 else 10
    else:
        factor = 1 if biggest > 400 else 10
    return {k: [round(v * factor) for v in pair] for k, pair in found.items()}
