import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, eq } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function PartsLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; part?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsBackFrom(today, 6);
  const to = params.to?.trim() || today;
  const partCode = params.part?.trim() || "";

  const parts = await db.select().from(schema.chartParts).orderBy(schema.chartParts.code);
  const partOpts = parts.map((p) => ({ value: p.code, label: `${p.code} — ${p.description}` }));
  const part = parts.find((p) => p.code === partCode);

  type Txn = {
    date: string;
    type: "OPEN" | "GRN" | "ISSUE" | "RETURN" | "ADJ";
    ref: string;
    party: string;
    qtyIn: number;
    qtyOut: number;
    rate: number;
    amount: number;
  };

  const txns: Txn[] = [];

  if (part) {
    const openingRow = await db
      .select()
      .from(schema.inventoryOpening)
      .where(
        and(
          eq(schema.inventoryOpening.itemType, "STORE-PART"),
          eq(schema.inventoryOpening.itemCode, part.code)
        )
      )
      .limit(1);
    const opening = openingRow[0];
    if (opening) {
      txns.push({
        date: opening.entryDate ?? from,
        type: "OPEN",
        ref: "Opening",
        party: "-",
        qtyIn: opening.openingQty ?? 0,
        qtyOut: 0,
        rate: opening.openingRate ?? 0,
        amount: opening.openingAmount ?? 0,
      });
    }

    const grn = await db
      .select({
        date: schema.storeGrn.grnDate,
        grnNo: schema.storeGrn.grnNo,
        supplier: schema.storeGrn.supplier,
        qty: schema.storeGrnDetail.qty,
        rate: schema.storeGrnDetail.rate,
        amount: schema.storeGrnDetail.amount,
      })
      .from(schema.storeGrnDetail)
      .innerJoin(schema.storeGrn, eq(schema.storeGrnDetail.grnId, schema.storeGrn.id))
      .where(
        and(
          eq(schema.storeGrnDetail.partCode, part.code),
          gte(schema.storeGrn.grnDate, from),
          lte(schema.storeGrn.grnDate, to)
        )
      );
    for (const g of grn) {
      txns.push({
        date: g.date,
        type: "GRN",
        ref: `GRN-${g.grnNo}`,
        party: g.supplier,
        qtyIn: g.qty ?? 0,
        qtyOut: 0,
        rate: g.rate ?? 0,
        amount: g.amount ?? 0,
      });
    }

    const iss = await db
      .select({
        date: schema.storeDemands.demandDate,
        no: schema.storeDemands.demandNo,
        dept: schema.storeDemands.department,
        qty: schema.storeDemandDetail.qty,
        rate: schema.storeDemandDetail.rate,
        amount: schema.storeDemandDetail.amount,
      })
      .from(schema.storeDemandDetail)
      .innerJoin(schema.storeDemands, eq(schema.storeDemandDetail.demandId, schema.storeDemands.id))
      .where(
        and(
          eq(schema.storeDemandDetail.partCode, part.code),
          gte(schema.storeDemands.demandDate, from),
          lte(schema.storeDemands.demandDate, to)
        )
      );
    for (const i of iss) {
      txns.push({
        date: i.date,
        type: "ISSUE",
        ref: `DMD-${i.no}`,
        party: i.dept,
        qtyIn: 0,
        qtyOut: i.qty ?? 0,
        rate: i.rate ?? 0,
        amount: i.amount ?? 0,
      });
    }

    const ret = await db
      .select({
        date: schema.storeReturns.returnDate,
        no: schema.storeReturns.returnNo,
        dept: schema.storeReturns.department,
        qty: schema.storeReturnDetail.qty,
        rate: schema.storeReturnDetail.rate,
        amount: schema.storeReturnDetail.amount,
      })
      .from(schema.storeReturnDetail)
      .innerJoin(schema.storeReturns, eq(schema.storeReturnDetail.returnId, schema.storeReturns.id))
      .where(
        and(
          eq(schema.storeReturnDetail.partCode, part.code),
          gte(schema.storeReturns.returnDate, from),
          lte(schema.storeReturns.returnDate, to)
        )
      );
    for (const r of ret) {
      txns.push({
        date: r.date,
        type: "RETURN",
        ref: `RET-${r.no}`,
        party: r.dept,
        qtyIn: r.qty ?? 0,
        qtyOut: 0,
        rate: r.rate ?? 0,
        amount: r.amount ?? 0,
      });
    }

    const adj = await db
      .select({
        date: schema.storeAdjustments.adjDate,
        no: schema.storeAdjustments.adjNo,
        type: schema.storeAdjustments.type,
        qty: schema.storeAdjustmentDetail.qty,
        rate: schema.storeAdjustmentDetail.rate,
        amount: schema.storeAdjustmentDetail.amount,
        reason: schema.storeAdjustmentDetail.reason,
      })
      .from(schema.storeAdjustmentDetail)
      .innerJoin(
        schema.storeAdjustments,
        eq(schema.storeAdjustmentDetail.adjId, schema.storeAdjustments.id)
      )
      .where(
        and(
          eq(schema.storeAdjustmentDetail.partCode, part.code),
          gte(schema.storeAdjustments.adjDate, from),
          lte(schema.storeAdjustments.adjDate, to)
        )
      );
    for (const a of adj) {
      const positive = (a.qty ?? 0) >= 0;
      txns.push({
        date: a.date,
        type: "ADJ",
        ref: `ADJ-${a.no}`,
        party: a.reason ?? a.type ?? "-",
        qtyIn: positive ? a.qty ?? 0 : 0,
        qtyOut: positive ? 0 : Math.abs(a.qty ?? 0),
        rate: a.rate ?? 0,
        amount: a.amount ?? 0,
      });
    }
  }

  txns.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === "OPEN" ? -1 : 1));

  let bal = 0;
  let valBal = 0;
  const rows = txns.map((t) => {
    bal += t.qtyIn - t.qtyOut;
    if (t.type === "OPEN" || t.type === "GRN" || t.type === "RETURN") valBal += t.amount;
    else if (t.type === "ISSUE") valBal -= t.amount;
    else if (t.type === "ADJ") valBal += t.qtyIn > 0 ? t.amount : -t.amount;
    return { ...t, bal, valBal };
  });

  const excelRows = rows.map((r) => ({
    date: r.date,
    type: r.type,
    ref: r.ref,
    party: r.party,
    qtyIn: r.qtyIn,
    qtyOut: r.qtyOut,
    rate: r.rate,
    amount: Math.round(r.amount),
    bal: r.bal,
    valBal: Math.round(r.valBal),
  }));

  return (
    <Shell active="s-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Parts Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {part ? `${part.code} — ${part.description}` : "Select a part"} &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "type", label: "Type" },
                { key: "ref", label: "Ref" },
                { key: "party", label: "Party/Dept" },
                { key: "qtyIn", label: "Qty In" },
                { key: "qtyOut", label: "Qty Out" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
                { key: "bal", label: "Bal Qty" },
                { key: "valBal", label: "Bal Value" },
              ]}
              filename={`parts-ledger-${part?.code ?? "part"}`}
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Parts Ledger</h1>
          <div className="mono text-[12px] mt-2">
            {part ? `${part.code} — ${part.description}` : ""} · Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Part</label>
            <Combobox name="part" options={partOpts} defaultValue={partCode} placeholder="Part" />
          </div>
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/store/parts-ledger" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Ref</th>
                <th>Party / Dept</th>
                <th className="text-right">Qty In</th>
                <th className="text-right">Qty Out</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Bal Qty</th>
                <th className="text-right">Bal Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    {part ? "No transactions" : "Select a part"}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.date}</td>
                    <td>
                      <span
                        className="inline-block text-[11px] px-2 py-0.5 border border-black uppercase mono"
                        style={{ letterSpacing: "0.05em" }}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="mono">{r.ref}</td>
                    <td className="text-[13px]">{r.party}</td>
                    <td className="mono text-right">{r.qtyIn ? fmt(r.qtyIn) : "-"}</td>
                    <td className="mono text-right">{r.qtyOut ? fmt(r.qtyOut) : "-"}</td>
                    <td className="mono text-right">{fmt2(r.rate)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                    <td className="mono text-right font-bold">{fmt(r.bal)}</td>
                    <td className="mono text-right">{fmt(r.valBal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
