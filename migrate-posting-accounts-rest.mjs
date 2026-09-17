import { createClient } from "@libsql/client";
import path from "node:path";

// The last five posting keys that named a chart code with nothing behind it.
// Earlier these were left alone because their configured codes sit under heads
// that contradict the account (production and stock costs pointing into ADMIN
// OFFICE EXPENSES, and two with no parent head at all). Rather than create them
// in the wrong place, each is REPOINTED at the home the chart already provides,
// and only genuinely new leaves are created.
//
//   WARPING_SIZING_EXP  -> 7.02.01.0001.0006  SIZING WARPING CHARGES (SULZER)   exists
//   PARTS_CONSUMPTION   -> 7.01.06.04.0001    PARTS CONSUMPTION (WVG)           new, under PARTS EXPENSE A/C (WVG)
//   PARTS_STOCK_EXP     -> 7.01.06.04.0002    PARTS STOCK CONSUMED (WVG)        new, same head
//   ADJUSTMENT_LOSS     -> 7.01.06.05.0001    SHRINKAGE / ADJUSTMENT LOSS (WVG) new, under CLAIMS
//
// ADVANCE_CLEARING is deliberately untouched: no page reads that key, and the
// only plausible-looking code in the chart is one named cheque account, not a
// clearing account. Pointing a key at the wrong real account is worse than
// leaving an unused key dangling.
//
// Sulzer vs Airjet for sizing/warping is a real per-shed choice; SULZER is used
// because that is the shed the existing conversion work runs on. Change it in
// /settings/posting-accounts if the mill wants Airjet.
//
// Idempotent, and nothing is repointed if the old code already carries GL rows.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const NEW_ACCOUNTS = [
  { code: "7.01.06.04.0001", parent: "7.01.06.04", short: "PARTSCON", desc: "PARTS CONSUMPTION (WVG)" },
  { code: "7.01.06.04.0002", parent: "7.01.06.04", short: "PARTSSTK", desc: "PARTS STOCK CONSUMED (WVG)" },
  { code: "7.01.06.05.0001", parent: "7.01.06.05", short: "ADJLOSS", desc: "SHRINKAGE / ADJUSTMENT LOSS (WVG)" },
];

for (const a of NEW_ACCOUNTS) {
  const parent = await client.execute({
    sql: "SELECT description FROM chart_of_accounts WHERE code = ?",
    args: [a.parent],
  });
  if (parent.rows.length === 0) {
    console.log(`  ! ${a.code}: parent ${a.parent} absent — skipped`);
    continue;
  }
  const existing = await client.execute({
    sql: "SELECT description FROM chart_of_accounts WHERE code = ?",
    args: [a.code],
  });
  if (existing.rows.length) {
    console.log(`  = ${a.code} already present (${existing.rows[0].description})`);
    continue;
  }
  await client.execute({
    sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
          VALUES (?, ?, '0', 5, ?, ?, 'R')`,
    args: [a.code, a.parent, a.desc, a.short],
  });
  console.log(`  + ${a.code}  ${a.short.padEnd(9)} ${a.desc}   [under ${parent.rows[0].description}]`);
}

const REMAP = [
  { key: "WARPING_SIZING_EXP", to: "7.02.01.0001.0006" },
  { key: "PARTS_CONSUMPTION", to: "7.01.06.04.0001" },
  { key: "PARTS_STOCK_EXP", to: "7.01.06.04.0002" },
  { key: "ADJUSTMENT_LOSS", to: "7.01.06.05.0001" },
];

for (const r of REMAP) {
  const row = await client.execute({
    sql: "SELECT acc_code FROM posting_accounts WHERE key = ?",
    args: [r.key],
  });
  const current = row.rows[0]?.acc_code;
  if (current === undefined) {
    console.log(`  ! ${r.key} not configured — skipped`);
    continue;
  }
  if (current === r.to) {
    console.log(`  = ${r.key} already -> ${r.to}`);
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
  const used = await client.execute({
    sql: "SELECT COUNT(*) n FROM trans_detail WHERE acc_code = ?",
    args: [current],
  });
  if (Number(used.rows[0].n) > 0) {
    console.log(`  ! ${r.key}: ${current} already carries ${used.rows[0].n} GL row(s) — left alone`);
    continue;
  }
  await client.execute({
    sql: "UPDATE posting_accounts SET acc_code = ?, updated_at = datetime('now') WHERE key = ?",
    args: [r.to, r.key],
  });
  console.log(`  ~ ${r.key}  ${current} -> ${r.to}  (${dest.rows[0].description})`);
}

console.log("done");
process.exit(0);
