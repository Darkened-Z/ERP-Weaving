import { createClient } from "@libsql/client";
import path from "node:path";

// Creates the posting accounts whose configured code already sits under the
// RIGHT head in this chart. Knotting/sarning/maroori are piece-rate labour and
// 7.01.06.01 is DIRECT WAGES; parts stock is an asset and 1.01.25.16 is
// STOCK - STORE. Knotting has already debited 7.01.06.01.0001 once (KB#1,
// 3,150) with no account row behind it, so that one is live.
//
// The other six posting keys are deliberately NOT created here — their
// configured codes sit under heads that contradict what the account is for
// (yarn purchase, sizing/warping and adjustment loss all point into
// 7.05.01.01 ADMIN OFFICE EXPENSES, and 7.05.10 does not exist at all), and
// the chart already carries real sizing/warping accounts under 7.02.01.
// Creating them where they currently point would misfile the P&L.
//
// Idempotent: each row is inserted only if missing, and only if its parent
// head is really there.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const ACCOUNTS = [
  { code: "7.01.06.01.0001", parent: "7.01.06.01", short: "KNOTTING", desc: "KNOTTING CHARGES EXP A/C (WVG)" },
  { code: "7.01.06.01.0002", parent: "7.01.06.01", short: "SARNING", desc: "SARNING CHARGES EXP A/C (WVG)" },
  { code: "7.01.06.01.0003", parent: "7.01.06.01", short: "MAROORI", desc: "MAROORI CHARGES EXP A/C (WVG)" },
  { code: "1.01.25.16.0001", parent: "1.01.25.16", short: "PARTSSTK", desc: "STORE PARTS STOCK (WVG)" },
];

for (const a of ACCOUNTS) {
  const parent = await client.execute({
    sql: "SELECT code, level, description FROM chart_of_accounts WHERE code = ?",
    args: [a.parent],
  });
  if (parent.rows.length === 0) {
    console.log(`  ! ${a.code}  parent ${a.parent} absent — skipped`);
    continue;
  }
  const existing = await client.execute({
    sql: "SELECT description FROM chart_of_accounts WHERE code = ?",
    args: [a.code],
  });
  if (existing.rows.length) {
    console.log(`  = ${a.code}  already present (${existing.rows[0].description})`);
    continue;
  }
  await client.execute({
    sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
          VALUES (?, ?, '0', 5, ?, ?, 'R')`,
    args: [a.code, a.parent, a.desc, a.short],
  });
  console.log(`  + ${a.code}  ${a.short.padEnd(9)} ${a.desc}   [under ${parent.rows[0].description}]`);
}

// One posting key does not need a new account at all — the right one is
// already in the chart. YARN_PURCHASE_STOCK pointed at 7.05.01.01.0020, a
// non-existent code under ADMIN OFFICE EXPENSES, while the key's own name and
// label say stock. GODOWN - YARN STOCK (WVG) is the account the rest of the
// system already treats as yarn stock.
const REMAP = [
  { key: "YARN_PURCHASE_STOCK", from: "7.05.01.01.0020", to: "1.01.25.01.0001" },
];

for (const r of REMAP) {
  const row = await client.execute({
    sql: "SELECT acc_code FROM posting_accounts WHERE key = ?",
    args: [r.key],
  });
  const current = row.rows[0]?.acc_code;
  if (current === r.to) {
    console.log(`  = ${r.key} already -> ${r.to}`);
    continue;
  }
  if (current !== r.from) {
    console.log(`  ! ${r.key} is ${current}, expected ${r.from} — left alone`);
    continue;
  }
  const dest = await client.execute({
    sql: "SELECT description FROM chart_of_accounts WHERE code = ?",
    args: [r.to],
  });
  if (dest.rows.length === 0) {
    console.log(`  ! ${r.key}: destination ${r.to} does not exist — left alone`);
    continue;
  }
  await client.execute({
    sql: "UPDATE posting_accounts SET acc_code = ?, updated_at = datetime('now') WHERE key = ?",
    args: [r.to, r.key],
  });
  console.log(`  ~ ${r.key}  ${r.from} -> ${r.to}  (${dest.rows[0].description})`);
  // Posted rows are NOT moved here — reclassifying a voucher that has already
  // hit the ledger is the mill's call, not a migration's.
  const stranded = await client.execute({
    sql: "SELECT vtype, vno, SUM(debit) d FROM trans_detail WHERE acc_code = ? GROUP BY vtype, vno",
    args: [r.from],
  });
  for (const x of stranded.rows) {
    console.log(`      note: ${x.vtype}#${x.vno} still carries ${x.d} on the old code — reclass separately`);
  }
}

console.log("done");
process.exit(0);
