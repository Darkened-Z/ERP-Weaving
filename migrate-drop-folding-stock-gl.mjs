import { createClient } from "@libsql/client";
import path from "node:path";

// Removes the folding-stock GL pair (DP from daily production, DPR from grey
// despatch) that ran through the conversion party's receivable.
//
// Under a conversion contract the cloth belongs to the party, not the mill.
// Capitalising it and crediting the party swung their receivable by the full
// cloth value for reasons unrelated to what they owe, and put a second
// identical debit beside the conversion bill — which is what the client
// reported as a double. Nothing reads these rows: the Daily Folding Stock
// report reads the production and despatch tables directly, so the stock
// figures are unaffected.
//
// Prints the party-balance movement so the change is visible, and checks every
// remaining voucher still balances. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const before = await client.execute(
  `SELECT acc_code, SUM(debit) dr, SUM(credit) cr FROM trans_detail WHERE vtype IN ('DP','DPR') GROUP BY acc_code`,
);
if (before.rows.length === 0) {
  console.log("  = no DP/DPR rows left");
  console.log("done");
  process.exit(0);
}
console.log("removing:");
for (const r of before.rows) console.log(`  ${r.acc_code}  Dr ${r.dr}  Cr ${r.cr}`);

const d = await client.execute(`DELETE FROM trans_detail WHERE vtype IN ('DP','DPR')`);
const m = await client.execute(`DELETE FROM trans_main WHERE vtype IN ('DP','DPR')`);
console.log(`  ${d.rowsAffected} detail row(s), ${m.rowsAffected} header(s) removed`);

for (const r of before.rows) {
  const now = await client.execute({
    sql: "SELECT COALESCE(SUM(debit),0) dr, COALESCE(SUM(credit),0) cr FROM trans_detail WHERE acc_code = ?",
    args: [r.acc_code],
  });
  const bal = Number(now.rows[0].dr) - Number(now.rows[0].cr);
  console.log(`  ${r.acc_code} now ${Math.abs(bal).toFixed(2)} ${bal >= 0 ? "Dr" : "Cr"}`);
}

const unbal = await client.execute(
  `SELECT vtype, vno, SUM(debit) dr, SUM(credit) cr FROM trans_detail
   GROUP BY vtype, vno HAVING ABS(SUM(debit)-SUM(credit)) > 0.01`,
);
if (unbal.rows.length) {
  for (const u of unbal.rows) console.log(`  !! ${u.vtype}#${u.vno} Dr ${u.dr} Cr ${u.cr}`);
  throw new Error("a voucher no longer balances — investigate before trusting this run.");
}
console.log("  all remaining vouchers balance");
console.log("done");
process.exit(0);
