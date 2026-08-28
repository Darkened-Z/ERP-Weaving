#!/usr/bin/env node
/**
 * Delete the 14 SHED group-A/B/C/etc. heads the client marked with blue lines
 * across the accounts print — 7.02.01.01-10, 7.02.02.01-10, 7.02.03.01-11.
 * Skips any that still have children or voucher references (in_use).
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

const CODES = [
  "7.02.01.01", "7.02.01.02", "7.02.01.03", "7.02.01.10",
  "7.02.02.01", "7.02.02.02", "7.02.02.03", "7.02.02.10",
  "7.02.03.01", "7.02.03.02", "7.02.03.03", "7.02.03.04",
  "7.02.03.10", "7.02.03.11",
];

let deleted = 0, skipped = 0;
for (const c of CODES) {
  // Check for children
  const kids = await client.execute({
    sql: `SELECT code FROM chart_of_accounts WHERE code_head = ? OR code LIKE ? LIMIT 1`,
    args: [c, `${c}.%`],
  });
  if (kids.rows.length > 0) {
    console.log(`  ⚠ ${c} has children — skipped`);
    skipped++;
    continue;
  }
  // Check for voucher refs
  const refs = await client.execute({
    sql: `SELECT id FROM trans_detail WHERE acc_code = ? LIMIT 1`,
    args: [c],
  }).catch(() => ({ rows: [] }));
  if (refs.rows.length > 0) {
    console.log(`  ⚠ ${c} referenced by vouchers — skipped`);
    skipped++;
    continue;
  }
  const res = await client.execute({ sql: `DELETE FROM chart_of_accounts WHERE code = ?`, args: [c] });
  console.log(`  ✗ ${c} deleted (${res.rowsAffected})`);
  deleted += res.rowsAffected;
}

console.log(`\n✓ Deleted ${deleted}, skipped ${skipped}`);
const after = await client.execute("SELECT COUNT(*) as n FROM chart_of_accounts");
console.log(`Total accounts now: ${after.rows[0].n}`);
