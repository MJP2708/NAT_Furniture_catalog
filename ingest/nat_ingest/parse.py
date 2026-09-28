"""Turn one repaired spec-sheet page into a structured product record."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .textfix import skel

# Label skeletons (tone marks removed, "ำ" -> "า") for the fields we treat specially.
TYPE_LABELS = {skel(x) for x in ["ประเภทสินค้า", "ประเภท", "Type", "Product type"]}
CODE_LABELS = {skel(x) for x in ["รหัสสินค้า", "รหัส", "Code", "Model", "รุ่น"]}
NOTE_LABELS = {skel(x) for x in ["หมายเหตุ", "Remark", "Note"]}
FEATURE_LABELS = {skel(x) for x in ["ลักษณะพิเศษ", "คุณสมบัติพิเศษ", "Feature", "Features"]}
SIZE_PREFIXES = [skel(x) for x in ["ขนาด", "Size", "Dimension"]]
SECTION_RE = re.compile(r"^(รายละเอียด|ข้อมูลทางเทคนิค|Specification|Technical|INTRODUCTION)", re.I)
HEADER_RE = re.compile(r"(CO\.,?\s*LTD|บริษัท|Tel\.|Fax|โทร|www\.|e-mail|Soi|ซ\.|ซอย|แขวง|Bangkok|กรุงเทพ)", re.I)
FIELD_RE = re.compile(r"^\s*(?P<label>[^:：]{1,60}?)\s*[:：]\s*(?P<value>.*)$")
CONT_RE = re.compile(r"^\s*[:：]\s*(?P<value>.+)$")
NUMERIC_LINE = re.compile(r"^[\s\d.,/\-xX×]+$")
ENUM_PREFIX = re.compile(r"^\s*\d+(\.\d+)*\.?\s*")


@dataclass
class SpecRow:
    label: str
    values: list[str] = field(default_factory=list)


@dataclass
class ParsedPage:
    code: str | None = None
    type: str | None = None
    sizes: list[tuple[str, str]] = field(default_factory=list)  # (label, value)
    specs: list[SpecRow] = field(default_factory=list)
    features: list[str] = field(default_factory=list)
    note: str | None = None
    sections: list[str] = field(default_factory=list)


def _clean(v: str) -> str:
    v = re.sub(r"\s{2,}", " ", v).strip()
    return v.strip(" :")


def _is_size(label_skel: str) -> bool:
    return any(label_skel.startswith(p) for p in SIZE_PREFIXES) and "ของ" not in label_skel


def parse_lines(lines: list[str]) -> ParsedPage | None:
    page = ParsedPage()
    started = False
    current: SpecRow | None = None
    target: str | None = None  # which special field a continuation line belongs to

    def append_to_current(text: str, new_value: bool) -> None:
        nonlocal current
        text = _clean(text)
        if not text:
            return
        if target == "features":
            if new_value or not page.features:
                page.features.append(text)
            else:
                page.features[-1] += " " + text
        elif target == "note":
            page.note = f"{page.note} {text}" if page.note else text
        elif target == "type":
            page.type = f"{page.type} {text}" if page.type else text
        elif target == "size" and page.sizes:
            if new_value:
                page.sizes.append((page.sizes[-1][0], text))
            else:
                lbl, val = page.sizes[-1]
                page.sizes[-1] = (lbl, f"{val} {text}")
        elif current is not None:
            if new_value or not current.values:
                current.values.append(text)
            else:
                current.values[-1] += " " + text

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            continue
        stripped = line.strip()

        if not started:
            m = FIELD_RE.match(stripped)
            if m and not HEADER_RE.search(stripped):
                ls = skel(ENUM_PREFIX.sub("", m.group("label")))
                if ls in TYPE_LABELS or ls in CODE_LABELS or _is_size(ls):
                    started = True
            if not started:
                continue

        if NUMERIC_LINE.match(stripped):
            continue  # dimension call-outs from drawings
        if SECTION_RE.match(stripped) and (":" not in stripped or not stripped.split(":", 1)[1].strip()):
            page.sections.append(_clean(stripped))
            current, target = None, None
            continue

        cont = CONT_RE.match(stripped)
        if cont:
            append_to_current(cont.group("value"), new_value=True)
            continue

        m = FIELD_RE.match(stripped)
        if m and len(m.group("label").strip()) <= 40 and not re.fullmatch(r"[\d\s.]+", m.group("label")):
            label = _clean(ENUM_PREFIX.sub("", m.group("label")))
            value = _clean(m.group("value"))
            ls = skel(label)
            if ls in TYPE_LABELS:
                page.type, target, current = value, "type", None
            elif ls in CODE_LABELS:
                page.code, target, current = value, "code", None
            elif ls in NOTE_LABELS:
                page.note, target, current = value, "note", None
            elif ls in FEATURE_LABELS:
                if value:
                    page.features.append(value)
                target, current = "features", None
            elif _is_size(ls):
                page.sizes.append((label, value))
                target, current = "size", None
            else:
                current = SpecRow(label=label, values=[value] if value else [])
                page.specs.append(current)
                target = None
            continue

        # Wrapped continuation of the previous value.
        if HEADER_RE.search(stripped) and current is None and target is None:
            continue
        append_to_current(stripped, new_value=False)

    if not page.code and not page.type:
        return None
    page.specs = [s for s in page.specs if s.values]
    return page
