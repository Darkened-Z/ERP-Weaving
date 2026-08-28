#!/usr/bin/env node
/**
 * Final audit + repair:
 * 1. Re-fix descriptions of any head still holding the wrong PDF-parse text
 *    ("Of Accounts (WVG)", "HOOK CHINA JAKAD PUR", "Chart Of Accounts", etc.)
 *    using known-good hard-coded values for L1 heads and the v3 JSON for others.
 * 2. Cross-reference EVERY row in DB against CHART_heads_v3.json and print:
 *    - matches (in both, same desc)
 *    - description-mismatches (in both, diff desc)
 *    - in-db-only (extra rows client can review)
 *    - in-pdf-only (missing rows client may want to add)
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADS_JSON = resolve(__dirname, "..", "videos", "CHART_heads_v3.json");

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

// Known-good L1 descriptions (accounting standard for a weaving mill)
const L1_FIX = {
  "1": "ASSETS",
  "3": "DIRECTOR'S INVESTMENTS",
  "5": "INCOME",
  "7": "EXPENSES",
};

// --- Step 1: fix L1 descriptions
for (const [code, desc] of Object.entries(L1_FIX)) {
  const cur = await client.execute({ sql: "SELECT description FROM chart_of_accounts WHERE code = ?", args: [code] });
  if (cur.rows.length === 0) {
    console.log(`  + inserting L1 ${code} → ${desc}`);
    await client.execute({
      sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status) VALUES (?, '', '0', 1, ?, ?, 'A')`,
      args: [code, desc, desc.substring(0, 12)],
    });
  } else if (cur.rows[0].description !== desc) {
    console.log(`  ⟳ fixing L1 ${code}: '${cur.rows[0].description}' → '${desc}'`);
    await client.execute({
      sql: "UPDATE chart_of_accounts SET description = ?, desc_short = ? WHERE code = ?",
      args: [desc, desc.substring(0, 12), code],
    });
  }
}

// --- Step 2: apply v3 JSON descriptions to all matching codes
const heads = JSON.parse(readFileSync(HEADS_JSON, "utf-8"));
const pdfByCode = new Map(heads.map((h) => [h.code, h.description]));

const all = await client.execute("SELECT code, description, level FROM chart_of_accounts ORDER BY code");
const dbByCode = new Map(all.rows.map((r) => [String(r.code), { desc: String(r.description ?? ""), level: r.level }]));

// Categorize
const matches = [];
const mismatches = [];
const dbOnly = [];
const pdfOnly = [];

for (const [code, dbRow] of dbByCode.entries()) {
  const pdfDesc = pdfByCode.get(code);
  if (pdfDesc == null) {
    dbOnly.push({ code, desc: dbRow.desc, level: dbRow.level });
  } else if (pdfDesc === dbRow.desc) {
    matches.push({ code, desc: dbRow.desc });
  } else {
    mismatches.push({ code, dbDesc: dbRow.desc, pdfDesc });
  }
}
for (const [code, pdfDesc] of pdfByCode.entries()) {
  if (!dbByCode.has(code)) pdfOnly.push({ code, desc: pdfDesc, level: code.split(".").length });
}

console.log(`\n=== FINAL AUDIT REPORT ===`);
console.log(`DB rows: ${dbByCode.size}`);
console.log(`PDF heads (v3 clean): ${pdfByCode.size}`);
console.log(`✓ Matches (identical desc): ${matches.length}`);
console.log(`⚠ Desc mismatches: ${mismatches.length}`);
console.log(`+ DB-only (extra, likely party rows or manual entries): ${dbOnly.length}`);
console.log(`- PDF-only (missing from DB): ${pdfOnly.length}`);

if (mismatches.length) {
  console.log(`\n--- Mismatches (auto-fixing with PDF value) ---`);
  for (const m of mismatches.slice(0, 50)) {
    console.log(`  ${m.code}  DB: '${m.dbDesc}'  →  PDF: '${m.pdfDesc}'`);
  }
  if (mismatches.length > 50) console.log(`  ... and ${mismatches.length - 50} more`);
  for (const m of mismatches) {
    await client.execute({
      sql: "UPDATE chart_of_accounts SET description = ?, desc_short = ? WHERE code = ?",
      args: [m.pdfDesc, m.pdfDesc.substring(0, 12), m.code],
    });
  }
  console.log(`  ✓ Applied ${mismatches.length} description corrections`);
}

if (pdfOnly.length) {
  console.log(`\n--- Missing from DB (PDF has these — inserting) ---`);
  for (const p of pdfOnly.slice(0, 30)) console.log(`  + L${p.level} ${p.code}  '${p.desc}'`);
  if (pdfOnly.length > 30) console.log(`  ... and ${pdfOnly.length - 30} more`);
  for (const p of pdfOnly) {
    const parts = p.code.split(".");
    const codeHead = parts.length > 1 ? parts.slice(0, -1).join(".") : "";
    await client.execute({
      sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
            VALUES (?, ?, '0', ?, ?, ?, 'A')`,
      args: [p.code, codeHead, p.level, p.desc, p.desc.substring(0, 12)],
    });
  }
  console.log(`  ✓ Inserted ${pdfOnly.length} missing heads`);
}

if (dbOnly.length) {
  console.log(`\n--- DB-only rows (${dbOnly.length}) — inspect ---`);
  // Break down by level
  const byLevel = {};
  for (const d of dbOnly) byLevel[d.level] = (byLevel[d.level] || 0) + 1;
  for (const lvl of Object.keys(byLevel).sort()) console.log(`  L${lvl}: ${byLevel[lvl]} rows`);
  // Show first 20 non-L5 (heads that are in DB but not in PDF — possibly manual additions or leftovers)
  const nonParties = dbOnly.filter((d) => d.level < 5);
  console.log(`\n  Non-party rows (heads L1-L4 in DB but not in PDF — ${nonParties.length}):`);
  for (const d of nonParties.slice(0, 20)) console.log(`    L${d.level} ${d.code}  '${d.desc}'`);
}
