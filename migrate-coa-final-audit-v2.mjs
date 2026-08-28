#!/usr/bin/env node
/**
 * Final audit v2 — undo the v1 damage:
 * 1. RE-fix L1 descriptions to hardcoded good values (PDF has garbage L1s).
 * 2. RE-delete the L1 garbage rows (2, 4, 6, 8, 9).
 * 3. Print a REPORT-ONLY comparison, no auto-apply. Client decides what to
 *    change from here on via the /accounts UI.
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

const L1_FIX = {
  "1": "ASSETS",
  "3": "DIRECTOR'S INVESTMENTS",
  "5": "INCOME",
  "7": "EXPENSES",
};

// Step 1: re-fix L1s (unconditional)
for (const [code, desc] of Object.entries(L1_FIX)) {
  const r = await client.execute({ sql: "SELECT description FROM chart_of_accounts WHERE code = ?", args: [code] });
  if (r.rows.length && r.rows[0].description !== desc) {
    await client.execute({
      sql: "UPDATE chart_of_accounts SET description = ?, desc_short = ? WHERE code = ?",
      args: [desc, desc.substring(0, 12), code],
    });
    console.log(`  ⟳ L1 ${code} → ${desc}`);
  }
}

// Step 2: delete garbage L1s (they somehow returned)
const GARBAGE_L1 = ["2", "4", "6", "8", "9", "72"];
for (const g of GARBAGE_L1) {
  const res = await client.execute({
    sql: "DELETE FROM chart_of_accounts WHERE code = ? OR code LIKE ?",
    args: [g, `${g}.%`],
  });
  if (res.rowsAffected) console.log(`  ✗ Deleted garbage ${g} (${res.rowsAffected})`);
}

// Step 3: comparison REPORT ONLY
const heads = JSON.parse(readFileSync(HEADS_JSON, "utf-8"))
  .filter((h) => !GARBAGE_L1.includes(h.code)); // skip garbage from PDF too
const pdfByCode = new Map(heads.map((h) => [h.code, h.description]));

// Also patch L1 descriptions in PDF map to our clean values for a fair report
for (const [c, d] of Object.entries(L1_FIX)) pdfByCode.set(c, d);

const all = await client.execute("SELECT code, description, level FROM chart_of_accounts ORDER BY code");
const dbByCode = new Map(all.rows.map((r) => [String(r.code), { desc: String(r.description ?? ""), level: r.level }]));

const matches = [];
const mismatches = [];
const dbOnly = [];
const pdfOnly = [];

for (const [code, dbRow] of dbByCode.entries()) {
  const pdfDesc = pdfByCode.get(code);
  if (pdfDesc == null) dbOnly.push({ code, desc: dbRow.desc, level: dbRow.level });
  else if (pdfDesc === dbRow.desc) matches.push({ code, desc: dbRow.desc });
  else mismatches.push({ code, dbDesc: dbRow.desc, pdfDesc });
}
for (const [code, pdfDesc] of pdfByCode.entries()) {
  if (!dbByCode.has(code)) pdfOnly.push({ code, desc: pdfDesc, level: code.split(".").length });
}

console.log(`\n═════════════════════════════════════════`);
console.log(`  FINAL DB ↔ PDF AUDIT (report only)`);
console.log(`═════════════════════════════════════════`);
console.log(`DB rows:  ${dbByCode.size}`);
console.log(`PDF clean heads: ${pdfByCode.size}`);
console.log(`✓ Matches:       ${matches.length}`);
console.log(`⚠ Mismatches:    ${mismatches.length}`);
console.log(`+ DB-only:       ${dbOnly.length}   (extras beyond PDF)`);
console.log(`- PDF-only:      ${pdfOnly.length}   (in PDF but not in DB)`);

if (mismatches.length) {
  console.log(`\n--- Mismatches (DB vs PDF description) ---`);
  for (const m of mismatches) {
    console.log(`  ${m.code}  DB='${m.dbDesc}'  PDF='${m.pdfDesc}'`);
  }
}

if (pdfOnly.length) {
  console.log(`\n--- In PDF but NOT in DB (${pdfOnly.length}) ---`);
  for (const p of pdfOnly) console.log(`  L${p.level} ${p.code}  '${p.desc}'`);
}

if (dbOnly.length) {
  console.log(`\n--- In DB but NOT in PDF (${dbOnly.length}) ---`);
  console.log(`   (These are the original SK Mills seed heads + parties;`);
  console.log(`    client should decide keep or delete via /accounts UI)`);
  const nonParties = dbOnly.filter((d) => d.level < 5);
  const parties = dbOnly.filter((d) => d.level === 5);
  console.log(`\n   Heads (L1-L4) — ${nonParties.length}:`);
  for (const d of nonParties) console.log(`     L${d.level} ${d.code}  '${d.desc}'`);
  console.log(`\n   Parties (L5) — ${parties.length}:`);
  for (const d of parties.slice(0, 10)) console.log(`     L5  ${d.code}  '${d.desc}'`);
  if (parties.length > 10) console.log(`     ... and ${parties.length - 10} more`);
}
