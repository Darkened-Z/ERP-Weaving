#!/usr/bin/env node
/**
 * Client feedback: 1.03 BANK ACCOUNTS, 1.04 YARN STOCK, 1.05 GREY STOCK were
 * imported as duplicates of the equivalent heads that live under 1.01.15 BANK
 * BALANCE and 1.01.25.* STOCK. Delete these 3 subtrees.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

const DROP = ["1.03", "1.04", "1.05"];
let total = 0;

for (const root of DROP) {
  // Delete the head itself + everything under it
  const before = await client.execute({
    sql: `SELECT code, description FROM chart_of_accounts WHERE code = ? OR code LIKE ? ORDER BY code`,
    args: [root, `${root}.%`],
  });
  console.log(`\n${root}:`);
  for (const r of before.rows) console.log(`  ${r.code}  ${r.description}`);

  const res = await client.execute({
    sql: `DELETE FROM chart_of_accounts WHERE code = ? OR code LIKE ?`,
    args: [root, `${root}.%`],
  });
  console.log(`  → deleted ${res.rowsAffected} rows`);
  total += res.rowsAffected;
}

console.log(`\n✓ Total removed: ${total}`);
