import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { sql, and, gte, lte, isNotNull } from "drizzle-orm";
import { toKarachiDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

function isoWeekBounds(w: string): { from: string; to: string } | null {
  const m = w.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const iso = new Date(simple);
  if (dow <= 4) iso.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else iso.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const from = toKarachiDate(iso);
  const end = new Date(iso);
  end.setUTCDate(iso.getUTCDate() + 6);
  const to = toKarachiDate(end);
  return { from, to };
}

function daysBackFrom(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - (n - 1));
  return toKarachiDate(dt);
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; from?: string; to?: string; rate?: string }>;
}) {
  const params = await searchParams;
  const parsed = parseFloat(params.rate ?? "");
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : 18;

  let from = params.from;
  let to = params.to;

  if (!from || !to) {
    if (params.week) {
      const b = isoWeekBounds(params.week);
      if (b) {
        from = b.from;
        to = b.to;
      }
    }
  }

  if (!from || !to) {
    const [maxRow] = await db
      .select({ d: sql<string>`max(production_date)` })
      .from(schema.dailyProduction);
    const maxD = maxRow?.d;
    if (maxD) {
      if (!to) to = maxD;
      if (!from && to) from = daysBackFrom(to, 7);
    }
  }

  const conditions = [
    isNotNull(schema.dailyProduction.weaverName),
    sql`trim(${schema.dailyProduction.weaverName}) != ''`,
  ];
  if (from) conditions.push(gte(schema.dailyProduction.productionDate, from));
  if (to) conditions.push(lte(schema.dailyProduction.productionDate, to));

  const rows = await db
    .select({
      weaver: schema.dailyProduction.weaverName,
      meters: sql<number>`coalesce(sum(meters), 0)`,
      gradeA: sql<number>`coalesce(sum(grade_a), 0)`,
      gradeB: sql<number>`coalesce(sum(grade_b), 0)`,
      gradeC: sql<number>`coalesce(sum(grade_c), 0)`,
      rejection: sql<number>`coalesce(sum(rejection), 0)`,
    })
    .from(schema.dailyProduction)
    .where(and(...conditions))
    .groupBy(schema.dailyProduction.weaverName);

  const enriched = rows
    .map((r) => {
      const total = (r.gradeA ?? 0) + (r.gradeB ?? 0) + (r.gradeC ?? 0) + (r.rejection ?? 0);
      const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
      return {
        weaver: r.weaver ?? "-",
        meters: r.meters ?? 0,
        amount: (r.meters ?? 0) * rate,
        gradeAPct: pct(r.gradeA ?? 0),
        gradeBPct: pct(r.gradeB ?? 0),
        gradeCPct: pct(r.gradeC ?? 0),
        rejectionPct: pct(r.rejection ?? 0),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const totalMeters = enriched.reduce((s, r) => s + r.meters, 0);
  const totalAmount = enriched.reduce((s, r) => s + r.amount, 0);

  return (
    <Shell active="payroll">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaver Payroll</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} weavers &middot; {from ?? "-"} to {to ?? "-"}
            </p>
          </div>
          <PrintButton />
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Weaver Payroll</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from ?? "-"} to {to ?? "-"} &middot; Rate: Rs. {rate}/mtr
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">From</label>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Rate / Mtr (Rs)</label>
            <input
              type="number"
              step="any"
              name="rate"
              defaultValue={rate}
              className="input-box mono"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{enriched.length}</div>
            <div className="stat-label">Weavers</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalMeters)}</div>
            <div className="stat-label">Total Meters</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalAmount)}</div>
            <div className="stat-label">Gross Payroll</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {rate}</div>
            <div className="stat-label">Rate / Meter</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Weaver</th>
                <th className="text-right">Meters</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th className="text-right">A %</th>
                <th className="text-right">B %</th>
                <th className="text-right">C %</th>
                <th className="text-right">Rej %</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No production data for selected period
                  </td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.weaver}>
                    <td className="text-[13px]">{r.weaver}</td>
                    <td className="mono text-right">{fmt(r.meters)}</td>
                    <td className="mono text-right">{rate}</td>
                    <td className="mono text-right font-bold">{fmt(r.amount)}</td>
                    <td className="mono text-right">{fmt2(r.gradeAPct)}</td>
                    <td className="mono text-right">{fmt2(r.gradeBPct)}</td>
                    <td className="mono text-right">{fmt2(r.gradeCPct)}</td>
                    <td className="mono text-right">{fmt2(r.rejectionPct)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {enriched.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td className="text-[13px]">GRAND TOTAL</td>
                  <td className="mono text-right text-base">{fmt(totalMeters)}</td>
                  <td></td>
                  <td className="mono text-right text-base">Rs {fmt(totalAmount)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
