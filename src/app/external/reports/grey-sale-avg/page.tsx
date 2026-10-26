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
    floom?: string;
    ftype?: string;
    find?: string;
  }>;
}) {
  const params = await searchParams;
  const fParty = (params.fparty ?? "").trim();
  const fStatus = (params.fstatus ?? "R").trim();
  const fLoom = (params.floom ?? "").trim();
  const fType = params.ftype === "INT" || params.ftype === "EXT" ? params.ftype : "";
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

  const despatchDetailRows = await db
      .select({
        contNo: schema.extPackiParchi.convContNoSale,
        party: schema.extPackiParchi.saleParty,
        vNo: schema.extPackiParchi.vNo,
        meterNet: schema.extPackiParchi.meterNet,
      })
      .from(schema.extPackiParchi)
      .where(sql`conv_cont_no_sale is not null and conv_cont_no_sale != ''`);
  type LotSummary = { party: string; totalMeter: number; lots: number; lotsList: { vNo: string; meter: number }[] };
    const despatchDetailByContNo = new Map<string, LotSummary[]>();
    for (const d of despatchDetailRows) {
      const key = d.contNo ?? "";
      const party = d.party ?? "-";
      if (!despatchDetailByContNo.has(key)) despatchDetailByContNo.set(key, []);
      const arr = despatchDetailByContNo.get(key)!;
      let partyObj = arr.find((x) => x.party === party);
      if (!partyObj) {
        partyObj = { party, totalMeter: 0, lots: 0, lotsList: [] };
        arr.push(partyObj);
      }
      const m = d.meterNet ?? 0;
      partyObj.totalMeter += m;
      partyObj.lots += 1;
      if (d.vNo) partyObj.lotsList.push({ vNo: d.vNo, meter: m });
    }

  const allIds = allContracts.map((c) => c.id);
  const allWarpRows = allIds.length
    ? await db
        .select({ contractId: schema.extGreySalContractWarp.contractId, descr: schema.extGreySalContractWarp.descr })
        .from(schema.extGreySalContractWarp)
        .where(sql`${schema.extGreySalContractWarp.contractId} IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})`)
        .orderBy(schema.extGreySalContractWarp.srNo)
    : [];
  const allWeftRows = allIds.length
    ? await db
        .select({ contractId: schema.extGreySalContractWeft.contractId, descr: schema.extGreySalContractWeft.descr })
        .from(schema.extGreySalContractWeft)
        .where(sql`${schema.extGreySalContractWeft.contractId} IN (${sql.join(allIds.map((id) => sql`${id}`), sql`, `)})`)
        .orderBy(schema.extGreySalContractWeft.srNo)
    : [];
  const warpByContract = new Map<number, string[]>();
  for (const r of allWarpRows) {
    if (r.descr) (warpByContract.get(r.contractId) ?? (warpByContract.set(r.contractId, []), warpByContract.get(r.contractId)!)).push(r.descr);
  }
  const weftByContract = new Map<number, string[]>();
  for (const r of allWeftRows) {
    if (r.descr) (weftByContract.get(r.contractId) ?? (weftByContract.set(r.contractId, []), weftByContract.get(r.contractId)!)).push(r.descr);
  }

  const usedParties = [...new Set(allContracts.map((c) => c.party).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.party !== fParty) return false;
    if (fLoom && (c.loomType ?? "") !== fLoom) return false;
    if (fType && c.contractType !== fType) return false;
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
    const despatchDetail = despatchDetailByContNo.get(c.contractNo ?? "") ?? [];
    const estRate = c.totalCostRate ?? 0;
    const profitLoss = rateMtr && estRate ? round2(rateMtr - estRate) : 0;
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
      warp: warpByContract.get(c.id)?.join(", ") || "-",
      weft: weftByContract.get(c.id)?.join(", ") || "-",
      width: c.width ?? 0,
      production: qty,
      despatch,
      despatchDetail,
      balance,
      estRate,
      rateMtr,
      profitLoss,
      amount,
      loomType: c.loomType ?? "",
      contractType: c.contractType,
      broker: c.broker ?? "",
      status: c.status,
    };
  });

  const n = rows.length;
  const totProduction = round2(rows.reduce((s, r) => s + r.production, 0));
  const totDespatch = round2(rows.reduce((s, r) => s + r.despatch, 0));
  const totBalance = round2(rows.reduce((s, r) => s + r.balance, 0));
  const totAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const avgEstRate = n ? round2(rows.reduce((s, r) => s + r.estRate, 0) / n) : 0;
  const avgRateMtr = n ? round2(rows.reduce((s, r) => s + r.rateMtr, 0) / n) : 0;
  const avgProfitLoss = n ? round2(rows.reduce((s, r) => s + r.profitLoss, 0) / n) : 0;

  const fmt = (v: number) => v ? v.toLocaleString("en-US") : "";
  const fmt2 = (v: number) => v ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const excelRows = rows.map((r) => ({
    contractNo: r.contractNo,
    type: r.contractType === "EXT" ? "External" : "Internal",
    party: r.party,
    construction: [r.construction, r.quality ? `(${r.quality})` : "", r.warp !== "-" ? `W: ${r.warp}` : "", r.weft !== "-" ? `Wf: ${r.weft}` : ""].filter(Boolean).join(" "),
    width: r.width,
    production: r.production,
    despatch: r.despatch,
    despatchTo: r.despatchDetail.map((d) => `${d.party}: ${d.totalMeter}m (${d.lots})`).join("; "),
    balance: r.balance,
    estRate: r.estRate,
    rateMtr: r.rateMtr,
    profitLoss: r.profitLoss,
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
          <div className="flex gap-2 no-print">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "contractNo", label: "Contract" },
                { key: "type", label: "Type" },
                { key: "party", label: "Party" },
                { key: "construction", label: "Construction" },
                { key: "width", label: "Width" },
                { key: "production", label: "Qty Mtr" },
                { key: "despatch", label: "Despatch" },
                { key: "despatchTo", label: "Despatch To" },
                { key: "balance", label: "Balance" },
                { key: "estRate", label: "Estimates Rate" },
                { key: "rateMtr", label: "Rate/Mtr" },
                { key: "profitLoss", label: "Profit/Loss" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              filename="grey-sale-contract"
              sheetName="GreySaleContract"
            />
            <PrintButton />
          </div>
        </div>

        <form action={reportUrl} method="get" className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-4 no-print">
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
            <label className="label block mb-1">Type</label>
            <select name="ftype" defaultValue={fType} className="input-box mono text-[13px]" style={{ minWidth: 120 }}>
              <option value="">All</option>
              <option value="INT">INT - Internal</option>
              <option value="EXT">EXT - External</option>
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
              <option value="SULZER">SULZER</option>
              <option value="AIRJET">AIRJET</option>
            </select>
          </div>
          <button type="submit" className="btn btn-outline btn-sm">Search</button>
          {(findFilter || from || to || fParty || fLoom || fType || fStatus !== "R") && (
            <a href={reportUrl} className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        {dateLabel && <div className="text-center text-[13px] font-bold mb-2 mono">{dateLabel}</div>}

        {/* Print (owner 2026-10-22): A4 landscape, the whole table on the page,
            and the filters in force written under the title instead of the form. */}
        <style>{`@media print {
  @page { size: A4 landscape; margin: 8mm; }
  .gsa-report .overflow-x-auto { overflow: visible !important; }
  .gsa-report table { width: 100% !important; font-size: 9.5px !important; }
  .gsa-report th, .gsa-report td { padding: 3px 4px !important; font-weight: 700 !important; color: #000 !important; border-color: #000 !important; }
  .gsa-report td * { color: #000 !important; font-weight: 700 !important; }
  .gsa-report thead tr, .gsa-report tfoot tr, .gsa-report tbody tr { background: #fff !important; color: #000 !important; }
  .gsa-report thead th { border-bottom: 1.5pt solid #000 !important; }
  .gsa-report { border: none !important; }
  .gsa-report tfoot { display: table-row-group; }
  .gsa-report tfoot td { border-top: 2pt solid #000 !important; border-bottom: 2pt solid #000 !important; font-size: 12px !important; padding: 5px 4px !important; }
  .gsa-report span.bg-black { background: #fff !important; color: #000 !important; border: 1px solid #000 !important; }
}`}</style>
        <div className="hidden print:block text-[11px] mono mb-2">
          {[fStatus === "R" ? "Status: Running" : fStatus ? `Status: ${fStatus}` : "All statuses", fParty ? `Party: ${fParty}` : "All parties", fLoom ? `Loom: ${fLoom}` : "", fType === "INT" ? "Type: Internal" : fType === "EXT" ? "Type: External" : "", from || to ? `${from || "…"} to ${to || "…"}` : ""].filter(Boolean).join(" · ")}
        </div>
        <div className="border border-black gsa-report">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ backgroundColor: "#1e3a5f", color: "white" }}>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30">Contract</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 150 }}>Party</th>
                  <th className="px-2 py-2 text-left border-r border-blue-900/30" style={{ minWidth: 200 }}>Construction</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Width</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Qty Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Despatch</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Balance</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Est. Rate</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">Rate/Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-blue-900/30">P/L</th>
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
                      <div className="text-[10px] font-normal text-[var(--muted)]">{r.contractType === "EXT" ? "EXT" : "INT"}</div>
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="text-[13px]">{r.party}</div>
                      {r.partyCode && <div className="text-[11px] text-[var(--muted)]">{r.partyCode}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="font-bold">{r.construction}</div>
                      {r.quality && <div className="text-[10px] mono text-[var(--muted)]">{r.quality}</div>}
                      {r.warp !== "-" && <div className="text-[10px] text-[var(--muted)]">W: {r.warp}</div>}
                      {r.weft !== "-" && <div className="text-[10px] text-[var(--muted)]">Wf: {r.weft}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.width || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.production)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">
                      {/* Total only; the parchi-by-parchi breakdown opens as its own report
                          (owner 2026-10-26: it crowded the table and the print). */}
                      {r.despatch ? (
                        <a
                          href={`/external/reports/grey-sale-avg/despatch?cont=${encodeURIComponent(r.contractNo)}`}
                          target="_blank"
                          rel="noopener"
                          className="font-bold underline underline-offset-2 print:no-underline"
                          title="Open the Pakki Parchi detail of this despatch"
                        >
                          {fmt2(r.despatch)}
                        </a>
                      ) : ""}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right font-bold">{fmt2(r.balance)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.estRate ? fmt2(r.estRate) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rateMtr ? fmt2(r.rateMtr) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right font-bold" style={{ color: r.profitLoss > 0 ? "#16a34a" : r.profitLoss < 0 ? "#dc2626" : "inherit" }}>{r.rateMtr && r.estRate ? fmt2(r.profitLoss) : "-"}</td>
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
                    <td className="px-2 py-2 border-r border-blue-900/30" colSpan={4}>Total</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totProduction)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totDespatch)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(totBalance)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgEstRate)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right">{fmt2(avgRateMtr)}</td>
                    <td className="px-2 py-2 border-r border-blue-900/30 mono text-right" style={{ color: avgProfitLoss > 0 ? "#16a34a" : avgProfitLoss < 0 ? "#dc2626" : "white" }}>{fmt2(avgProfitLoss)}</td>
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
