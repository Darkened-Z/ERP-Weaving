#!/usr/bin/env node
/**
 * Insert L5 parties under 9 named heads from CHART.pdf.
 * Reads l5-to-insert.json (produced by extract-l5-heads.py).
 * Skips rows whose code already exists.
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const data = JSON.parse(fs.readFileSync("l5-to-insert.json", "utf8"));

const existing = await c.execute("SELECT code FROM chart_of_accounts WHERE level = 5");
const haveCodes = new Set(existing.rows.map(r => r.code));
console.log(`Existing L5 in DB: ${haveCodes.size}`);

let totalInserted = 0;
let totalSkipped = 0;
for (const [parentCode, entry] of Object.entries(data)) {
  console.log(`\n=== ${parentCode}  ${entry.name}  (${entry.children.length} in PDF) ===`);

  // Verify parent exists
  const parent = await c.execute({ sql: "SELECT code, description FROM chart_of_accounts WHERE code = ?", args: [parentCode] });
  if (!parent.rows.length) { console.log(`  ⚠ parent code ${parentCode} not in DB, skipping this head`); continue; }

  let ins = 0, skip = 0;
  for (const ch of entry.children) {
    if (haveCodes.has(ch.code)) { skip++; continue; }
    const parts = ch.code.split(".");
    const l4Code = parts.slice(0, 4).join(".");
    const l4 = await c.execute({ sql: "SELECT code FROM chart_of_accounts WHERE code = ?", args: [l4Code] });
    if (!l4.rows.length) { console.log(`  ⚠ L4 parent ${l4Code} not in DB, skipping ${ch.code}`); skip++; continue; }

    // Split code into short-code (first token) + description remainder
    // e.g. "NUK NADEEM USMAN KARACHI" → descShort = "NUK", description = "NADEEM USMAN KARACHI"
    const parts2 = ch.desc.split(/\s+/);
    let descShort = null, description = ch.desc;
    if (parts2.length >= 2 && parts2[0].length <= 12 && /^[A-Z0-9]+$/i.test(parts2[0])) {
      descShort = parts2[0];
      description = parts2.slice(1).join(" ");
    }

    await c.execute({
      sql: "INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status) VALUES (?, ?, ?, 5, ?, ?, 'R')",
      args: [ch.code, l4Code, parts[4], description, descShort],
    });
    ins++;
  }
  console.log(`  inserted: ${ins}, skipped (exist/orphan): ${skip}`);
  totalInserted += ins;
  totalSkipped += skip;
}

console.log(`\n=== TOTAL ===`);
console.log(`inserted: ${totalInserted}`);
console.log(`skipped:  ${totalSkipped}`);

// Final counts per head
console.log("\n=== Final L5 counts in DB per target head ===");
for (const [parentCode, entry] of Object.entries(data)) {
  const r = await c.execute({
    sql: "SELECT COUNT(*) as n FROM chart_of_accounts WHERE level = 5 AND code LIKE ?",
    args: [parentCode + ".%"],
  });
  console.log(`  ${parentCode}  ${entry.name.padEnd(38)}  ${r.rows[0].n} L5 parties`);
}
