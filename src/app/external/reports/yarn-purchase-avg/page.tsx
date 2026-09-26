import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { today as pkToday } from "@/lib/time";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function YarnPurchaseAvgPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    fparty?: string;
    fstatus?: string;
    find?: string;
  }>;
}) {
  const params = await searchParams;
  const fParty = (params.fparty ?? "").trim();
  const fStatus = (params.fstatus ?? "R").trim();
  const from = (params.from ?? "").trim();
  const to = (params.to ?? "").trim();
  const findFilter = (params.find ?? "").trim();
  const findL = findFilter.toLowerCase();
  const today = pkToday();

  const allContracts = await db
    .select()
    .from(schema.extYarnPurContract)
    .orderBy(sql`cont_no asc`);

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyDescByCode = new Map(parties.map((p) => [p.code, p.description ?? ""]));

  const yarnCounts = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(yarnCounts.map((y) => [y.countCode, y.description ?? ""]));

  const purchasedRows = await db
    .select({
      contNo: schema.extYarnPurVoucherLine.contNo,
      totalBags: sql<number>`coalesce(sum(bag), 0)`,
    })
    .from(schema.extYarnPurVoucherLine)
    .where(sql`cont_no is not null and cont_no != ''`)
    .groupBy(schema.extYarnPurVoucherLine.contNo);
  const purchasedByContNo = new Map(purchasedRows.map((p) => [p.contNo, p.totalBags]));

  const usedPartyCodes = [...new Set(allContracts.map((c) => c.partyCode).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.partyCode !== fParty) return false;
    if (from && (c.contDate ?? "") < from) return false;
    if (to && (c.contDate ?? "") > to) return false;
    if (findL) {
      const partyName = c.partyCode ? partyDescByCode.get(c.partyCode) ?? "" : "";
      const countDesc = c.countCode ? countDescByCode.get(c.countCode) ?? "" : "";
      const hay = `${c.contNo ?? ""} ${partyName} ${c.partyCode ?? ""} ${countDesc} ${c.countCode ?? ""} ${c.brand ?? ""}`.toLowerCase();
      if (!hay.includes(findL)) return false;
    }
    return true;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = contracts.map((c) => {
    const qtyBags = c.qtyBags ?? 0;
    const purchased = purchasedByContNo.get(c.contNo ?? "") ?? 0;
    const balance = round2(qtyBags - purchased);
    const partyName = c.partyCode ? partyDescByCode.get(c.partyCode) ?? c.partyCode : "-";
    const countDesc = c.countCode ? countDescByCode.get(c.countCode) ?? c.countCode : "-";
    const ratePerLbs = c.ratePerLbs ?? 0;
    const amount = c.amount ?? round2(qtyBags * (c.qtyLbs ?? 0) * ratePerLbs / (qtyBags || 1));
    return {
      id: c.id,
      contNo: c.contNo ?? "",
      partyName,
      partyCode: c.partyCode ?? "",
      countCode: c.countCode ?? "",
      countDesc,
      brand: c.brand ?? "-",
      ratio: c.ratio ?? "",
      qtyBags,
      qtyLbs: c.qtyLbs ?? 0,
      purchased,
      balance,
      ratePerLbs,
      amount,
      broker: c.broker ?? "",
      status: c.status,
    };
  });

  const n = rows.length;
  const totBags = round2(rows.reduce((s, r) => s + r.qtyBags, 0));
  const totLbs = round2(rows.reduce((s, r) => s + r.qtyLbs, 0));
  const totPurchased = round2(rows.reduce((s, r) => s + r.purchased, 0));
  const totBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
  const totAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const avgRate = n ? round2(rows.reduce((s, r) => s + r.ratePerLbs, 0) / n) : 0;

  const fmt = (v: number) => v ? v.toLocaleString("en-US") : "";
  const fmt2 = (v: number) => v ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const excelRows = rows.map((r) => ({
    contNo: r.contNo,
    party: r.partyName,
    count: r.countDesc,
    brand: r.brand,
    ratio: r.ratio,
    qtyBags: r.qtyBags,
    qtyLbs: r.qtyLbs,
    purchased: r.purchased,
    balance: r.balance,
    ratePerLbs: r.ratePerLbs,
    amount: r.amount,
    status: r.status === "R" ? "Running" : r.status === "C" ? "Closed" : r.status,
  }));

  const dateLabel = from || to ? `${from || "…"} — ${to || today}` : "";
  const reportUrl = "/external/reports/yarn-purchase-avg";

  return (
    <Shell active="ext-r-ypa">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4">
          <div>
            <h1 className="page-title">YARN PURCHASE CONTRACT REPORT</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {n} contract{n !== 1 ? "s" : ""} &middot; Total{" "}
              <span className="mono">{fmt(totBags)}</span> bags
            </p>
          </div>
          <div className="flex gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "contNo", label: "Contract" },
                { key: "party", label: "Party" },
                { key: "count", label: "Count" },
                { key: "brand", label: "Brand" },
                { key: "ratio", label: "Ratio" },
                { key: "qtyBags", label: "Qty Bags" },
                { key: "qtyLbs", label: "Qty Lbs" },
                { key: "purchased", label: "Purchased" },
                { key: "balance", label: "Balance" },
                { key: "ratePerLbs", label: "Rate/Lbs" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              filename="yarn-purchase-contract"
              sheetName="YarnPurContract"
            />
            <PrintButton />
          </div>
        </div>

        <form action={reportUrl} method="get" className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-4">
          <div>
            <label className="label block mb-1">Find</label>
            <input name="find" defaultValue={findFilter} placeholder="Contract, Party, Count…" className="input-box mono text-[13px]" style={{ maxWidth: 220 }} />
          </div>
          <div>
            <label className="label block mb-1">From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono text-[13px]" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono text-[13px]" />
          </div>
          <div>
            <label className="label block mb-1">Status</label>
            <select name="fstatus" defaultValue={fStatus} className="input-box mono text-[13px]" style={{ minWidth: 120 }}>
              <option value="R">Running</option>
              <option value="C">Completed</option>
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <select name="fparty" defaultValue={fParty} className="input-box mono text-[13px]" style={{ minWidth: 200 }}>
              <option value="">— All parties —</option>
              {usedPartyCodes.map((code) => (
                <option key={code} value={code}>{partyDescByCode.get(code) ?? code}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-outline btn-sm">Search</button>
          {(findFilter || from || to || fParty || fStatus !== "R") && (
            <a href={reportUrl} className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        {dateLabel && <div className="text-center text-[13px] font-bold mb-2 mono">{dateLabel}</div>}

        <div className="border border-black">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ backgroundColor: "#1e3a5f", color: "white" }}>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Contract</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 150 }}>Party</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 140 }}>Count</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Brand</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Qty Bags</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Qty Lbs</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Purchased</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Balance</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Rate/Lbs</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Amount</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono font-bold">
                      <Link href={`/external/contracts/yarn-purchase?id=${r.id}`} className="no-underline" style={{ color: "inherit" }}>
                        {r.contNo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="text-[13px]">{r.partyName}</div>
                      {r.partyCode && <div className="text-[11px] text-[var(--muted)]">{r.partyCode}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="font-bold">{r.countDesc}</div>
                      {r.ratio && <div className="text-[10px] mono text-[var(--muted)]">{r.ratio}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] text-[13px]">{r.brand}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.qtyBags)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.qtyLbs)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.purchased)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right font-bold">{fmt2(r.balance)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.ratePerLbs ? fmt2(r.ratePerLbs) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.amount ? fmt(r.amount) : "-"}</td>
                    <td className="px-2 py-1.5">
                      {r.status === "R" ? (
                        <span className="inline-block text-[11px] px-2 py-0.5 uppercase bg-black text-white" style={{ letterSpacing: "0.05em" }}>RUNNING</span>
                      ) : (
                        <span className="inline-block text-[11px] px-2 py-0.5 uppercase border border-black" style={{ letterSpacing: "0.05em", color: "var(--muted)" }}>{r.status === "C" ? "CLOSED" : r.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="text-center text-[var(--muted)] py-8 text-[13px]">No contracts match the selected filters.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#1e3a5f", color: "white" }} className="font-bold">
                    <td className="px-2 py-2 border-r border-blue-900/30" colSpan={4}>Total</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totBags)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totLbs)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totPurchased)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totBalance)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgRate)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt(totAmount)}</td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-[var(--muted)]">{n} contract{n !== 1 ? "s" : ""}</div>
      </div>
    </Shell>
  );
}
