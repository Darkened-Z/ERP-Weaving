import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { countLabelMap, wfPartFull, type GreyConstr } from "@/lib/grey-quality";
import { fmt, fmt2, sixMonthsAgo, todayIso } from "../../../_shared";

export const dynamic = "force-dynamic";

// Than register for one grey-conversion contract (the "P" drill-down from the
// folding-stock report). One row per than produced, carrying the despatch V.No
// it went out on — the mill reads this as "IDP-0001/A went out on IGD-0001",
// so a despatch is NOT repeated as a second row underneath.
export default async function FoldingStockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cont: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { cont: contRaw } = await params;
  const cont = decodeURIComponent(contRaw);
  const sp = await searchParams;
  const from = sp.from?.trim() || sixMonthsAgo();
  const to = sp.to?.trim() || todayIso();

  const [contract] = await db
    .select({
      contNo: schema.intGreyConversionContract.contNo,
      party: schema.intGreyConversionContract.party,
      quality: schema.intGreyConversionContract.productQuality,
      designNo: schema.intGreyConversionContract.designNo,
        qCode: schema.intGreyConversionContract.grayQltyCode,
    })
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.contNo, cont));

  const prodRows = await db
    .select({
      date: schema.intDailyProduction.vDate,
      vNo: schema.intDailyProduction.vNo,
      a: schema.intDailyProductionSet.aCount,
      b: schema.intDailyProductionSet.bCount,
      c: schema.intDailyProductionSet.cCount,
      cp: schema.intDailyProductionSet.cpCount,
      total: schema.intDailyProductionSet.totalCount,
      than: schema.intDailyProductionSet.mmThanSrNo,
      loomNo: schema.intDailyProductionSet.loomNo,
      shed: schema.intDailyProduction.shedNo,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
    .where(and(eq(schema.intDailyProductionSet.contNo, cont), gte(schema.intDailyProduction.vDate, from), lte(schema.intDailyProduction.vDate, to)))
    .orderBy(schema.intDailyProduction.vDate);

  const despRows = await db
    .select({
      date: schema.intGreyDespatch.vDate,
      vNo: schema.intGreyDespatch.vNo,
      mtr: schema.intGreyDespatchLine.lengthMtrs,
      than: schema.intGreyDespatchLine.tSrNo,
    })
    .from(schema.intGreyDespatchLine)
    .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
    .where(and(eq(schema.intGreyDespatch.convContNo, cont), gte(schema.intGreyDespatch.vDate, from), lte(schema.intGreyDespatch.vDate, to)))
    .orderBy(schema.intGreyDespatch.vDate);

  // Opening = what stood on the books the day before FROM. The same three pieces
  // the summary report adds up, so the drill-down ties back to its OPENING
  // column instead of starting every contract at zero and running negative.
  const [openProd, openDesp, openInv] = await Promise.all([
    db
      .select({ s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0)),0)` })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
      .where(and(eq(schema.intDailyProductionSet.contNo, cont), lt(schema.intDailyProduction.vDate, from))),
    db
      .select({ s: sql<number>`COALESCE(SUM(COALESCE(${schema.intGreyDespatchLine.lengthMtrs},0)),0)` })
      .from(schema.intGreyDespatchLine)
      .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
      .where(and(eq(schema.intGreyDespatch.convContNo, cont), lt(schema.intGreyDespatch.vDate, from))),
    db
      .select({ s: sql<number>`COALESCE(SUM(COALESCE(${schema.inventoryOpening.openingQty},0)),0)` })
      .from(schema.inventoryOpening)
      .where(and(eq(schema.inventoryOpening.itemType, "GREY"), eq(schema.inventoryOpening.status, "A"), eq(schema.inventoryOpening.convContNo, cont))),
  ]);
  const opening = Number(openInv[0]?.s ?? 0) + Number(openProd[0]?.s ?? 0) - Number(openDesp[0]?.s ?? 0);

  // Index the period's despatch lines by the than they carried, so each than can
  // be stamped with the voucher it left on.
  const despByThan = new Map<string, { vNo: string; date: string; mtr: number }>();
  const unmatched: { vNo: string; date: string; mtr: number; than: string }[] = [];
  for (const d of despRows) {
    const than = ((d.than as unknown as string) ?? "").trim();
    const rec = { vNo: d.vNo, date: d.date, mtr: d.mtr ?? 0 };
    if (than && !despByThan.has(than)) despByThan.set(than, rec);
    else unmatched.push({ ...rec, than });
  }

  type Row = {
    date: string; vNo: string; kind: "P" | "D";
    a?: number | null; b?: number | null; c?: number | null; cp?: number | null;
    inQty: number; outQty: number; than: string;
    despVNo: string; despDate: string; loom: string;
  };

  const loomByVNo = new Map<string, string>();
  for (const r of prodRows) {
    if (r.loomNo != null && !loomByVNo.has(r.vNo))
      loomByVNo.set(r.vNo, `${r.shed ?? ""}|${r.loomNo}`);
  }
  const rows: Row[] = prodRows.map((r) => {
    const than = ((r.than as string) ?? "").trim();
    const d = than ? despByThan.get(than) : undefined;
    if (d) despByThan.delete(than);
    return {
      date: r.date,
      vNo: r.vNo,
      kind: "P" as const,
      a: r.a,
      b: r.b,
      c: r.c,
      cp: r.cp,
      inQty: r.total ?? 0,
      outQty: d?.mtr ?? 0,
      than,
      despVNo: d?.vNo ?? "",
      despDate: d?.date ?? "",
      loom: r.loomNo != null ? `${r.shed ?? ""}|${r.loomNo}` : loomByVNo.get(r.vNo) ?? "",
    };
  });

  // Anything left over went out against a than woven BEFORE this period — its
  // production row is not on screen, so it keeps a line of its own or the meters
  // would simply vanish out of the balance.
  const leftover = [...despByThan.entries()].map(([than, v]) => ({ ...v, than })).concat(unmatched);
  for (const d of leftover) {
    rows.push({
      date: d.date,
      vNo: d.vNo,
      kind: "D" as const,
      inQty: 0,
      outQty: d.mtr,
      than: d.than,
      despVNo: d.vNo,
      despDate: d.date,
      loom: "",
    });
  }

  let bal = opening;
  const totIn = rows.reduce((s, e) => s + e.inQty, 0);
  const totOut = rows.reduce((s, e) => s + e.outQty, 0);

  return (
    <Shell active="w-folding-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Folding — {cont}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contract?.party ?? ""} · {contract?.quality ?? ""}{contract?.designNo ? ` · Design ${contract.designNo}` : ""} · {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <a href={`/reports/weaving/folding-stock?from=${from}&to=${to}`} className="btn btn-outline btn-sm">Back</a>
          </div>
        </div>

        <style>{`@media print {
  @page { size: A4 portrait; margin: 10mm; }
  .overflow-x-auto { overflow: visible !important; }
  .overflow-x-auto table { min-width: 0 !important; width: 100% !important; font-size: 10px; }
  .overflow-x-auto th, .overflow-x-auto td { padding: 2px 4px !important; line-height: 1.1 !important; white-space: nowrap !important; }
}`}</style>
        
        <div className="hidden print:block mb-2 text-black">
          <div className="text-center font-bold text-[16px]">PENDING FOLDING PRODUCTION LEDGER</div>
          <div className="text-center text-[12px] mb-2">FROM: {from} TO: {to}</div>
          <table className="w-full border-t border-b border-black text-[12px] font-bold">
            <tbody>
              <tr>
                <td className="text-left py-1 text-blue-700">{contract?.party ?? ""}</td>
                <td className="text-right py-1 text-blue-700">
                  {contract?.quality ?? ""} &nbsp;&nbsp; <span className="text-red-600">{cont}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] print:text-[10px]" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>V.No</th>
                <th>Type</th>
                <th className="text-right">A</th>
                <th className="text-right">B</th>
                <th className="text-right">C</th>
                <th className="text-right">CP</th>
                <th className="text-right">Production</th>
                <th className="text-right">Despatch</th>
                <th>Than Sr#</th>
                <th>Desp V.No</th>
                <th>Loom#</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
                <td className="mono text-[12px]">{from}</td>
                <td colSpan={10} className="text-[11px]">OPENING</td>
                <td></td>
                <td className="mono text-right">{fmt2(opening)}</td>
              </tr>
              {rows.length === 0 ? (
                <tr><td colSpan={13} className="text-center text-[var(--muted)] py-8">No production or despatch for this contract in period.</td></tr>
              ) : (
                rows.map((e, i) => {
                  bal += e.inQty - e.outQty;
                  return (
                    <tr key={i} style={e.kind === "D" ? { background: "#f8fafc" } : undefined}>
                      <td className="mono text-[12px] whitespace-nowrap">{e.date}</td>
                      <td className="mono text-[12px] font-bold whitespace-nowrap">{e.vNo}</td>
                      <td className="text-[11px] font-semibold">{e.kind === "P" ? "PROD" : "DESP"}</td>
                      <td className="mono text-right">{e.kind === "P" && e.a ? fmt2(e.a) : ""}</td>
                      <td className="mono text-right">{e.kind === "P" && e.b ? fmt2(e.b) : ""}</td>
                      <td className="mono text-right">{e.kind === "P" && e.c ? fmt2(e.c) : ""}</td>
                      <td className="mono text-right">{e.kind === "P" && e.cp ? fmt2(e.cp) : ""}</td>
                      <td className="mono text-right">{e.inQty ? fmt2(e.inQty) : ""}</td>
                      <td className="mono text-right">{e.outQty ? fmt2(e.outQty) : ""}</td>
                      <td className="mono text-[12px]">{e.than || "—"}</td>
                      <td className="mono text-[12px] font-bold" title={e.despDate ? `Despatched ${e.despDate}` : undefined}>
                        {e.despVNo || ""}
                      </td>
                      <td className="mono text-[11px]">{e.loom || ""}</td>
                      <td className="mono text-right font-bold">{fmt2(bal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                <td colSpan={7} className="text-right pr-2">TOTAL</td>
                <td className="mono text-right">{fmt2(totIn)}</td>
                <td className="mono text-right">{fmt2(totOut)}</td>
                <td></td>
                <td></td>
                <td></td>
                <td className="mono text-right">{fmt2(opening + totIn - totOut)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Shell>
  );
}
