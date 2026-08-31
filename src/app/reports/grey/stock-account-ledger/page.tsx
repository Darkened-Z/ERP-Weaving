import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { fmt, escLike, sixMonthsAgo, todayIso, partyByNameOptions } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GREY STOCK — ACCOUNT LEDGER (value / Dr-Cr).
 * The grey-stock trading account seen as debit/credit: each godown-stock line books a
 * PURCHASE (Dr = net meter × cost rate) and a SALE (Cr = net meter × sale rate). The
 * running column tracks cumulative profit (Sale − Purchase); the footer shows total
 * purchase, total sale and the net profit / loss.
 */
export default async function GreyStockAccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  const partyOpts = await partyByNameOptions();
  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const partyCodeByName = new Map(accounts.map((a) => [a.description ?? "", a.code]));

  const conds = [
    gte(schema.extGodownStock.vDate, from),
    lte(schema.extGodownStock.vDate, to),
  ];
  if (party) conds.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${`%${escLike(party)}%`} ESCAPE '\\'`);

  const stock = await db
    .select({
      vNo: schema.extGodownStock.vNo,
      vDate: schema.extGodownStock.vDate,
      party: schema.extGodownStock.purchaseParty,
      quality: schema.extGodownStock.contactQuality,
      dspQuality: schema.extGodownStock.dspQuality,
      than: schema.extGodownStock.than,
      netMeter: schema.extGodownStock.netMeter,
      meter: schema.extGodownStock.meter,
      rate: schema.extGodownStock.rate,
      rateSal: schema.extGodownStock.rateSal,
    })
    .from(schema.extGodownStock)
    .where(and(...conds))
    .orderBy(schema.extGodownStock.vDate, schema.extGodownStock.id);

  let runProfit = 0;
  const rows = stock.map((s) => {
    const mtr = s.netMeter ?? s.meter ?? 0;
    const purchase = Math.round(mtr * (s.rate ?? 0));
    const sale = Math.round(mtr * (s.rateSal ?? 0));
    const profit = sale - purchase;
    runProfit += profit;
    return {
      vNo: s.vNo ?? "",
      vDate: s.vDate ?? "",
      party: s.party ?? "—",
      quality: s.quality || s.dspQuality || "",
      than: s.than ?? 0,
      mtr,
      purchase,
      sale,
      profit,
      running: runProfit,
    };
  });

  const totalPurchase = rows.reduce((a, r) => a + r.purchase, 0);
  const totalSale = rows.reduce((a, r) => a + r.sale, 0);
  const netProfit = totalSale - totalPurchase;

  return (
    <Shell active="rpt-grey-stock-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY STOCK — ACCOUNT LEDGER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} entries &middot; {from} to {to} &middot; purchase = Dr, sale = Cr
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows}
              columns={[
                { key: "vDate", label: "Date" },
                { key: "vNo", label: "V.No" },
                { key: "party", label: "Party" },
                { key: "quality", label: "Quality" },
                { key: "than", label: "Than" },
                { key: "mtr", label: "Mtr" },
                { key: "purchase", label: "Purchase (Dr)" },
                { key: "sale", label: "Sale (Cr)" },
                { key: "profit", label: "Profit" },
              ]}
              filename="grey-stock-account-ledger"
              sheetName="StockLedger"
            />
          </div>
        </div>

        <div className="hidden print:block mb-4 text-center">
          <h1 className="page-title">GREY STOCK — ACCOUNT LEDGER</h1>
          <div className="mono text-[12px] mt-1">{from} — {to}</div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(supplier)</span></label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/stock-account-ledger" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-6 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalPurchase)}</div>
            <div className="stat-label">Total Purchase (Dr)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalSale)}</div>
            <div className="stat-label">Total Sale (Cr)</div>
          </div>
          <div className="bg-white p-4">
            <div className={`mono text-xl font-bold ${netProfit >= 0 ? "" : "text-[var(--danger)]"}`}>
              Rs {fmt(netProfit)} {netProfit >= 0 ? "Profit" : "Loss"}
            </div>
            <div className="stat-label">Net Profit / Loss</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>V.No</th>
                <th>Party</th>
                <th>Quality</th>
                <th className="text-right">Than</th>
                <th className="text-right">Mtr</th>
                <th className="text-right">Purchase (Dr)</th>
                <th className="text-right">Sale (Cr)</th>
                <th className="text-right">Profit</th>
                <th className="text-right">Running P/L</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">No entries in this range</td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono text-[13px]">{r.vDate}</td>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td className="text-[13px]">
                      {r.party}
                      {partyCodeByName.get(r.party) ? <span className="text-[11px] text-[var(--muted)]"> ({partyCodeByName.get(r.party)})</span> : null}
                    </td>
                    <td className="text-[13px]">{r.quality || "-"}</td>
                    <td className="mono text-right">{r.than ? fmt(r.than) : "-"}</td>
                    <td className="mono text-right">{r.mtr ? fmt(r.mtr) : "-"}</td>
                    <td className="mono text-right">{r.purchase ? fmt(r.purchase) : "-"}</td>
                    <td className="mono text-right">{r.sale ? fmt(r.sale) : "-"}</td>
                    <td className={`mono text-right font-semibold ${r.profit < 0 ? "text-[var(--danger)]" : ""}`}>{r.profit ? fmt(r.profit) : "-"}</td>
                    <td className="mono text-right font-bold">{fmt(r.running)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black font-bold">
                  <td colSpan={6} className="text-right uppercase tracking-[0.05em]">Total</td>
                  <td className="mono text-right">{fmt(totalPurchase)}</td>
                  <td className="mono text-right">{fmt(totalSale)}</td>
                  <td className={`mono text-right ${netProfit < 0 ? "text-[var(--danger)]" : ""}`}>{fmt(netProfit)}</td>
                  <td className="mono text-right">{fmt(netProfit)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
