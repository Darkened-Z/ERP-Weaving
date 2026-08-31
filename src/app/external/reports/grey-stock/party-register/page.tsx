import { Fragment } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt0 = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

/**
 * GREY REGISTER — party-wise purchase register from godown grey stock.
 * Mirrors the Oracle "GREY REGISTER": grouped by the party we purchased grey from,
 * each stock line shows Date, V#, Quality, Remarks, Sal Cont, Sal Party, Comm, Than,
 * Mtr and the sale (Rate, Amount), with a subtotal per party and a grand total.
 */
export default async function GreyPartyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string; salParty?: string; quality?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsAgo(8);
  const to = params.to?.trim() || today;
  const party = params.party?.trim() ?? "";
  const salParty = params.salParty?.trim() ?? "";
  const quality = params.quality?.trim() ?? "";

  const conditions = [
    gte(schema.extGodownStock.vDate, from),
    lte(schema.extGodownStock.vDate, to),
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    conditions.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${pat} ESCAPE '\\'`);
  }
  if (quality) {
    const pat = `%${escLike(quality)}%`;
    conditions.push(sql`${schema.extGodownStock.contactQuality} LIKE ${pat} ESCAPE '\\'`);
  }

  const [stockRows, salContracts, convContracts, accountRows] = await Promise.all([
    db.select().from(schema.extGodownStock).where(and(...conditions)).orderBy(sql`purchase_party, v_date, id`),
    db.select({ contractNo: schema.extGreySalContract.contractNo, party: schema.extGreySalContract.party }).from(schema.extGreySalContract),
    db.select({ contNo: schema.extGreyConvContract.contNo, party: schema.extGreyConvContract.party }).from(schema.extGreyConvContract),
    db.select({ description: schema.chartOfAccounts.description, code: schema.chartOfAccounts.code }).from(schema.chartOfAccounts),
  ]);

  // Sale party for a stock line = the party on its sale contract (sal cont # or grey sale cont).
  const salPartyByContract = new Map<string, string>();
  for (const c of salContracts) if (c.contractNo && c.party) salPartyByContract.set(c.contractNo, c.party);
  for (const c of convContracts) if (c.contNo && c.party && !salPartyByContract.has(c.contNo)) salPartyByContract.set(c.contNo, c.party);
  const partyCodeByName = new Map(accountRows.map((r) => [r.description, r.code]));

  type Line = {
    date: string;
    vNo: string;
    quality: string;
    remarks: string;
    salCont: string;
    salParty: string;
    comm: number;
    than: number;
    mtr: number;
    rate: number;
    amount: number;
  };

  const line = (s: typeof stockRows[number]): Line => {
    const mtr = s.netMeter ?? s.meter ?? 0;
    const rate = s.rateSal ?? 0;
    const cost = s.rate ?? 0;
    const commPct = s.commission ?? 0;
    const salCont = s.salContNo || s.greySaleCont || "";
    return {
      date: s.vDate ?? "",
      vNo: s.vNo ?? "",
      quality: s.contactQuality || s.dspQuality || "",
      remarks: s.remarks ?? "",
      salCont,
      salParty: (salCont && salPartyByContract.get(salCont)) || "",
      comm: Math.round((mtr * cost * commPct) / 100),
      than: s.than ?? 0,
      mtr,
      rate,
      amount: Math.round(mtr * rate),
    };
  };

  // Group by purchase party (the supplier), keeping DB order (already sorted by party, date).
  const groups: { party: string; lines: Line[] }[] = [];
  for (const s of stockRows) {
    const p = s.purchaseParty ?? "—";
    let g = groups.find((x) => x.party === p);
    if (!g) { g = { party: p, lines: [] }; groups.push(g); }
    g.lines.push(line(s));
  }

  const sum = (arr: Line[], k: "comm" | "than" | "mtr" | "amount") => arr.reduce((a, r) => a + r[k], 0);
  const allLines = groups.flatMap((g) => g.lines);
  const grand = {
    comm: sum(allLines, "comm"),
    than: sum(allLines, "than"),
    mtr: sum(allLines, "mtr"),
    amount: sum(allLines, "amount"),
  };

  const excelRows = groups.flatMap((g) =>
    g.lines.map((l) => ({
      party: g.party,
      date: l.date,
      vNo: l.vNo,
      quality: l.quality,
      remarks: l.remarks,
      salCont: l.salCont,
      salParty: l.salParty,
      comm: l.comm,
      than: l.than,
      mtr: l.mtr,
      rate: l.rate,
      amount: l.amount,
    }))
  );

  return (
    <Shell active="ext-r-greystock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY REGISTER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {allLines.length} lines &middot; {groups.length} part{groups.length === 1 ? "y" : "ies"} &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "party", label: "Party" },
                { key: "date", label: "Date" },
                { key: "vNo", label: "V#" },
                { key: "quality", label: "Quality" },
                { key: "remarks", label: "Remarks" },
                { key: "salCont", label: "Sal Cont" },
                { key: "salParty", label: "Sal Party" },
                { key: "comm", label: "Comm" },
                { key: "than", label: "Than" },
                { key: "mtr", label: "Mtr" },
                { key: "rate", label: "Sale Rate" },
                { key: "amount", label: "Sale Amt" },
              ]}
              filename="grey-register"
              sheetName="GreyRegister"
            />
          </div>
        </div>

        <div className="hidden print:block mb-4 text-center">
          <h1 className="page-title">GREY REGISTER</h1>
          <div className="mono text-[12px] mt-1">{from} — {to}</div>
        </div>

        <form method="GET" action="" className="border border-black p-4 mb-4 grid grid-cols-1 sm:grid-cols-5 gap-4 no-print">
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party <span className="text-[9px] text-[var(--muted)]">(supplier)</span></label>
            <input type="text" name="party" defaultValue={party} className="input-box" list="reg-party-list" placeholder="e.g. Ahmad Kareem" />
            <datalist id="reg-party-list">
              {accountRows.map((p) => (
                <option key={p.code} value={p.description} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label block mb-1">Quality</label>
            <input type="text" name="quality" defaultValue={quality} className="input-box mono" placeholder="read×pick…" />
          </div>
          <div className="sm:col-span-5 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/external/reports/grey-stock/party-register" className="btn btn-outline btn-sm">Clear</a>
            <a href="/external/reports/grey-stock" className="btn btn-outline btn-sm">Back</a>
          </div>
        </form>

        <div className="overflow-x-auto border border-black">
          <table className="w-full text-[12px]" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1 border-b border-black text-left">Date</th>
                <th className="px-2 py-1 border-b border-black text-left">V#</th>
                <th className="px-2 py-1 border-b border-black text-left">Quality</th>
                <th className="px-2 py-1 border-b border-black text-left">Remarks</th>
                <th className="px-2 py-1 border-b border-black text-left">Sal Cont</th>
                <th className="px-2 py-1 border-b border-black text-left">Sal Party</th>
                <th className="px-2 py-1 border-b border-black text-right">Comm</th>
                <th className="px-2 py-1 border-b border-black text-right">Than</th>
                <th className="px-2 py-1 border-b border-black text-right">Mtr</th>
                <th className="px-2 py-1 border-b border-black text-right">Rate</th>
                <th className="px-2 py-1 border-b border-black text-right">Sale Amt</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-8">No records found</td>
                </tr>
              )}
              {groups.map((g) => {
                const code = partyCodeByName.get(g.party);
                return (
                  <Fragment key={g.party}>
                    <tr className="bg-black text-white">
                      <td colSpan={11} className="px-2 py-1 mono text-[12px] font-bold">
                        {g.party}{code ? `  (${code})` : ""}
                      </td>
                    </tr>
                    {g.lines.map((l, i) => (
                      <tr key={`${g.party}-${i}`} className="border-b border-[var(--border-light)]">
                        <td className="px-2 py-0.5 mono">{l.date}</td>
                        <td className="px-2 py-0.5 mono">{l.vNo}</td>
                        <td className="px-2 py-0.5">{l.quality || "-"}</td>
                        <td className="px-2 py-0.5">{l.remarks || "-"}</td>
                        <td className="px-2 py-0.5 mono">{l.salCont || "-"}</td>
                        <td className="px-2 py-0.5">{l.salParty || "-"}</td>
                        <td className="px-2 py-0.5 mono text-right">{l.comm ? fmt0(l.comm) : "-"}</td>
                        <td className="px-2 py-0.5 mono text-right">{l.than ? fmt0(l.than) : "-"}</td>
                        <td className="px-2 py-0.5 mono text-right">{l.mtr ? fmt2(l.mtr) : "-"}</td>
                        <td className="px-2 py-0.5 mono text-right">{l.rate ? fmt2(l.rate) : "-"}</td>
                        <td className="px-2 py-0.5 mono text-right font-semibold">{l.amount ? fmt0(l.amount) : "-"}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={6} className="px-2 py-1 text-right mono">Total — {g.party}</td>
                      <td className="px-2 py-1 mono text-right">{fmt0(sum(g.lines, "comm"))}</td>
                      <td className="px-2 py-1 mono text-right">{fmt0(sum(g.lines, "than"))}</td>
                      <td className="px-2 py-1 mono text-right">{fmt2(sum(g.lines, "mtr"))}</td>
                      <td className="px-2 py-1"></td>
                      <td className="px-2 py-1 mono text-right">{fmt0(sum(g.lines, "amount"))}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="bg-black text-white font-bold">
                  <td colSpan={6} className="px-2 py-1.5 text-right mono">GRAND TOTAL</td>
                  <td className="px-2 py-1.5 mono text-right">{fmt0(grand.comm)}</td>
                  <td className="px-2 py-1.5 mono text-right">{fmt0(grand.than)}</td>
                  <td className="px-2 py-1.5 mono text-right">{fmt2(grand.mtr)}</td>
                  <td className="px-2 py-1.5"></td>
                  <td className="px-2 py-1.5 mono text-right">{fmt0(grand.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
