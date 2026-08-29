#!/usr/bin/env node
/**
 * Cross-verify: PDF-extracted L5 parties vs DB L5 rows for each of the 9 heads.
 * Reports mismatches (missing, extra, description drift).
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const pdf = JSON.parse(fs.readFileSync("l5-to-insert.json", "utf8"));

let overallPdf = 0, overallDb = 0, overallMissing = 0, overallDrift = 0;

for (const [parentCode, entry] of Object.entries(pdf)) {
  const pdfMap = new Map();
  for (const ch of entry.children) pdfMap.set(ch.code, ch.desc);

  const dbRows = await c.execute({
    sql: "SELECT code, description, desc_short FROM chart_of_accounts WHERE level = 5 AND code LIKE ? ORDER BY code",
    args: [parentCode + ".%"],
  });
  const dbMap = new Map();
  for (const r of dbRows.rows) {
    const full = r.desc_short ? `${r.desc_short} ${r.description}` : r.description;
    dbMap.set(r.code, full);
  }

  const missing = [];
  const drift = [];
  for (const [code, pdfDesc] of pdfMap) {
    if (!dbMap.has(code)) { missing.push({ code, pdfDesc }); continue; }
    const dbDesc = dbMap.get(code);
    if (pdfDesc.replace(/\s+/g, " ").trim() !== dbDesc.replace(/\s+/g, " ").trim()) {
      drift.push({ code, pdf: pdfDesc, db: dbDesc });
    }
  }
  const extra = [];
  for (const [code, dbDesc] of dbMap) {
    if (!pdfMap.has(code)) extra.push({ code, dbDesc });
  }

  const ok = missing.length === 0 && drift.length === 0;
  const marker = ok ? "✓" : "✗";
  console.log(`\n${marker} ${parentCode}  ${entry.name}`);
  console.log(`    PDF: ${pdfMap.size}   DB: ${dbMap.size}   missing: ${missing.length}   drift: ${drift.length}   extra: ${extra.length}`);
  if (missing.length) {
    console.log(`    Missing from DB (would be re-inserted):`);
    for (const m of missing.slice(0, 10)) console.log(`       ${m.code}  ${m.pdfDesc}`);
    if (missing.length > 10) console.log(`       ... +${missing.length - 10} more`);
  }
  if (drift.length) {
    console.log(`    Desc drift:`);
    for (const d of drift.slice(0, 5)) console.log(`       ${d.code}\n          PDF: ${d.pdf}\n           DB: ${d.db}`);
    if (drift.length > 5) console.log(`       ... +${drift.length - 5} more`);
  }
  if (extra.length) {
    console.log(`    Extra in DB (not in PDF):`);
    for (const e of extra.slice(0, 5)) console.log(`       ${e.code}  ${e.dbDesc}`);
    if (extra.length > 5) console.log(`       ... +${extra.length - 5} more`);
  }

  overallPdf += pdfMap.size;
  overallDb += dbMap.size;
  overallMissing += missing.length;
  overallDrift += drift.length;
}

console.log(`\n=== OVERALL ===`);
console.log(`PDF total L5 (in target heads): ${overallPdf}`);
console.log(`DB total L5 (in target heads):  ${overallDb}`);
console.log(`Missing:  ${overallMissing}`);
console.log(`Drift:    ${overallDrift}`);
console.log(overallMissing === 0 && overallDrift === 0 ? "\n✓ FULL MATCH — every PDF entry is in DB with correct description" : "\n✗ mismatches above");
