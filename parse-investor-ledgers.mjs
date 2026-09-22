import fs from "node:fs";
import { pdfText } from "./pdf-read.mjs";

/**
 * Read the client's Oracle "ACCOUNTS LEDGER (WVG)" exports for the local
 * investor accounts, and prove each one adds up before anything is imported.
 *
 * Oracle's PDF driver writes a report COLUMN by column, not row by row. Per
 * page the order is: dates, voucher numbers, the DR column, the CR column, the
 * DR total, the CR total, the narrations, then the running balances. Rows are
 * rebuilt by zipping those blocks back together.
 *
 * Every file is then checked the only way that matters: walk the rows adding
 * credits and subtracting debits, and see whether the balance we compute equals
 * the balance Oracle printed on that row, and whether the last one equals the
 * stated CLOSING BALANCE. A file that does not reconcile is not imported.
 *
 * This script only reads and reports. It writes nothing.
 */

export const DIR = "C:/Users/7eesh/Downloads/";

const DATE = /^\d{2}-\d{2}-\d{2}$/;
const VNO = /^[A-Z]+-\d+$/;
const SIGNED_BAL = /^\s*-?[\d,]+(\.\d+)?\s*(Cr|Dr)\s*$/;
const ACC_CODE = /^\d\.\d\d\.\d\d\.\d\d\.\d{4}$/;
const AMOUNT_CELL = /^\s*-?[\d,]*(\.\d+)?\s*$/;

const money = (s) => {
  const t = String(s ?? "").replace(/[, ]/g, "");
  if (t === "" || t === "-") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

/** "31-10-20" -> "2020-10-31". Oracle prints a 2-digit year; the mill's data starts in 2020. */
const isoDate = (d) => {
  const [dd, mm, yy] = d.split("-");
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
};

/** Credit balance prints as "3000000 Cr" — positive means the mill owes it. */
const balValue = (s) => {
  const t = String(s ?? "").trim();
  const n = money(t.replace(/\s*(Cr|Dr)\s*$/, ""));
  return /Cr\s*$/.test(t) ? n : -n;
};

function parsePage(lines) {
  const dates = [];
  const vnos = [];
  let i = 0;
  while (i < lines.length && !DATE.test(lines[i].trim())) i += 1;
  while (i < lines.length && DATE.test(lines[i].trim())) dates.push(lines[i++].trim());
  while (i < lines.length && VNO.test(lines[i].trim())) vnos.push(lines[i++].trim());
  const n = Math.min(dates.length, vnos.length);
  if (n === 0) return null;

  // Skip the column labels and the closing-balance caption that sit between the
  // voucher numbers and the money.
  while (i < lines.length && !AMOUNT_CELL.test(lines[i])) i += 1;

  const cells = [];
  while (i < lines.length && cells.length < 2 * n + 2) {
    const t = lines[i];
    if (AMOUNT_CELL.test(t)) cells.push(t);
    else if (t.trim() !== "") break;
    i += 1;
  }
  const dr = cells.slice(0, n).map(money);
  const cr = cells.slice(n, 2 * n).map(money);

  // Narrations are the only free text left; balances all carry Cr or Dr.
  const rest = lines.slice(i);
  const narrations = rest
    .filter((l) => l.trim() !== "" && !SIGNED_BAL.test(l) && !DATE.test(l.trim()) && !/^(Total Balance|FROM|TO|OK|Page|>|,+|Img|Acc\. Code|SR\.#|\d+)$/.test(l.trim()))
    .slice(0, n);
  const balances = rest.filter((l) => SIGNED_BAL.test(l) || l.trim() === "0").slice(0, n);

  return Array.from({ length: n }, (_, k) => ({
    date: isoDate(dates[k]),
    vno: vnos[k],
    narration: (narrations[k] ?? "").trim(),
    dr: dr[k] ?? 0,
    cr: cr[k] ?? 0,
    printedBalance: balValue(balances[k] ?? "0"),
  }));
}

export function parseLedger(file) {
  const text = pdfText(DIR + file);
  const lines = text.split("\n");
  const accCode = lines.map((l) => l.trim()).find((l) => ACC_CODE.test(l)) ?? "";
  const name = (lines.find((l) => /\.FSD\s*$/.test(l)) ?? file).replace(/\.FSD\s*$/, "").trim();
  const closingLine = lines.find((l, k) => (lines[k - 1] ?? "").includes("CLOSING BALANCE"));
  const closing = balValue(closingLine ?? "0");

  const pages = text.split("ACCOUNTS LEDGER (WVG)").slice(1);
  const rows = pages.flatMap((p) => parsePage(p.split("\n")) ?? []);

  let running = 0;
  let mismatches = 0;
  for (const r of rows) {
    running += r.cr - r.dr;
    r.computedBalance = running;
    if (Math.abs(running - r.printedBalance) > 1) mismatches += 1;
  }

  return {
    file,
    name,
    accCode,
    rows,
    closing,
    computedClosing: running,
    mismatches,
    reconciles: mismatches === 0 && Math.abs(running - closing) <= 1,
  };
}

export function ledgerFiles() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /\.pdf$/i.test(f))
    .filter((f) => {
      try {
        return pdfText(DIR + f).includes("ACCOUNTS LEDGER");
      } catch {
        return false;
      }
    })
    // ACC_LEDGER1112 is the ARIF LODHI ledger again under a generic name.
    .filter((f) => !/^ACC_LEDGER/i.test(f));
}

if (/parse-investor-ledgers\.mjs$/.test(process.argv[1] ?? "")) {
  const all = ledgerFiles().map(parseLedger);
  console.log("OK   ROWS  ACC CODE           CLOSING        COMPUTED       ACCOUNT");
  for (const r of all.sort((a, b) => b.rows.length - a.rows.length)) {
    console.log(
      `${r.reconciles ? " ok " : "FAIL"} ${String(r.rows.length).padStart(4)}  ${(r.accCode || "—").padEnd(18)} ` +
        `${String(r.closing).padStart(12)}  ${String(r.computedClosing).padStart(12)}  ${r.name}` +
        (r.mismatches ? `   (${r.mismatches} row mismatches)` : ""),
    );
  }
  const good = all.filter((r) => r.reconciles);
  console.log(
    `\nfiles: ${all.length}  reconciling: ${good.length}  rows: ${all.reduce((s, r) => s + r.rows.length, 0)}`,
  );
}
