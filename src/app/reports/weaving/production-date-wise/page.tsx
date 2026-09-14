import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { fmt2, todayIso } from "../../_shared";

export const dynamic = "force-dynamic";

function daysBackFrom(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() - (n - 1));
  return dt.toISOString().slice(0, 10);
}

/** 2026-09-01 → 01-09-26, the column heading Oracle prints. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
}

/**
 * PRODUCTION DATE WISE (WVG) — Oracle DAILY_PRODUCTION_VDATES parity.
 *
 * One block per shed; inside it one sub-block per date laid left to right and
 * wrapping, each listing that date's entries as V.No / Loom / Meters with its
 * own total. Deliberately NOT a loom x date pivot: each date carries its own
 * set of looms (01-09 runs looms 13,15,16.., 02-09 runs 1,3,4,5..), so aligning
 * looms across dates would invent blank cells the Oracle report never shows.
 *
 * Shed and loom come off the BEAM the set row names rather than the voucher:
 * the daily-production header no longer carries Shed No, and the set row's own
 * loom_no is only stamped when the beam was picked with a loom (same join
 * Daily Folding uses).
 */
export default async function ProductionDateWisePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; shed?: string; loom?: string; quality?: string }>;
}) {
  const params = await searchParams;
  const today = todayIso();
  const to = params.to?.trim() || today;
  const from = params.from?.trim() || daysBackFrom(to, 12);
  const shedQ = params.shed?.trim() || "";
  const loomQ = params.loom?.trim() || "";
  const qualityQ = params.quality?.trim() || "";

  const conds = [
    gte(schema.intDailyProduction.vDate, from),
    lte(schema.intDailyProduction.vDate, to),
  ];
  if (shedQ) conds.push(eq(schema.beams.shed, shedQ));
  if (loomQ) conds.push(eq(schema.beams.loomNo, Number(loomQ)));
  if (qualityQ) conds.push(eq(schema.intDailyProductionSet.contNo, qualityQ));

  const shedExpr = sql<string | null>`coalesce(${schema.beams.shed}, ${schema.intDailyProduction.shedNo})`;
  const loomExpr = sql<number | null>`coalesce(${schema.beams.loomNo}, ${schema.intDailyProductionSet.loomNo})`;

  const raw = await db
    .select({
      vNo: schema.intDailyProduction.vNo,
      vDate: schema.intDailyProduction.vDate,
      shed: shedExpr,
      loomNo: loomExpr,
      total: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(
      schema.intDailyProduction,
      eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id),
    )
    .leftJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(...conds))
    .groupBy(schema.intDailyProduction.vNo, schema.intDailyProduction.vDate, shedExpr, loomExpr)
    .orderBy(schema.intDailyProduction.vDate, schema.intDailyProduction.vNo);

  // Contract list for the Product Quality filter.
  const contracts = await db
    .select({ contNo: schema.intGreyConversionContract.contNo, name: schema.intGreyConversionContract.productName })
    .from(schema.intGreyConversionContract)
    .orderBy(schema.intGreyConversionContract.contNo);

  type Entry = { vNo: string; loom: string; mtrs: number };
  // shed -> date -> entries, in the order Oracle prints them.
  const byShed = new Map<string, Map<string, Entry[]>>();
  for (const r of raw) {
    const shed = r.shed ?? "—";
    const byDate = byShed.get(shed) ?? new Map<string, Entry[]>();
    const list = byDate.get(r.vDate) ?? [];
    list.push({ vNo: r.vNo, loom: r.loomNo == null ? "—" : String(r.loomNo), mtrs: Number(r.total ?? 0) });
    byDate.set(r.vDate, list);
    byShed.set(shed, byDate);
  }

  const sheds = [...byShed.keys()].sort();
  const sum = (es: Entry[]) => es.reduce((a, e) => a + e.mtrs, 0);
  const shedTotal = (shed: string) =>
    [...(byShed.get(shed)?.values() ?? [])].reduce((a, es) => a + sum(es), 0);
  const grandTotal = sheds.reduce((a, s) => a + shedTotal(s), 0);

  const excelRows = sheds.flatMap((shed) =>
    [...(byShed.get(shed)?.entries() ?? [])].flatMap(([d, es]) =>
      es.map((e) => ({ shed, date: shortDate(d), vNo: e.vNo, loom: e.loom, mtrs: e.mtrs })),
    ),
  );
  const excelCols = [
    { key: "shed", label: "Shed" },
    { key: "date", label: "Date" },
    { key: "vNo", label: "V.No" },
    { key: "loom", label: "Loom" },
    { key: "mtrs", label: "Meters" },
  ];

  return (
    <Shell active="w-prod-date-wise">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Production Date Wise (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              One block per date, per shed · V.No / Loom / Meters · {from} to {to}
              {shedQ ? ` · Shed ${shedQ}` : ""}
              {loomQ ? ` · Loom ${loomQ}` : ""}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <ExcelExportButton rows={excelRows} columns={excelCols} filename="production-date-wise" title="Production Date Wise (WVG)" />
            <PrintButton />
          </div>
        </div>

        <form method="GET" className="flex items-end gap-2 flex-wrap mb-5 no-print border border-black p-3">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Shed No</label>
            <select name="shed" defaultValue={shedQ} className="input-box mono" style={{ minWidth: 90 }}>
              <option value="">All</option>
              {["1", "2", "3"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Loom No</label>
            <input name="loom" type="number" defaultValue={loomQ} className="input-box mono" style={{ width: 90 }} placeholder="All" />
          </div>
          <div>
            <label className="label block mb-1">Product Quality</label>
            <select name="quality" defaultValue={qualityQ} className="input-box mono" style={{ minWidth: 200 }}>
              <option value="">All</option>
              {contracts.map((c) => (
                <option key={c.contNo} value={c.contNo}>
                  {c.contNo}{c.name ? ` — ${c.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm">View</button>
        </form>

        {sheds.length === 0 ? (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            No production in this range.
          </div>
        ) : (
          sheds.map((shed) => {
            const dates = [...(byShed.get(shed)?.keys() ?? [])].sort();
            return (
              <div key={shed} className="mb-6 border border-black">
                <div className="bg-[var(--accent)] text-white px-3 py-1.5 text-[12px] uppercase tracking-[0.1em] font-semibold">
                  Shed # : {shed}
                </div>
                {/* Date blocks flow left to right and wrap, the way the Oracle
                    page tiles them across the sheet. */}
                <div className="flex flex-wrap gap-3 p-3">
                  {dates.map((d) => {
                    const entries = byShed.get(shed)!.get(d)!;
                    return (
                      <div key={d} className="border border-black">
                        <div className="border-b border-black bg-gray-100 px-2 py-1 text-center mono text-[12px] font-semibold">
                          {shortDate(d)}
                        </div>
                        <table className="mono text-[11px]">
                          <thead>
                            <tr className="border-b border-[var(--border-light)] text-[var(--muted)]">
                              <th className="px-2 py-0.5 text-left font-normal">V.No</th>
                              <th className="px-2 py-0.5 text-right font-normal">Loom</th>
                              <th className="px-2 py-0.5 text-right font-normal">Mtrs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map((e, i) => (
                              <tr key={`${e.vNo}-${e.loom}-${i}`}>
                                <td className="px-2 py-0.5 whitespace-nowrap">{e.vNo}</td>
                                <td className="px-2 py-0.5 text-right">{e.loom}</td>
                                <td className="px-2 py-0.5 text-right">{fmt2(e.mtrs)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-black font-bold">
                              <td className="px-2 py-0.5" colSpan={2} />
                              <td className="px-2 py-0.5 text-right">{fmt2(sum(entries))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-black px-3 py-1.5 flex items-center justify-between bg-gray-50">
                  <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Shed {shed} Total</span>
                  <span className="mono text-[13px] font-bold">{fmt2(shedTotal(shed))}</span>
                </div>
              </div>
            );
          })
        )}

        {sheds.length > 0 && (
          <div className="border-2 border-black px-4 py-2 flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-[0.1em] font-semibold">Grand Total</span>
            <span className="mono text-[15px] font-bold">{fmt2(grandTotal)}</span>
          </div>
        )}
      </div>
    </Shell>
  );
}
