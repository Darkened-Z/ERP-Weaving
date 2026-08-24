import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function PartsPurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier?: string; part?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || monthsBackFrom(today, 1);
  const to = params.to?.trim() || today;
  const supplierQ = params.supplier?.trim() || "";
  const partQ = params.part?.trim() || "";

  const partList = await db
    .select({ code: schema.chartParts.code, description: schema.chartParts.description })
    .from(schema.chartParts);

  const conds = [gte(schema.storeGrn.grnDate, from), lte(schema.storeGrn.grnDate, to)];
  if (supplierQ) conds.push(eq(schema.storeGrn.supplier, supplierQ));

  const rowsRaw = await db
    .select({
      date: schema.storeGrn.grnDate,
      grnNo: schema.storeGrn.grnNo,
      supplier: schema.storeGrn.supplier,
      invoiceNo: schema.storeGrn.invoiceNo,
      partCode: schema.storeGrnDetail.partCode,
      qty: schema.storeGrnDetail.qty,
      rate: schema.storeGrnDetail.rate,
      amount: schema.storeGrnDetail.amount,
    })
    .from(schema.storeGrnDetail)
    .innerJoin(schema.storeGrn, eq(schema.storeGrnDetail.grnId, schema.storeGrn.id))
    .where(and(...conds))
    .orderBy(schema.storeGrn.grnDate);

  const partMap = new Map(partList.map((p) => [p.code, p.description]));

  const rows = rowsRaw
    .filter((r) => !partQ || r.partCode === partQ)
    .map((r) => ({
      date: r.date,
      grnNo: r.grnNo,
      supplier: r.supplier,
      invoiceNo: r.invoiceNo ?? "-",
      partCode: r.partCode,
      partName: partMap.get(r.partCode) ?? r.partCode,
      qty: r.qty ?? 0,
      rate: r.rate ?? 0,
      amount: r.amount ?? 0,
    }));

  const totQty = rows.reduce((s, r) => s + r.qty, 0);
  const totAmt = rows.reduce((s, r) => s + r.amount, 0);

  const supplierOpts = Array.from(new Set(rowsRaw.map((r) => r.supplier)))
    .filter(Boolean)
    .map((s) => ({ value: s, label: s }));
  const partOpts = partList.map((p) => ({ value: p.code, label: `${p.code} — ${p.description}` }));

  const excelRows = rows.map((r) => ({
    date: r.date,
    grnNo: r.grnNo,
    supplier: r.supplier,
    invoiceNo: r.invoiceNo,
    partCode: r.partCode,
    partName: r.partName,
    qty: r.qty,
    rate: r.rate,
    amount: Math.round(r.amount),
  }));

  return (
    <Shell active="s-purchase">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Parts Purchase Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} rows &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "grnNo", label: "GRN No" },
                { key: "supplier", label: "Supplier" },
                { key: "invoiceNo", label: "Invoice" },
                { key: "partCode", label: "Part Code" },
                { key: "partName", label: "Part" },
                { key: "qty", label: "Qty" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
              ]}
              filename="parts-purchase-register"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Parts Purchase Register</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {supplierQ ? ` · Supplier: ${supplierQ}` : ""}
            {partQ ? ` · Part: ${partQ}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Supplier</label>
            <Combobox name="supplier" options={supplierOpts} defaultValue={supplierQ} placeholder="Supplier" />
          </div>
          <div>
            <label className="label block mb-1">Part</label>
            <Combobox name="part" options={partOpts} defaultValue={partQ} placeholder="Part" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/store/parts-purchase-register" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Purchases</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totQty)}</div>
            <div className="stat-label">Total Qty</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totAmt)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>GRN No</th>
                <th>Supplier</th>
                <th>Invoice</th>
                <th>Part</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No data
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.date}</td>
                    <td className="mono">{r.grnNo}</td>
                    <td className="text-[13px]">{r.supplier}</td>
                    <td className="mono">{r.invoiceNo}</td>
                    <td className="text-[13px]">
                      <span className="mono">{r.partCode}</span> — {r.partName}
                    </td>
                    <td className="mono text-right">{fmt(r.qty)}</td>
                    <td className="mono text-right">{fmt(r.rate)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={5}>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totQty)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
