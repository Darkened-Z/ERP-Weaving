import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  fmt,
  fmt2,
  escLike,
  sixMonthsAgo,
  todayIso,
  partyByNameOptions,
} from "../../_shared";

export const dynamic = "force-dynamic";

export default async function YarnPurContractHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; cont?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";
  const cont = p.cont?.trim() ?? "";

  const [partyOpts, accountRows, countMetaRows] = await Promise.all([
    partyByNameOptions(),
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description }).from(schema.yarnCounts),
  ]);
  const accountDescMap = new Map(accountRows.map((r) => [r.code, r.description]));
  const countDescMap = new Map(countMetaRows.map((r) => [r.code, r.description]));

  const conds = [
    gte(schema.extYarnPurContract.contDate, from),
    lte(schema.extYarnPurContract.contDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conds.push(sql`${schema.extYarnPurContract.partyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (cont) {
    const pat = `%${escLike(cont)}%`;
    conds.push(sql`${schema.extYarnPurContract.contNo} LIKE ${pat} ESCAPE '\\'`);
  }

  const contracts = await db
    .select({
      id: schema.extYarnPurContract.id,
      contNo: schema.extYarnPurContract.contNo,
      contDate: schema.extYarnPurContract.contDate,
      party: schema.extYarnPurContract.partyCode,
      broker: schema.extYarnPurContract.broker,
      countCode: schema.extYarnPurContract.countCode,
      brand: schema.extYarnPurContract.brand,
      qtyBags: schema.extYarnPurContract.qtyBags,
      qtyLbs: schema.extYarnPurContract.qtyLbs,
      rate: schema.extYarnPurContract.ratePerLbs,
      amount: schema.extYarnPurContract.amount,
      status: schema.extYarnPurContract.status,
    })
    .from(schema.extYarnPurContract)
    .where(and(...conds))
    .orderBy(schema.extYarnPurContract.contDate);

  const contNos = contracts.map((c) => c.contNo).filter(Boolean);

  const delivered = contNos.length
    ? await db
        .select({
          contNo: schema.extYarnPurVoucherLine.contNo,
          bags: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.bag}), 0)`,
          lbs: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs}), 0)`,
          amt: sql<number>`coalesce(sum(${schema.extYarnPurVoucherLine.lbs} * ${schema.extYarnPurVoucherLine.rate}), 0)`,
          deliveries: sql<number>`count(distinct ${schema.extYarnPurVoucherLine.voucherId})`,
          lastDate: sql<string>`max(${schema.extYarnPurVoucher.vDate})`,
        })
        .from(schema.extYarnPurVoucherLine)
        .innerJoin(
          schema.extYarnPurVoucher,
          sql`${schema.extYarnPurVoucherLine.voucherId} = ${schema.extYarnPurVoucher.id}`
        )
        .where(sql`${schema.extYarnPurVoucherLine.contNo} IN (${sql.join(contNos.map((c) => sql`${c}`), sql`, `)})`)
        .groupBy(schema.extYarnPurVoucherLine.contNo)
    : [];

  const delMap = new Map(delivered.map((d) => [d.contNo, d]));

  const rows = contracts.map((c) => {
    const d = delMap.get(c.contNo);
    const delBags = d?.bags ?? 0;
    const delLbs = d?.lbs ?? 0;
    const delAmt = d?.amt ?? 0;
    const remBags = (c.qtyBags ?? 0) - delBags;
    const remLbs = (c.qtyLbs ?? 0) - delLbs;
    const pctBags = (c.qtyBags ?? 0) > 0 ? (delBags / (c.qtyBags ?? 1)) * 100 : 0;
    return {
      ...c,
      delBags,
      delLbs,
      delAmt,
      remBags,
      remLbs,
      pctBags,
      deliveries: d?.deliveries ?? 0,
      lastDate: d?.lastDate ?? "-",
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      qtyBags: t.qtyBags + (r.qtyBags ?? 0),
      qtyLbs: t.qtyLbs + (r.qtyLbs ?? 0),
      delBags: t.delBags + r.delBags,
      delLbs: t.delLbs + r.delLbs,
      remBags: t.remBags + r.remBags,
      remLbs: t.remLbs + r.remLbs,
      amount: t.amount + (r.amount ?? 0),
      delAmt: t.delAmt + r.delAmt,
    }),
    { qtyBags: 0, qtyLbs: 0, delBags: 0, delLbs: 0, remBags: 0, remLbs: 0, amount: 0, delAmt: 0 }
  );

  return (
    <Shell active="rpt-yarn-pur-cont-history">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Purchase Contract History</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} contracts · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                contNo: r.contNo,
                contDate: r.contDate,
                party: r.party ?? "",
                broker: r.broker ?? "",
                countCode: r.countCode ?? "",
                brand: r.brand ?? "",
                qtyBags: r.qtyBags ?? 0,
                qtyLbs: Math.round(r.qtyLbs ?? 0),
                delBags: r.delBags,
                delLbs: Math.round(r.delLbs),
                remBags: r.remBags,
                remLbs: Math.round(r.remLbs),
                pctBags: Number(r.pctBags.toFixed(1)),
                deliveries: r.deliveries,
                lastDate: r.lastDate,
                status: r.status,
              }))}
              columns={[
                { key: "contNo", label: "Contract" },
                { key: "contDate", label: "Date" },
                { key: "party", label: "Party" },
                { key: "broker", label: "Broker" },
                { key: "countCode", label: "Count" },
                { key: "brand", label: "Brand" },
                { key: "qtyBags", label: "Ctr Bags" },
                { key: "qtyLbs", label: "Ctr Lbs" },
                { key: "delBags", label: "Del Bags" },
                { key: "delLbs", label: "Del Lbs" },
                { key: "remBags", label: "Rem Bags" },
                { key: "remLbs", label: "Rem Lbs" },
                { key: "pctBags", label: "% Delivered" },
                { key: "deliveries", label: "# Deliveries" },
                { key: "lastDate", label: "Last Delivery" },
                { key: "status", label: "Status" },
              ]}
              filename="yarn-pur-contract-history"
              sheetName="Contracts"
            />
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">Contract Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="All parties" />
          </div>
          <div>
            <label className="label block mb-1">Contract #</label>
            <input type="text" name="cont" defaultValue={cont} className="input-box mono" placeholder="Contract no" />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/yarn/pur-contract-history" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Date</th>
                <th>Party</th>
                <th>Count</th>
                <th>Brand</th>
                <th className="text-right">Ctr Bags</th>
                <th className="text-right">Del Bags</th>
                <th className="text-right">Rem Bags</th>
                <th className="text-right">% Del</th>
                <th className="text-right">Deliveries</th>
                <th>Last Delivery</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center text-[var(--muted)] py-8">
                    No contracts in period
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const done = r.pctBags >= 100;
                  const stale = !done && r.pctBags < 25;
                  return (
                    <tr key={r.id}>
                      <td className="mono font-bold">{r.contNo}</td>
                      <td className="mono text-[13px]">{r.contDate}</td>
                      <td className="text-[13px]">
                        {r.party ?? "-"}
                        {r.party && accountDescMap.get(r.party) ? (
                          <div className="text-[11px] text-[var(--muted)]">{accountDescMap.get(r.party)}</div>
                        ) : null}
                      </td>
                      <td className="mono text-[13px]">
                        {r.countCode ?? "-"}
                        {r.countCode && countDescMap.get(r.countCode) ? (
                          <div className="text-[11px] text-[var(--muted)]">{countDescMap.get(r.countCode)}</div>
                        ) : null}
                      </td>
                      <td className="text-[13px]">{r.brand ?? "-"}</td>
                      <td className="mono text-right">{fmt(r.qtyBags ?? 0)}</td>
                      <td className="mono text-right">{fmt(r.delBags)}</td>
                      <td className="mono text-right">{fmt(r.remBags)}</td>
                      <td className={`mono text-right ${done ? "font-bold" : stale ? "italic underline" : ""}`}>{fmt2(r.pctBags)}%</td>
                      <td className="mono text-right">{r.deliveries}</td>
                      <td className="mono text-[13px]">{r.lastDate}</td>
                      <td>
                        <span
                          className="inline-block text-[10px] px-2 py-0.5 uppercase"
                          style={{
                            letterSpacing: "0.06em",
                            background: done ? "black" : "transparent",
                            color: done ? "white" : "black",
                            border: "1px solid black",
                          }}
                        >
                          {done ? "DONE" : r.status ?? "OPEN"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={5}>Total</td>
                  <td className="mono text-right">{fmt(totals.qtyBags)}</td>
                  <td className="mono text-right">{fmt(totals.delBags)}</td>
                  <td className="mono text-right">{fmt(totals.remBags)}</td>
                  <td className="mono text-right">{fmt2(totals.qtyBags > 0 ? (totals.delBags / totals.qtyBags) * 100 : 0)}%</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
