import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BankPaymentPage() {
  const vouchers = await db
    .select({
      fyCode: schema.transMain.fyCode,
      vtype: schema.transMain.vtype,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      narration: schema.transMain.narration,
    })
    .from(schema.transMain)
    .where(sql`vtype = 'BP'`)
    .orderBy(sql`vdate DESC`);

  const totals = await db
    .select({
      totalDebit: sql<number>`coalesce(sum(debit), 0)`,
      totalCredit: sql<number>`coalesce(sum(credit), 0)`,
    })
    .from(schema.transDetail)
    .where(sql`vtype = 'BP'`);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="fin-bp">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Bank Payment Vouchers</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {vouchers.length} vouchers
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-5">
            <div className="stat-value">{vouchers.length}</div>
            <div className="stat-label">Vouchers</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{fmt(totals[0]?.totalDebit ?? 0)}</div>
            <div className="stat-label">Total Debit</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">
              {fmt(totals[0]?.totalCredit ?? 0)}
            </div>
            <div className="stat-label">Total Credit</div>
          </div>
        </div>

        {vouchers.length === 0 ? (
          <p className="text-[var(--muted)] text-[14px] py-8">
            No vouchers found.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>V.No</th>
                <th>FY</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={`${v.fyCode}-${v.vtype}-${v.vno}`}>
                  <td className="mono text-[13px]">{v.vdate}</td>
                  <td className="mono">{v.vno}</td>
                  <td className="mono text-[13px] text-[var(--muted)]">
                    {v.fyCode}
                  </td>
                  <td>{v.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
