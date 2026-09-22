import { createClient } from "@libsql/client";
import path from "node:path";
import { ledgerFiles, parseLedger } from "./parse-investor-ledgers.mjs";
import { Pdf } from "./pdf-write.mjs";

/**
 * Bring the client's 21 Oracle local-investor ledgers into the system.
 *
 * NOTHING IS GUESSED. Oracle exported only the investor's own side of each
 * voucher; the other side is named in the narration, in brackets, and often
 * left empty. A row is imported only when that bracket names an account this
 * chart actually has. Everything else is left out entirely — no suspense
 * account, no invented contra — and is listed in a companion PDF explaining, in
 * plain words, why it could not be added.
 *
 * Because more than half the rows do not say where the money went, the balances
 * this produces will NOT match the Oracle closing balances. That is the honest
 * result of importing only what is known, and the report states the difference
 * for every account so it can be chased.
 *
 * Run with --apply to write. Without it, nothing is written and the report is
 * still produced, so the skipped list can be reviewed first.
 */

const APPLY = process.argv.includes("--apply");
const OUT_PDF = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "C:/Users/7eesh/Downloads/INVESTOR LEDGERS - NOT IMPORTED.pdf";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
console.log(APPLY ? "Mode: APPLY (writing)" : "Mode: dry run (nothing will be written)");

const norm = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const money = (n) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

const coa = (await client.execute("SELECT code, description, level FROM chart_of_accounts")).rows;
const byDesc = new Map(coa.map((a) => [norm(a.description), a.code]));
const descByCode = new Map(coa.map((a) => [a.code, a.description ?? ""]));

/** Resolve the bracketed hint to a chart code, or null. Never a fallback. */
function resolveContra(hint) {
  const h = norm(hint);
  if (!h) return null;
  if (byDesc.has(h)) return byDesc.get(h);
  const hits = coa.filter((a) => a.level >= 4 && norm(a.description).includes(h));
  return hits.length === 1 ? hits[0].code : null;
}

// Every entry belongs to the financial year its DATE falls in. Dropping a 2026
// entry into the current year because that is the only one open would quietly
// misstate every year-end, so an entry whose year has not been set up is left
// out and reported like any other missing piece.
const fiscalYears = (
  await client.execute("SELECT code, start_date, end_date FROM fiscal_years ORDER BY start_date")
).rows.map((f) => ({ code: String(f.code), start: String(f.start_date), end: String(f.end_date) }));
const fyFor = (date) => fiscalYears.find((f) => date >= f.start && date <= f.end)?.code ?? null;

// Voucher numbers already in use, so an import can never land on top of an
// entry someone made in this system.
const used = new Map();
for (const r of (await client.execute("SELECT vtype, vno FROM trans_detail GROUP BY vtype, vno")).rows) {
  (used.get(r.vtype) ?? used.set(r.vtype, new Set()).get(r.vtype)).add(Number(r.vno));
}

const accounts = [];
const skipped = [];
const seen = new Set();

for (const file of ledgerFiles()) {
  const L = parseLedger(file);
  if (!L.accCode) {
    skipped.push({ file, why: "This file does not carry an account code, so there is no way to know whose ledger it is." });
    continue;
  }
  if (seen.has(L.accCode)) {
    skipped.push({
      file,
      acc: L.accCode,
      name: descByCode.get(L.accCode) ?? L.name,
      why: `This is a second copy of the same account (${L.accCode}). It was already read from another file, so importing it again would double every figure.`,
      rows: L.rows.length,
    });
    continue;
  }
  seen.add(L.accCode);

  if (!L.reconciles) {
    skipped.push({
      file,
      acc: L.accCode,
      name: descByCode.get(L.accCode) ?? L.name,
      why: "The running balance printed on this ledger does not add up from its own rows, so it was not trusted.",
      rows: L.rows.length,
    });
    continue;
  }

  const acc = {
    code: L.accCode,
    name: descByCode.get(L.accCode) ?? L.name,
    oracleClosing: L.closing,
    imported: [],
    left: [],
  };

  for (const r of L.rows) {
    if (r.dr === 0 && r.cr === 0) continue; // opening marker carries no money
    const m = r.narration.match(/\(([^)]*)\)\s*$/);
    const hint = m ? m[1].trim() : "";
    if (!hint) {
      acc.left.push({ ...r, why: "The voucher does not say which account the money came from or went to." });
      continue;
    }
    const contra = resolveContra(hint);
    if (!contra) {
      acc.left.push({ ...r, why: `The voucher names "${hint}", but there is no such account in the chart of accounts.` });
      continue;
    }
    const fy = fyFor(r.date);
    if (!fy) {
      acc.left.push({
        ...r,
        why: `The financial year covering ${r.date.slice(0, 4)} has not been set up yet, so this entry has no year to go into.`,
      });
      continue;
    }
    acc.imported.push({ ...r, contra, fy, contraName: descByCode.get(contra) ?? contra });
  }
  accounts.push(acc);
}

