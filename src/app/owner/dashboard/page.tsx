import { Shell } from "@/components/shell";
import { Timestamp } from "@/components/timestamp";
import { db, schema } from "@/db";
import { sql, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

export default async function OwnerDashboardPage() {
  const [maxDateRow] = await db
    .select({ d: sql<string>`max(production_date)` })
    .from(schema.dailyProduction);
  const today = maxDateRow?.d ?? null;

  const [todaySumRow] = today
    ? await db
        .select({
          meters: sql<number>`coalesce(sum(meters), 0)`,
          rejection: sql<number>`coalesce(sum(rejection), 0)`,
          totalPicks: sql<number>`coalesce(sum(picks), 0)`,
          effSum: sql<number>`coalesce(sum(case when ${schema.dailyProduction.efficiency} is not null then ${schema.dailyProduction.meters} * ${schema.dailyProduction.efficiency} end), 0)`,
          metersSum: sql<number>`coalesce(sum(case when ${schema.dailyProduction.efficiency} is not null then ${schema.dailyProduction.meters} end), 0)`,
        })
        .from(schema.dailyProduction)
        .where(eq(schema.dailyProduction.productionDate, today))
    : [{ meters: 0, rejection: 0, totalPicks: 0, effSum: 0, metersSum: 0 }];

  const todayMeters = todaySumRow?.meters ?? 0;
  const todayRejection = todaySumRow?.rejection ?? 0;
  const weightedEff =
    (todaySumRow?.metersSum ?? 0) > 0
      ? (todaySumRow!.effSum ?? 0) / (todaySumRow!.metersSum ?? 1)
      : 0;

  const [runningRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.looms)
    .where(eq(schema.looms.statusWrk, "RUNNING"));
  const loomsRunning = runningRow?.c ?? 0;

  const [totalLoomsRow] = await db
    .select({ c: sql<number>`count(*)` })
    .from(schema.looms);
  const totalLooms = totalLoomsRow?.c ?? 0;

  const recentDespatch = await db
    .select({
      id: schema.greyDespatch.id,
      despatchNo: schema.greyDespatch.despatchNo,
      despatchDate: schema.greyDespatch.despatchDate,
      party: schema.greyDespatch.party,
      meters: schema.greyDespatch.meters,
      rolls: schema.greyDespatch.rolls,
    })
    .from(schema.greyDespatch)
    .orderBy(desc(schema.greyDespatch.despatchDate), desc(schema.greyDespatch.id))
    .limit(5);

  const contractsBreakdown = await db
    .select({
      type: schema.contracts.type,
      c: sql<number>`count(*)`,
      amount: sql<number>`coalesce(sum(amount), 0)`,
    })
    .from(schema.contracts)
    .where(eq(schema.contracts.status, "A"))
    .groupBy(schema.contracts.type);

  const inventoryValue = await db
    .select({
      itemType: schema.inventoryOpening.itemType,
      amount: sql<number>`coalesce(sum(opening_amount), 0)`,
      qty: sql<number>`coalesce(sum(opening_qty), 0)`,
    })
    .from(schema.inventoryOpening)
    .where(eq(schema.inventoryOpening.status, "A"))
    .groupBy(schema.inventoryOpening.itemType);

  const totalInv = inventoryValue.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalContracts = contractsBreakdown.reduce((s, r) => s + (r.c ?? 0), 0);

  return (
    <Shell active="owner-dash">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
          <div>
            <h1 className="page-title">Executive Overview</h1>
            <p className="text-[12px] text-[var(--muted)] mt-2 uppercase tracking-[0.1em]">
              Read-only summary for {today ?? "no data"}
            </p>
          </div>
          <Timestamp />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-4 sm:p-5">
            <div className="mono text-2xl sm:text-3xl font-bold tracking-tight">
              {fmt(todayMeters)}
            </div>
            <div className="stat-label">Today Meters</div>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <div className="mono text-2xl sm:text-3xl font-bold tracking-tight">
              {weightedEff > 0 ? `${fmt2(weightedEff)}%` : "-"}
            </div>
            <div className="stat-label">Avg Efficiency</div>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <div className="mono text-2xl sm:text-3xl font-bold tracking-tight">
              {loomsRunning}
              <span className="text-[var(--muted)] text-lg">/{totalLooms}</span>
            </div>
            <div className="stat-label">Looms Running</div>
          </div>
          <div className="bg-white p-4 sm:p-5">
            <div className="mono text-2xl sm:text-3xl font-bold tracking-tight">
              {fmt(todayRejection)}
            </div>
            <div className="stat-label">Rejection Today</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="border border-black">
            <div className="border-b border-black bg-black text-white px-4 py-2">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold">
                Recent Despatch
              </div>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Party</th>
                    <th className="text-right">Meters</th>
                    <th className="text-right">Rolls</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDespatch.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-[var(--muted)] py-6">
                        No despatch data
                      </td>
                    </tr>
                  ) : (
                    recentDespatch.map((d) => (
                      <tr key={d.id}>
                        <td className="mono text-[12px]">{d.despatchDate}</td>
                        <td className="text-[13px]">{d.party}</td>
                        <td className="mono text-right">{fmt(d.meters ?? 0)}</td>
                        <td className="mono text-right">{d.rolls ?? 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border border-black">
            <div className="border-b border-black bg-black text-white px-4 py-2 flex justify-between">
              <div className="text-[11px] uppercase tracking-[0.12em] font-semibold">
                Active Contracts
              </div>
              <div className="mono text-[11px]">{totalContracts}</div>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="text-right">Count</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {contractsBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-[var(--muted)] py-6">
                        No active contracts
                      </td>
                    </tr>
                  ) : (
                    contractsBreakdown.map((c) => (
                      <tr key={c.type}>
                        <td>
                          <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase mono">
                            {c.type}
                          </span>
                        </td>
                        <td className="mono text-right">{c.c}</td>
                        <td className="mono text-right">{fmt(c.amount ?? 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="border border-black">
          <div className="border-b border-black bg-black text-white px-4 py-2 flex justify-between">
            <div className="text-[11px] uppercase tracking-[0.12em] font-semibold">
              Inventory Value
            </div>
            <div className="mono text-[11px]">{fmt(totalInv)}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black">
            {inventoryValue.length === 0 ? (
              <div className="bg-white p-6 text-center text-[var(--muted)] col-span-3">
                No inventory data
              </div>
            ) : (
              inventoryValue.map((i) => (
                <div key={i.itemType} className="bg-white p-4 sm:p-5">
                  <div className="stat-label">{i.itemType}</div>
                  <div className="mono text-xl sm:text-2xl font-bold mt-1">
                    {fmt(i.amount ?? 0)}
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-1 mono">
                    QTY {fmt(i.qty ?? 0)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
