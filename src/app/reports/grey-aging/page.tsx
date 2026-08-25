import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { today as todayFn } from "@/lib/time";

export const dynamic = "force-dynamic";

type Bucket = "0-30" | "31-60" | "61-90" | "90+";

const BUCKETS: { key: Bucket; label: string; cls: string; min: number; max: number }[] = [
  { key: "0-30", label: "0-30 days", cls: "bg-green-100 text-green-900", min: 0, max: 30 },
  { key: "31-60", label: "31-60 days", cls: "bg-yellow-100 text-yellow-900", min: 31, max: 60 },
  { key: "61-90", label: "61-90 days", cls: "bg-orange-100 text-orange-900", min: 61, max: 90 },
  { key: "90+", label: "91+ days", cls: "bg-red-100 text-red-900", min: 91, max: Infinity },
];

function bucketFor(days: number): Bucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function daysBetween(a: string, b: string): number {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  if (!Number.isFinite(ma) || !Number.isFinite(mb)) return 0;
  return Math.max(0, Math.round((mb - ma) / 86400000));
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function GreyAgingPage() {
  const rows = await db
    .select()
    .from(schema.inventoryOpening)
    .where(and(eq(schema.inventoryOpening.itemType, "GREY"), eq(schema.inventoryOpening.status, "A")))
    .orderBy(schema.inventoryOpening.entryDate);

  const [maxRow] = await db
    .select({ maxDate: sql<string>`MAX(${schema.inventoryOpening.entryDate})` })
    .from(schema.inventoryOpening)
    .where(and(eq(schema.inventoryOpening.itemType, "GREY"), eq(schema.inventoryOpening.status, "A")));

  const today = maxRow?.maxDate ? addDays(maxRow.maxDate, 1) : todayFn();

  const enriched = rows.map((r) => {
    const days = r.entryDate ? daysBetween(r.entryDate, today) : 0;
    return { row: r, days, bucket: bucketFor(days) };
  });

  const bucketStats = BUCKETS.map((b) => {
    const items = enriched.filter((e) => e.bucket === b.key);
    return {
      ...b,
      count: items.length,
      qty: items.reduce((s, e) => s + (e.row.openingQty ?? 0), 0),
    };
  });

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="grey-aging">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">Grey Stock Aging</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {enriched.length} lots &middot; reference date <span className="mono">{today}</span>
            </p>
          </div>
          <PrintButton label="Print Report" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          {bucketStats.map((b) => (
            <div key={b.key} className="bg-white p-6">
              <div className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mb-3 ${b.cls}`}>
                {b.label}
              </div>
              <div className="stat-value">{b.count}</div>
              <div className="stat-label">Lots</div>
              <div className="mono text-[13px] mt-3 pt-3 border-t border-[var(--border-light)]">
                {fmt(b.qty)} <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider ml-1">mtr</span>
              </div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Lot No</th>
                <th>Product</th>
                <th>Location</th>
                <th className="text-right">Qty (mtr)</th>
                <th>Entry Date</th>
                <th className="text-right">Days in Stock</th>
                <th>Age Band</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((e) => {
                const b = BUCKETS.find((x) => x.key === e.bucket)!;
                return (
                  <tr key={e.row.id}>
                    <td className="mono font-bold">{e.row.itemCode}</td>
                    <td className="text-[13px]">{e.row.productName ?? e.row.description ?? "-"}</td>
                    <td className="text-[13px]">{e.row.location ?? "-"}</td>
                    <td className="text-right mono">{fmt(e.row.openingQty ?? 0)}</td>
                    <td className="mono text-[13px]">{e.row.entryDate ?? "-"}</td>
                    <td className="text-right mono">{e.days}</td>
                    <td>
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-bold uppercase ${b.cls}`}>
                        {b.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {enriched.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">
                    No grey lots on file.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
