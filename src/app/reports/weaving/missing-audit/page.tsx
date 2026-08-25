import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { sixMonthsAgo, todayIso } from "../../_shared";

export const dynamic = "force-dynamic";

const NULL_OR_EMPTY = (col: unknown) =>
  sql`(${col} IS NULL OR TRIM(${col}) = '')`;

export default async function MissingAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();

  // Section A — production entries with no shift-incharge stamped
  const prodMissing = await db
    .select({
      id: schema.intDailyProduction.id,
      vNo: schema.intDailyProduction.vNo,
      vDate: schema.intDailyProduction.vDate,
      shedNo: schema.intDailyProduction.shedNo,
      designNo: schema.intDailyProduction.designNo,
      setNo: schema.intDailyProduction.setNo,
      tm: schema.intDailyProduction.shiftInchargeTm,
      pm: schema.intDailyProduction.shiftInchargePm,
      a: schema.intDailyProduction.shiftInchargeA,
      b: schema.intDailyProduction.shiftInchargeB,
      c: schema.intDailyProduction.shiftInchargeC,
    })
    .from(schema.intDailyProduction)
    .where(
      and(
        gte(schema.intDailyProduction.vDate, from),
        lte(schema.intDailyProduction.vDate, to),
        NULL_OR_EMPTY(schema.intDailyProduction.shiftInchargeTm),
        NULL_OR_EMPTY(schema.intDailyProduction.shiftInchargePm),
        NULL_OR_EMPTY(schema.intDailyProduction.shiftInchargeA),
        NULL_OR_EMPTY(schema.intDailyProduction.shiftInchargeB),
        NULL_OR_EMPTY(schema.intDailyProduction.shiftInchargeC),
      ),
    )
    .orderBy(schema.intDailyProduction.vDate);

  // Section B — vouchers with any line missing audit stamp (statusOk NULL/empty)
  const voucherMissing = await db
    .selectDistinct({
      id: schema.transMain.id,
      fyCode: schema.transMain.fyCode,
      vtype: schema.transMain.vtype,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      accCode: schema.transMain.accCode,
      narration: schema.transMain.narration,
    })
    .from(schema.transMain)
    .innerJoin(
      schema.transDetail,
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
        NULL_OR_EMPTY(schema.transDetail.statusOk),
      ),
    )
    .orderBy(schema.transMain.vdate);

  const prodExcel = prodMissing.map((r) => ({
    vNo: r.vNo,
    vDate: r.vDate,
    shedNo: r.shedNo ?? "",
    designNo: r.designNo ?? "",
    setNo: r.setNo ?? "",
  }));

  const vchExcel = voucherMissing.map((r) => ({
    vtype: r.vtype,
    vno: r.vno,
    vdate: r.vdate,
    accCode: r.accCode ?? "",
    narration: r.narration ?? "",
  }));

  return (
    <Shell active="w-missing-audit">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Missing Audit / Supervisor</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {prodMissing.length} unsigned production &middot; {voucherMissing.length} unaudited vouchers &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={prodExcel}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "shedNo", label: "Shed" },
                { key: "designNo", label: "Design" },
                { key: "setNo", label: "Set" },
              ]}
              filename="missing-supervisor"
            />
            <ExcelExportButton
              rows={vchExcel}
              columns={[
                { key: "vtype", label: "V.Type" },
                { key: "vno", label: "V.No" },
                { key: "vdate", label: "V.Date" },
                { key: "accCode", label: "Acc Code" },
                { key: "narration", label: "Narration" },
              ]}
              filename="missing-audit-vouchers"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Missing Audit / Supervisor</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="sm:col-span-2 flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/missing-audit" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <section className="mb-12">
          <div className="section-title">A. Production Entries Missing Supervisor</div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Shed</th>
                  <th>Design</th>
                  <th>Set</th>
                </tr>
              </thead>
              <tbody>
                {prodMissing.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-[var(--muted)] py-8">
                      All production entries have a supervisor stamped in range.
                    </td>
                  </tr>
                ) : (
                  prodMissing.map((r) => (
                    <tr key={r.id}>
                      <td className="mono font-bold">{r.vNo}</td>
                      <td className="mono">{r.vDate}</td>
                      <td className="mono">{r.shedNo ?? "-"}</td>
                      <td className="mono">{r.designNo ?? "-"}</td>
                      <td className="mono">{r.setNo ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-12">
          <div className="section-title">B. Vouchers Missing Audit Stamp (any line statusOk empty)</div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>V.Type</th>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Acc Code</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                {voucherMissing.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-[var(--muted)] py-8">
                      All vouchers audited in range.
                    </td>
                  </tr>
                ) : (
                  voucherMissing.map((r) => (
                    <tr key={r.id}>
                      <td className="mono font-bold">{r.vtype}</td>
                      <td className="mono">{r.vno}</td>
                      <td className="mono">{r.vdate}</td>
                      <td className="mono">{r.accCode ?? "-"}</td>
                      <td className="text-[13px]">{r.narration ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Shell>
  );
}
