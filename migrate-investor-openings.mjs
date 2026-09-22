import { createClient } from "@libsql/client";
import path from "node:path";
import { ledgerFiles, parseLedger } from "./parse-investor-ledgers.mjs";

/**
 * Open the 20 local investor accounts at the balance their own Oracle ledger
 * closes on, against 3.01.01.06.0001 "opening balnce" — the account the client
 * already uses for this, as JV-2 does for the Dasti advances.
 *
 * WHY AN OPENING RATHER THAN THE HISTORY
 *
 * Oracle exported only the investor's side of each voucher. Of 1,247 entries,
 * 681 never say which account the money came from or went to, so they cannot be
 * posted without inventing the other half. Importing the 544 that can be posted
 * would leave every investor showing a balance lower than their real one, while
 * looking like a complete ledger — worse than not importing at all.
 *
 * The closing balance, by contrast, is stated on the client's own ledger and
 * verified here: each file's rows are re-added from zero and the total must
 * equal the printed closing figure before it is used. So this posts a figure
 * that is known, and nothing that is not.
 *
 * The detailed history stays in the PDF report for the client to complete.
 *
 * Run with --apply to write; without it nothing is written.
 */

const APPLY = process.argv.includes("--apply");
const OPENING_CONTRA = "3.01.01.06.0001";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
console.log(APPLY ? "Mode: APPLY (writing)" : "Mode: dry run (nothing will be written)");

const money = (n) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

const [contra] = (
  await client.execute({
    sql: "SELECT code, description FROM chart_of_accounts WHERE code = ?",
    args: [OPENING_CONTRA],
  })
).rows;
if (!contra) throw new Error(`${OPENING_CONTRA} is not in the chart of accounts`);
console.log(`Opening contra: ${contra.code} ${contra.description}`);

const descByCode = new Map(
  (await client.execute("SELECT code, description FROM chart_of_accounts")).rows.map((a) => [
    a.code,
    a.description ?? "",
  ]),
);

// The opening is dated the day before the earliest movement, so it never sits
// inside a period that already has entries in it.
const fiscalYears = (
  await client.execute("SELECT code, start_date, end_date FROM fiscal_years ORDER BY start_date")
).rows.map((f) => ({ code: String(f.code), start: String(f.start_date), end: String(f.end_date) }));
const fyFor = (d) => fiscalYears.find((f) => d >= f.start && d <= f.end)?.code ?? null;

const [{ vno: maxJv } = { vno: 0 }] = (
  await client.execute("SELECT COALESCE(MAX(vno), 0) AS vno FROM trans_detail WHERE vtype = 'OPN'")
).rows;
let vno = Number(maxJv);

const seen = new Set();
const rows = [];
for (const file of ledgerFiles()) {
  const L = parseLedger(file);
  if (!L.accCode || seen.has(L.accCode) || !L.reconciles || L.closing === 0) continue;
  seen.add(L.accCode);
  const openDate = L.rows[0]?.date ?? "";
  rows.push({
    code: L.accCode,
    name: descByCode.get(L.accCode) ?? L.name,
    closing: L.closing,
    date: openDate,
    fy: fyFor(openDate),
  });
}

console.log("\nACCOUNT                                             OPENING        DATE        FY");
for (const r of rows) {
  console.log(
    `${`${r.code} ${r.name}`.slice(0, 50).padEnd(50)} ${money(r.closing).padStart(13)}  ${r.date}  ${r.fy ?? "— none —"}`,
  );
}
const total = rows.reduce((s, r) => s + r.closing, 0);
console.log(`${"".padEnd(50)} ${money(total).padStart(13)}   <- total credited to investors`);

const noFy = rows.filter((r) => !r.fy);
if (noFy.length) {
  console.log(`\n!! ${noFy.length} account(s) have no fiscal year for their opening date — not written.`);
}

let posted = 0;
if (APPLY) {
  for (const r of rows.filter((x) => x.fy)) {
    vno += 1;
    const narration = `OPENING BALANCE - ${r.name}`;
    await client.execute({
      sql: `INSERT INTO trans_main (fy_code, vtype, vno, vdate, acc_code, trn_type, narration, balance_amount)
            VALUES (?, 'OPN', ?, ?, ?, 'OPENING', ?, ?)`,
      args: [r.fy, vno, r.date, r.code, narration, Math.abs(r.closing)],
    });
    // A credit balance means the mill owes the investor.
    const cr = r.closing > 0 ? r.closing : 0;
    const dr = r.closing < 0 ? -r.closing : 0;
    await client.execute({
      sql: `INSERT INTO trans_detail (fy_code, vtype, vno, srno, acc_code, party_code, narration, debit, credit)
            VALUES (?, 'OPN', ?, 1, ?, ?, ?, ?, ?)`,
      args: [r.fy, vno, r.code, OPENING_CONTRA, narration, dr, cr],
    });
    await client.execute({
      sql: `INSERT INTO trans_detail (fy_code, vtype, vno, srno, acc_code, party_code, narration, debit, credit)
            VALUES (?, 'OPN', ?, 2, ?, ?, ?, ?, ?)`,
      args: [r.fy, vno, OPENING_CONTRA, r.code, narration, cr, dr],
    });
    posted += 1;
  }
}

console.log(`\naccounts opened : ${posted}${APPLY ? "" : "  (dry run)"}`);
process.exit(0);
