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

export default async function PartsIssuesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; department?: string; part?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || monthsBackFrom(today, 1);
  const to = params.to?.trim() || today;
  const departmentQ = params.department?.trim() || "";
  const partQ = params.part?.trim() || "";

  const [ccList, partList] = await Promise.all([
    db.select().from(schema.costCenters),
    db.select({ code: schema.chartParts.code, description: schema.chartParts.description }).from(schema.chartParts),
  ]);

  const conds = [
    gte(schema.storeDemands.demandDate, from),
    lte(schema.storeDemands.demandDate, to),
  ];
  if (departmentQ) conds.push(eq(schema.storeDemands.department, departmentQ));

  const rowsRaw = await db
    .select({
      date: schema.storeDemands.demandDate,
      demandNo: schema.storeDemands.demandNo,
      department: schema.storeDemands.department,
      partCode: schema.storeDemandDetail.partCode,
      qty: schema.storeDemandDetail.qty,
      rate: schema.storeDemandDetail.rate,
      amount: schema.storeDemandDetail.amount,
      ccCode: schema.storeDemandDetail.ccCode,
    })
    .from(schema.storeDemandDetail)
    .innerJoin(schema.storeDemands, eq(schema.storeDemandDetail.demandId, schema.storeDemands.id))
    .where(and(...conds))
    .orderBy(schema.storeDemands.demandDate);

  const partMap = new Map(partList.map((p) => [p.code, p.description]));
  const ccMap = new Map(ccList.map((c) => [String(c.code), c.description]));

  const rows = rowsRaw
    .filter((r) => !partQ || r.partCode === partQ)
    .map((r) => ({
      date: r.date,
      demandNo: r.demandNo,
      partCode: r.partCode,
      partName: partMap.get(r.partCode) ?? r.partCode,
      qty: r.qty ?? 0,
      rate: r.rate ?? 0,
      amount: r.amount ?? 0,
      dept: r.department,
      ccCode: r.ccCode ?? "",
      cc: ccMap.get(r.ccCode ?? "") ?? r.ccCode ?? "-",
    }));

  const totQty = rows.reduce((s, r) => s + r.qty, 0);
  const totAmt = rows.reduce((s, r) => s + r.amount, 0);

  const deptOpts = Array.from(new Set(ccList.map((c) => c.description)))
    .filter(Boolean)
    .map((d) => ({ value: d, label: d }));
  const partOpts = partList.map((p) => ({ value: p.code, label: `${p.code} — ${p.description}` }));

  const excelRows = rows.map((r) => ({
    date: r.date,
    demandNo: r.demandNo,
    partCode: r.partCode,
    partName: r.partName,
    qty: r.qty,
    rate: r.rate,
    amount: Math.round(r.amount),
    dept: r.dept,
    cc: r.cc,
  }));

  return (
    <Shell active="s-issues">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Parts Issues Register</h1>
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
                { key: "demandNo", label: "Dmd No" },
                { key: "partCode", label: "Part Code" },
                { key: "partName", label: "Part" },
                { key: "qty", label: "Qty" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
                { key: "dept", label: "Dept" },
                { key: "cc", label: "Cost Ctr" },
              ]}
              filename="parts-issues-register"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Parts Issues Register</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {departmentQ ? ` · Dept: ${departmentQ}` : ""}
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
            <label className="label block mb-1">Department</label>
            <Combobox name="department" options={deptOpts} defaultValue={departmentQ} placeholder="Department" />
          </div>
          <div>
            <label className="label block mb-1">Part</label>
            <Combobox name="part" options={partOpts} defaultValue={partQ} placeholder="Part" />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/store/parts-issues-register" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Issues</div>
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
                <th>Dmd No</th>
                <th>Part</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th>Dept</th>
                <th>Cost Ctr</th>
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
                    <td className="mono">{r.demandNo}</td>
                    <td className="text-[13px]">
                      <span className="mono">{r.partCode}</span> — {r.partName}
                    </td>
                    <td className="mono text-right">{fmt(r.qty)}</td>
                    <td className="mono text-right">{fmt(r.rate)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                    <td className="text-[13px]">{r.dept}</td>
                    <td className="text-[13px]">
                      {r.ccCode ? `${r.ccCode} — ${r.cc}` : r.cc}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3}>GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(totQty)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totAmt)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
