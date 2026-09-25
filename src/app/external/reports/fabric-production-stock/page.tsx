import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { today as pkToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const LOOM_TYPES = ["SULZER", "AIRJET"];

export default async function FabricProductionStockPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    fparty?: string;
    fstatus?: string;
    floom?: string;
  }>;
}) {
  const params = await searchParams;
  const fParty = (params.fparty ?? "").trim();
  const fStatus = (params.fstatus ?? "R").trim();
  const fLoom = (params.floom ?? "").trim();
  const from = (params.from ?? "").trim();
  const to = (params.to ?? "").trim();
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

  const usedParties = [...new Set(allContracts.map((c) => c.party).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.party !== fParty) return false;
    if (fLoom && c.loomType !== fLoom) return false;
    if (from && (c.contDate ?? "") < from) return false;
    if (to && (c.contDate ?? "") > to) return false;
    return true;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const rows = contracts.map((c) => {
    const qty = c.qtyMtr ?? 0;
    const pickVal = c.pick ?? 0;
    const reedVal = (() => {
      const code = c.grayQltyCode ?? c.grayCode ?? null;
      const g = code ? greyReedPick.get(code) : null;
      return g?.reed ?? (c.read ?? null);
    })();
    const rPick = c.ratePerPick ?? 0;
    const rateMtr = c.convRatePerMtr ?? 0;
    const amount = round2(qty * rateMtr);
    const sRate = c.grayRatePerMtr ?? 0;
    const totalAmt = round2(qty * sRate);
    const mainDesc = c.productName ? productMainDesc.get(c.productName) ?? "" : "";
    const constrCode = c.grayQltyCode ?? c.grayCode ?? null;
    const gInfo = constrCode ? greyReedPick.get(constrCode) : null;
    const quality = gInfo?.reed && gInfo?.pick ? `${gInfo.reed}×${gInfo.pick}` : "";
    return {
      id: c.id,
      productName: c.productName ?? "-",
      mainDesc,
      quality,
      contNo: c.contNo ?? "",
      designNo: c.designNo ?? "",
      production: qty,
      reed: reedVal,
      pick: pickVal,
      rPick,
      rateMtr,
      amount,
      sRate,
      totalAmt,
    };
  });

  const n = rows.length;
  const totProduction = round2(rows.reduce((s, r) => s + r.production, 0));
  const totAmount = round2(rows.reduce((s, r) => s + r.amount, 0));
  const totTotalAmt = round2(rows.reduce((s, r) => s + r.totalAmt, 0));
  const avgReed = n ? round2(rows.reduce((s, r) => s + (r.reed ?? 0), 0) / n) : 0;
  const avgPick = n ? round2(rows.reduce((s, r) => s + r.pick, 0) / n) : 0;
  const avgRPick = n ? round2(rows.reduce((s, r) => s + r.rPick, 0) / n) : 0;
  const avgRateMtr = n ? round2(rows.reduce((s, r) => s + r.rateMtr, 0) / n) : 0;
  const avgSRate = n ? round2(rows.reduce((s, r) => s + r.sRate, 0) / n) : 0;

  const fmt = (v: number) => v ? v.toLocaleString("en-US") : "";
  const fmt2 = (v: number) => v ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const excelRows = rows.map((r) => ({
    quality: r.productName,
    mainDesc: r.mainDesc,
    reedPick: r.quality,
    contNo: r.contNo,
    designNo: r.designNo,
    production: r.production,
    pick: r.pick,
    rPick: r.rPick,
    rateMtr: r.rateMtr,
    amount: r.amount,
    sRate: r.sRate,
    totalAmt: r.totalAmt,
  }));

  const dateLabel = from || to
    ? `${from || "…"} — ${to || today}`
    : "";

  return (
    <Shell active="ext-r-fabric-prod">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4">
          <h1 className="page-title">FABRIC PRODUCTION &amp; STOCK</h1>
          <div className="flex gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "quality", label: "Quality" },
                { key: "mainDesc", label: "Main Desc" },
                { key: "reedPick", label: "Reed×Pick" },
                { key: "contNo", label: "Contract" },
                { key: "designNo", label: "Design #" },
                { key: "production", label: "Production" },
                { key: "pick", label: "Pick" },
                { key: "rPick", label: "R/Pick" },
                { key: "rateMtr", label: "Rate/Mtr" },
                { key: "amount", label: "Amount" },
                { key: "sRate", label: "S.Rate" },
                { key: "totalAmt", label: "Total Amt" },
              ]}
              filename="fabric-production-stock"
              sheetName="FabricProdStock"
            />
            <PrintButton />
          </div>
        </div>

        <form
          action="/external/reports/fabric-production-stock"
          method="get"
          className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-4"
        >
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
          {(from || to || fParty || fStatus !== "R" || fLoom) && (
            <a href="/external/reports/fabric-production-stock" className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        {dateLabel && (
          <div className="text-center text-[13px] font-bold mb-2 mono">{dateLabel}</div>
        )}

        <div className="border border-black">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ backgroundColor: "#1a6b1a", color: "white" }}>
                  <th className="px-2 py-2 text-left border-r border-green-800" style={{ minWidth: 200 }}>Quality</th>
                  <th className="px-2 py-2 text-left border-r border-green-800">Contract</th>
                  <th className="px-2 py-2 text-left border-r border-green-800">Design #</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">Production</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">Pick</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">R/Pick</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">Rate/Mtr</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">Amount</th>
                  <th className="px-2 py-2 text-right border-r border-green-800">S.Rate</th>
                  <th className="px-2 py-2 text-right">Total Amt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)]">
                      <div className="font-bold">{r.productName}</div>
                      {r.mainDesc && <div className="text-[11px] text-[var(--muted)]">{r.mainDesc}</div>}
                      {r.quality && <div className="text-[10px] mono text-[var(--muted)]">{r.quality}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono">{r.contNo}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono">{r.designNo || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt2(r.production)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.pick || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rPick || "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.rateMtr ? fmt2(r.rateMtr) : "-"}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{fmt(r.amount)}</td>
                    <td className="px-2 py-1.5 border-r border-[var(--border-light)] mono text-right">{r.sRate ? fmt2(r.sRate) : ""}</td>
                    <td className="px-2 py-1.5 mono text-right">{r.totalAmt ? fmt(r.totalAmt) : ""}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-[var(--muted)] py-8 text-[13px]">
                      No contracts match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: "#1a6b1a", color: "white" }} className="font-bold">
                    <td className="px-2 py-2 border-r border-green-800" colSpan={3}>Total</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt2(totProduction)}</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt2(avgPick)}</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt2(avgRPick)}</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt2(avgRateMtr)}</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt(totAmount)}</td>
                    <td className="px-2 py-2 border-r border-green-800 mono text-right">{fmt2(avgSRate)}</td>
                    <td className="px-2 py-2 mono text-right">{fmt(totTotalAmt)}</td>
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
