import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export default async function VoucherDaybookPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; vtype?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const dateFrom = params.from?.trim() || monthStart();
  const dateTo = params.to?.trim() || today();
  const vtypeFilter = params.vtype?.trim() || "";

  const voucherTypes = await db
    .select()
    .from(schema.voucherTypes)
    .orderBy(schema.voucherTypes.sortOrder);

  const conds = [
    gte(schema.transMain.vdate, dateFrom),
    lte(schema.transMain.vdate, dateTo),
  ];
  if (vtypeFilter) conds.push(eq(schema.transMain.vtype, vtypeFilter));

  const rows = await db
    .select({
      fyCode: schema.transMain.fyCode,
      vtype: schema.transMain.vtype,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      narration: schema.transMain.narration,
      totalDebit: sql<number>`(SELECT coalesce(sum(debit), 0) FROM trans_detail WHERE fy_code = trans_main.fy_code AND vtype = trans_main.vtype AND vno = trans_main.vno)`,
      totalCredit: sql<number>`(SELECT coalesce(sum(credit), 0) FROM trans_detail WHERE fy_code = trans_main.fy_code AND vtype = trans_main.vtype AND vno = trans_main.vno)`,
    })
    .from(schema.transMain)
    .where(and(...conds))
    .orderBy(schema.transMain.vdate, schema.transMain.vtype, schema.transMain.vno);

  const grandDr = rows.reduce((s, r) => s + (r.totalDebit ?? 0), 0);
  const grandCr = rows.reduce((s, r) => s + (r.totalCredit ?? 0), 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const excelRows = rows.map((r) => ({
    date: r.vdate,
    vtype: r.vtype,
    vno: r.vno,
    fy: r.fyCode,
    narration: r.narration ?? "",
    debit: r.totalDebit ?? 0,
    credit: r.totalCredit ?? 0,
  }));

  const groupedByDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = groupedByDate.get(r.vdate) ?? [];
    g.push(r);
    groupedByDate.set(r.vdate, g);
  }
  const dateGroups = [...groupedByDate.entries()];

  return (
    <Shell active="fin-daybook">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Voucher Daybook</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {dateFrom} to {dateTo} · {rows.length} vouchers
              {vtypeFilter ? ` · Type: ${vtypeFilter}` : ""}
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "vtype", label: "V.Type" },
                { key: "vno", label: "V.No" },
                { key: "fy", label: "FY" },
                { key: "narration", label: "Narration" },
                { key: "debit", label: "Debit" },
                { key: "credit", label: "Credit" },
              ]}
              filename="voucher-daybook"
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8 no-print">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="label block mb-1">Date From</label>
              <input type="date" name="from" className="input-box mono" defaultValue={dateFrom} />
            </div>
            <div className="sm:col-span-3">
              <label className="label block mb-1">Date To</label>
              <input type="date" name="to" className="input-box mono" defaultValue={dateTo} />
            </div>
            <div className="sm:col-span-4">
              <label className="label block mb-1">V.Type</label>
              <select name="vtype" className="input-box mono" defaultValue={vtypeFilter}>
                <option value="">All</option>
                {voucherTypes.map((v) => (
                  <option key={v.vtype} value={v.vtype}>
                    {v.vtype} — {v.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">View</button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Vouchers</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(grandDr)}</div>
            <div className="stat-label">Total Debit</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(grandCr)}</div>
            <div className="stat-label">Total Credit</div>
          </div>
        </div>

        {dateGroups.map(([d, items]) => {
          const dayDr = items.reduce((s, r) => s + (r.totalDebit ?? 0), 0);
          const dayCr = items.reduce((s, r) => s + (r.totalCredit ?? 0), 0);
          return (
            <div key={d} className="mb-8">
              <div className="section-title">{d}</div>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>V.Type</th>
                      <th>V.No</th>
                      <th>Narration</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={`${r.fyCode}-${r.vtype}-${r.vno}`}>
                        <td>
                          <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                            {r.vtype}
                          </span>
                        </td>
                        <td className="mono">{r.vno}</td>
                        <td className="text-[13px]">{r.narration}</td>
                        <td className="mono text-right">{fmt(r.totalDebit ?? 0)}</td>
                        <td className="mono text-right">{fmt(r.totalCredit ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                      <td colSpan={3}>Day Total</td>
                      <td className="mono text-right">{fmt(dayDr)}</td>
                      <td className="mono text-right">{fmt(dayCr)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}

        {dateGroups.length === 0 && (
          <div className="text-center text-[var(--muted)] py-10">No vouchers in this range.</div>
        )}

        {dateGroups.length > 0 && (
          <div
            className="flex justify-between items-center px-4 py-4 mono text-[15px]"
            style={{ borderTop: "3px double black", borderBottom: "3px double black", fontWeight: 700 }}
          >
            <span className="uppercase tracking-[0.06em]">Grand Total</span>
            <span className="flex gap-16">
              <span>{fmt(grandDr)}</span>
              <span>{fmt(grandCr)}</span>
            </span>
          </div>
        )}
      </div>
    </Shell>
  );
}
