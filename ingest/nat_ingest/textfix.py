"""Repair the broken Thai text layer of the supplier PDFs.

Damage seen in the text layer:

* TIS-620 bytes decoded as Latin-1 ("ËÁÒÂàËµØ" -> "หมายเหตุ").
* Excel exports map "า" to "ำ" ("ขนำด") and insert stray spaces ("สิ นค้า").
* PScript/CordiaNew exports drop tone marks ("เกาอี" -> "เก้าอี้", "นัง" -> "นั่ง").

The damage only ever removes tone marks or swaps "า"/"ำ", so every word keeps its
*skeleton* (the word with tone marks removed and "ำ" read as "า"). We segment each
Thai run against a skeleton index of the Thai dictionary and emit the dictionary
spelling. When several spellings share a skeleton ("ไม" -> ไม่/ไม้), we keep only
those consistent with the marks that survived, then prefer what the page OCR saw,
then what is most common across all OCR'd sheets.
"""
from __future__ import annotations

import math
import re
import unicodedata
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

THAI = "\u0e00-\u0e7f"
THAI_RUN = re.compile(f"[{THAI}]+(?: +[{THAI}]+)*")
MOJIBAKE_RUN = re.compile(r"[\u00a0-\u00ff]{2,}")
TONE = set("\u0e48\u0e49\u0e4a\u0e4b\u0e4c\u0e47\u0e4d")  # tone marks, thanthakhat, maitaikhu, nikhahit
MAX_WORD = 24
UNKNOWN_COST = 4

EXTRA_WORDS = """
เก้าอี้ พนักพิง ท้าวแขน ที่ท้าวแขน ฟองน้ำ หนังเทียม เมลามีน โครเมี่ยม ลิ้นชัก บังตา ท็อป ท๊อป
เคาน์เตอร์ ไซด์บอร์ด โซฟา สแตนเลส สเตนเลส ไนลอน ปรับระดับ ขึ้นรูป ฉีดขึ้นรูป พ่นสี อีพ็อกซี่
ปิดขอบ ปิดผิว ศีรษะ ศรีษะ แขวนไฟล์ ล้อ ท่อกลม ท่อเหลี่ยม วีเนียร์ ยางพารา เอนกประสงค์ ต่อมุม
เข้ามุม เพลา ชุบ โครเมียม บรอนซ์ บรอนด์ พียู ไมโครไฟเบอร์ โพลียูรีเทน ปุ่ม รองขา ตู้ ชั้นวาง
ไฟล์ บานเลื่อน บานเปิด มือจับ กุญแจ รางลิ้นชัก ลูกล้อ ตะแกรง เมทัลชีท หน้าท็อป ขาโต๊ะ ขาเก้าอี้
""".split()


# Windows Thai fonts position marks with private-use glyphs; map them back.
PUA_THAI = str.maketrans({
    0xF700: "\u0e10", 0xF701: "\u0e34", 0xF702: "\u0e35", 0xF703: "\u0e36", 0xF704: "\u0e37",
    0xF705: "\u0e48", 0xF706: "\u0e49", 0xF707: "\u0e4a", 0xF708: "\u0e4b", 0xF709: "\u0e4c",
    0xF70A: "\u0e48", 0xF70B: "\u0e49", 0xF70C: "\u0e4a", 0xF70D: "\u0e4b", 0xF70E: "\u0e4c",
    0xF70F: "\u0e0d", 0xF710: "\u0e31", 0xF711: "\u0e4d", 0xF712: "\u0e47", 0xF713: "\u0e48",
    0xF714: "\u0e49", 0xF715: "\u0e4a", 0xF716: "\u0e4b", 0xF717: "\u0e4c", 0xF718: "\u0e38",
    0xF719: "\u0e39", 0xF71A: "\u0e3a",
})


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFC", s.translate(PUA_THAI)).replace("\u03bc", "\u00b5")
    s = s.replace("\u00a0", " ")
    s = MOJIBAKE_RUN.sub(_demojibake, s)
    s = s.replace("\u0e4d\u0e32", "\u0e33")  # nikhahit + sara aa -> sara am
    s = re.sub("\u0e4d([\u0e48-\u0e4b])\u0e32", "\\1\u0e33", s)
    return s


def _demojibake(m: re.Match[str]) -> str:
    chunk = m.group(0)
    try:
        thai = chunk.encode("latin-1").decode("cp874")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return chunk
    return thai if sum("\u0e00" <= c <= "\u0e7f" for c in thai) * 2 >= len(thai) else chunk


def skel(s: str) -> str:
    return "".join("\u0e32" if c == "\u0e33" else c for c in s if c not in TONE and not c.isspace())


def tone_seq(s: str) -> str:
    return "".join(c for c in s if c in TONE)


def is_subsequence(small: str, big: str) -> bool:
    it = iter(big)
    return all(c in it for c in small)


