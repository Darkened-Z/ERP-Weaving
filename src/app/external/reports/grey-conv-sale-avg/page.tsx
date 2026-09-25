import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { today as pkToday } from "@/lib/time";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LOOM_TYPES = ["SULZER", "AIRJET"];

export default async function GreyConvSaleAvgPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    fparty?: string;
    fstatus?: string;
    floom?: string;
    find?: string;
  }>;
}) {
  const params = await searchParams;
  const fParty = (params.fparty ?? "").trim();
  const fStatus = (params.fstatus ?? "R").trim();
  const fLoom = (params.floom ?? "").trim();
  const from = (params.from ?? "").trim();
  const to = (params.to ?? "").trim();
  const findFilter = (params.find ?? "").trim();
  const findL = findFilter.toLowerCase();
  const today = pkToday();

  const allContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(sql`product_name asc, cont_no asc`);

  const productRows = await db
    .select({ description: schema.products.description, mainDesc: schema.products.mainDesc })
    .from(schema.products);
  const productMainDesc = new Map(productRows.map((p) => [p.description, p.mainDesc ?? ""]));

  const greyRows = await db
    .select({ code: schema.greyConstruction.code, reed: schema.greyConstruction.reed, pick: schema.greyConstruction.pick })
    .from(schema.greyConstruction);
  const greyReedPick = new Map(greyRows.map((g) => [g.code, { reed: g.reed as number | null, pick: g.pick as number | null }]));

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  const despatchRows = await db
    .select({
      contNo: schema.extPackiParchi.convContNo,
      totalMeter: sql<number>`coalesce(sum(meter_net), 0)`,
    })
    .from(schema.extPackiParchi)
    .where(sql`conv_cont_no is not null and conv_cont_no != ''`)
    .groupBy(schema.extPackiParchi.convContNo);
  const despatchByContNo = new Map(despatchRows.map((d) => [d.contNo, d.totalMeter]));

  const usedParties = [...new Set(allContracts.map((c) => c.party).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.party !== fParty) return false;
    if (fLoom && c.loomType !== fLoom) return false;
    if (from && (c.contDate ?? "") < from) return false;
    if (to && (c.contDate ?? "") > to) return false;
    if (findL) {
      const hay = `${c.contNo ?? ""} ${c.party ?? ""} ${c.productName ?? ""} ${c.grayCode ?? ""}`.toLowerCase();
      if (!hay.includes(findL)) return false;
    }
    return true;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = contracts.map((c) => {
    const qty = c.qtyMtr ?? 0;
    const pickVal = c.pick ?? 0;
    const constrCode = c.grayQltyCode ?? c.grayCode ?? null;
    const gInfo = constrCode ? greyReedPick.get(constrCode) : null;
    const quality = gInfo?.reed && gInfo?.pick ? `${gInfo.reed}×${gInfo.pick}` : "";
    const rPick = c.ratePerPick ?? 0;
    const rateMtr = c.convRatePerMtr ?? 0;
    const amount = round2(qty * rateMtr);
    const sRate = c.grayRatePerMtr ?? 0;
    const totalAmt = round2(qty * sRate);
    const mainDesc = c.productName ? productMainDesc.get(c.productName) ?? "" : "";
    const despatch = despatchByContNo.get(c.contNo ?? "") ?? 0;
    const balance = round2(qty - despatch);
    return {
      id: c.id,
      contNo: c.contNo ?? "",
      party: c.party ?? "-",
      partyCode: c.party ? partyCodeByDesc.get(c.party) ?? "" : "",
      productName: c.productName ?? "-",
      mainDesc,
      quality,
      constrCode,
      designNo: c.designNo ?? "",
      production: qty,
      despatch,
      balance,
      pick: pickVal,
      rPick,
      rateMtr,
      amount,
      sRate,
      totalAmt,
      loomType: c.loomType ?? "-",
      status: c.status,
    };
  });

  const n = rows.length;
  const totProduction = round2(rows.reduce((s, r) => s + r.production, 0));
  const totDespatch = round2(rows.reduce((s, r) => s + r.despatch, 0));
  const totBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
  const totAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const totTotalAmt = round2(rows.reduce((s, r) => s + r.totalAmt, 0));
  const avgPick = n ? round2(rows.reduce((s, r) => s + r.pick, 0) / n) : 0;
  const avgRPick = n ? round2(rows.reduce((s, r) => s + r.rPick, 0) / n) : 0;
  const avgRateMtr = n ? round2(rows.reduce((s, r) => s + r.rateMtr, 0) / n) : 0;
  const avgSRate = n ? round2(rows.reduce((s, r) => s + r.sRate, 0) / n) : 0;
  const totalValue = round2(rows.reduce((s, r) => s + r.amount, 0));

  const fmt = (v: number) => v ? v.toLocaleString("en-US") : "";
  const fmt2 = (v: number) => v ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const excelRows = rows.map((r) => ({
    contNo: r.contNo,
    party: r.party,
    product: r.productName,
    mainDesc: r.mainDesc,
    quality: r.quality,
    designNo: r.designNo,
    production: r.production,
    despatch: r.despatch,
    balance: r.balance,
    pick: r.pick,
    rPick: r.rPick,
    rateMtr: r.rateMtr,
    amount: r.amount,
    sRate: r.sRate,
    totalAmt: r.totalAmt,
    loom: r.loomType,
    status: r.status === "R" ? "Running" : r.status === "C" ? "Closed" : r.status,
  }));

  const dateLabel = from || to
    ? `${from || "…"} — ${to || today}`
    : "";

  const reportUrl = "/external/reports/grey-conv-sale-avg";

  return (
    <Shell active="ext-r-gcsa">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4">
          <div>
            <h1 className="page-title">GREY CONV SALE AVG REPORT</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {n} contract{n !== 1 ? "s" : ""} &middot; Total value{" "}
              <span className="mono">{fmt(totalValue)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "contNo", label: "Contract" },
                { key: "party", label: "Party" },
                { key: "product", label: "Product" },
                { key: "mainDesc", label: "Main Desc" },
                { key: "quality", label: "Quality" },
                { key: "designNo", label: "Design #" },
                { key: "production", label: "Production" },
                { key: "despatch", label: "Despatch" },
                { key: "balance", label: "Balance" },
                { key: "pick", label: "Pick" },
                { key: "rPick", label: "R/Pick" },
                { key: "rateMtr", label: "Rate/Mtr" },
                { key: "amount", label: "Amount" },
                { key: "sRate", label: "S.Rate" },
                { key: "totalAmt", label: "Total Amt" },
                { key: "loom", label: "Loom" },
                { key: "status", label: "Status" },
              ]}
              filename="grey-conv-sale-avg"
              sheetName="GreyConvSaleAvg"
            />
            <PrintButton />
          </div>
        </div>

        <form
          action={reportUrl}
          method="get"
          className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-4"
        >
          <div>
            <label className="label block mb-1">Find</label>
            <input
              name="find"
              defaultValue={findFilter}
              placeholder="Cont No, Party, Product…"
              className="input-box mono text-[13px]"
              style={{ maxWidth: 220 }}
            />
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
          <div>
            <label className="label block mb-1">Loom Type</label>
            <select name="floom" defaultValue={fLoom} className="input-box mono text-[13px]" style={{ minWidth: 120 }}>
              <option value="">All</option>
              {LOOM_TYPES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-outline btn-sm">Search</button>
          {(findFilter || from || to || fParty || fStatus !== "R" || fLoom) && (
            <a href={reportUrl} className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        {dateLabel && (
          <div className="text-center text-[13px] font-bold mb-2 mono">{dateLabel}</div>
        )}

        <div className="border border-black">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ backgroundColor: "#1e3a5f", color: "white" }}>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Contract</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 150 }}>Party</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 180 }}>Quality</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Design #</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Production</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Despatch</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Balance</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Pick</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">R/Pick</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Rate/Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Amount</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">S.Rate</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Total Amt</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Loom</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono font-bold">
                      <Link href={`/external/contracts/grey-conversion?id=${r.id}`} className="no-underline" style={{ color: "inherit" }}>
                        {r.contNo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="text-[13px]">{r.party}</div>
                      {r.partyCode && <div className="text-[11px] text-[var(--muted)]">{r.partyCode}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="font-bold">{r.productName}</div>
                      {r.mainDesc && <div className="text-[11px] text-[var(--muted)]">{r.mainDesc}</div>}
                      {r.quality && <div className="text-[10px] mono text-[var(--muted)]">{r.quality}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono">{r.designNo || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.production)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.despatch)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right font-bold">{fmt2(r.balance)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.pick || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rPick || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rateMtr ? fmt2(r.rateMtr) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.amount ? fmt(r.amount) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.sRate ? fmt2(r.sRate) : ""}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.totalAmt ? fmt(r.totalAmt) : ""}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] text-[12px]">{r.loomType}</td>
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
                  <tr>
                    <td colSpan={15} className="text-center text-[var(--muted)] py-8 text-[13px]">
                      No contracts match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#1e3a5f", color: "white" }} className="font-bold">
                    <td className="px-2 py-2 border-r border-blue-900/30" colSpan={4}>Total</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totProduction)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totDespatch)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totBalance)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgPick)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgRPick)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgRateMtr)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt(totAmount)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgSRate)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt(totTotalAmt)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30" colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-[var(--muted)]">
          {n} contract{n !== 1 ? "s" : ""}
        </div>
      </div>
    </Shell>
  );
}
