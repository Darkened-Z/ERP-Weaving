import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
  yarnCountOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function YarnSaleRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    party?: string;
    count?: string;
  }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const count = p.count?.trim() ?? "";

  const [partyOpts, countOpts] = await Promise.all([
    partyByNameOptions(),
    yarnCountOptions(),
  ]);

  const conds = [
    gte(schema.extYarnSalVoucher.vDate, from),
    lte(schema.extYarnSalVoucher.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`${schema.extYarnSalVoucher.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (count) {
    conds.push(eq(schema.extYarnSalVoucherLine.count, count));
  }

  const joined = await db
    .select({
      voucherId: schema.extYarnSalVoucher.id,
      vNo: schema.extYarnSalVoucher.vNo,
      vDate: schema.extYarnSalVoucher.vDate,
      party: schema.extYarnSalVoucher.party,
      count: schema.extYarnSalVoucherLine.count,
      brand: schema.extYarnSalVoucherLine.brand,
      bag: schema.extYarnSalVoucherLine.bag,
      lbs: schema.extYarnSalVoucherLine.lbs,
      rate: schema.extYarnSalVoucherLine.rate,
      amt: schema.extYarnSalVoucherLine.amt,
      lineId: schema.extYarnSalVoucherLine.id,
    })
    .from(schema.extYarnSalVoucher)
    .innerJoin(
      schema.extYarnSalVoucherLine,
      eq(schema.extYarnSalVoucherLine.voucherId, schema.extYarnSalVoucher.id),
    )
    .where(and(...conds))
    .orderBy(schema.extYarnSalVoucher.vDate, schema.extYarnSalVoucher.vNo);

  let running = 0;
  const rows = joined.map((r) => {
    const amt = r.amt ?? 0;
    running += amt;
    return { ...r, amt, running };
  });

  const totBags = rows.reduce((s, r) => s + (r.bag ?? 0), 0);
  const totLbs = rows.reduce((s, r) => s + (r.lbs ?? 0), 0);
  const totAmt = rows.reduce((s, r) => s + r.amt, 0);

  const excelRows = rows.map((r) => ({
    vNo: r.vNo,
    vDate: r.vDate,
    party: r.party ?? "",
    count: r.count ?? "",
    brand: r.brand ?? "",
    bag: r.bag ?? 0,
    lbs: r.lbs ?? 0,
    rate: r.rate ?? 0,
    amt: Math.round(r.amt),
    running: Math.round(r.running),
  }));

  return (
    <Shell active="rpt-yarn-sale-register">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Sale Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} lines &middot; {from} to {to}
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
                { key: "count", label: "Count" },
                { key: "brand", label: "Brand" },
                { key: "bag", label: "Bags" },
                { key: "lbs", label: "Lbs" },
                { key: "rate", label: "Rate" },
                { key: "amt", label: "Amount" },
                { key: "running", label: "Running Total" },
              ]}
              filename="yarn-sale-register"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Yarn Sale Register</h1>
          <div className="mono text-[12px] mt-2">
            {from} to {to}
            {party ? ` · ${party}` : ""}
            {count ? ` · Count ${count}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-6 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Count</label>
            <Combobox name="count" options={countOpts} defaultValue={count} placeholder="All counts" />
          </div>
          <div className="sm:col-span-6 flex gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/yarn/sale-register" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{rows.length}</div>
            <div className="stat-label">Lines</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totBags)}</div>
            <div className="stat-label">Bags</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totLbs)}</div>
            <div className="stat-label">Lbs</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totAmt)}</div>
            <div className="stat-label">Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>V.Date</th>
                <th>Party</th>
                <th>Count</th>
                <th>Brand</th>
                <th className="text-right">Bags</th>
                <th className="text-right">Lbs</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Running</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No yarn sales in range
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.lineId}>
                    <td className="mono font-bold">{r.vNo}</td>
                    <td className="mono">{r.vDate}</td>
                    <td>{r.party ?? "-"}</td>
                    <td className="mono">{r.count ?? "-"}</td>
                    <td>{r.brand ?? "-"}</td>
                    <td className="mono text-right">{fmt(r.bag ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.lbs ?? 0)}</td>
                    <td className="mono text-right">{fmt2(r.rate ?? 0)}</td>
                    <td className="mono text-right">{fmt(r.amt)}</td>
                    <td className="mono text-right">{fmt(r.running)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={5}>Total</td>
                  <td className="mono text-right">{fmt(totBags)}</td>
                  <td className="mono text-right">{fmt2(totLbs)}</td>
                  <td></td>
                  <td className="mono text-right">{fmt(totAmt)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
