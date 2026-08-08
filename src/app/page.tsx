import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [company] = await db.select().from(schema.companyProfile);

  const [dRow] = await db.select({ total: sql<number>`coalesce(sum(debit), 0)` }).from(schema.transDetail);
  const [cRow] = await db.select({ total: sql<number>`coalesce(sum(credit), 0)` }).from(schema.transDetail);
  const totalDebit = dRow?.total ?? 0;
  const totalCredit = cRow?.total ?? 0;

  const [vRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.transMain);
  const [accRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.chartOfAccounts);
  const [loomRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.looms);
  const [runningRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.looms).where(sql`status = 'RUNNING'`);
  const [contractRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.contracts);
  const [activeContractRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.contracts).where(sql`status = 'A'`);
  const [greyRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.greyConstruction);
  const [yarnRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.yarnCounts);
  const [partsRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.chartParts);
  const [beamRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.beams);
  const [prodRow] = await db.select({ total: sql<number>`coalesce(sum(meters), 0)` }).from(schema.dailyProduction);
  const [userRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.users);

  const recentVouchers = await db
    .select({
      fyCode: schema.transMain.fyCode,
      vtype: schema.transMain.vtype,
      vno: schema.transMain.vno,
      vdate: schema.transMain.vdate,
      narration: schema.transMain.narration,
    })
    .from(schema.transMain)
    .orderBy(sql`vdate DESC, id DESC`)
    .limit(8);

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const modules = [
    { label: "Finance", items: [
      { label: "Accounts", value: accRow?.count ?? 0, unit: "chart of accounts", href: "/accounts" },
      { label: "Vouchers", value: vRow?.count ?? 0, unit: "journal entries", href: "/vouchers" },
      { label: "Ledger", value: "View", unit: "account wise", href: "/ledger" },
    ]},
    { label: "Production", items: [
      { label: "Looms", value: `${runningRow?.count ?? 0}/${loomRow?.count ?? 0}`, unit: "running / total", href: "/weaving/looms" },
      { label: "Output", value: formatNum(prodRow?.total ?? 0), unit: "meters produced", href: "/weaving/production" },
      { label: "Grey Specs", value: greyRow?.count ?? 0, unit: "construction types", href: "/define/grey-construction" },
    ]},
    { label: "Supply Chain", items: [
      { label: "Contracts", value: `${activeContractRow?.count ?? 0}/${contractRow?.count ?? 0}`, unit: "active / total", href: "/contracts" },
      { label: "Yarn", value: yarnRow?.count ?? 0, unit: "yarn counts", href: "/define/yarn-counts" },
      { label: "Beams", value: beamRow?.count ?? 0, unit: "tracked beams", href: "/weaving/beams" },
    ]},
    { label: "Operations", items: [
      { label: "Spare Parts", value: partsRow?.count ?? 0, unit: "inventory items", href: "/store/parts" },
      { label: "Users", value: userRow?.count ?? 0, unit: "system users", href: "/settings/users" },
      { label: "Reports", value: "View", unit: "trial balance, aging", href: "/reports/trial-balance" },
    ]},
  ];

  return (
    <Shell active="dash">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">{company?.name ?? "SK Weaving Mills"}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              FY {company?.currentFy} &middot; {company?.city}
            </p>
          </div>
          <div className="text-right">
            <div className="label">Fiscal Year</div>
            <div className="mono text-lg font-bold mt-1">{company?.fyStart} — {company?.fyEnd}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-10">
          <div className="bg-white p-5">
            <div className="stat-value">{formatNum(totalDebit)}</div>
            <div className="stat-label">Total Debits</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{formatNum(totalCredit)}</div>
            <div className="stat-label">Total Credits</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{totalDebit === totalCredit ? "0" : formatNum(Math.abs(totalDebit - totalCredit))}</div>
            <div className="stat-label">{totalDebit === totalCredit ? "Balanced" : "Difference"}</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{vRow?.count ?? 0}</div>
            <div className="stat-label">Vouchers</div>
          </div>
        </div>

        {modules.map((group) => (
          <div key={group.label} className="mb-8">
            <div className="section-title">{group.label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((m) => (
                <Link key={m.href} href={m.href} className="card group transition-colors block">
                  <div className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] mb-2">
                    {m.label}
                  </div>
                  <div className="mono text-2xl font-bold">{m.value}</div>
                  <div className="text-[12px] text-[var(--muted)] mt-1">{m.unit}</div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.08em] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    Open &rarr;
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}

        <div>
          <div className="section-title">Recent Vouchers</div>
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>No.</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {recentVouchers.map((v) => (
                <tr key={`${v.fyCode}-${v.vtype}-${v.vno}`}>
                  <td className="mono text-[13px]">{v.vdate}</td>
                  <td>
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                      {v.vtype}
                    </span>
                  </td>
                  <td className="mono">{v.vno}</td>
                  <td className="text-[var(--muted)]">{v.narration}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
