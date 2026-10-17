import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { DateBox } from "@/components/date-box";
import { loadFabricBilling, shedList } from "@/lib/fabric-billing";
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
  searchParams: Promise<{ from?: string; to?: string; party?: string; shed?: string | string[]; loom?: string; status?: string }>;
}) {
  const p = await searchParams;
  const now = today();
  const to = p.to?.trim() || now;
  const from = p.from?.trim() || monthStart(to);
  const partyQ = p.party?.trim() || "";
  // Oracle's parameter form (owner 2026-10): tick the sheds to include; none
  // ticked = every shed. Loom numbers repeat per shed, so a loom narrows within
  // the ticked sheds. Status is the contract's: R running, C completed.
  const shedQ = (Array.isArray(p.shed) ? p.shed : p.shed ? [p.shed] : []).map((x) => x.trim()).filter(Boolean);
  const loomQ = parseInt(p.loom ?? "", 10);
  const statusQ = (p.status?.trim() || "").toUpperCase();

  const sheds = await shedList();
  const { rows, days, totals, parties } = await loadFabricBilling({ from, to, sheds: shedQ, loom: loomQ, status: statusQ, party: partyQ });
  const { production: totProd, amount: totAmt, pick: avgPick, ratePerPick: avgRpp, rate: avgRate } = totals;

  const prev = prevMonth(now);
  const q = (f: string, t: string) => {
    const u = new URLSearchParams({ from: f, to: t });
    if (partyQ) u.set("party", partyQ);
    for (const x of shedQ) u.append("shed", x);
    if (Number.isFinite(loomQ)) u.set("loom", String(loomQ));
    if (statusQ) u.set("status", statusQ);
    return "?" + u.toString();
  };
  const filterNote = [
    shedQ.length ? `Shed ${shedQ.join(", ")}` : "All sheds",
    Number.isFinite(loomQ) ? `Loom ${loomQ}` : "",
    statusQ === "R" ? "Running" : statusQ === "C" ? "Completed" : "",
    partyQ,
  ].filter(Boolean).join(" · ");

  return (
    <Shell active="w-fabric-production">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Fabric Production &amp; Billing</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} contracts &middot; {from} to {to} &middot; {filterNote}
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
              totals={{
                quality: "TOTAL",
                production: Math.round(totProd * 100) / 100,
                pick: Math.round(avgPick * 100) / 100,
                ratePerPick: Math.round(avgRpp * 10000) / 10000,
                rate: Math.round(avgRate * 100) / 100,
                amount: Math.round(totAmt),
              }}
              filename="fabric-production-billing"
              title={`Fabric Production & Billing  ${from} to ${to}`}
            />
          </div>
        </div>

        <div className="hidden print:block mb-4">
          <h1 className="page-title">FABRIC PRODUCTION &amp; BILLING</h1>
          <div className="mono text-[12px] mt-1">
            {from} to {to} · {filterNote}
          </div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-3 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print">
          <div className="sm:col-span-4">
            <div className="label mb-1">Sheds <span className="normal-case tracking-normal text-[var(--muted)]">(none ticked = all)</span></div>
            <div className="flex gap-5 flex-wrap">
              {sheds.map((sh) => (
                <label key={sh} className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
                  <input type="checkbox" name="shed" value={sh} defaultChecked={shedQ.length === 0 || shedQ.includes(sh)} className="w-5 h-5 accent-black" />
                  Shed {sh}
                </label>
              ))}
            </div>
          </div>
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
          <div>
            <label className="label block mb-1">Loom No</label>
            <input name="loom" type="number" inputMode="numeric" defaultValue={Number.isFinite(loomQ) ? loomQ : ""} className="input-box mono" placeholder="All" />
          </div>
          <div>
            <label className="label block mb-1">Contract Status</label>
            <select name="status" defaultValue={statusQ} className="input-box">
              <option value="">All</option>
              <option value="R">R - Running</option>
              <option value="C">C - Completed</option>
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
