import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { and, asc, eq, lte } from "drizzle-orm";
import { fmt2, sixMonthsAgo, todayIso } from "../../../_shared";

export const dynamic = "force-dynamic";

// Drill-down from the Daily Folding Stock report for one grey-conversion
// contract, in two views (owner 2026-10):
//   P — PENDING: only the thans still lying in folding stock as of TO. A than
//       that has gone out on a despatch is not stock any more and is left out.
//   D — the period's production register: every than woven FROM–TO with the
//       despatch V.No it went out on in front of it (the client's original sheet).
// A than is despatched when a grey-despatch line carries its serial; opening
// stock lots travel as OPN-<id>.
export default async function FoldingStockDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cont: string }>;
  searchParams: Promise<{ from?: string; to?: string; view?: string }>;
}) {
  const { cont: contRaw } = await params;
  const cont = decodeURIComponent(contRaw);
  const sp = await searchParams;
  const from = sp.from?.trim() || sixMonthsAgo();
  const to = sp.to?.trim() || todayIso();
  const view = sp.view === "D" ? "D" : "P";

  const [contract] = await db
    .select({
      party: schema.intGreyConversionContract.party,
      quality: schema.intGreyConversionContract.productQuality,
      productName: schema.intGreyConversionContract.productName,
      designNo: schema.intGreyConversionContract.designNo,
    })
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.contNo, cont));

  let mainDesc = "";
  if (contract?.productName) {
    const [prod] = await db.select({ mainDesc: schema.products.mainDesc }).from(schema.products).where(eq(schema.products.description, contract.productName));
    if (prod?.mainDesc) mainDesc = prod.mainDesc;
  }

  const [prodRows, despRows, openRows] = await Promise.all([
    db
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
      .where(and(eq(schema.intDailyProductionSet.contNo, cont), lte(schema.intDailyProduction.vDate, to)))
      .orderBy(asc(schema.intDailyProduction.vDate), asc(schema.intDailyProduction.id), asc(schema.intDailyProductionSet.id)),
    db
      .select({
        date: schema.intGreyDespatch.vDate,
        vNo: schema.intGreyDespatch.vNo,
        mtr: schema.intGreyDespatchLine.lengthMtrs,
        than: schema.intGreyDespatchLine.tSrNo,
      })
      .from(schema.intGreyDespatchLine)
      .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
      .where(and(eq(schema.intGreyDespatch.convContNo, cont), lte(schema.intGreyDespatch.vDate, to)))
      .orderBy(asc(schema.intGreyDespatch.vDate), asc(schema.intGreyDespatch.id), asc(schema.intGreyDespatchLine.srNo)),
    db
      .select({
        id: schema.inventoryOpening.id,
        qty: schema.inventoryOpening.openingQty,
        netMtr: schema.inventoryOpening.netMtr,
        date: schema.inventoryOpening.entryDate,
        voucherNo: schema.inventoryOpening.voucherNo,
        than: schema.inventoryOpening.than,
        description: schema.inventoryOpening.description,
      })
      .from(schema.inventoryOpening)
      .where(and(eq(schema.inventoryOpening.itemType, "GREY"), eq(schema.inventoryOpening.status, "A"), eq(schema.inventoryOpening.convContNo, cont))),
  ]);

  const serialOf = (v: unknown) => String(v ?? "").trim();
  const loomOf = (r: (typeof prodRows)[number]) => (r.loomNo != null ? `${r.shed ?? ""}|${r.loomNo}` : "");
  const despatched = new Set(despRows.map((d) => serialOf(d.than)).filter(Boolean));

  // ── P: what is still in stock ──
  type Pending = { date: string; vNo: string; kind: "OPENING" | "PROD"; a?: number | null; b?: number | null; c?: number | null; cp?: number | null; mtr: number; than: string; loom: string };
  const pending: Pending[] = [
    ...openRows
      .filter((o) => !despatched.has(`OPN-${o.id}`))
      .map((o) => ({
        date: o.date ?? "",
        vNo: o.voucherNo || `OPN-${o.id}`,
        kind: "OPENING" as const,
        mtr: o.qty ?? o.netMtr ?? 0,
        than: o.than ? `${o.than} than` : `OPN-${o.id}`,
        loom: "",
      })),
    ...prodRows
      .filter((r) => !despatched.has(serialOf(r.than)))
      .map((r) => ({ date: r.date, vNo: r.vNo, kind: "PROD" as const, a: r.a, b: r.b, c: r.c, cp: r.cp, mtr: r.total ?? 0, than: serialOf(r.than), loom: loomOf(r) })),
  ];
  const pendingTotal = pending.reduce((s, r) => s + r.mtr, 0);

  // ── D: the period's production register (the client's original sheet) ──
  // One row per than woven FROM–TO with the despatch V.No it went out on in front
  // of it — "IDP-0153/A went out on IGD-0006" — so a despatch is not repeated as a
  // row underneath. A despatch of a than woven BEFORE FROM keeps a DESP row of
  // its own (its production row is off screen). Opens on the OPENING balance.
  const prodPeriod = prodRows.filter((r) => r.date >= from);
  const despPeriod = despRows.filter((d) => d.date >= from);
  const opening =
    openRows.reduce((s, o) => s + (o.qty ?? 0), 0) +
    prodRows.filter((r) => r.date < from).reduce((s, r) => s + (r.total ?? 0), 0) -
    despRows.filter((d) => d.date < from).reduce((s, d) => s + (d.mtr ?? 0), 0);
  const despByThan = new Map<string, { vNo: string; date: string; mtr: number }>();
  const unmatched: { vNo: string; date: string; mtr: number; than: string }[] = [];
  for (const d of despPeriod) {
    const than = serialOf(d.than);
    const rec = { vNo: d.vNo, date: d.date, mtr: d.mtr ?? 0 };
    if (than && !despByThan.has(than)) despByThan.set(than, rec);
    else unmatched.push({ ...rec, than });
  }
  const loomByVNo = new Map<string, string>();
  for (const r of prodPeriod) if (r.loomNo != null && !loomByVNo.has(r.vNo)) loomByVNo.set(r.vNo, loomOf(r));
  type Reg = {
    date: string; vNo: string; kind: "P" | "D";
    a?: number | null; b?: number | null; c?: number | null; cp?: number | null;
    inQty: number; outQty: number; than: string; despVNo: string; despDate: string; loom: string;
  };
  const register: Reg[] = prodPeriod.map((r) => {
    const than = serialOf(r.than);
    const d = than ? despByThan.get(than) : undefined;
    if (d) despByThan.delete(than);
    return {
      date: r.date, vNo: r.vNo, kind: "P" as const, a: r.a, b: r.b, c: r.c, cp: r.cp,
      inQty: r.total ?? 0, outQty: d?.mtr ?? 0, than, despVNo: d?.vNo ?? "", despDate: d?.date ?? "",
      loom: r.loomNo != null ? loomOf(r) : loomByVNo.get(r.vNo) ?? "",
    };
  });
  for (const d of [...[...despByThan.entries()].map(([than, v]) => ({ ...v, than })), ...unmatched]) {
    register.push({ date: d.date, vNo: d.vNo, kind: "D", inQty: 0, outQty: d.mtr, than: d.than, despVNo: d.vNo, despDate: d.date, loom: "" });
  }
  const regIn = register.reduce((s, e) => s + e.inQty, 0);
  const regOut = register.reduce((s, e) => s + e.outQty, 0);

  const base = `/reports/weaving/folding-stock/${encodeURIComponent(cont)}?from=${from}&to=${to}`;
  const tab = (v: "P" | "D", label: string) => (
    <a href={`${base}&view=${v}`} className={`btn btn-sm ${view === v ? "" : "btn-outline"}`}>{label}</a>
  );

  return (
    <Shell active="w-folding-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Folding — {cont}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contract?.party ?? ""} · {contract?.quality ?? ""}{contract?.designNo ? ` · Design ${contract.designNo}` : ""} ·{" "}
              {view === "P" ? `stock as of ${to}` : `${from} to ${to}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {tab("P", "P · Pending stock")}
            {tab("D", "D · Production & despatch")}
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
          <div className="text-center font-bold text-[16px]">{view === "P" ? "FOLDING STOCK — PENDING THANS" : "PENDING FOLDING PRODUCTION LEDGER"}</div>
          <div className="text-center text-[12px] mb-2">{view === "P" ? `STOCK AS OF: ${to}` : `FROM: ${from} TO: ${to}`}</div>
          <table className="w-full border-t border-b border-black text-[12px] font-bold">
            <tbody>
              <tr>
                <td className="text-left py-1 text-blue-700 w-1/3">{contract?.party ?? ""}</td>
                <td className="text-center py-1 w-1/3 text-[11px] text-[var(--muted)]">{mainDesc}</td>
                <td className="text-right py-1 text-blue-700 w-1/3">
                  {contract?.quality ?? ""} &nbsp;&nbsp; <span className="text-red-600">{cont}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {view === "P" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] print:text-[10px]" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>V.No</th>
                  <th>Type</th>
                  <th className="text-right">A</th>
                  <th className="text-right">B</th>
                  <th className="text-right">C</th>
                  <th className="text-right">CP</th>
                  <th className="text-right">Meters</th>
                  <th>Than Sr#</th>
                  <th>Loom#</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {pending.length === 0 ? (
                  <tr><td colSpan={11} className="text-center text-[var(--muted)] py-8">Nothing of this contract is lying in folding stock.</td></tr>
                ) : (
                  (() => {
                    let bal = 0;
                    return pending.map((e, i) => {
                      bal += e.mtr;
                      return (
                        <tr key={i} style={e.kind === "OPENING" ? { background: "#f1f5f9" } : undefined}>
                          <td className="mono text-[12px] whitespace-nowrap">{e.date}</td>
                          <td className="mono text-[12px] font-bold whitespace-nowrap">{e.vNo}</td>
                          <td className="text-[11px] font-semibold">{e.kind === "OPENING" ? "OPENING" : "PROD"}</td>
                          <td className="mono text-right">{e.a ? fmt2(e.a) : ""}</td>
                          <td className="mono text-right">{e.b ? fmt2(e.b) : ""}</td>
                          <td className="mono text-right">{e.c ? fmt2(e.c) : ""}</td>
                          <td className="mono text-right">{e.cp ? fmt2(e.cp) : ""}</td>
                          <td className="mono text-right">{fmt2(e.mtr)}</td>
                          <td className="mono text-[12px]">{e.than || "—"}</td>
                          <td className="mono text-[11px]">{e.loom}</td>
                          <td className="mono text-right font-bold">{fmt2(bal)}</td>
                        </tr>
                      );
                    });
                  })()
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={7} className="text-right pr-2">IN STOCK · {pending.length} {pending.length === 1 ? "entry" : "entries"}</td>
                  <td className="mono text-right">{fmt2(pendingTotal)}</td>
                  <td colSpan={2}></td>
                  <td className="mono text-right">{fmt2(pendingTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
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
                {register.length === 0 ? (
                  <tr><td colSpan={13} className="text-center text-[var(--muted)] py-8">No production or despatch for this contract in period.</td></tr>
                ) : (
                  (() => {
                    let bal = opening;
                    let cumProd = 0;
                    let cumDesp = 0;
                    return register.map((e, i) => {
                      bal += e.inQty - e.outQty;
                      if (e.kind === "P") cumProd += e.inQty || 0;
                      if (e.kind === "D") cumDesp += e.outQty || 0;
                      return (
                        <tr key={i} style={e.kind === "D" ? { background: "#f8fafc" } : undefined}>
                          <td className="mono text-[12px] whitespace-nowrap">{e.date}</td>
                          <td className="mono text-[12px] font-bold whitespace-nowrap">{e.vNo}</td>
                          <td className="text-[11px] font-semibold">{e.kind === "P" ? "PROD" : "DESP"}</td>
                          <td className="mono text-right">{e.kind === "P" && e.a ? fmt2(e.a) : ""}</td>
                          <td className="mono text-right">{e.kind === "P" && e.b ? fmt2(e.b) : ""}</td>
                          <td className="mono text-right">{e.kind === "P" && e.c ? fmt2(e.c) : ""}</td>
                          <td className="mono text-right">{e.kind === "P" && e.cp ? fmt2(e.cp) : ""}</td>
                          <td className="mono text-right">{e.kind === "P" ? fmt2(cumProd) : ""}</td>
                          <td className="mono text-right">{e.kind === "D" ? fmt2(cumDesp) : ""}</td>
                          <td className="mono text-[12px]">{e.than || "—"}</td>
                          <td className="mono text-[12px] font-bold" title={e.despDate ? `Despatched ${e.despDate}` : undefined}>
                            {e.despVNo || ""}
                          </td>
                          <td className="mono text-[11px]">{e.loom || ""}</td>
                          <td className="mono text-right font-bold">{fmt2(bal)}</td>
                        </tr>
                      );
                    });
                  })()
                )}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={7} className="text-right pr-2">TOTAL</td>
                  <td className="mono text-right">{fmt2(regIn)}</td>
                  <td className="mono text-right">{fmt2(regOut)}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td className="mono text-right">{fmt2(opening + regIn - regOut)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
