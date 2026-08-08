import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, or, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

type StockRow = {
  id: number;
  vNo: string;
  vDate: string;
  party: string | null;
  count: string | null;
  brand: string | null;
  bags: number | null;
  cons: number | null;
  lbs: number | null;
  rate: number | null;
  amount: number | null;
};

export default async function YarnStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; code?: string; description?: string }>;
}) {
  const params = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const code = params.code?.trim() ?? "";
  const description = params.description?.trim() ?? "";

  const conditions = [
    gte(schema.extYarnPurVoucher.vDate, from),
    lte(schema.extYarnPurVoucher.vDate, to),
  ];

  if (code) {
    const pat = `%${escLike(code)}%`;
    conditions.push(sql`${schema.extYarnPurVoucherLine.count} LIKE ${pat} ESCAPE '\\'`);
  }
  if (description) {
    const pat = `%${escLike(description)}%`;
    const brandLike = sql`${schema.extYarnPurVoucherLine.brand} LIKE ${pat} ESCAPE '\\'`;
    const partyLike = sql`${schema.extYarnPurVoucher.party} LIKE ${pat} ESCAPE '\\'`;
    conditions.push(or(brandLike, partyLike)!);
  }

  const joined = await db
    .select({
      id: schema.extYarnPurVoucherLine.id,
      vNo: schema.extYarnPurVoucher.vNo,
      vDate: schema.extYarnPurVoucher.vDate,
      party: schema.extYarnPurVoucher.party,
      count: schema.extYarnPurVoucherLine.count,
      brand: schema.extYarnPurVoucherLine.brand,
      bags: schema.extYarnPurVoucherLine.bag,
      cons: schema.extYarnPurVoucherLine.con,
      lbs: schema.extYarnPurVoucherLine.lbs,
      rate: schema.extYarnPurVoucherLine.rate,
      qty: schema.extYarnPurVoucherLine.qty,
    })
    .from(schema.extYarnPurVoucher)
    .innerJoin(
      schema.extYarnPurVoucherLine,
      sql`${schema.extYarnPurVoucherLine.voucherId} = ${schema.extYarnPurVoucher.id}`
    )
    .where(and(...conditions))
    .orderBy(sql`v_date DESC, ext_yarn_pur_voucher.id DESC`);

  const rows: StockRow[] = joined.map((r) => ({
    id: r.id,
    vNo: r.vNo,
    vDate: r.vDate,
    party: r.party,
    count: r.count,
    brand: r.brand,
    bags: r.bags,
    cons: r.cons,
    lbs: r.lbs,
    rate: r.rate,
    amount: r.rate != null && r.lbs != null ? r.rate * r.lbs : null,
  }));

  const uniqueVouchers = new Set(rows.map((r) => r.vNo)).size;
  const totalBags = rows.reduce((s, r) => s + (r.bags ?? 0), 0);
  const totalLbs = rows.reduce((s, r) => s + (r.lbs ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  const excelRows = rows.map((r) => ({
    ...r,
    party: r.party ?? "",
    count: r.count ?? "",
    brand: r.brand ?? "",
  }));

  return (
    <Shell active="ext-r-yarnstock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Stock</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} lines &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "party", label: "Party" },
                { key: "count", label: "Count" },
                { key: "brand", label: "Brand" },
                { key: "bags", label: "Bags" },
                { key: "cons", label: "Cons" },
                { key: "lbs", label: "Lbs" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
              ]}
              filename="yarn-stock"
              sheetName="YarnStock"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Yarn Stock</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Code</label>
            <input type="text" name="code" defaultValue={code} className="input-box mono" placeholder="Count Code" />
          </div>
          <div>
            <label className="label block mb-1">Description</label>
            <input type="text" name="description" defaultValue={description} className="input-box" placeholder="Brand / Party" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/external/reports/yarn-stock" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(uniqueVouchers)}</div>
            <div className="stat-label">Total Vouchers</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalBags)}</div>
            <div className="stat-label">Total Bags</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalLbs)}</div>
            <div className="stat-label">Total Lbs</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
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
                <th className="text-right">Cons</th>
                <th className="text-right">Lbs</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td className="mono text-[13px]">{r.vDate}</td>
                    <td className="text-[13px]">{r.party ?? "-"}</td>
                    <td className="mono text-[13px]">{r.count ?? "-"}</td>
                    <td className="text-[13px]">{r.brand ?? "-"}</td>
                    <td className="mono text-right">{r.bags != null ? fmt(r.bags) : "-"}</td>
                    <td className="mono text-right">{r.cons != null ? fmt(r.cons) : "-"}</td>
                    <td className="mono text-right">{r.lbs != null ? fmt(r.lbs) : "-"}</td>
                    <td className="mono text-right">{r.rate != null ? fmt(r.rate) : "-"}</td>
                    <td className="mono text-right font-bold">{r.amount != null ? fmt(r.amount) : "-"}</td>
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
