#!/usr/bin/env python3
"""Print every account row from CHART.pdf with code + level + description."""
import pdfplumber
import re
pdf_path = r"D:\Softwares\Weaving\CHART.pdf"
seen = {}
with pdfplumber.open(pdf_path) as pdf:
    for page_no, page in enumerate(pdf.pages, 1):
        words = page.extract_words(x_tolerance=1, y_tolerance=2)
        lines = {}
        for w in words:
            y = round(w["top"] / 3) * 3
            lines.setdefault(y, []).append(w)
        for y in sorted(lines):
            row_words = sorted(lines[y], key=lambda w: w["x0"])
            if not row_words: continue
            first = row_words[0]["text"]
            if re.fullmatch(r"\d+(?:\.\d+){0,4}", first):
                code = first
                desc = " ".join(w["text"] for w in row_words[1:])
                if desc and code not in seen:
                    seen[code] = desc
# Print all L1-L4 sorted by code
def sort_key(c):
    return [int(x) for x in c.split(".")]
for code in sorted(seen, key=sort_key):
    lv = code.count(".") + 1
    if lv <= 4:
        print(f"L{lv}  {code:20s}  {seen[code]}")