class Corpus:
    """Dictionary skeleton index + domain frequency counts for disambiguation.

    `texts` should be trustworthy spec text: the non-Excel text layers (exact once
    the private-use glyphs are mapped) plus the page OCR.
    """

    def __init__(self, texts: list[str]):
        from pythainlp.corpus import thai_words

        self.index: dict[str, list[str]] = defaultdict(list)
        for w in set(thai_words()) | set(EXTRA_WORDS):
            if 1 <= len(w) <= MAX_WORD and re.fullmatch(f"[{THAI}]+", w):
                self.index[skel(w)].append(w)
        self.all_ocr = "\n".join(normalize(re.sub(r"[ \t]+", "", t)) for t in texts)

    @lru_cache(maxsize=200_000)
    def freq(self, word: str) -> int:
        return self.all_ocr.count(word)

    @lru_cache(maxsize=200_000)
    def word_cost(self, piece: str) -> int:
        """Cheaper for words common in our spec sheets, so "สี"+"ดำ" beats the name "สีดา"."""
        f = max(self.freq(w) for w in self.index[piece])
        return 10 - round(6 * min(1.0, math.log10(1 + f) / 3))

    def choose(self, original: str, candidates: list[str], page_ocr: str, prev: str, nxt: str, excel: bool) -> str:
        orig_tones = tone_seq(original)
        ok = [c for c in candidates if is_subsequence(orig_tones, tone_seq(c))] or candidates
        if not excel:
            # Outside Excel exports "ำ" vs "า" in the text layer is reliable.
            same_am = [c for c in ok if c.count("\u0e33") == original.count("\u0e33")]
            ok = same_am or ok
        if len(ok) == 1:
            return ok[0]
        p, n = prev[-1:], nxt[:1]

        def score(c: str) -> tuple:
            return (
                page_ocr.count(p + c + n) + self.freq(p + c + n),
                page_ocr.count(c + n) + self.freq(c + n),
                self.freq(p + c),
                c == original,
                self.freq(c),
                -len(tone_seq(c)),
            )

        return max(ok, key=score)

    def repair_run(self, run: str, page_ocr: str, excel: bool = False) -> str:
        """Segment a Thai run (spaces allowed) and emit dictionary spellings."""
        chars = [c for c in run]
        # Positions of skeleton chars in the original, and which ones had a space before them.
        sk, pos, space_before = [], [], set()
        pending_space = False
        for i, c in enumerate(chars):
            if c == " ":
                pending_space = True
                continue
            if c in TONE:
                pending_space = False
                continue
            if pending_space and sk:
                space_before.add(len(sk))
            pending_space = False
            sk.append("\u0e32" if c == "\u0e33" else c)
            pos.append(i)
        s = "".join(sk)
        n = len(s)
        if n == 0:
            return run

        def orig(j: int, i: int) -> str:
            start = pos[j]
            end = pos[i] if i < n else len(chars)
            return "".join(chars[start:end]).replace(" ", "")

        INF = 10**9
        best = [INF] * (n + 1)
        back: list[tuple[int, str | None]] = [(0, None)] * (n + 1)
        best[0] = 0
        for i in range(1, n + 1):
            for j in range(max(0, i - MAX_WORD), i):
                if best[j] == INF:
                    continue
                piece = s[j:i]
                if piece in self.index:
                    # Words crossing an original space are slightly penalised (real phrase breaks).
                    cost = best[j] + self.word_cost(piece) + sum(3 for k in range(j + 1, i) if k in space_before)
                    if cost < best[i]:
                        best[i], back[i] = cost, (j, piece)
            # Unknown single character.
            cost = best[i - 1] + 10 * UNKNOWN_COST
            if cost < best[i]:
                best[i], back[i] = cost, (i - 1, None)

        segs: list[tuple[int, int, str | None]] = []
        i = n
        while i > 0:
            j, piece = back[i]
            segs.append((j, i, piece))
            i = j
        segs.reverse()

        out: list[str] = []
        for k, (j, i, piece) in enumerate(segs):
            original = orig(j, i)
            nxt = orig(segs[k + 1][0], segs[k + 1][1]) if k + 1 < len(segs) else ""
            prev = "".join(out).rstrip()
            word = self.choose(original, self.index[piece], page_ocr, prev, nxt, excel) if piece else original
            if j in space_before and out:
                out.append(" ")
            out.append(word)
        return "".join(out)

    def unknown_ratio(self, text: str) -> float:
        """Share of Thai characters not covered by dictionary words (quality metric)."""
        total = unknown = 0
        for m in THAI_RUN.finditer(text):
            run = m.group(0).replace(" ", "")
            s = skel(run)
            n = len(s)
            total += n
            best = [0] + [10**9] * n
            for i in range(1, n + 1):
                best[i] = best[i - 1] + 1
                for j in range(max(0, i - MAX_WORD), i):
                    if s[j:i] in self.index and best[j] < best[i]:
                        best[i] = best[j]
            unknown += best[n]
        return unknown / total if total else 0.0


def repair_line(line: str, corpus: Corpus, page_ocr: str, excel: bool = False) -> str:
    line = normalize(line)
    return THAI_RUN.sub(lambda m: corpus.repair_run(m.group(0), page_ocr, excel), line)


def load_corpus(text_root: Path, ocr_root: Path, excel_files: set[str]) -> Corpus:
    """Build from cached text layers (skipping Excel exports) and all OCR pages."""
    texts = [
        p.read_text()
        for p in text_root.rglob("*.txt")
        if str(p.parent.relative_to(text_root)) not in excel_files
    ]
    texts += [p.read_text() for p in ocr_root.rglob("*.txt")]
    return Corpus(texts)
