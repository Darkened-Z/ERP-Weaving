import { createClient } from "@libsql/client";
import path from "node:path";

// YPV#1 debits 1,855,000 of yarn purchase to 7.05.01.01.0020 — a code with no
// account behind it, under ADMIN OFFICE EXPENSES. The posting key was already
// repointed to 1.01.25.01.0001 GODOWN - YARN STOCK (WVG), but repointing a key
// does not move rows that are already posted, so the money stayed invisible:
// no ledger can name the account it sits on.
//
// This moves ONLY the debit leg to the yarn stock account. The credit side is
// untouched, the amount is unchanged and the voucher stays balanced — it is a
// reclassification, not a re-rate.
//
// Idempotent, and it refuses to run if the voucher would not balance afterwards.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const FROM = "7.05.01.01.0020";
const TO = "1.01.25.01.0001";

const dest = await client.execute({ sql: "SELECT description FROM chart_of_accounts WHERE code = ?", args: [TO] });
if (dest.rows.length === 0) throw new Error(`${TO} does not exist — refusing to reclass onto a dead code.`);

const rows = await client.execute({
  sql: "SELECT vtype, vno, srno, debit, credit FROM trans_detail WHERE acc_code = ?",
  args: [FROM],
});
if (rows.rows.length === 0) {
  console.log("  = nothing left on the old code");
  console.log("done");
  process.exit(0);
}

for (const r of rows.rows) {
  console.log(`  ~ ${r.vtype}#${r.vno}.${r.srno}  Dr ${r.debit} Cr ${r.credit}   ${FROM} -> ${TO}`);
}

await client.execute({
  sql: "UPDATE trans_detail SET acc_code = ? WHERE acc_code = ?",
  args: [TO, FROM],
});

// Every voucher we touched must still balance.
const vs = [...new Set(rows.rows.map((r) => `${r.vtype}|${r.vno}`))];
for (const v of vs) {
  const [vtype, vno] = v.split("|");
  const chk = await client.execute({
    sql: "SELECT COALESCE(SUM(debit),0) dr, COALESCE(SUM(credit),0) cr FROM trans_detail WHERE vtype = ? AND vno = ?",
    args: [vtype, Number(vno)],
  });
  const { dr, cr } = chk.rows[0];
  const ok = Math.abs(Number(dr) - Number(cr)) < 0.01;
  console.log(`  ${ok ? "ok" : "!!"}  ${vtype}#${vno} Dr ${dr} Cr ${cr}${ok ? "" : "  UNBALANCED"}`);
  if (!ok) throw new Error(`${vtype}#${vno} no longer balances — investigate before trusting this run.`);
}

console.log(`done — reclassed onto ${dest.rows[0].description}`);
process.exit(0);
