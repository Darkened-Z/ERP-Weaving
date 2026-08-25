import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

const daysBetween = (a: string, b: string) => {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return Math.floor((t2 - t1) / 86_400_000);
};

const BUCKETS = [
  { key: "b0", label: "0-30", from: 0, to: 30 },
  { key: "b1", label: "31-60", from: 31, to: 60 },
  { key: "b2", label: "61-90", from: 61, to: 90 },
  { key: "b3", label: "91-120", from: 91, to: 120 },
  { key: "b4", label: "120+", from: 121, to: Infinity },
];

export default async function AgingDebtorsPage({
  searchParams,
}: {
  searchParams: Promise<{ asof?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const asOf = params.asof?.trim() || today();

  const details = await db
    .select({
      accCode: schema.transDetail.accCode,
      vdate: schema.transMain.vdate,
      debit: schema.transDetail.debit,
      credit: schema.transDetail.credit,
    })
    .from(schema.transDetail)
    .innerJoin(
      schema.transMain,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    );

  const accounts = await db.select().from(schema.chartOfAccounts);
  const debtors = new Map(
    accounts
      .filter(
        (a) =>
          a.codeHead === "3" &&
          (a.level ?? 0) >= 4 &&
          (a.code ?? "").startsWith("3.05"),
      )
      .map((a) => [a.code, a]),
  );

  type Row = {
    code: string;
    name: string;
    total: number;
    b0: number;
    b1: number;
    b2: number;
    b3: number;
    b4: number;
  };

  const byParty = new Map<string, Row>();

  for (const d of details) {
    if (d.vdate > asOf) continue;
    const code = d.accCode;
    if (!debtors.has(code)) continue;
    const acc = debtors.get(code)!;
    let row = byParty.get(code);
    if (!row) {
      row = { code, name: acc.description ?? "", total: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
      byParty.set(code, row);
    }
    const net = (d.debit ?? 0) - (d.credit ?? 0);
    const age = daysBetween(d.vdate, asOf);
    row.total += net;
    for (const b of BUCKETS) {
      if (age >= b.from && age <= b.to) {
        (row as unknown as Record<string, number>)[b.key] += net;
        break;
      }
    }
  }

  const rows = [...byParty.values()].filter((r) => Math.abs(r.total) > 0.01).sort((a, b) => a.code.localeCompare(b.code));

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      b0: acc.b0 + r.b0,
      b1: acc.b1 + r.b1,
      b2: acc.b2 + r.b2,
      b3: acc.b3 + r.b3,
      b4: acc.b4 + r.b4,
    }),
    { total: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 },
  );

  const excelRows = rows.map((r) => ({
    code: r.code,
    party: r.name,
    b0: r.b0,
    b1: r.b1,
    b2: r.b2,
    b3: r.b3,
    b4: r.b4,
    total: r.total,
  }));

  return (
    <Shell active="fin-aging-db">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Debtors Aging</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              As of {asOf} · {rows.length} debtors
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "code", label: "Party Code" },
                { key: "party", label: "Party" },
                { key: "b0", label: "0-30" },
                { key: "b1", label: "31-60" },
                { key: "b2", label: "61-90" },
                { key: "b3", label: "91-120" },
                { key: "b4", label: "120+" },
                { key: "total", label: "Total" },
              ]}
              filename="debtors-aging"
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8 no-print">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="label block mb-1">As of Date</label>
              <input type="date" name="asof" className="input-box mono" defaultValue={asOf} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">View</button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-6 gap-px bg-black border border-black mb-10">
          {BUCKETS.map((b) => (
            <div key={b.key} className="bg-white p-4">
              <div className="stat-value text-[16px]">
                {fmt((totals as unknown as Record<string, number>)[b.key])}
              </div>
              <div className="stat-label">{b.label} days</div>
            </div>
          ))}
          <div className="bg-white p-4">
            <div className="stat-value text-[16px]">{fmt(totals.total)}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Party Code</th>
                <th>Party</th>
                {BUCKETS.map((b) => (
                  <th key={b.key} className="text-right">{b.label}</th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td>{r.name}</td>
                  {BUCKETS.map((b) => {
                    const v = (r as unknown as Record<string, number>)[b.key];
                    return (
                      <td key={b.key} className="mono text-right">
                        {Math.abs(v) > 0.01 ? fmt(v) : "-"}
                      </td>
                    );
                  })}
                  <td className="mono text-right font-semibold">{fmt(r.total)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-6">
                    No debtor balances.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={2}>Total</td>
                  {BUCKETS.map((b) => (
                    <td key={b.key} className="mono text-right">
                      {fmt((totals as unknown as Record<string, number>)[b.key])}
                    </td>
                  ))}
                  <td className="mono text-right">{fmt(totals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
