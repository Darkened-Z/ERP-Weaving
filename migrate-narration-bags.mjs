import { createClient } from "@libsql/client";
import path from "node:path";

// Ledger narrations were written as "(0) bags (1000) lbs @ 300".
//
// Bags come from a column that is blank on every live row, so the figure was
// always zero. The voucher code now derives bags at 100 lbs to a bag, but a
// narration is TEXT stored at save time — rows already in the ledger keep the
// zero until their voucher is re-saved, which is not something anyone should
// have to do. This rewrites the bags figure in place from the lbs beside it.
//
// Only the bags number inside the pattern is touched; nothing else in the
// narration, and no amount, moves. Idempotent: a narration that already agrees
// is left alone.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const RE = /\((\d+(?:\.\d+)?)\) bags \((\d+(?:\.\d+)?)\) lbs/g;
const fix = (s) =>
  s.replace(RE, (m, _bags, lbs) => {
    const b = Math.round((Number(lbs) / 100) * 100) / 100;
    return `(${b}) bags (${lbs}) lbs`;
  });

for (const table of ["trans_detail", "trans_main"]) {
  const rows = await client.execute({
    sql: `SELECT rowid AS rid, narration FROM ${table}
          WHERE narration LIKE '%) bags (%) lbs%'`,
    args: [],
  });
  let changed = 0;
  for (const r of rows.rows) {
    const before = String(r.narration ?? "");
    const after = fix(before);
    if (after === before) continue;
    await client.execute({
      sql: `UPDATE ${table} SET narration = ? WHERE rowid = ?`,
      args: [after, r.rid],
    });
    changed += 1;
    if (changed <= 5) console.log(`  ${table}: ${before}\n            -> ${after}`);
  }
  console.log(`  ${table}: ${changed} of ${rows.rows.length} narration(s) corrected`);
}
console.log("done");
process.exit(0);
