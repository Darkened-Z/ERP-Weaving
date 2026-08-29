#!/usr/bin/env python3
"""Extract all L5 accounts from CHART.pdf, then group under 9 target parents."""
import pdfplumber
import re
import json

# Target parent codes derived from the earlier dump
TARGETS = {
    "1.01.01.10":  "DEBTORS GREY SALE",
    "1.01.12":     "SHORT TERM LOANS AND ADVANCES",  # L3 — pick any L5 under it
    "1.01.15.02":  "BANK BALANCE",
    "1.01.15.03":  "BANK BALANCE ADVANCE CHEQUE",
    "1.01.15.04":  "BANK CHEQUE DISHONOUR ACC",
    "1.01.25.01":  "STOCK - YARN",
    "3.01.01.04":  "LOCAL INVESTORS",
    "3.03.01.01":  "CREDITORS - YARN PURCHASE",
    "3.03.31.01":  "CREDITORS - PRINTING",
}

FULL_CODE = re.compile(r"^\d+(?:\.\d+){0,4}$")
L5_CODE   = re.compile(r"^\d+\.\d+\.\d+\.\d+\.\d+$")

pdf_path = r"D:\Softwares\Weaving\CHART.pdf"
seen_l5 = {}  # code -> description
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
            tokens = [w["text"] for w in row_words]
            code = None
            desc_start = 0
            # Case A: first token is dotted code (heading rows L1-L4)
            if FULL_CODE.match(tokens[0]) and "." in tokens[0]:
                code = tokens[0]
                desc_start = 1
            # Case B: first token is serial number, second is dotted code (L5 rows)
            elif len(tokens) >= 2 and tokens[0].isdigit() and FULL_CODE.match(tokens[1]) and "." in tokens[1]:
                code = tokens[1]
                desc_start = 2
            if not code: continue
            desc = " ".join(tokens[desc_start:]).strip()
            if not desc: continue
            if L5_CODE.match(code) and code not in seen_l5:
                seen_l5[code] = desc

# Group by target parent
report = {}
for parent_code, parent_name in TARGETS.items():
    children = []
    for code, desc in seen_l5.items():
        if code.startswith(parent_code + "."):
            children.append({"code": code, "desc": desc})
    children.sort(key=lambda x: [int(s) for s in x["code"].split(".")])
    report[parent_code] = {"name": parent_name, "children": children}

# Print human report
for pcode, entry in report.items():
    print("=" * 70)
    print(f"{pcode}  {entry['name']}  ({len(entry['children'])} L5 parties)")
    for c in entry["children"]:
        print(f"   {c['code']}   {c['desc']}")

# Save JSON for insertion
with open("l5-to-insert.json", "w", encoding="utf-8") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print(f"\nTotal L5 to insert: {sum(len(r['children']) for r in report.values())}")
print("(JSON → l5-to-insert.json)")
