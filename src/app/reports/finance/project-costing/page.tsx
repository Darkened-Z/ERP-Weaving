import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";
import { buildCostCenterOptions } from "@/app/settings/cost-centers/page";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

// Direct labour heads are Oracle's knotting/sarning/maroori and payroll
// buckets. On a mill CoA these fall under code_head '6' (cost of sales) and
// their descriptions include a labour marker. Anything else under head '6'
// or '7' that isn't materials or labour is bucketed as overheads.
const DIRECT_LABOUR_MARKERS = [
  "knotting",
  "sarning",
  "maroori",
  "wages",
  "payroll",
  "labour",
  "salaries",
];

const MATERIALS_MARKERS = ["stores consumption", "parts consumption", "material"];

function classifyExpense(
  accDesc: string,
  head: string
): "materials" | "labour" | "overhead" | null {
  if (head !== "6" && head !== "7") return null;
  const d = accDesc.toLowerCase();
  if (MATERIALS_MARKERS.some((m) => d.includes(m))) return "materials";
  if (DIRECT_LABOUR_MARKERS.some((m) => d.includes(m))) return "labour";
  return "overhead";
}

export default async function ProjectCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ cc?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsAgo(3);
  const to = params.to?.trim() || today;
  const ccParam = params.cc?.trim() ?? "";
  const ccCode = ccParam ? parseInt(ccParam, 10) : NaN;
  const hasCc = Number.isFinite(ccCode);

  const centers = await db
    .select()
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);
  const ccOptions = buildCostCenterOptions(centers);
  const ccMap = new Map(centers.map((c) => [c.code, c]));

  // Materials issued from stores (store demands allocated to this CC).
  // storeDemandDetail.ccCode is TEXT; costCenters.code is INTEGER. Match on string.
  const materialsIssuedRows = hasCc
    ? await db
        .select({
          date: schema.storeDemands.demandDate,
          demandNo: schema.storeDemands.demandNo,
          fyCode: schema.storeDemands.fyCode,
          department: schema.storeDemands.department,
          partCode: schema.storeDemandDetail.partCode,
          qty: schema.storeDemandDetail.qty,
          rate: schema.storeDemandDetail.rate,
          amount: schema.storeDemandDetail.amount,
        })
        .from(schema.storeDemandDetail)
        .innerJoin(
          schema.storeDemands,
          eq(schema.storeDemandDetail.demandId, schema.storeDemands.id)
        )
        .where(
          and(
            eq(schema.storeDemandDetail.ccCode, String(ccCode)),
            gte(schema.storeDemands.demandDate, from),
            lte(schema.storeDemands.demandDate, to)
          )
        )
        .orderBy(schema.storeDemands.demandDate)
    : [];

  // Materials returned: storeReturns has no cc_code on the detail row today, so
  // we cannot allocate a return to a cost centre exactly. Skip per spec.
  const materialsReturnedRows: typeof materialsIssuedRows = [];

  // Ledger-side allocations: trans_detail.ccCode is the Oracle "TAD_CC_CODE".
  // Sum debits, subtract credits (returns).
  const glRows = hasCc
    ? await db
        .select({
          fyCode: schema.transDetail.fyCode,
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          accCode: schema.transDetail.accCode,
          narration: schema.transDetail.narration,
          debit: schema.transDetail.debit,
          credit: schema.transDetail.credit,
          vdate: schema.transMain.vdate,
        })
        .from(schema.transDetail)
        .innerJoin(
          schema.transMain,
          and(
            eq(schema.transDetail.fyCode, schema.transMain.fyCode),
            eq(schema.transDetail.vtype, schema.transMain.vtype),
            eq(schema.transDetail.vno, schema.transMain.vno)
          )
        )
        .where(
          and(
            eq(schema.transDetail.ccCode, ccCode),
            gte(schema.transMain.vdate, from),
            lte(schema.transMain.vdate, to)
          )
        )
        .orderBy(schema.transMain.vdate)
    : [];

  const accounts = await db.select().from(schema.chartOfAccounts);
  const accMap = new Map(accounts.map((a) => [a.code, a]));

  type Bucket = { label: string; total: number; lines: { date: string; ref: string; desc: string; amount: number }[] };
  const materials: Bucket = { label: "Materials", total: 0, lines: [] };
  const labour: Bucket = { label: "Direct Labour", total: 0, lines: [] };
  const overheads: Bucket = { label: "Overheads", total: 0, lines: [] };
  const unclassified: Bucket = { label: "Unclassified (non-P&L)", total: 0, lines: [] };

  for (const r of materialsIssuedRows) {
    materials.total += r.amount;
    materials.lines.push({
      date: r.date,
      ref: `Dmd#${r.demandNo}/${r.fyCode}`,
      desc: `${r.partCode} × ${r.qty} @ ${r.rate}`,
      amount: r.amount,
    });
  }

  for (const g of glRows) {
    const acc = accMap.get(g.accCode);
    const head = acc?.codeHead ?? "";
    const desc = acc?.description ?? g.accCode;
    const bucket = classifyExpense(desc, head);
    const net = (g.debit ?? 0) - (g.credit ?? 0);
    if (net === 0) continue;
    const line = {
      date: g.vdate,
      ref: `${g.vtype}#${g.vno}/${g.fyCode}`,
      desc: `${g.accCode} — ${desc}${g.narration ? ` · ${g.narration}` : ""}`,
      amount: net,
    };
    if (bucket === "materials") {
      // Avoid double-counting: GL debits to a stores-consumption account
      // already appear in materialsIssuedRows. Keep the store-side number as
      // truth and skip this GL line.
      continue;
    } else if (bucket === "labour") {
      labour.total += net;
      labour.lines.push(line);
    } else if (bucket === "overhead") {
      overheads.total += net;
      overheads.lines.push(line);
    } else {
      unclassified.total += net;
      unclassified.lines.push(line);
    }
  }

  const totalCost = materials.total + labour.total + overheads.total;
  const selectedCc = hasCc ? ccMap.get(ccCode) : null;
  const selectedCcLabel = selectedCc
    ? `${selectedCc.code} — ${selectedCc.description}`
    : "";

  // Rollup: also include child cost centers? For now only the exact cc.
  // Users can pick a leaf; higher-level rollups can be added later.

  const summary = [
    { key: "materials", label: "Materials Issued", amount: materials.total },
    { key: "labour", label: "Direct Labour", amount: labour.total },
    { key: "overheads", label: "Overheads", amount: overheads.total },
    { key: "total", label: "Total Cost", amount: totalCost, bold: true },
  ];

  const allLines = [
    ...materials.lines.map((l) => ({ bucket: "Materials", ...l })),
    ...labour.lines.map((l) => ({ bucket: "Labour", ...l })),
    ...overheads.lines.map((l) => ({ bucket: "Overheads", ...l })),
    ...unclassified.lines.map((l) => ({ bucket: "Other", ...l })),
  ];

  return (
    <Shell active="fin-project-costing">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Job / Project Costing</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {hasCc
                ? `${selectedCcLabel} · ${from} to ${to}`
                : "Pick a cost center to compute materials, labour, and overheads."}
            </p>
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Roles: gated at ADMIN only for approval workflow. This report is
              read-only for any signed-in user.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={allLines}
              columns={[
                { key: "bucket", label: "Bucket" },
                { key: "date", label: "Date" },
                { key: "ref", label: "Ref" },
                { key: "desc", label: "Description" },
                { key: "amount", label: "Amount" },
              ]}
              filename="project-costing"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Job / Project Costing</h1>
          <div className="mono text-[12px] mt-2">
            Cost Center: {selectedCcLabel || "(all)"} · {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print"
        >
          <div className="sm:col-span-5">
            <label className="label block mb-1">Cost Center</label>
            <Combobox
              name="cc"
              options={ccOptions}
              defaultValue={hasCc ? String(ccCode) : ""}
              placeholder="Select cost center…"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="sm:col-span-1 flex gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
          </div>
        </form>

        {!hasCc && (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            Choose a cost center above to see its costing breakdown.
          </div>
        )}

        {hasCc && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8">
              {summary.map((s) => (
                <div key={s.key} className="bg-white p-4">
                  <div
                    className={
                      s.bold ? "mono text-2xl font-bold" : "mono text-xl font-bold"
                    }
                  >
                    {fmt(s.amount)}
                  </div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {unclassified.total !== 0 && (
              <div className="border border-black bg-gray-50 px-3 py-2 mb-6 text-[12px]">
                Note: {fmt(unclassified.total)} of ledger entries tagged to this
                cost center do not sit under a P&amp;L head (code_head 6/7) and
                were excluded from the totals. They are shown in the detail
                table under &quot;Other&quot;.
              </div>
            )}

            <h2 className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
              Detail
            </h2>
            <div className="overflow-x-auto mb-8">
              <table>
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th>Date</th>
                    <th>Ref</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {allLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-[var(--muted)] py-6">
                        No activity for this cost center in the selected period.
                      </td>
                    </tr>
                  ) : (
                    allLines.map((l, i) => (
                      <tr key={i}>
                        <td className="text-[12px]">{l.bucket}</td>
                        <td className="mono text-[12px]">{l.date}</td>
                        <td className="mono text-[12px]">{l.ref}</td>
                        <td className="text-[12px]">{l.desc}</td>
                        <td className="mono text-[12px] text-right">
                          {fmt(l.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {allLines.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                      <td colSpan={4}>TOTAL COST</td>
                      <td className="mono text-right">{fmt(totalCost)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <div className="text-[11px] text-[var(--muted)] mb-2">
              Sources: Materials from store_demand_detail (cc_code = {ccCode}).
              Labour and overheads from trans_detail (cc_code = {ccCode}),
              routed by chart_of_accounts.code_head and description keywords
              ({DIRECT_LABOUR_MARKERS.join(", ")} → labour). Returns are only
              included when they carry a cost centre; store returns currently
              do not, so they are skipped per spec.
            </div>
            <div className="text-[11px] text-[var(--muted)]">
              Unit metric: no quantity is tracked at the cost-centre level, so
              per-unit cost is not computed.
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
