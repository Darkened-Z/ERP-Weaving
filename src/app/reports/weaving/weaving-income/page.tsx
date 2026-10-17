import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExportPdfButton, WaPdfButton } from "@/components/wa-pdf-button";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, gte, like, lte, ne, or, sql } from "drizzle-orm";
import { today } from "@/lib/time";
import { loadFabricBilling, shedList } from "@/lib/fabric-billing";
import { HeadsField } from "./heads-field";

export const dynamic = "force-dynamic";

// Weaving Income — the Oracle "Accounts Closing Balance" P/L (owner 2026-10):
// income = the Fabric Production & Billing total for the ticked sheds and
// dates, plus any other income accounts picked; expenses = ledger movement on
// the expense heads picked (e.g. 7.02.01.0001 WEAVING EXPENSIVE SULZER SHED for
// Shed 1). P / L = income − expenses.

const mtr = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
const amt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const dec = (n: number, dp: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: dp }).format(n);
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter(Boolean);
const under = (code: string, head: string) => code === head || code.startsWith(head + ".");
// A head already covered by a picked ancestor would be counted twice.
const outermost = (codes: string[]) => [...new Set(codes)].filter((c, _, all) => !all.some((a) => a !== c && under(c, a)));

async function ledgerByAccount(heads: string[], from: string, to: string) {
  if (heads.length === 0) return [];
  return db
    .select({
      code: schema.transDetail.accCode,
      debit: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)`,
      credit: sql<number>`coalesce(sum(${schema.transDetail.credit}), 0)`,
    })
    .from(schema.transDetail)
    .innerJoin(
      schema.transMain,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(
      and(
        gte(schema.transMain.vdate, from),
        lte(schema.transMain.vdate, to),
        // Opening balances are not the period's income or expense.
        ne(schema.transDetail.vtype, "OPN"),
        or(...heads.flatMap((h) => [eq(schema.transDetail.accCode, h), like(schema.transDetail.accCode, `${h}.%`)])),
      ),
    )
    .groupBy(schema.transDetail.accCode)
    .orderBy(schema.transDetail.accCode);
}

export default async function WeavingIncomePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shed?: string | string[]; exp?: string | string[]; inc?: string | string[] }>;
}) {
  const p = await searchParams;
  const now = today();
  const to = p.to?.trim() || now;
  const from = p.from?.trim() || to.slice(0, 7) + "-01";
  const shedQ = list(p.shed);
  const expHeads = outermost(list(p.exp));
  const incHeads = outermost(list(p.inc));

  const [sheds, billing, coa, expRows, incRows] = await Promise.all([
    shedList(),
    loadFabricBilling({ from, to, sheds: shedQ }),
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description, level: schema.chartOfAccounts.level }).from(schema.chartOfAccounts),
    ledgerByAccount(expHeads, from, to),
    ledgerByAccount(incHeads, from, to),
  ]);
  const desc = new Map(coa.map((a) => [a.code, a.description]));
  const expOpts = coa.filter((a) => a.code.startsWith("7"));
  const incOpts = coa.filter((a) => a.code.startsWith("5"));

  const nz = (r: { debit: number; credit: number }) => Math.abs(Number(r.debit)) > 0.004 || Math.abs(Number(r.credit)) > 0.004;
  const expGroups = expHeads.map((h) => {
    const accounts = expRows.filter((r) => under(r.code, h) && nz(r)).map((r) => ({ code: r.code, debit: Number(r.debit), credit: Number(r.credit) }));
    return { head: h, accounts, debit: accounts.reduce((s, a) => s + a.debit, 0), credit: accounts.reduce((s, a) => s + a.credit, 0) };
  });
  const expDebit = expGroups.reduce((s, g) => s + g.debit, 0);
  const expCredit = expGroups.reduce((s, g) => s + g.credit, 0);
  const expenses = expDebit - expCredit;

  const otherIncome = incRows.filter(nz).map((r) => ({ code: r.code, amount: Number(r.credit) - Number(r.debit) }));
  const otherTotal = otherIncome.reduce((s, r) => s + r.amount, 0);
  const income = billing.totals.amount + otherTotal;
  const pl = income - expenses;

  const shedNote = shedQ.length ? `Shed ${shedQ.join(", ")}` : "All sheds";
  const fname = `Weaving-Income-${shedQ.length ? `Shed-${shedQ.join("-")}-` : ""}${from}-to-${to}`;
  const th = "text-[11px]";

  return (
    <Shell active="w-weaving-income">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Income (P / L)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {from} to {to} &middot; {shedNote}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <PrintButton />
            <ExportPdfButton contentId="weaving-income" filename={`${fname}.pdf`} />
            <WaPdfButton contentId="weaving-income" filename={`${fname}.jpg`} as="jpg" />
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">From</label>
            <DateBox name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <DateBox name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="sm:col-span-2">
            <div className="label mb-1">Sheds <span className="normal-case tracking-normal text-[var(--muted)]">(none ticked = all)</span></div>
            <div className="flex gap-5 flex-wrap pt-1">
              {sheds.map((sh) => (
                <label key={sh} className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
                  <input type="checkbox" name="shed" value={sh} defaultChecked={shedQ.length === 0 || shedQ.includes(sh)} className="w-5 h-5 accent-black" />
                  Shed {sh}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-4">
            <div className="label mb-1">Expense heads</div>
            <HeadsField name="exp" values={expHeads} options={expOpts} label="Select Expense Head" />
          </div>
          <div className="sm:col-span-4">
            <div className="label mb-1">
              Other income accounts{" "}
              <span className="normal-case tracking-normal text-[var(--muted)]">(conversion income is the production billing — do not add it here)</span>
            </div>
            <HeadsField name="inc" values={incHeads} options={incOpts} label="Select Income Account" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-4">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/weaving/weaving-income" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div id="weaving-income" className="bg-white p-4" style={{ maxWidth: 980 }}>
          <div className="flex justify-between items-baseline border-b-2 border-black pb-2 mb-4">
            <div className="text-[18px] font-extrabold tracking-tight">WEAVING INCOME — P / L</div>
            <div className="mono text-[12px] text-right">
              {from} to {to}
              <br />
              {shedNote}
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-1">Production (income)</div>
          <div className="overflow-x-auto mb-5">
            <table>
              <thead>
                <tr>
                  <th className={th}>Quality</th>
                  <th className={th}>Contract</th>
                  <th className={`${th} text-right`}>Mtrs</th>
                  <th className={`${th} text-right`}>Rate / Mtr</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {billing.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-[var(--muted)] py-4">No production in this period</td>
                  </tr>
                ) : (
                  billing.rows.map((r) => (
                    <tr key={r.contNo}>
                      <td>
                        <div className="font-semibold">{r.quality}</div>
                        {r.construction && <div className="text-[11px] text-[var(--muted)]">{r.construction}</div>}
                      </td>
                      <td className="mono">{r.contNo}</td>
                      <td className="mono text-right">{mtr(r.production)}</td>
                      <td className="mono text-right">{dec(r.rate, 2)}</td>
                      <td className="mono text-right">{amt(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>TOTAL PRODUCTION</td>
                  <td className="mono text-right">{mtr(billing.totals.production)}</td>
                  <td className="mono text-right">{dec(billing.totals.rate, 2)}</td>
                  <td className="mono text-right">{amt(billing.totals.amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-1">Other income</div>
          <div className="overflow-x-auto mb-5">
            <table>
              <tbody>
                {otherIncome.length === 0 ? (
                  <tr>
                    <td className="text-[var(--muted)]">{incHeads.length ? "No entries in this period" : "None picked"}</td>
                    <td className="mono text-right">0</td>
                  </tr>
                ) : (
                  otherIncome.map((r) => (
                    <tr key={r.code}>
                      <td>
                        <span className="mono mr-2">{r.code}</span>
                        {desc.get(r.code)}
                      </td>
                      <td className="mono text-right">{amt(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>TOTAL OTHER INCOME</td>
                  <td className="mono text-right">{amt(otherTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-1">Expenses</div>
          <div className="overflow-x-auto mb-5">
            <table>
              <thead>
                <tr>
                  <th className={th}>Code</th>
                  <th className={th}>Description</th>
                  <th className={`${th} text-right`}>Debit</th>
                  <th className={`${th} text-right`}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {expGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-[var(--muted)] py-3">No expense head picked — add one above (e.g. 7.02.01.0001 for the Sulzer shed).</td>
                  </tr>
                ) : (
                  expGroups.flatMap((g) => [
                    <tr key={`head-${g.head}`} style={{ background: "#f1f2f4", fontWeight: 700 }}>
                      <td className="mono">{g.head}</td>
                      <td>{desc.get(g.head) ?? ""}</td>
                      <td className="mono text-right">{amt(g.debit)}</td>
                      <td className="mono text-right">{amt(g.credit)}</td>
                    </tr>,
                    ...(g.accounts.length === 0
                      ? [
                          <tr key={`${g.head}-none`}>
                            <td></td>
                            <td colSpan={3} className="text-[var(--muted)]">No entries in this period</td>
                          </tr>,
                        ]
                      : g.accounts.map((a) => (
                          <tr key={`${g.head}|${a.code}`}>
                            <td className="mono pl-4">{a.code}</td>
                            <td>{a.code === g.head ? <span className="text-[var(--muted)]">Posted to the head itself</span> : (desc.get(a.code) ?? "")}</td>
                            <td className="mono text-right">{amt(a.debit)}</td>
                            <td className="mono text-right">{amt(a.credit)}</td>
                          </tr>
                        ))),
                  ])
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>TOTAL EXPENSES</td>
                  <td className="mono text-right">{amt(expDebit)}</td>
                  <td className="mono text-right">{amt(expCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="border-2 border-black">
            {([
              ["Production income", billing.totals.amount],
              ["Other income", otherTotal],
              ["Less: expenses", -expenses],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between px-4 py-1.5 border-b border-[var(--border-light)] text-[13px]">
                <span>{k}</span>
                <span className="mono">{amt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between items-baseline px-4 py-3 bg-black text-white">
              <span className="text-[15px] font-bold tracking-wide">P / L</span>
              <span className="mono text-[24px] font-extrabold">{amt(pl)}</span>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
