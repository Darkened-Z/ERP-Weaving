import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { today } from "@/lib/time";

export const dynamic = "force-dynamic";

// Oracle DAILY_FOLDING_FABRIC_WOS ("Fabric Production & Stock", owner 2026-10):
// per conversion contract, the metres woven in the period × the contract's
// rate per metre (pick × rate/pick) = the conversion billing. A day range
// gives the day's billing, a month range the month's; the day-wise table
// below splits the range by date.

const mtr = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);
const amt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const dec = (n: number, dp: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: dp }).format(n);

function monthStart(d: string) {
  return d.slice(0, 7) + "-01";
}
function prevMonth(d: string) {
  const dt = new Date(monthStart(d) + "T00:00:00Z");
  dt.setUTCDate(0);
  const end = dt.toISOString().slice(0, 10);
  return { from: monthStart(end), to: end };
}

export default async function FabricProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  const p = await searchParams;
  const now = today();
  const to = p.to?.trim() || now;
  const from = p.from?.trim() || monthStart(to);
  const partyQ = p.party?.trim() || "";

  const contractNo = sql<string | null>`coalesce(nullif(${schema.intDailyProductionSet.contNo}, ''), ${schema.beams.contractNo})`;
  const prod = await db
    .select({
      contNo: contractNo,
      vDate: schema.intDailyProduction.vDate,
      m: sql<number>`coalesce(sum(${schema.intDailyProductionSet.totalCount}), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
    .leftJoin(schema.beams, eq(schema.intDailyProductionSet.beamNo, schema.beams.beamNo))
    .where(and(gte(schema.intDailyProduction.vDate, from), lte(schema.intDailyProduction.vDate, to)))
    .groupBy(sql`1`, schema.intDailyProduction.vDate);

  // Every status: a contract completed since still bills what it wove in range.
  const cols = <T extends typeof schema.intGreyConversionContract | typeof schema.extGreyConvContract>(t: T) => ({
    id: t.id,
    contNo: t.contNo,
    party: t.party,
    productName: t.productName,
    productQuality: t.productQuality,
    designNo: t.designNo,
    pick: t.pick,
    ratePerPick: t.ratePerPick,
    convRatePerMtr: t.convRatePerMtr,
  });
  const [intC, extC, intWarp, intWeft, extWarp, extWeft] = await Promise.all([
    db.select(cols(schema.intGreyConversionContract)).from(schema.intGreyConversionContract),
    db.select(cols(schema.extGreyConvContract)).from(schema.extGreyConvContract),
    db.select({ id: schema.intGreyConversionWarp.contractId, d: schema.intGreyConversionWarp.descr }).from(schema.intGreyConversionWarp).orderBy(schema.intGreyConversionWarp.srNo),
    db.select({ id: schema.intGreyConversionWeft.contractId, d: schema.intGreyConversionWeft.descr }).from(schema.intGreyConversionWeft).orderBy(schema.intGreyConversionWeft.srNo),
    db.select({ id: schema.extGreyConvWarp.contractId, d: schema.extGreyConvWarp.descr }).from(schema.extGreyConvWarp).orderBy(schema.extGreyConvWarp.srNo),
    db.select({ id: schema.extGreyConvWeft.contractId, d: schema.extGreyConvWeft.descr }).from(schema.extGreyConvWeft).orderBy(schema.extGreyConvWeft.srNo),
  ]);
  const descrs = (rows: { id: number; d: string | null }[]) => {
    const m = new Map<number, string[]>();
    for (const r of rows) if (r.d?.trim()) m.set(r.id, [...(m.get(r.id) ?? []), r.d.trim()]);
    return m;
  };
  const construction = (warp: Map<number, string[]>, weft: Map<number, string[]>, id: number) =>
    [warp.get(id)?.join(" + "), weft.get(id)?.join(" + ")].filter(Boolean).join(" BY ");
  const [iwp, iwf, ewp, ewf] = [descrs(intWarp), descrs(intWeft), descrs(extWarp), descrs(extWeft)];
  const contracts = new Map(
    [
      ...intC.map((c) => ({ ...c, construction: construction(iwp, iwf, c.id) })),
      ...extC.map((c) => ({ ...c, construction: construction(ewp, ewf, c.id) })),
    ].map((c) => [c.contNo, c]),
  );

  const rateOf = (c: { pick: number | null; ratePerPick: number | null; convRatePerMtr: number | null } | undefined) =>
    c ? (c.convRatePerMtr ?? (c.pick ?? 0) * (c.ratePerPick ?? 0)) : 0;

  const parties = [...new Set(prod.map((r) => (r.contNo ? contracts.get(r.contNo)?.party?.trim() : "") || "").filter(Boolean))].sort();
  const inParty = (contNo: string | null) => !partyQ || (contNo ? contracts.get(contNo)?.party?.trim() === partyQ : false);
  const rowsIn = prod.filter((r) => inParty(r.contNo) && Number(r.m) > 0);

  const byContract = new Map<string, number>();
  const byDay = new Map<string, { m: number; a: number }>();
  for (const r of rowsIn) {
    const k = r.contNo ?? "";
    const m = Number(r.m);
    byContract.set(k, (byContract.get(k) ?? 0) + m);
    const d = byDay.get(r.vDate) ?? { m: 0, a: 0 };
    d.m += m;
    d.a += m * rateOf(contracts.get(k));
    byDay.set(r.vDate, d);
  }

  const rows = [...byContract.entries()]
    .map(([contNo, production]) => {
      const c = contracts.get(contNo);
      const rate = rateOf(c);
      return {
        contNo: contNo || "—",
        quality: c?.productName || c?.productQuality || "—",
        construction: c?.construction ?? "",
        party: c?.party ?? "",
        designNo: c?.designNo ?? "",
        production,
        pick: c?.pick ?? 0,
        ratePerPick: c?.ratePerPick ?? 0,
        rate,
        amount: production * rate,
      };
    })
    // Oracle prints the smallest production first.
    .sort((a, b) => a.production - b.production);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const totProd = rows.reduce((s, r) => s + r.production, 0);
  const totAmt = rows.reduce((s, r) => s + r.amount, 0);
  const wAvg = (f: (r: (typeof rows)[number]) => number) => (totProd ? rows.reduce((s, r) => s + f(r) * r.production, 0) / totProd : 0);
  const avgPick = wAvg((r) => r.pick);
  const avgRpp = wAvg((r) => r.ratePerPick);
  const avgRate = totProd ? totAmt / totProd : 0;

  const prev = prevMonth(now);
  const q = (f: string, t: string) => `?from=${f}&to=${t}${partyQ ? `&party=${encodeURIComponent(partyQ)}` : ""}`;

  return (
    <Shell active="w-fabric-production">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Fabric Production &amp; Billing</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} contracts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                quality: r.quality,
                construction: r.construction,
                contNo: r.contNo,
                designNo: r.designNo,
                production: Math.round(r.production * 100) / 100,
                pick: r.pick,
                ratePerPick: r.ratePerPick,
                rate: Math.round(r.rate * 100) / 100,
                amount: Math.round(r.amount),
              }))}
              columns={[
                { key: "quality", label: "Quality" },
                { key: "construction", label: "Construction" },
                { key: "contNo", label: "Contract" },
                { key: "designNo", label: "Design #" },
                { key: "production", label: "Production" },
                { key: "pick", label: "Pick" },
                { key: "ratePerPick", label: "R/Pick" },
                { key: "rate", label: "Rate / Mtr" },
                { key: "amount", label: "Amount" },
              ]}
              filename="fabric-production-billing"
              title={`Fabric Production & Billing  ${from} to ${to}`}
            />
          </div>
        </div>

        <div className="hidden print:block mb-4">
          <h1 className="page-title">FABRIC PRODUCTION &amp; BILLING</h1>
          <div className="mono text-[12px] mt-1">
            {from} to {to}
            {partyQ ? ` · ${partyQ}` : ""}
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-3 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div>
            <label className="label block mb-1">From</label>
            <DateBox name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">To</label>
            <DateBox name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <select name="party" defaultValue={partyQ} className="input-box">
              <option value="">All parties</option>
              {parties.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/reports/weaving/fabric-production" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>
        <div className="flex gap-2 mb-6 flex-wrap no-print">
          <a href={q(now, now)} className="btn btn-outline btn-sm">Today</a>
          <a href={q(monthStart(now), now)} className="btn btn-outline btn-sm">This Month</a>
          <a href={q(prev.from, prev.to)} className="btn btn-outline btn-sm">Last Month</a>
        </div>

        <div className="overflow-x-auto mb-8">
          <table>
            <thead>
              <tr>
                <th>Quality</th>
                <th>Contract</th>
                <th>Design #</th>
                <th className="text-right">Production</th>
                <th className="text-right">Pick</th>
                <th className="text-right">R/Pick</th>
                <th className="text-right">Rate / Mtr</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">No production in this period</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.contNo}>
                    <td>
                      <div className="font-semibold">{r.quality}</div>
                      {r.construction && <div className="text-[11px] text-[var(--muted)]">{r.construction}</div>}
                    </td>
                    <td className="mono">{r.contNo}</td>
                    <td className="mono">{r.designNo || "—"}</td>
                    <td className="mono text-right">{mtr(r.production)}</td>
                    <td className="mono text-right">{dec(r.pick, 2)}</td>
                    <td className="mono text-right">{dec(r.ratePerPick, 4)}</td>
                    <td className="mono text-right">{dec(r.rate, 2)}</td>
                    <td className="mono text-right font-bold">{amt(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3}>TOTAL</td>
                  <td className="mono text-right">{mtr(totProd)}</td>
                  <td className="mono text-right">{dec(avgPick, 2)}</td>
                  <td className="mono text-right">{dec(avgRpp, 4)}</td>
                  <td className="mono text-right">{dec(avgRate, 2)}</td>
                  <td className="mono text-right">{amt(totAmt)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {days.length > 0 && (
          <div className="overflow-x-auto" style={{ maxWidth: 560 }}>
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Day-wise billing</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Production</th>
                  <th className="text-right">Rate / Mtr</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {days.map(([d, v]) => (
                  <tr key={d}>
                    <td className="mono">{d.split("-").reverse().join("-")}</td>
                    <td className="mono text-right">{mtr(v.m)}</td>
                    <td className="mono text-right">{dec(v.m ? v.a / v.m : 0, 2)}</td>
                    <td className="mono text-right font-bold">{amt(v.a)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td>TOTAL</td>
                  <td className="mono text-right">{mtr(totProd)}</td>
                  <td className="mono text-right">{dec(avgRate, 2)}</td>
                  <td className="mono text-right">{amt(totAmt)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
