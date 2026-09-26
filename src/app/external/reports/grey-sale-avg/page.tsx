import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { today as pkToday } from "@/lib/time";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GreySaleAvgPage({
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
    .from(schema.extGreySalContract)
    .orderBy(sql`contract_no asc`);

  const greyRows = await db
    .select({ code: schema.greyConstruction.code, reed: schema.greyConstruction.reed, pick: schema.greyConstruction.pick, description: schema.greyConstruction.description })
    .from(schema.greyConstruction);
  const greyInfo = new Map(greyRows.map((g) => [g.code, g]));

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  const despatchRows = await db
    .select({
      contNo: schema.extPackiParchi.convContNoSale,
      totalMeter: sql<number>`coalesce(sum(meter_net), 0)`,
    })
    .from(schema.extPackiParchi)
    .where(sql`conv_cont_no_sale is not null and conv_cont_no_sale != ''`)
    .groupBy(schema.extPackiParchi.convContNoSale);
  const despatchByContNo = new Map(despatchRows.map((d) => [d.contNo, d.totalMeter]));

  const usedParties = [...new Set(allContracts.map((c) => c.party).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.party !== fParty) return false;
    if (from && (c.contractDate ?? "") < from) return false;
    if (to && (c.contractDate ?? "") > to) return false;
    if (findL) {
      const hay = `${c.contractNo ?? ""} ${c.party ?? ""} ${c.greyCode ?? ""} ${c.construction ?? ""}`.toLowerCase();
      if (!hay.includes(findL)) return false;
    }
    return true;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = contracts.map((c) => {
    const qty = c.quantityMtr ?? 0;
    const constrCode = c.greyCode ?? null;
    const gRow = constrCode ? greyInfo.get(constrCode) : null;
    const quality = gRow?.reed && gRow?.pick ? `${gRow.reed}×${gRow.pick}` : "";
    const rateMtr = c.ratePerMtr ?? 0;
    const amount = c.amount ?? round2(qty * rateMtr);
    const despatch = despatchByContNo.get(c.contractNo ?? "") ?? 0;
    const balance = round2(qty - despatch);
    return {
      id: c.id,
      contractNo: c.contractNo ?? "",
      party: c.party ?? "-",
      partyCode: c.party ? partyCodeByDesc.get(c.party) ?? "" : "",
      construction: c.construction ?? "-",
      quality,
      greyCode: constrCode,
      reed: c.read ?? 0,
      pick: c.pick ?? 0,
      width: c.width ?? 0,
      production: qty,
      despatch,
      balance,
      rateMtr,
      amount,
      broker: c.broker ?? "",
      status: c.status,
    };
  });

  const n = rows.length;
  const totProduction = round2(rows.reduce((s, r) => s + r.production, 0));
  const totDespatch = round2(rows.reduce((s, r) => s + r.despatch, 0));
  const totBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
  const totAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const avgRateMtr = n ? round2(rows.reduce((s, r) => s + r.rateMtr, 0) / n) : 0;

  const fmt = (v: number) => v ? v.toLocaleString("en-US") : "";
  const fmt2 = (v: number) => v ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const excelRows = rows.map((r) => ({
    contractNo: r.contractNo,
    party: r.party,
    construction: r.construction,
    quality: r.quality,
    production: r.production,
    despatch: r.despatch,
    balance: r.balance,
    reed: r.reed,
    pick: r.pick,
    width: r.width,
    rateMtr: r.rateMtr,
    amount: r.amount,
    status: r.status === "R" ? "Running" : r.status === "C" ? "Closed" : r.status,
  }));

  const dateLabel = from || to ? `${from || "…"} — ${to || today}` : "";
  const reportUrl = "/external/reports/grey-sale-avg";

  return (
    <Shell active="ext-r-gsa">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4">
          <div>
            <h1 className="page-title">GREY SALE CONTRACT REPORT</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {n} contract{n !== 1 ? "s" : ""} &middot; Total value{" "}
              <span className="mono">{fmt(totAmount)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "contractNo", label: "Contract" },
                { key: "party", label: "Party" },
                { key: "construction", label: "Construction" },
                { key: "quality", label: "Quality" },
                { key: "production", label: "Qty Mtr" },
                { key: "despatch", label: "Despatch" },
                { key: "balance", label: "Balance" },
                { key: "reed", label: "Reed" },
                { key: "pick", label: "Pick" },
                { key: "width", label: "Width" },
                { key: "rateMtr", label: "Rate/Mtr" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              filename="grey-sale-contract"
              sheetName="GreySaleContract"
            />
            <PrintButton />
          </div>
        </div>

        <form action={reportUrl} method="get" className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-4">
          <div>
            <label className="label block mb-1">Find</label>
            <input name="find" defaultValue={findFilter} placeholder="Contract, Party…" className="input-box mono text-[13px]" style={{ maxWidth: 220 }} />
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
              {usedParties.map((p) => (
                <option key={p} value={p}>{p}</option>
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
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 160 }}>Construction</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Reed</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Pick</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Width</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Qty Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Despatch</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Balance</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Rate/Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Amount</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono font-bold">
                      <Link href={`/external/contracts/grey-sales?id=${r.id}`} className="no-underline" style={{ color: "inherit" }}>
                        {r.contractNo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="text-[13px]">{r.party}</div>
                      {r.partyCode && <div className="text-[11px] text-[var(--muted)]">{r.partyCode}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="font-bold">{r.construction}</div>
                      {r.quality && <div className="text-[10px] mono text-[var(--muted)]">{r.quality}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.reed || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.pick || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.width || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.production)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.despatch)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right font-bold">{fmt2(r.balance)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rateMtr ? fmt2(r.rateMtr) : "-"}</td>
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
                  <tr><td colSpan={12} className="text-center text-[var(--muted)] py-8 text-[13px]">No contracts match the selected filters.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#1e3a5f", color: "white" }} className="font-bold">
                    <td className="px-2 py-2 border-r border-blue-900/30" colSpan={6}>Total</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totProduction)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totDespatch)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totBalance)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgRateMtr)}</td>
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
