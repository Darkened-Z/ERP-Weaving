#!/usr/bin/env node
/**
 * Delete rows that exist in DB but NOT in the client's CHART.pdf (v3 clean).
 * Print a report showing where each deleted row came from (src/db/seed.ts).
 *
 * The 45 DB-only rows all originate from src/db/seed.ts line 583-664 where
 * a generic accounting seed was inserted before the PDF-based import.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADS_JSON = resolve(__dirname, "..", "videos", "CHART_heads_v3.json");
const SEED_TS = resolve(__dirname, "src", "db", "seed.ts");

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

// PDF heads (with our L1 patches applied)
const heads = JSON.parse(readFileSync(HEADS_JSON, "utf-8"))
  .filter((h) => !["2", "4", "6", "8", "9", "72"].includes(h.code));
const pdfByCode = new Map(heads.map((h) => [h.code, h.description]));
for (const [c, d] of [["1", "ASSETS"], ["3", "DIRECTOR'S INVESTMENTS"], ["5", "INCOME"], ["7", "EXPENSES"]]) {
  pdfByCode.set(c, d);
}

// DB rows
const all = await client.execute("SELECT code, description, level FROM chart_of_accounts ORDER BY code");
const dbOnly = all.rows
  .map((r) => ({ code: String(r.code), desc: String(r.description ?? ""), level: r.level }))
  .filter((r) => !pdfByCode.has(r.code));

// Read seed.ts to trace source for each DB-only row
const seedText = readFileSync(SEED_TS, "utf-8");
const seedLines = seedText.split("\n");
const seedMap = new Map(); // code -> line number
seedLines.forEach((ln, idx) => {
  const m = ln.match(/\[\s*"([\d\.]+)"\s*,\s*"([\d\.]+)"\s*,\s*\d+\s*,\s*"([^"]+)"/);
  if (m) seedMap.set(m[1], { line: idx + 1, desc: m[3] });
});

console.log(`\n═════════════════════════════════════════════`);
console.log(`  DELETION REPORT — DB rows not in PDF`);
console.log(`═════════════════════════════════════════════`);
console.log(`Total DB-only rows: ${dbOnly.length}`);
console.log(`\nCode           L  Description                          Source`);
console.log(`------------   -  -----------------------------------  ---------------------`);

const notInSeed = [];
for (const r of dbOnly) {
  const src = seedMap.get(r.code);
  const source = src ? `seed.ts:${src.line}` : "UNKNOWN (manual/other)";
  console.log(`${r.code.padEnd(13)}  ${r.level}  ${r.desc.padEnd(35).substring(0, 35)}  ${source}`);
  if (!src) notInSeed.push(r);
}

// Check FK references before deleting
console.log(`\n--- Checking references ---`);
const referenced = new Set();
for (const r of dbOnly) {
  // Check partyCounts, postingAccounts, voucher party fields (by description text)
  const refs = await Promise.all([
    client.execute({ sql: "SELECT 1 FROM party_counts WHERE party_code = ? LIMIT 1", args: [r.code] }),
    client.execute({ sql: "SELECT 1 FROM posting_accounts WHERE acc_code = ? LIMIT 1", args: [r.code] }).catch(() => ({ rows: [] })),
  ]);
  if (refs.some((x) => x.rows.length > 0)) referenced.add(r.code);
}

if (referenced.size) {
  console.log(`⚠ ${referenced.size} rows have references — will still delete but note:`);
  for (const c of referenced) console.log(`   ${c}`);
}

// Delete all DB-only rows
console.log(`\n--- Deleting ${dbOnly.length} rows ---`);
let deleted = 0;
for (const r of dbOnly) {
  try {
    const res = await client.execute({
      sql: "DELETE FROM chart_of_accounts WHERE code = ?",
      args: [r.code],
    });
    deleted += res.rowsAffected;
  } catch (e) {
    console.log(`   ✗ ${r.code} FAILED: ${e.message}`);
  }
}
console.log(`✓ Deleted ${deleted} rows`);

// Final tally
const after = await client.execute("SELECT COUNT(*) as n FROM chart_of_accounts");
console.log(`\nFinal DB row count: ${after.rows[0].n}`);

console.log(`\n═════════════════════════════════════════════`);
console.log(`  SOURCE TRACE SUMMARY`);
console.log(`═════════════════════════════════════════════`);
const fromSeed = dbOnly.length - notInSeed.length;
console.log(`  ${fromSeed} rows from src/db/seed.ts (lines 583-664 — generic accounting seed)`);
console.log(`  ${notInSeed.length} rows from unknown sources (manual entry via /accounts UI)`);
if (notInSeed.length) {
  console.log(`\n  Unknown-source rows:`);
  for (const r of notInSeed) console.log(`    ${r.code}  '${r.desc}'`);
}
