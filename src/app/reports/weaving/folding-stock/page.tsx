import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte, lt, sql } from "drizzle-orm";
import { fmt, sixMonthsAgo, todayIso } from "../../_shared";
import { loadConvContracts } from "@/lib/conv-contracts";

export const dynamic = "force-dynamic";

// Daily Folding Stock — per grey-conversion contract, grouped by party:
// Opening (net before from) + Production (set totalCount) − Despatch (grey despatch
// meters) = Balance. Production is linked by set.cont_no, despatch by convContNo.
export default async function FoldingStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || sixMonthsAgo();
  const to = p.to?.trim() || todayIso();

  const contracts = (await loadConvContracts())
    .map((c) => ({ contNo: c.contNo, party: c.party, quality: c.productQuality, productName: c.productName, designNo: c.designNo }))
    .sort((a, b) => (a.party ?? "").localeCompare(b.party ?? "") || a.contNo.localeCompare(b.contNo));

  const prodSum = async (before: boolean) =>
    db
      .select({
        cont: schema.intDailyProductionSet.contNo,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0)),0)`,
      })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
      .where(before ? lt(schema.intDailyProduction.vDate, from) : and(gte(schema.intDailyProduction.vDate, from), lte(schema.intDailyProduction.vDate, to)))
      .groupBy(schema.intDailyProductionSet.contNo);

  const despSum = async (before: boolean) =>
    db
      .select({
        cont: schema.intGreyDespatch.convContNo,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intGreyDespatchLine.lengthMtrs},0)),0)`,
      })
      .from(schema.intGreyDespatchLine)
      .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
      .where(before ? lt(schema.intGreyDespatch.vDate, from) : and(gte(schema.intGreyDespatch.vDate, from), lte(schema.intGreyDespatch.vDate, to)))
      .groupBy(schema.intGreyDespatch.convContNo);

  const rejSum = async () =>
    db
      .select({
        cont: schema.intDailyProductionSet.contNo,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.rejCount},0)),0)`,
      })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
      .where(and(gte(schema.intDailyProduction.vDate, from), lte(schema.intDailyProduction.vDate, to)))
      .groupBy(schema.intDailyProductionSet.contNo);

  const allContNos = (await loadConvContracts()).map((c) => c.contNo);
  const activeLooms = allContNos.length
    ? await db
        .select({ contractNo: schema.beams.contractNo, loomNo: schema.beams.loomNo, shed: schema.beams.shed })
        .from(schema.beams)
        .where(
          and(
            inArray(schema.beams.statusWrk, ["RUNNING", "PRODUCTION", "KNOTTING"]),
            inArray(schema.beams.contractNo, allContNos)
          )
        )
    : [];
  const loomsByContract = new Map<string, string[]>();
  for (const b of activeLooms) {
    if (!b.contractNo || b.loomNo == null) continue;
    const label = b.shed ? `${b.shed}-${b.loomNo}` : String(b.loomNo);
    const arr = loomsByContract.get(b.contractNo) ?? [];
    if (!arr.includes(label)) arr.push(label);
    loomsByContract.set(b.contractNo, arr);
  }

  const [prodOpen, prodPer, despOpen, despPer, rejPer, invOpen] = await Promise.all([
    prodSum(true),
    prodSum(false),
    despSum(true),
    despSum(false),
    rejSum(),
    // Manually-entered opening lots (Inventory Opening → Grey Lots Open Stock)
    // are keyed to a conversion contract via conv_cont_no; sum their qty for the
    // OPENING column so what the operator seeds shows up straight away.
    db
      .select({
        cont: schema.inventoryOpening.convContNo,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.inventoryOpening.openingQty},0)),0)`,
      })
      .from(schema.inventoryOpening)
      .where(and(eq(schema.inventoryOpening.itemType, "GREY"), eq(schema.inventoryOpening.status, "A")))
      .groupBy(schema.inventoryOpening.convContNo),
  ]);
  const toMap = (rows: { cont: string | null; s: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.cont) m.set(r.cont, Number(r.s ?? 0));
    return m;
  };
  const prodOpenM = toMap(prodOpen), prodPerM = toMap(prodPer), despOpenM = toMap(despOpen), despPerM = toMap(despPer), rejPerM = toMap(rejPer);
  const invOpenM = toMap(invOpen);

  type Row = { contNo: string; party: string; quality: string; designNo: string; opening: number; production: number; rejection: number; despatch: number; total: number; balance: number; looms: string[] };
  const rows: Row[] = contracts
    .map((c) => {
      const opening = (invOpenM.get(c.contNo) ?? 0) + (prodOpenM.get(c.contNo) ?? 0) - (despOpenM.get(c.contNo) ?? 0);
      const production = prodPerM.get(c.contNo) ?? 0;
      const rejection = rejPerM.get(c.contNo) ?? 0;
      const despatch = despPerM.get(c.contNo) ?? 0;
      const total = opening + production;
      return {
        contNo: c.contNo,
        party: c.party ?? "—",
        quality: c.quality ?? c.productName ?? "—",
        designNo: c.designNo ?? "—",
        looms: loomsByContract.get(c.contNo) ?? [],
        opening, production, rejection, despatch, total, balance: total - despatch,
      };
    })
    // Only contracts with any movement or balance.
    .filter((r) => r.opening || r.production || r.despatch || r.rejection);

  const byParty = new Map<string, Row[]>();
  for (const r of rows) (byParty.get(r.party) ?? byParty.set(r.party, []).get(r.party)!).push(r);
  const groups = Array.from(byParty.entries());

  const grand = rows.reduce(
    (a, r) => ({ opening: a.opening + r.opening, production: a.production + r.production, rejection: a.rejection + r.rejection, despatch: a.despatch + r.despatch, balance: a.balance + r.balance }),
    { opening: 0, production: 0, rejection: 0, despatch: 0, balance: 0 },
  );

  return (
    <Shell active="w-folding-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Daily Folding Stock</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Opening + Production − Despatch = Balance, per conversion contract · {from} to {to}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <form method="GET" className="flex items-end gap-2">
              <div>
                <label className="label block mb-1">From</label>
                <input type="date" name="from" defaultValue={from} className="input-box mono" />
              </div>
              <div>
                <label className="label block mb-1">To</label>
                <input type="date" name="to" defaultValue={to} className="input-box mono" />
              </div>
              <button className="btn btn-sm">View</button>
            </form>
            <PrintButton />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table style={{ minWidth: 960 }}>
            <thead>
              <tr>
                <th>Quality</th>
                <th>Contract</th>
                <th>Design#</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Production</th>
                <th className="text-right">Rejection</th>
                <th className="text-right">Total</th>
                <th className="text-right">Despatch</th>
                <th className="text-right">Balance</th>
                <th>Loom#</th>
                <th className="no-print"></th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-[var(--muted)] py-8">No folding stock movement in this period.</td></tr>
              ) : (
                groups.flatMap(([party, prs]) => {
                  const sub = prs.reduce(
                    (a, r) => ({ opening: a.opening + r.opening, production: a.production + r.production, rejection: a.rejection + r.rejection, despatch: a.despatch + r.despatch, total: a.total + r.total, balance: a.balance + r.balance }),
                    { opening: 0, production: 0, rejection: 0, despatch: 0, total: 0, balance: 0 },
                  );
                  return [
                    <tr key={`h-${party}`} style={{ background: "#0f172a", color: "white" }}>
                      <td colSpan={11} className="mono font-bold text-[12px] px-2 py-1">{party}</td>
                    </tr>,
                    ...prs.map((r) => (
                      <tr key={`${party}-${r.contNo}`}>
                        <td className="text-[12px]">{r.quality}</td>
                        <td className="mono text-[12px] font-bold">{r.contNo}</td>
                        <td className="mono text-[12px]">{r.designNo}</td>
                        <td className="mono text-right">{fmt(r.opening)}</td>
                        <td className="mono text-right">{fmt(r.production)}</td>
                        <td className="mono text-right">{fmt(r.rejection)}</td>
                        <td className="mono text-right">{fmt(r.total)}</td>
                        <td className="mono text-right">{fmt(r.despatch)}</td>
                        <td className="mono text-right font-bold">{fmt(r.balance)}</td>
                        <td className="text-[10px] mono">
                          {r.looms.map((l) => (
                            <span key={l} style={{ display: "inline-block", border: "1px solid #aaa", borderRadius: 2, padding: "0 3px", margin: "1px", background: "#f8fafc" }}>{l}</span>
                          ))}
                        </td>
                        <td className="no-print text-center">
                          <a href={`/reports/weaving/folding-stock/${encodeURIComponent(r.contNo)}?from=${from}&to=${to}`} className="btn btn-outline btn-sm" title="Production detail">P</a>
                        </td>
                      </tr>
                    )),
                    <tr key={`s-${party}`} style={{ background: "#f1f5f9", fontWeight: 700 }}>
                      <td colSpan={3} className="text-right pr-2">{party} TOTAL</td>
                      <td className="mono text-right">{fmt(sub.opening)}</td>
                      <td className="mono text-right">{fmt(sub.production)}</td>
                      <td className="mono text-right">{fmt(sub.rejection)}</td>
                      <td className="mono text-right">{fmt(sub.total)}</td>
                      <td className="mono text-right">{fmt(sub.despatch)}</td>
                      <td className="mono text-right">{fmt(sub.balance)}</td>
                      <td></td>
                      <td className="no-print"></td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3} className="text-right pr-2">GRAND TOTAL</td>
                  <td className="mono text-right">{fmt(grand.opening)}</td>
                  <td className="mono text-right">{fmt(grand.production)}</td>
                  <td className="mono text-right">{fmt(grand.rejection)}</td>
                  <td className="mono text-right">{fmt(grand.opening + grand.production)}</td>
                  <td className="mono text-right">{fmt(grand.despatch)}</td>
                  <td className="mono text-right">{fmt(grand.balance)}</td>
                  <td></td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
