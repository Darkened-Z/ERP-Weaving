import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, or, sql } from "drizzle-orm";
import { fmt, escLike, sixMonthsAgo, todayIso, partyByNameOptions } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GREY STOCK — ACCOUNT LEDGER (value / Dr-Cr).
 * The grey-stock godown account as debit/credit:
 *   DEBIT  = grey purchased INTO the godown  (ext_godown_stock)      → net meter × purchase rate
 *   CREDIT = grey sold OUT via Packi Parchi  (ext_packi_parchi)      → net meter × grey rate
 * Movements are replayed in date order with a running balance; the footer shows total
 * purchase (Dr), total sale (Cr) and the closing balance.
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
  const like = party ? `%${escLike(party)}%` : null;

  const partyOpts = await partyByNameOptions();
  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const codeByName = new Map(accounts.map((a) => [a.description ?? "", a.code]));

  // DEBIT side — purchases into the godown.
  const purConds = [gte(schema.extGodownStock.vDate, from), lte(schema.extGodownStock.vDate, to)];
  if (like) purConds.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${like} ESCAPE '\\'`);
  const purchases = await db
    .select({
      vNo: schema.extGodownStock.vNo,
      vDate: schema.extGodownStock.vDate,
      party: schema.extGodownStock.purchaseParty,
      quality: schema.extGodownStock.contactQuality,
      than: schema.extGodownStock.than,
      netMeter: schema.extGodownStock.netMeter,
      meter: schema.extGodownStock.meter,
      rate: schema.extGodownStock.rate,
    })
    .from(schema.extGodownStock)
    .where(and(...purConds));

  // CREDIT side — sales out via packi parchi.
  const salConds = [gte(schema.extPackiParchi.vDate, from), lte(schema.extPackiParchi.vDate, to)];
  if (like)
    salConds.push(
      or(
        sql`${schema.extPackiParchi.saleParty} LIKE ${like} ESCAPE '\\'`,
        sql`${schema.extPackiParchi.purchaseParty} LIKE ${like} ESCAPE '\\'`,
      )!,
    );
  const sales = await db
    .select({
      vNo: schema.extPackiParchi.vNo,
      vDate: schema.extPackiParchi.vDate,
      party: schema.extPackiParchi.saleParty,
      quality: schema.extPackiParchi.quality,
      than: schema.extPackiParchi.than,
      meterNet: schema.extPackiParchi.meterNet,
      greyRate: schema.extPackiParchi.greyRate,
    })
    .from(schema.extPackiParchi)
    .where(and(...salConds));

  type Row = {
    date: string;
    vNo: string;
    kind: "DR" | "CR";
    party: string;
    narration: string;
    dr: number;
    cr: number;
  };

  const rows: Row[] = [
    ...purchases.map((s) => {
      const mtr = s.netMeter ?? s.meter ?? 0;
      return {
        date: s.vDate ?? "",
        vNo: s.vNo ?? "",
        kind: "DR" as const,
        party: s.party ?? "—",
        narration: `${s.than ?? 0} THAN ${fmt(mtr)} MTR @ ${s.rate ?? 0}${s.quality ? ` , ${s.quality}` : ""} (GODOWN - GREY STOCK)`,
        dr: Math.round(mtr * (s.rate ?? 0)),
        cr: 0,
      };
    }),
    ...sales.map((s) => {
      const mtr = s.meterNet ?? 0;
      return {
        date: s.vDate ?? "",
        vNo: s.vNo ?? "",
        kind: "CR" as const,
        party: s.party ?? "—",
        narration: `${s.than ?? 0} THAN ${fmt(mtr)} MTR @ ${s.greyRate ?? 0}${s.quality ? ` , ${s.quality}` : ""} (PACKI SALE)`,
        dr: 0,
        cr: Math.round(mtr * (s.greyRate ?? 0)),
      };
    }),
  ].sort((a, b) =>
    a.date === b.date ? (a.kind === b.kind ? 0 : a.kind === "DR" ? -1 : 1) : a.date.localeCompare(b.date),
  );

  let bal = 0;
  const ledger = rows.map((r) => {
    bal += r.dr - r.cr;
    return { ...r, balance: bal };
  });

  const totalDr = rows.reduce((a, r) => a + r.dr, 0);
  const totalCr = rows.reduce((a, r) => a + r.cr, 0);
  const closing = totalDr - totalCr;

  return (
    <Shell active="rpt-grey-stock-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY STOCK — ACCOUNT LEDGER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {ledger.length} entries &middot; {from} to {to} &middot; purchase = Dr, packi sale = Cr
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={ledger.map((r) => ({
                date: r.date,
                vNo: r.vNo,
                type: r.kind,
                party: r.party,
                narration: r.narration,
                dr: r.dr,
                cr: r.cr,
                balance: r.balance,
              }))}
              columns={[
                { key: "date", label: "Date" },
                { key: "vNo", label: "V.No" },
                { key: "type", label: "Type" },
                { key: "party", label: "Party" },
                { key: "narration", label: "Narration" },
                { key: "dr", label: "Debit" },
                { key: "cr", label: "Credit" },
                { key: "balance", label: "Balance" },
              ]}
              filename="grey-stock-account-ledger"
              sheetName="AccountLedger"
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
            <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(supplier / customer)</span></label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/grey/stock-account-ledger" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-6 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalDr)}</div>
            <div className="stat-label">Total Purchase (Dr)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalCr)}</div>
            <div className="stat-label">Total Sale (Cr)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(Math.abs(closing))} {closing >= 0 ? "Dr" : "Cr"}</div>
            <div className="stat-label">Closing Balance</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>V.No</th>
                <th>Type</th>
                <th>Party</th>
                <th>Narration</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">No movements in this range</td>
                </tr>
              ) : (
                ledger.map((r, i) => (
                  <tr key={i}>
                    <td className="mono text-[13px]">{r.date}</td>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td>
                      <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold">{r.kind}</span>
                    </td>
                    <td className="text-[13px]">
                      {r.party}
                      {codeByName.get(r.party) ? <span className="text-[11px] text-[var(--muted)]"> ({codeByName.get(r.party)})</span> : null}
                    </td>
                    <td className="text-[12px] text-[var(--muted)]">{r.narration}</td>
                    <td className="mono text-right">{r.dr ? fmt(r.dr) : ""}</td>
                    <td className="mono text-right">{r.cr ? fmt(r.cr) : ""}</td>
                    <td className="mono text-right font-semibold">
                      {fmt(Math.abs(r.balance))} <span className="text-[11px] text-[var(--muted)]">{r.balance >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ledger.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black font-bold">
                  <td colSpan={5} className="text-right uppercase tracking-[0.05em]">Closing</td>
                  <td className="mono text-right">{fmt(totalDr)}</td>
                  <td className="mono text-right">{fmt(totalCr)}</td>
                  <td className="mono text-right">{fmt(Math.abs(closing))} {closing >= 0 ? "Dr" : "Cr"}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
