#!/usr/bin/env node
/**
 * Delete garbage L1 codes that came from PDF-parse misfires (page numbers,
 * sequence numbers glued to headings). Valid L1 accounting codes are 1/3/5/7.
 * Also print every code that doesn't match a normal accounting shape so the
 * client can spot others.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

const VALID_L1 = new Set(["1", "3", "5", "7"]);

const all = await client.execute("SELECT code, description, level FROM chart_of_accounts ORDER BY code");
console.log(`Total rows: ${all.rows.length}`);

// Anything at level 1 not in VALID_L1
const garbage = all.rows.filter((r) => r.level === 1 && !VALID_L1.has(String(r.code)));
console.log(`\nGarbage L1 codes:`);
for (const g of garbage) console.log(`  ${g.code}  '${g.description}'`);

let deleted = 0;
for (const g of garbage) {
  // Delete the head itself + anything under it (defensive — shouldn't have children)
  const res = await client.execute({
    sql: `DELETE FROM chart_of_accounts WHERE code = ? OR code LIKE ?`,
    args: [g.code, `${g.code}.%`],
  });
  console.log(`  ✗ ${g.code} → ${res.rowsAffected}`);
  deleted += res.rowsAffected;
}
console.log(`\n✓ Removed ${deleted} garbage row(s)`);

// Report suspicious other codes (codes with descriptions that look weird)
const suspicious = all.rows.filter((r) => {
  const d = String(r.description ?? "");
  // Looks like a partial or garbage description
  return d.length < 3 || /^Of Accounts/i.test(d) || /^Page /.test(d);
});
if (suspicious.length) {
  console.log(`\nOther suspicious rows (not auto-deleted — inspect manually):`);
  for (const s of suspicious) console.log(`  ${s.code}  L${s.level}  '${s.description}'`);
}
