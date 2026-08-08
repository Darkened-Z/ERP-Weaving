import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VouchersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const activeType = params.type || null;

  const voucherTypes = await db.select().from(schema.voucherTypes).orderBy(schema.voucherTypes.sortOrder);

  const typeCounts = await db
    .select({
      vtype: schema.transMain.vtype,
      count: sql<number>`count(*)`,
    })
    .from(schema.transMain)
    .groupBy(schema.transMain.vtype);

  const countMap = new Map(typeCounts.map((tc) => [tc.vtype, tc.count]));

  let vouchers: {
    fyCode: string;
    vtype: string;
    vno: number;
    vdate: string;
    narration: string | null;
    totalDebit: number;
  }[] = [];

  if (activeType) {
    vouchers = await db
      .select({
        fyCode: schema.transMain.fyCode,
        vtype: schema.transMain.vtype,
        vno: schema.transMain.vno,
        vdate: schema.transMain.vdate,
        narration: schema.transMain.narration,
        totalDebit: sql<number>`(SELECT coalesce(sum(debit), 0) FROM trans_detail WHERE fy_code = trans_main.fy_code AND vtype = trans_main.vtype AND vno = trans_main.vno)`,
      })
      .from(schema.transMain)
      .where(eq(schema.transMain.vtype, activeType))
      .orderBy(sql`vdate DESC, vno DESC`);
  }

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="vouchers">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">Vouchers</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {voucherTypes.length} types &middot; {typeCounts.reduce((s, tc) => s + tc.count, 0)} total entries
            </p>
          </div>
          <Link href="/vouchers/new" className="btn btn-sm">
            + New Voucher
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <Link
            href="/vouchers"
            className={`text-[11px] uppercase tracking-[0.06em] font-semibold px-3 py-1.5 border transition-colors ${
              !activeType ? "bg-black text-white border-black" : "border-[var(--border-light)] hover:border-black"
            }`}
          >
            All
          </Link>
          {voucherTypes.map((vt) => (
            <Link
              key={vt.vtype}
              href={`/vouchers?type=${vt.vtype}`}
              className={`text-[11px] uppercase tracking-[0.06em] font-semibold px-3 py-1.5 border transition-colors ${
                activeType === vt.vtype
                  ? "bg-black text-white border-black"
                  : "border-[var(--border-light)] hover:border-black"
              }`}
            >
              {vt.vtype}
              {countMap.get(vt.vtype) ? (
                <span className="ml-1 opacity-50">{countMap.get(vt.vtype)}</span>
              ) : null}
            </Link>
          ))}
        </div>

        {activeType ? (
          <div>
            <div className="section-title">
              {voucherTypes.find((vt) => vt.vtype === activeType)?.description ?? activeType}
            </div>
            {vouchers.length === 0 ? (
              <p className="text-[var(--muted)] text-[14px] py-8">No vouchers found for this type.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>V.No</th>
                    <th>FY</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={`${v.fyCode}-${v.vtype}-${v.vno}`}>
                      <td className="mono text-[13px]">{v.vdate}</td>
                      <td className="mono font-semibold">{v.vno}</td>
                      <td className="mono text-[13px] text-[var(--muted)]">{v.fyCode}</td>
                      <td>{v.narration}</td>
                      <td className="mono text-right font-medium">{formatNum(v.totalDebit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div>
            <div className="section-title">Voucher Types</div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th className="text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {voucherTypes.map((vt) => (
                  <tr key={vt.vtype}>
                    <td>
                      <Link
                        href={`/vouchers?type=${vt.vtype}`}
                        className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase hover:bg-black hover:text-white transition-colors"
                      >
                        {vt.vtype}
                      </Link>
                    </td>
                    <td>{vt.description}</td>
                    <td className="mono text-right">{countMap.get(vt.vtype) ?? 0}</td>
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