// ── write ────────────────────────────────────────────────────────────────────
let posted = 0;
if (APPLY) {
  for (const acc of accounts) {
    for (const r of acc.imported) {
      const [type, noRaw] = r.vno.split("-");
      let vno = Number(noRaw);
      const inUse = used.get(type) ?? used.set(type, new Set()).get(type);
      while (inUse.has(vno)) vno += 100000; // keep clear of anything already here
      inUse.add(vno);

      const narration = `${r.narration}  [Oracle ${r.vno}]`;
      await client.execute({
        sql: `INSERT INTO trans_main (fy_code, vtype, vno, vdate, acc_code, trn_type, narration, balance_amount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [r.fy, type, vno, r.date, acc.code, "IMPORT", narration, Math.max(r.dr, r.cr)],
      });
      const legs = [
        { acc: acc.code, dr: r.dr, cr: r.cr, party: r.contra },
        { acc: r.contra, dr: r.cr, cr: r.dr, party: acc.code },
      ];
      let srno = 1;
      for (const leg of legs) {
        await client.execute({
          sql: `INSERT INTO trans_detail (fy_code, vtype, vno, srno, acc_code, party_code, narration, debit, credit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [r.fy, type, vno, srno++, leg.acc, leg.party, narration, leg.dr, leg.cr],
        });
      }
      posted += 1;
    }
  }
}

// ── the report ───────────────────────────────────────────────────────────────
const pdf = new Pdf({ title: "Investor ledgers - what could not be imported" });
const R = 555;

pdf.line("LOCAL INVESTOR LEDGERS", { size: 16, bold: true });
pdf.line("What could not be brought into the system, and why", { size: 10, gray: 0.35 });
pdf.gap(4);
pdf.rule();

const totalImported = accounts.reduce((s, a) => s + a.imported.length, 0);
const totalLeft = accounts.reduce((s, a) => s + a.left.length, 0);

pdf.line("IN SHORT", { size: 11, bold: true });
pdf.line(
  `${accounts.length} investor accounts were read. ${totalImported} entries were added. ${totalLeft} were left out.`,
);
pdf.line("");
pdf.line("Why anything was left out:", { bold: true });
pdf.line("The old system printed only the investor's own side of each entry. The other side - the");
pdf.line("account the money came from or went to - is written in brackets at the end of the");
pdf.line("narration, and on most entries those brackets are empty. An entry cannot be added");
pdf.line("without knowing both sides, and nothing has been guessed, so those entries were left out.");
pdf.line("");
pdf.line("What this means for the balances:", { bold: true });
pdf.line("Because entries are missing, each investor's balance in the system will be lower than the");
pdf.line("balance on the old ledger. The difference for every account is listed below. Tell us the");
pdf.line("missing account for an entry and it can be added straight away.");
pdf.gap(6);
pdf.rule();

pdf.line("BALANCE DIFFERENCE BY ACCOUNT", { size: 11, bold: true });
pdf.gap(2);
pdf.row([
  { text: "Account", x: 40, bold: true, size: 8.5 },
  { text: "Old ledger", x: 330, bold: true, size: 8.5, align: "right" },
  { text: "In system", x: 425, bold: true, size: 8.5, align: "right" },
  { text: "Difference", x: 520, bold: true, size: 8.5, align: "right" },
  { text: "Left out", x: R, bold: true, size: 8.5, align: "right" },
]);
for (const a of accounts) {
  const inSystem = a.imported.reduce((s, r) => s + r.cr - r.dr, 0);
  pdf.row([
    { text: `${a.code}  ${a.name}`.slice(0, 52), x: 40, size: 8 },
    { text: money(a.oracleClosing), x: 330, size: 8, align: "right" },
    { text: money(inSystem), x: 425, size: 8, align: "right" },
    { text: money(a.oracleClosing - inSystem), x: 520, size: 8, align: "right" },
    { text: String(a.left.length), x: R, size: 8, align: "right" },
  ]);
}

for (const a of accounts.filter((x) => x.left.length)) {
  pdf.gap(10);
  pdf.rule();
  pdf.line(`${a.name}`, { size: 11, bold: true });
  pdf.line(`${a.code}  -  ${a.left.length} entries left out`, { size: 8.5, gray: 0.35 });
  pdf.gap(2);
  pdf.row([
    { text: "Date", x: 40, bold: true, size: 8 },
    { text: "Voucher", x: 100, bold: true, size: 8 },
    { text: "What it says", x: 165, bold: true, size: 8 },
    { text: "Amount", x: R, bold: true, size: 8, align: "right" },
  ]);
  for (const r of a.left) {
    pdf.row(
      [
        { text: r.date, x: 40, size: 7.5 },
        { text: r.vno, x: 100, size: 7.5 },
        { text: r.narration.replace(/\s+/g, " ").slice(0, 58), x: 165, size: 7.5 },
        { text: `${money(r.dr || r.cr)} ${r.dr ? "Dr" : "Cr"}`, x: R, size: 7.5, align: "right" },
      ],
      { lead: 10 },
    );
  }
  const reasons = {};
  for (const r of a.left) reasons[r.why] = (reasons[r.why] ?? 0) + 1;
  pdf.gap(2);
  for (const [why, n] of Object.entries(reasons)) {
    pdf.line(`${n} of these: ${why}`, { size: 8, gray: 0.3 });
  }
}

const fileSkips = skipped.filter((s) => s.why);
if (fileSkips.length) {
  pdf.gap(10);
  pdf.rule();
  pdf.line("WHOLE FILES THAT WERE NOT USED", { size: 11, bold: true });
  for (const s of fileSkips) {
    pdf.line(`${s.file}`, { size: 8.5, bold: true });
    pdf.line(`   ${s.why}`, { size: 8, gray: 0.3 });
  }
}

const saved = pdf.save(OUT_PDF);

console.log(`\naccounts read      : ${accounts.length}`);
console.log(`entries importable : ${totalImported}`);
console.log(`entries left out   : ${totalLeft}`);
console.log(`whole files skipped: ${fileSkips.length}`);
console.log(`posted to the books: ${posted}${APPLY ? "" : "  (dry run)"}`);
console.log(`report             : ${saved.file}  (${saved.pages} pages)`);
process.exit(0);
