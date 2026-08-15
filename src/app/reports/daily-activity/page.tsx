import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function DailyActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || new Date().toISOString().split("T")[0];

  const vouchers = await db
    .select({
      vtype: schema.transMain.vtype,
      vno: schema.transMain.vno,
      fyCode: schema.transMain.fyCode,
      narration: schema.transMain.narration,
    })
    .from(schema.transMain)
    .where(eq(schema.transMain.vdate, date))
    .orderBy(schema.transMain.vtype, schema.transMain.vno);

  const detailRows = vouchers.length > 0
    ? await db
        .select({
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          fyCode: schema.transDetail.fyCode,
          totalDebit: sql<number>`sum(debit)`,
          totalCredit: sql<number>`sum(credit)`,
        })
        .from(schema.transDetail)
        .where(
          eq(
            schema.transDetail.fyCode,
            vouchers[0].fyCode
          )
        )
        .groupBy(schema.transDetail.fyCode, schema.transDetail.vtype, schema.transDetail.vno)
    : [];

  const detailMap = new Map(
    detailRows.map((d) => [`${d.fyCode}-${d.vtype}-${d.vno}`, d])
  );

  const rows = vouchers.map((v) => {
    const d = detailMap.get(`${v.fyCode}-${v.vtype}-${v.vno}`);
    return {
      ...v,
      totalDebit: d?.totalDebit ?? 0,
      totalCredit: d?.totalCredit ?? 0,
    };
  });

  const grouped = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.vtype ?? "OTHER";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  const grandDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const grandCredit = rows.reduce((s, r) => s + r.totalCredit, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="daily-activity">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Daily Activity Report</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} vouchers on {date}
          </p>
        </div>

        <form className="flex items-center gap-4 mb-10">
          <label className="label" style={{ marginBottom: 0 }}>
            Date
          </label>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="input-box mono"
          />
          <button type="submit" className="btn btn-sm">
            Filter
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Vouchers</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(grandDebit)}</div>
            <div className="stat-label">Total Debit</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(grandCredit)}</div>
            <div className="stat-label">Total Credit</div>
          </div>
        </div>

        {[...grouped.entries()].map(([type, items]) => (
          <div key={type} className="mb-10">
            <div className="section-title">{type}</div>
            <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>V.No</th>
                  <th>Narration</th>
                  <th className="text-right">Total Debit</th>
                  <th className="text-right">Total Credit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={`${r.vtype}-${r.vno}`}>
                    <td>
                      <span
                        className="inline-block text-[11px] px-2 py-0.5 border border-black uppercase"
                        style={{ letterSpacing: "0.05em" }}
                      >
                        {r.vtype}
                      </span>
                    </td>
                    <td className="mono">{r.vno}</td>
                    <td>{r.narration}</td>
                    <td className="mono text-right">{fmt(r.totalDebit)}</td>
                    <td className="mono text-right">{fmt(r.totalCredit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ))}

        <div
          className="flex justify-between px-2 py-3 mono"
          style={{ borderTop: "2px solid black", fontWeight: 700 }}
        >
          <span>Daily Totals</span>
          <span className="flex gap-16">
            <span>{fmt(grandDebit)}</span>
            <span>{fmt(grandCredit)}</span>
          </span>
        </div>
      </div>
    </Shell>
  );
}
