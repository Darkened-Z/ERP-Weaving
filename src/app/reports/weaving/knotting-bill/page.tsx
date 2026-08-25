import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { fmt, sixMonthsAgo, todayIso } from "../../_shared";

export const dynamic = "force-dynamic";

const BILL_TYPES = ["KNOTTING", "SARNING", "MAROORI"] as const;

export default async function KnottingBillRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; type?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const type = (p.type?.trim() || "").toUpperCase();

  const conds = [
    gte(schema.intKnottingSarning.vDate, from),
    lte(schema.intKnottingSarning.vDate, to),
  ];
  if (type && BILL_TYPES.includes(type as (typeof BILL_TYPES)[number])) {
    conds.push(eq(schema.intKnottingSarning.type, type));
  }

  const bills = await db
    .select()
    .from(schema.intKnottingSarning)
    .where(and(...conds))
    .orderBy(schema.intKnottingSarning.vDate, schema.intKnottingSarning.vNo);

  const ids = bills.map((b) => b.id);
  const agg = ids.length
    ? await db
        .select({
          knottingId: schema.intKnottingSarningLine.knottingId,
          rows: sql<number>`count(*)`,
          amount: sql<number>`coalesce(sum(${schema.intKnottingSarningLine.netAmt}), 0)`,
          ends: sql<number>`coalesce(sum(${schema.intKnottingSarningLine.ends}), 0)`,
        })
        .from(schema.intKnottingSarningLine)
        .where(
          sql`${schema.intKnottingSarningLine.knottingId} IN (${sql.join(
            ids.map((i) => sql`${i}`),
            sql`, `,
          )})`,
        )
        .groupBy(schema.intKnottingSarningLine.knottingId)
    : [];
  const aggMap = new Map(agg.map((a) => [a.knottingId, a]));

  const rows = bills.map((b) => {
    const a = aggMap.get(b.id);
    return {
      id: b.id,
      vNo: b.vNo,
      vDate: b.vDate,
      party: b.party ?? "",
      billType: b.type ?? "",
      rows: a?.rows ?? 0,
      ends: a?.ends ?? 0,
      amount: a?.amount ?? 0,
    };
  });

  const totalRows = rows.reduce((s, r) => s + r.rows, 0);
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
  const totalEnds = rows.reduce((s, r) => s + r.ends, 0);

  const excelRows = rows.map((r) => ({
    vNo: r.vNo,
    vDate: r.vDate,
    party: r.party,
    billType: r.billType,
    rows: r.rows,
    ends: r.ends,
    amount: Math.round(r.amount),
  }));

  return (
    <Shell active="w-knotting-bill">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Knotting Bill Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} bills &middot; {from} to {to}
              {type ? ` · ${type}` : ""}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "party", label: "Party" },
                { key: "billType", label: "Type" },
                { key: "rows", label: "Rows" },
                { key: "ends", label: "Ends" },
                { key: "amount", label: "Net Amount" },
              ]}
              filename="knotting-bill-register"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Knotting Bill Register</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
            {type ? ` · ${type}` : ""}
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
            <label className="label block mb-1">Bill Type</label>
            <select name="type" defaultValue={type} className="input-box mono">
              <option value="">All</option>
              {BILL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/knotting-bill" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Bills</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalRows)}</div>
            <div className="stat-label">Total Rows</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalEnds)}</div>
            <div className="stat-label">Total Ends</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalAmt)}</div>
            <div className="stat-label">Net Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>V.Date</th>
                <th>Party</th>
                <th>Type</th>
                <th className="text-right">Rows</th>
                <th className="text-right">Ends</th>
                <th className="text-right">Net Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)] py-8">
                    No knotting bills in range
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono font-bold">{r.vNo}</td>
                    <td className="mono">{r.vDate}</td>
                    <td>{r.party || "-"}</td>
                    <td className="mono">{r.billType || "-"}</td>
                    <td className="mono text-right">{r.rows}</td>
                    <td className="mono text-right">{fmt(r.ends)}</td>
                    <td className="mono text-right">{fmt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={4}>Total</td>
                  <td className="mono text-right">{totalRows}</td>
                  <td className="mono text-right">{fmt(totalEnds)}</td>
                  <td className="mono text-right">{fmt(totalAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
