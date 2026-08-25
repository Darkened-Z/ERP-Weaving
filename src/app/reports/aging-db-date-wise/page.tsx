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

const bucketFor = (age: number) => BUCKETS.find((b) => age >= b.from && age <= b.to)?.label ?? "-";

export default async function AgingDebtorsDateWisePage({
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
      vtype: schema.transDetail.vtype,
      vno: schema.transDetail.vno,
      vdate: schema.transMain.vdate,
      dueDate: schema.transMain.dueDate,
      narration: schema.transDetail.narration,
      mainNarration: schema.transMain.narration,
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

  type Line = {
    code: string;
    name: string;
    vdate: string;
    vtype: string;
    vno: number;
    narration: string;
    amount: number;
    age: number;
    bucket: string;
  };

  const lines: Line[] = [];
  const partyRunning = new Map<string, number>();

  const sorted = details
    .filter((d) => d.vdate <= asOf && debtors.has(d.accCode))
    .sort((a, b) => a.accCode.localeCompare(b.accCode) || a.vdate.localeCompare(b.vdate));

  for (const d of sorted) {
    const amount = (d.debit ?? 0) - (d.credit ?? 0);
    if (amount === 0) continue;
    const acc = debtors.get(d.accCode)!;
    const age = daysBetween(d.vdate, asOf);
    lines.push({
      code: d.accCode,
      name: acc.description ?? "",
      vdate: d.vdate,
      vtype: d.vtype,
      vno: d.vno,
      narration: d.narration || d.mainNarration || "",
      amount,
      age,
      bucket: bucketFor(age),
    });
    partyRunning.set(d.accCode, (partyRunning.get(d.accCode) ?? 0) + amount);
  }

  const groupedMap = new Map<string, { name: string; lines: Line[]; total: number }>();
  for (const l of lines) {
    if (Math.abs(partyRunning.get(l.code) ?? 0) < 0.01) continue;
    let g = groupedMap.get(l.code);
    if (!g) {
      g = { name: l.name, lines: [], total: partyRunning.get(l.code) ?? 0 };
      groupedMap.set(l.code, g);
    }
    g.lines.push(l);
  }

  const groups = [...groupedMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  const grandTotal = [...groupedMap.values()].reduce((s, g) => s + g.total, 0);

  const excelRows = lines
    .filter((l) => Math.abs(partyRunning.get(l.code) ?? 0) > 0.01)
    .map((l) => ({
      code: l.code,
      party: l.name,
      vdate: l.vdate,
      vtype: l.vtype,
      vno: l.vno,
      narration: l.narration,
      age: l.age,
      bucket: l.bucket,
      amount: l.amount,
    }));

  return (
    <Shell active="fin-aging-db-dw">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Debtors Aging — Date-wise</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              As of {asOf} · {groups.length} debtors · {lines.length} entries
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "code", label: "Party Code" },
                { key: "party", label: "Party" },
                { key: "vdate", label: "V.Date" },
                { key: "vtype", label: "V.Type" },
                { key: "vno", label: "V.No" },
                { key: "narration", label: "Narration" },
                { key: "age", label: "Age" },
                { key: "bucket", label: "Bucket" },
                { key: "amount", label: "Amount" },
              ]}
              filename="debtors-aging-date-wise"
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{groups.length}</div>
            <div className="stat-label">Debtors</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{lines.length}</div>
            <div className="stat-label">Entries</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(grandTotal)}</div>
            <div className="stat-label">Total Receivable</div>
          </div>
        </div>

        {groups.map(([code, g]) => (
          <div key={code} className="mb-8">
            <div className="section-title">
              {g.name} <span className="mono text-[12px] text-[var(--muted)]">{code}</span>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>V.Date</th>
                    <th>V.Type</th>
                    <th>V.No</th>
                    <th>Narration</th>
                    <th className="text-right">Age</th>
                    <th>Bucket</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l, i) => (
                    <tr key={`${l.vtype}-${l.vno}-${i}`}>
                      <td className="mono text-[13px]">{l.vdate}</td>
                      <td>
                        <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                          {l.vtype}
                        </span>
                      </td>
                      <td className="mono">{l.vno}</td>
                      <td className="text-[13px]">{l.narration}</td>
                      <td className="mono text-right">{l.age}</td>
                      <td className="mono text-[12px]">{l.bucket}</td>
                      <td className="mono text-right">{fmt(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                    <td colSpan={6}>Party Total</td>
                    <td className="mono text-right">{fmt(g.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="text-center text-[var(--muted)] py-10">No debtor balances as of {asOf}.</div>
        )}

        {groups.length > 0 && (
          <div
            className="flex justify-between items-center px-4 py-4 mono text-[15px]"
            style={{ borderTop: "3px double black", borderBottom: "3px double black", fontWeight: 700 }}
          >
            <span className="uppercase tracking-[0.06em]">Grand Total Receivable</span>
            <span>{fmt(grandTotal)}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}
