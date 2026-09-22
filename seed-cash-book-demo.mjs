import { createClient } from "@libsql/client";
import path from "node:path";

/**
 * DEMO DATA for the Cash Book. Not real trading.
 *
 * Four days of cash and bank movement across 5-8 July 2026, shaped like the
 * client's own ACC_CASH_BOOK print so the two can be read side by side: an
 * opening on cash in hand, receipts from the Dasti accounts, payments out, and
 * a bank account moving on its own days.
 *
 * Every row is tagged trn_type = 'DEMO' and carries [DEMO] in its narration, so
 * `node seed-cash-book-demo.mjs --remove` takes all of it back out and nothing
 * else. Amounts are balanced; the ledger stays square while it is in place.
 */

const REMOVE = process.argv.includes("--remove");

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const CASH = "1.01.11.01.0001"; // CASH IN HAND
const BANK = "1.01.15.02.0005"; // MEEZAN BANK ABDUL KARIM-2086
const OPENING = "3.01.01.06.0001"; // opening balnce

if (REMOVE) {
  const d = await client.execute("DELETE FROM trans_detail WHERE narration LIKE '%[DEMO]%'");
  const m = await client.execute("DELETE FROM trans_main WHERE narration LIKE '%[DEMO]%'");
  console.log(`  removed ${d.rowsAffected} detail row(s), ${m.rowsAffected} voucher(s)`);
  process.exit(0);
}

const [company] = (await client.execute("SELECT current_fy FROM company_profile LIMIT 1")).rows;
// The voucher forms stamp the company's current year regardless of date, so the
// demo matches what a real entry here would look like rather than inventing a
// year of its own. (The years after 2023 still need setting up — see the note.)
const fy = String(company?.current_fy ?? "2022");

/** [date, vtype, contra account, narration, amount, direction on the cash/bank account] */
const MOVES = [
  // 05-07: the client's own page — two receipts from the Rizwan Dasti accounts.
  ["2026-06-30", "OPN", OPENING, "Opening cash in hand", 12751577, "IN", CASH],
  ["2026-07-05", "CR", "3.03.15.02.0005", "Katoti", 10000, "IN", CASH],
  ["2026-07-05", "CR", "3.03.15.02.0009", "Katoti", 100000, "IN", CASH],
  // 06-07: a day that pays out.
  ["2026-07-06", "CP", "3.03.15.02.0007", "Cash Paid For", 50600, "OUT", CASH],
  ["2026-07-06", "CP", "3.03.15.02.0002", "Saman Misc", 6000, "OUT", CASH],
  ["2026-07-06", "CR", "3.03.15.02.0006", "Cash Rcvd.", 25000, "IN", CASH],
  // 07-07: both sides, and the bank moves for the first time.
  ["2026-07-07", "CP", "3.03.15.02.0004", "Airjet Rent", 14209, "OUT", CASH],
  ["2026-07-07", "CR", "3.03.15.02.0001", "Khizar Se Wapsi", 8500, "IN", CASH],
  ["2026-07-07", "BR", "1.01.01.01.0001", "Cheque received", 579200, "IN", BANK],
  // 08-07: cash quiet, bank pays out.
  ["2026-07-08", "BP", "3.03.15.02.0003", "Salary transfer", 191000, "OUT", BANK],
  ["2026-07-08", "CP", "3.03.15.02.0008", "Wasa Kharcha", 9000, "OUT", CASH],
];

const [{ n: maxVno } = { n: 0 }] = (
  await client.execute("SELECT COALESCE(MAX(vno), 0) AS n FROM trans_main")
).rows;
let vno = Number(maxVno) + 500;

let posted = 0;
for (const [vdate, vtype, contra, narr, amount, dir, book] of MOVES) {
  vno += 1;
  const narration = `${narr} [DEMO]`;
  await client.execute({
    sql: `INSERT INTO trans_main (fy_code, vtype, vno, vdate, acc_code, trn_type, narration, balance_amount)
          VALUES (?, ?, ?, ?, ?, 'DEMO', ?, ?)`,
    args: [fy, vtype, vno, vdate, book, narration, amount],
  });
  // Money IN debits the cash/bank account and credits where it came from.
  const legs =
    dir === "IN"
      ? [
          { acc: book, dr: amount, cr: 0, party: contra },
          { acc: contra, dr: 0, cr: amount, party: book },
        ]
      : [
          { acc: contra, dr: amount, cr: 0, party: book },
          { acc: book, dr: 0, cr: amount, party: contra },
        ];
  let srno = 1;
  for (const leg of legs) {
    await client.execute({
      sql: `INSERT INTO trans_detail (fy_code, vtype, vno, srno, acc_code, party_code, narration, debit, credit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [fy, vtype, vno, srno++, leg.acc, leg.party, narration, leg.dr, leg.cr],
    });
  }
  posted += 1;
}

const check = await client.execute(
  `SELECT vtype, vno, SUM(debit) d, SUM(credit) c FROM trans_detail
   WHERE narration LIKE '%[DEMO]%' GROUP BY vtype, vno HAVING ABS(SUM(debit) - SUM(credit)) > 0.01`,
);
console.log(`  ${posted} demo voucher(s) posted`);
console.log(`  unbalanced: ${check.rows.length ? JSON.stringify(check.rows) : "none"}`);
console.log("  remove with:  node seed-cash-book-demo.mjs --remove");
process.exit(0);
