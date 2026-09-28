import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { fmt2, todayIso } from "../../_shared";
import { loadConvContracts } from "@/lib/conv-contracts";

export const dynamic = "force-dynamic";

function yearsBack(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCFullYear(dt.getUTCFullYear() - n);
  return dt.toISOString().slice(0, 10);
}

const n2 = (v: number) => (v ? fmt2(v) : "");

/**
 * WEAVING COUNTS ACCOUNTS REPORT — per party (Oracle WEAVING_COUNTS_ACCOUNTS_PP).
 *
 * Every despatch the party took, grouped by the conversion contract's book no
 * (CONV.C#), with the yarn each one consumed worked out from the contract's
 * construction:
 *
 *   Lbs/M per side = side ends ÷ 731.52 ÷ resulted count
 *   consumed side  = meters × Lbs/M
 *   Amount         = total consumed lbs × rate per lbs
 *
 * That is the same wt-per-mtr formula the conversion contract itself uses, so a
 * despatch values its yarn exactly the way the contract costed it. Each CONV.C#
 * carries a total, then a grand total, then the Send / Consumed / Balance
 * summary the Oracle sheet prints at the end.
 */
// Rendered at both its original path and under Inventory External > Reports,
// so the mill finds it beside the other sale reports without the query being
// copied into a second file that can drift.
export async function CountsAccountsPartyWiseReport({
  searchParams,
  navKey = "w-counts-pp",
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
  navKey?: string;
}) {
  const p = await searchParams;
  const to = p.to?.trim() || todayIso();
  const from = p.from?.trim() || yearsBack(to, 6);
  const partyQ = p.party?.trim() || "";

  const allContracts = await loadConvContracts();
  const partyOpts = [...new Set(allContracts.map((c) => c.party).filter((x): x is string => !!x))].sort();

  const conds = [
    gte(schema.intGreyDespatch.vDate, from),
    lte(schema.intGreyDespatch.vDate, to),
  ];
  if (partyQ) conds.push(eq(schema.intGreyDespatch.party, partyQ));

  const heads = await db
    .select({
      id: schema.intGreyDespatch.id,
      vNo: schema.intGreyDespatch.vNo,
      vDate: schema.intGreyDespatch.vDate,
      party: schema.intGreyDespatch.party,
      convContNo: schema.intGreyDespatch.convContNo,
      thanQty: schema.intGreyDespatch.thanQty,
      location: schema.intGreyDespatch.despatchLocation,
      brand: schema.intGreyDespatch.productBrand,
      convRate: schema.intGreyDespatch.convRate,
    })
    .from(schema.intGreyDespatch)
    .where(and(...conds))
    .orderBy(schema.intGreyDespatch.vDate, schema.intGreyDespatch.vNo);

  // Meters come off the thaan lines, same as every other despatch report.
  const ids = heads.map((h) => h.id);
  const lineSums = ids.length
    ? await db
        .select({
          despatchId: schema.intGreyDespatchLine.despatchId,
          mtrs: sql<number>`coalesce(sum(${schema.intGreyDespatchLine.lengthMtrs}), 0)`,
        })
        .from(schema.intGreyDespatchLine)
        .where(inArray(schema.intGreyDespatchLine.despatchId, ids))
        .groupBy(schema.intGreyDespatchLine.despatchId)
    : [];
  const mtrsById = new Map(lineSums.map((r) => [r.despatchId, Number(r.mtrs ?? 0)]));

  // Contract construction: book no, read/pick/width, and the warp/weft rows that
  // carry ends, resulted count and rate per lbs.
  const intRows = await db
    .select({
      id: schema.intGreyConversionContract.id,
      contNo: schema.intGreyConversionContract.contNo,
      lContNo: schema.intGreyConversionContract.lContNo,
      party: schema.intGreyConversionContract.party,
      read: schema.intGreyConversionContract.read,
      pick: schema.intGreyConversionContract.pick,
      width: schema.intGreyConversionContract.width,
      productName: schema.intGreyConversionContract.productName,
    })
    .from(schema.intGreyConversionContract);
  const cById = new Map(intRows.map((r) => [r.id, r]));
  const cByNo = new Map(intRows.map((r) => [r.contNo, r]));
  const cIds = intRows.map((r) => r.id);
  const warpRows = cIds.length
    ? await db.select().from(schema.intGreyConversionWarp).where(inArray(schema.intGreyConversionWarp.contractId, cIds))
    : [];
  const weftRows = cIds.length
    ? await db.select().from(schema.intGreyConversionWeft).where(inArray(schema.intGreyConversionWeft.contractId, cIds))
    : [];

  type Side = { ends: number; calCount: number; rate: number; descr: string; lbsPerM: number };
  const sideOf = (rows: { contractId: number | null; ends: number | null; calCount: number | null; ratePerLbs: number | null; descr: string | null }[], cid: number): Side => {
    const mine = rows.filter((r) => r.contractId === cid);
    const ends = mine.reduce((a, r) => a + Number(r.ends ?? 0), 0);
    const cal = Number(mine.find((r) => r.calCount)?.calCount ?? 0);
    const rate = Number(mine.find((r) => r.ratePerLbs)?.ratePerLbs ?? 0);
    const descr = mine.find((r) => r.descr)?.descr ?? "";
    return { ends, calCount: cal, rate, descr, lbsPerM: cal > 0 ? ends / 731.52 / cal : 0 };
  };

  type Row = {
    party: string;
    bookNo: string; contNo: string; vNo: string; date: string; than: number; mtrs: number;
    dying: string; product: string; prdQlty: string; resultedCount: string;
    endsWarp: number; endsWeft: number; endsTotal: number;
    lbsMWarp: number; lbsMWeft: number;
    conWarp: number; conWeft: number; conTotal: number;
    convRate: number; rate: number; amount: number;
  };

  const rows: Row[] = heads.map((h) => {
    const c = h.convContNo ? cByNo.get(h.convContNo) : undefined;
    const cid = c?.id;
    const warp = cid != null ? sideOf(warpRows, cid) : { ends: 0, calCount: 0, rate: 0, descr: "", lbsPerM: 0 };
    const weft = cid != null ? sideOf(weftRows, cid) : { ends: 0, calCount: 0, rate: 0, descr: "", lbsPerM: 0 };
    const mtrs = mtrsById.get(h.id) ?? 0;
    const conWarp = mtrs * warp.lbsPerM;
    const conWeft = mtrs * weft.lbsPerM;
    const conTotal = conWarp + conWeft;
    // Rate per lbs is the yarn rate off the contract; warp and weft normally
    // share it, so take whichever side carries one.
    const rate = warp.rate || weft.rate || 0;
    return {
      party: h.party ?? "",
      bookNo: c?.lContNo != null ? String(c.lContNo) : h.convContNo ?? "—",
      contNo: h.convContNo ?? "—",
      vNo: h.vNo,
      date: h.vDate,
      than: Number(h.thanQty ?? 0),
      mtrs,
      dying: h.location ?? "",
      product: h.brand ?? c?.productName ?? "",
      prdQlty: c?.read != null && c?.pick != null ? `${c.read} X ${c.pick}` : "",
      resultedCount: warp.descr || weft.descr,
      endsWarp: warp.ends, endsWeft: weft.ends, endsTotal: warp.ends + weft.ends,
      lbsMWarp: warp.lbsPerM, lbsMWeft: weft.lbsPerM,
      conWarp, conWeft, conTotal,
      convRate: Number(h.convRate ?? 0),
      rate,
      amount: conTotal * rate,
    };
  });

  const sumOf = (rs: Row[]) =>
    rs.reduce(
      (a, r) => ({ than: a.than + r.than, mtrs: a.mtrs + r.mtrs, con: a.con + r.conTotal, amount: a.amount + r.amount }),
      { than: 0, mtrs: 0, con: 0, amount: 0 },
    );
  const grand = sumOf(rows);

  type CountGroup = { countDesc: string; lbs: number; bags: number; rate: number; amount: number };
  type PartyBlock = { party: string; counts: CountGroup[]; total: { lbs: number; bags: number; amount: number } };
  const pMap = new Map<string, Map<string, CountGroup>>();
  for (const r of rows) {
    const party = r.party || "Unknown";
    if (!pMap.has(party)) pMap.set(party, new Map());
    const cMap = pMap.get(party)!;
    const key = r.resultedCount || "—";
    const ex = cMap.get(key);
    if (ex) {
      ex.lbs += r.conTotal;
      ex.bags += r.than;
      ex.amount += r.amount;
      if (!ex.rate && r.rate) ex.rate = r.rate;
    } else {
      cMap.set(key, { countDesc: key, lbs: r.conTotal, bags: r.than, rate: r.rate, amount: r.amount });
    }
  }
  const partyBlocks: PartyBlock[] = [...pMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([party, cMap]) => {
      const counts = [...cMap.values()].sort((a, b) => a.countDesc.localeCompare(b.countDesc));
      const total = counts.reduce((t, c) => ({ lbs: t.lbs + c.lbs, bags: t.bags + c.bags, amount: t.amount + c.amount }), { lbs: 0, bags: 0, amount: 0 });
      return { party, counts, total };
    });

  // Summary: what the party was sent, what the cloth consumed, what is left.
  // Sent = yarn issued to the party (receipts out of the mill's godown to it).
  const sentRows = partyQ
    ? await db
        .select({
          lbs: sql<number>`coalesce(sum(coalesce(${schema.intYarnReceipt.qtyLbs},0)),0)`,
          bags: sql<number>`coalesce(sum(coalesce(${schema.intYarnReceipt.bags},0)),0)`,
          rate: sql<number>`max(coalesce(${schema.intYarnReceipt.ratePerLbs},0))`,
        })
        .from(schema.intYarnReceipt)
        .where(and(eq(schema.intYarnReceipt.party, partyQ), gte(schema.intYarnReceipt.vDate, from), lte(schema.intYarnReceipt.vDate, to)))
    : [];
  const sentLbs = Number(sentRows[0]?.lbs ?? 0);
  const sentBags = Number(sentRows[0]?.bags ?? 0);
  const sumRate = Number(sentRows[0]?.rate ?? 0) || rows.find((r) => r.rate)?.rate || 0;
  const balLbs = sentLbs - grand.con;

  const excelRows = partyBlocks.flatMap((pb) =>
    pb.counts.map((c) => ({
      party: pb.party, count: c.countDesc, lbs: c.lbs, bags: c.bags, rate: c.rate, amount: c.amount,
    })),
  );
  const excelCols = [
    { key: "party", label: "Party" }, { key: "count", label: "Count Desc" },
    { key: "lbs", label: "Total Lbs" }, { key: "bags", label: "Bages" },
    { key: "rate", label: "Rate" }, { key: "amount", label: "Amount" },
  ];

  return (
    <Shell active={navKey}>
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Weaving Counts Accounts — Party Wise</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Yarn consumed by each despatch, per conversion contract · {from} to {to}
              {partyQ ? ` · ${partyQ}` : " · all parties"}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <ExcelExportButton rows={excelRows} columns={excelCols} filename="counts-accounts-pp" title="Weaving Counts Accounts — Party Wise" />
            <PrintButton />
          </div>
        </div>

        <form method="GET" className="flex items-end gap-2 flex-wrap mb-5 no-print border border-black p-3">
          <div>
            <label className="label block mb-1">Date From</label>
            <DateBox name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <DateBox name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <select name="party" defaultValue={partyQ} className="input-box mono" style={{ minWidth: 240 }}>
              <option value="">All parties</option>
              {partyOpts.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm">View</button>
        </form>

        {partyBlocks.length === 0 ? (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            No despatches in this range.
          </div>
        ) : (
          <>
            <div className="border border-black mb-4">
              <table className="mono text-[12px] w-full">
                <thead>
                  <tr className="border-b border-black bg-gray-100">
                    <th className="px-2 py-1 text-left">Count Desc</th>
                    <th className="px-2 py-1 text-right" style={{ width: 90 }}>Total Lbs</th>
                    <th className="px-2 py-1 text-right" style={{ width: 70 }}>Bages</th>
                    <th className="px-2 py-1 text-right" style={{ width: 55 }}>Rate</th>
                    <th className="px-2 py-1 text-right" style={{ width: 100 }}>Amount</th>
                  </tr>
                </thead>
                {partyBlocks.map((pb) => (
                  <tbody key={pb.party}>
                    <tr style={{ background: "#0f172a", color: "white" }}>
                      <td className="px-2 py-1.5 font-bold text-[13px]" colSpan={5}>
                        {pb.party} <span className="opacity-70">· {pb.counts.length}</span>
                        <span className="float-right">{n2(pb.total.amount)}</span>
                      </td>
                    </tr>
                    {pb.counts.map((c, i) => (
                      <tr key={`${c.countDesc}-${i}`} className="border-b border-[var(--border-light)]">
                        <td className="px-2 py-1 text-[11px]">{c.countDesc || "—"}</td>
                        <td className="px-2 py-1 text-right">{n2(c.lbs)}</td>
                        <td className="px-2 py-1 text-right">{c.bags || ""}</td>
                        <td className="px-2 py-1 text-right">{c.rate || ""}</td>
                        <td className="px-2 py-1 text-right">{n2(c.amount)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold" style={{ background: "#dbeafe" }}>
                      <td className="px-2 py-1 italic">Party Total</td>
                      <td className="px-2 py-1 text-right">{n2(pb.total.lbs)}</td>
                      <td className="px-2 py-1 text-right">{pb.total.bags || ""}</td>
                      <td />
                      <td className="px-2 py-1 text-right">{n2(pb.total.amount)}</td>
                    </tr>
                  </tbody>
                ))}
                <tfoot>
                  <tr className="font-bold border-t-2 border-black" style={{ background: "#f3e8ff" }}>
                    <td className="px-2 py-1.5 italic">Grand Total</td>
                    <td className="px-2 py-1.5 text-right">{n2(grand.con)}</td>
                    <td className="px-2 py-1.5 text-right">{grand.than || ""}</td>
                    <td />
                    <td className="px-2 py-1.5 text-right">{n2(grand.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* SUMMERY REPORT — what went out, what the cloth ate, what is left. */}
            <div className="border-2 border-black">
              <div className="bg-[var(--accent)] text-white px-3 py-1.5 text-[12px] uppercase tracking-[0.1em] font-semibold flex items-center justify-between">
                <span>Summary Report{partyQ ? ` — ${partyQ}` : ""}</span>
                {partyQ && (
                  <span className="flex gap-2 no-print">
                    <a href={`/external/reports/yarn-register?party=${encodeURIComponent(partyQ)}&from=${from}&to=${to}`} target="_blank" rel="noopener" className="text-[10px] bg-white text-black px-2 py-0.5 rounded normal-case tracking-normal font-medium hover:bg-gray-200">Yarn Register</a>
                    <a href={`/external/reports/grey-register/conv-ledger?party=${encodeURIComponent(partyQ)}&from=${from}&to=${to}`} target="_blank" rel="noopener" className="text-[10px] bg-white text-black px-2 py-0.5 rounded normal-case tracking-normal font-medium hover:bg-gray-200">Conv Register</a>
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="mono text-[12px] w-full">
                  <thead>
                    <tr className="border-b border-black bg-gray-100">
                      <th className="px-2 py-1 text-left" style={{ width: 140 }}></th>
                      <th className="px-2 py-1 text-right">Bags</th>
                      <th className="px-2 py-1 text-right">Lbs</th>
                      <th className="px-2 py-1 text-right">Rate</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--border-light)]">
                      <td className="px-2 py-1 font-semibold">Send</td>
                      <td className="px-2 py-1 text-right">{sentBags ? fmt2(sentBags) : ""}</td>
                      <td className="px-2 py-1 text-right">{fmt2(sentLbs)}</td>
                      <td className="px-2 py-1 text-right">{sumRate ? fmt2(sumRate) : ""}</td>
                      <td className="px-2 py-1 text-right">{fmt2(sentLbs * sumRate)}</td>
                    </tr>
                    <tr className="border-b border-[var(--border-light)]">
                      <td className="px-2 py-1 font-semibold">Consumed</td>
                      <td className="px-2 py-1 text-right" />
                      <td className="px-2 py-1 text-right">{fmt2(grand.con)}</td>
                      <td className="px-2 py-1 text-right">{sumRate ? fmt2(sumRate) : ""}</td>
                      <td className="px-2 py-1 text-right">{fmt2(grand.con * sumRate)}</td>
                    </tr>
                    <tr className="font-bold">
                      <td className="px-2 py-1">Balance</td>
                      <td className="px-2 py-1 text-right" />
                      <td className="px-2 py-1 text-right">{fmt2(balLbs)}</td>
                      <td className="px-2 py-1 text-right">{sumRate ? fmt2(sumRate) : ""}</td>
                      <td className="px-2 py-1 text-right">{fmt2(balLbs * sumRate)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {!partyQ && (
                <div className="text-[10px] text-[var(--muted)] px-3 py-2">
                  Pick a party to see what was sent to it — Send is read from that party&apos;s yarn receipts.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
