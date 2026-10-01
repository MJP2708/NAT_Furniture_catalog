"""Parse size strings like "กว้าง 120 x ลึก 60-74 x สูง 105 ซม." into millimetre ranges."""
from __future__ import annotations

import re

NUM = r"(\d+(?:[.,]\d+)?)"
RANGE = rf"{NUM}(?:\s*[-–~]\s*{NUM})?"
AXES = {
    "w": r"(?:กว้าง|กว้า|กวาง|ก\.|ก(?=\s*\d)|W\.?|Width)",
    "d": r"(?:ลึก|ลก|ยาว|D\.?|Depth|L\.?|ล(?=\s*\d))",
    "h": r"(?:สูง|สง|H\.?|Height|ส(?=\s*\d))",
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
    if biggest <= 5 and any(v % 1 for pair in found.values() for v in pair):
        # "1.20 x 0.60 x 0.75" -- metres
        return {k: [round(v * 1000) for v in pair] for k, pair in found.items()}
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


# Plausible furniture sizes in mm (depth can be tiny: panels, shelves, table tops).
PLAUSIBLE = {"w": (200, 6000), "d": (10, 4000), "h": (200, 2600), "dia": (200, 3000)}


def _bad(axis: str, pair: list[int]) -> bool:
    lo, hi = PLAUSIBLE.get(axis, (1, 10**6))
    return pair[0] < lo or pair[1] > hi


def sanity_fix(mm: dict) -> tuple[dict, str | None]:
    """Repair unit typos on the sheets ("560 x 550 x 790 ซม." that are really mm, "1100 ซม.").

    First rescale the whole size line by x1, x10 or /10, whichever leaves the fewest implausible
    axes (x1 wins ties), then shrink single axes that are exactly 10x too large. Returns the
    (possibly fixed) sizes and a flag: "dims-fixed", "dims-suspect" or None.
    """
    def scaled(f: float) -> dict:
        return {k: [round(v * f) for v in pair] for k, pair in mm.items()}

    options = [(sum(_bad(k, p) for k, p in scaled(f).items()), i, f) for i, f in enumerate((1, 10, 0.1))]
    _, _, factor = min(options)
    out = scaled(factor)
    fixed = factor != 1
    for k, pair in out.items():
        if _bad(k, pair) and pair[1] > PLAUSIBLE.get(k, (0, 10**6))[1]:
            smaller = [round(v / 10) for v in pair]
            if not _bad(k, smaller):
                out[k], fixed = smaller, True
    if any(_bad(k, p) for k, p in out.items()):
        return out, "dims-suspect"
    return out, "dims-fixed" if fixed else None
