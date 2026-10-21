import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [company] = await db.select().from(schema.companyProfile);

  // Totals for the fiscal year shown in the header, not every year ever posted.
  const fy = company?.currentFy ?? "";
  // The year's dates come from its own fiscal_years row; the profile's
  // fy_start/fy_end are typed once and go stale when the year rolls over.
  const [fyRow] = await db.select().from(schema.fiscalYears).where(eq(schema.fiscalYears.code, fy));
  const [dRow] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.transDetail.debit}), 0)` })
    .from(schema.transDetail)
    .where(eq(schema.transDetail.fyCode, fy));
  const [cRow] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.transDetail.credit}), 0)` })
    .from(schema.transDetail)
    .where(eq(schema.transDetail.fyCode, fy));
  const totalDebit = dRow?.total ?? 0;
  const totalCredit = cRow?.total ?? 0;

  const [vRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.transMain).where(eq(schema.transMain.fyCode, fy));
  const [contractRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.contracts);
  const [activeContractRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.contracts).where(sql`status = 'A'`);
  const oracleContracts = await db.get<{ total: number; running: number }>(sql`
    select
      (select count(*) from ext_yarn_pur_contract) +
      (select count(*) from ext_yarn_sal_contract) +
      (select count(*) from ext_grey_pur_contract) +
      (select count(*) from ext_grey_sal_contract) +
      (select count(*) from ext_grey_conv_contract) +
      (select count(*) from int_yarn_purchase_contract) +
      (select count(*) from int_grey_conversion_contract) +
      (select count(*) from int_beam_contract_ext_ws) +
      (select count(*) from int_knotting_contract) as total,
      (select count(*) from ext_yarn_pur_contract where status = 'R') +
      (select count(*) from ext_yarn_sal_contract where status = 'R') +
      (select count(*) from ext_grey_pur_contract where status = 'R') +
      (select count(*) from ext_grey_sal_contract where status = 'R') +
      (select count(*) from ext_grey_conv_contract where status = 'R') +
      (select count(*) from int_yarn_purchase_contract where status = 'R') +
      (select count(*) from int_grey_conversion_contract where status = 'R') +
      (select count(*) from int_beam_contract_ext_ws where status = 'R') +
      (select count(*) from int_knotting_contract where status = 'R') as running
  `);
  const contractsTotal = (contractRow?.count ?? 0) + (oracleContracts?.total ?? 0);
  const contractsActive = (activeContractRow?.count ?? 0) + (oracleContracts?.running ?? 0);
  const [yarnRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.yarnCounts);
  const [partsRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.chartParts);
  const [beamRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.beams);
  const [extGccRow] = await db.select({
    running: sql<number>`count(case when status = 'R' then 1 end)`,
    total: sql<number>`count(*)`,
    production: sql<number>`coalesce(sum(case when status = 'R' then qty_mtr else 0 end), 0)`,
  }).from(schema.extGreyConvContract).where(sql`${schema.extGreyConvContract.grayQltyCode} is not null and ${schema.extGreyConvContract.grayQltyCode} != ''`);
  const [extGscRow] = await db.select({
    running: sql<number>`count(case when status = 'R' then 1 end)`,
    total: sql<number>`count(*)`,
  }).from(schema.extGreySalContract);
  const [extYpcRow] = await db.select({
    running: sql<number>`count(case when status = 'R' then 1 end)`,
    totalBags: sql<number>`coalesce(sum(case when status = 'R' then qty_bags else 0 end), 0)`,
  }).from(schema.extYarnPurContract);
  const [userRow] = await db.select({ count: sql<number>`count(*)` }).from(schema.users).where(sql`${schema.users.roleName} != 'superadmin'`);

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
    // What the mill opens every morning. Chart of accounts and vouchers are
    // still in the menu. The Production block (looms / output / grey specs)
    // was dropped by the owner in favour of the General Ledger.
    { label: "Finance", items: [
      { label: "Folding Stock", value: "View", unit: "daily folding stock", href: "/reports/weaving/folding-stock" },
      { label: "Counts — Sale", value: "View", unit: "weaving counts accounts", href: "/external/reports/weaving-counts-sale" },
      { label: "Counts — Purchase", value: "View", unit: "weaving counts accounts", href: "/external/reports/weaving-counts-purchase" },
      { label: "General Ledger", value: "View", unit: "accounts ledger", href: "/ledger" },
    ]},
    { label: "Supply Chain", items: [
      { label: "Grey Conv Sale Avg", value: `${extGccRow?.running ?? 0}`, unit: `running · ${formatNum(extGccRow?.production ?? 0)} mtr`, href: "/external/reports/grey-conv-sale-avg" },
      { label: "Grey Sale Contract", value: `${extGscRow?.running ?? 0}`, unit: `running / ${extGscRow?.total ?? 0}`, href: "/external/reports/grey-sale-avg" },
      { label: "Yarn Purchase Contract", value: `${extYpcRow?.running ?? 0}`, unit: `running · ${formatNum(extYpcRow?.totalBags ?? 0)} bags`, href: "/external/reports/yarn-purchase-avg" },
      { label: "Beams", value: beamRow?.count ?? 0, unit: "tracked beams", href: "/weaving/beams" },
    ]},
    { label: "Operations", items: [
      { label: "Spare Parts", value: partsRow?.count ?? 0, unit: "inventory items", href: "/store/parts" },
      { label: "Users", value: userRow?.count ?? 0, unit: "system users", href: "/settings/users" },
      { label: "Reports", value: "View", unit: "trial balance, aging", href: "/reports/trial-balance" },
    ]},
  ];

  const GROUP_COLORS: Record<string, string> = {
    Finance: "var(--h4)",
    "Supply Chain": "var(--h3)",
    Operations: "var(--h5)",
  };

  return (
    <Shell active="dash">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">{company?.name ?? BRAND.name}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              FY {company?.currentFy} &middot; {company?.city}
            </p>
          </div>
          <div className="text-right">
            <div className="label">Fiscal Year</div>
            <div className="mono text-lg font-bold mt-1">{fyRow?.startDate ?? company?.fyStart} — {fyRow?.endDate ?? company?.fyEnd}</div>
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
            <div className="section-title" style={{ color: GROUP_COLORS[group.label], borderColor: GROUP_COLORS[group.label] }}>{group.label}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((m) => (
                <Link key={m.href} href={m.href} className="card group transition-colors block" style={{ borderLeft: `3px solid ${GROUP_COLORS[group.label] ?? "transparent"}` }}>
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
