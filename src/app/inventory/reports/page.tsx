import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InventoryReportsPage() {
  const [yarnRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.yarnTransactions);
  const [beamRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.beamTransactions);
  const [knotRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.knottingTransactions);
  const [prodRow] = await db.select({ total: sql<number>`coalesce(sum(meters), 0)` }).from(schema.dailyProduction);
  const [greyRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.greyDespatch);
  const [ppRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.greyPakiParchi);
  const [hoursRow] = await db.select({ total: sql<number>`coalesce(sum(hours), 0)` }).from(schema.productionHours);
  const [loomRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.looms);
  const [yarnCountRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.yarnCounts);
  const [beamCountRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.beams);

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const reports = [
    {
      label: "Yarn Stock Report",
      description: "Current yarn inventory by count, blend, and location",
      stats: [
        { label: "Yarn Counts", value: yarnCountRow?.count ?? 0 },
        { label: "Transactions", value: yarnRow?.count ?? 0 },
      ],
      href: "/inventory/yarn-receipt",
    },
    {
      label: "Beam Register",
      description: "Beam inventory status — empty, warped, running, and cut beams",
      stats: [
        { label: "Total Beams", value: beamCountRow?.count ?? 0 },
        { label: "Beam Transactions", value: beamRow?.count ?? 0 },
      ],
      href: "/weaving/beams",
    },
    {
      label: "Daily Production Report",
      description: "Loom-wise daily output by shed and shift with grading breakdown",
      stats: [
        { label: "Total Output", value: formatNum(prodRow?.total ?? 0) + " mtrs" },
        { label: "Looms", value: loomRow?.count ?? 0 },
      ],
      href: "/weaving/production",
    },
    {
      label: "Grey Stock Report",
      description: "Grey cloth stock by construction type and location",
      stats: [
        { label: "Despatches", value: greyRow?.count ?? 0 },
        { label: "Paki Parchis", value: ppRow?.count ?? 0 },
      ],
      href: "/inventory/grey-despatch",
    },
    {
      label: "Knotting Register",
      description: "Knotting, sarning, and maroori transactions by weaver and loom",
      stats: [
        { label: "Transactions", value: knotRow?.count ?? 0 },
      ],
      href: "/inventory/knotting",
    },
    {
      label: "Production Hours Summary",
      description: "Shed-wise shift hours and loom running schedule",
      stats: [
        { label: "Total Hours", value: formatNum(hoursRow?.total ?? 0) },
      ],
      href: "/inventory/hours-schedule",
    },
  ];

  return (
    <Shell active="inv-reports">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Inventory Reports</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {reports.length} report categories
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {reports.map((r) => (
            <Link
              key={r.label}
              href={r.href}
              className="card group transition-colors block"
            >
              <div className="text-[14px] font-bold mb-1">{r.label}</div>
              <p className="text-[12px] text-[var(--muted)] mb-4">
                {r.description}
              </p>
              <div className="flex gap-6">
                {r.stats.map((s) => (
                  <div key={s.label}>
                    <div className="mono text-lg font-bold">{s.value}</div>
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.08em] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                View Report &rarr;
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  );
}
