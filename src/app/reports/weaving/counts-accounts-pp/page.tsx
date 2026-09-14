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

/** 2026-05-07 → 07-05-26, the way the Oracle sheet prints dates. */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
}

const n2 = (v: number) => (v ? fmt2(v) : "");
const n4 = (v: number) =>
  v ? String(Math.round(v * 10000) / 10000).replace(/^0\./, ".") : "";

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
export default async function CountsAccountsPpPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
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

  // Group by the contract's book no, the way the Oracle sheet blocks it.
  const blocks = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.bookNo}||${r.contNo}`;
    (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(r);
  }
  const ordered = [...blocks.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const sumOf = (rs: Row[]) =>
    rs.reduce(
      (a, r) => ({ than: a.than + r.than, mtrs: a.mtrs + r.mtrs, con: a.con + r.conTotal, amount: a.amount + r.amount }),
      { than: 0, mtrs: 0, con: 0, amount: 0 },
    );
  const grand = sumOf(rows);

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

  const excelRows = ordered.flatMap(([, rs]) =>
    rs.map((r) => ({
      book: r.bookNo, vNo: r.vNo, date: shortDate(r.date), than: r.than, mtrs: r.mtrs,
      dying: r.dying, product: r.product, count: r.resultedCount,
      endsW: r.endsWarp, endsF: r.endsWeft, lbsMW: r.lbsMWarp, lbsMF: r.lbsMWeft,
      conW: r.conWarp, conF: r.conWeft, conT: r.conTotal, convRate: r.convRate, rate: r.rate, amount: r.amount,
    })),
  );
  const excelCols = [
    { key: "book", label: "Book No" }, { key: "vNo", label: "V.No" }, { key: "date", label: "Date" },
    { key: "than", label: "Than" }, { key: "mtrs", label: "Meters" }, { key: "dying", label: "Dying" },
    { key: "product", label: "Product" }, { key: "count", label: "Resulted Count" },
    { key: "endsW", label: "Ends Warp" }, { key: "endsF", label: "Ends Weft" },
    { key: "lbsMW", label: "Lbs/M Warp" }, { key: "lbsMF", label: "Lbs/M Weft" },
    { key: "conW", label: "Consumed Warp" }, { key: "conF", label: "Consumed Weft" },
    { key: "conT", label: "Consumed Total" }, { key: "convRate", label: "Conv Rate" },
    { key: "rate", label: "Rate" }, { key: "amount", label: "Amount" },
  ];

  const HEADS = ["Book No", "V.No", "Date", "Than", "Meters", "Dying", "Product", "Resulted Count",
    "Ends W/F/T", "Lbs/M W/F", "Consumed W/F/T", "Conv Rate", "Rate", "Amount"];

  return (
    <Shell active="w-counts-pp">
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

        {ordered.length === 0 ? (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            No despatches in this range.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-black mb-4">
              <table className="mono text-[11px] w-full" style={{ minWidth: 1250 }}>
                <thead>
                  <tr className="border-b border-black bg-gray-100">
                    {HEADS.map((h, i) => (
                      <th key={h} className={`px-2 py-1 whitespace-nowrap ${i >= 3 && i !== 5 && i !== 6 && i !== 7 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                {ordered.map(([key, rs]) => {
                  const sub = sumOf(rs);
                  return (
                    <tbody key={key}>
                      <tr style={{ background: "#0f172a", color: "white" }}>
                        <td colSpan={HEADS.length} className="px-2 py-1 font-bold">
                          CONV.C# {rs[0].bookNo}{rs[0].contNo !== rs[0].bookNo ? ` · ${rs[0].contNo}` : ""}
                        </td>
                      </tr>
                      {rs.map((r, i) => (
                        <tr key={`${r.vNo}-${i}`} className="border-b border-[var(--border-light)]">
                          <td className="px-2 py-1">{r.bookNo}</td>
                          <td className="px-2 py-1">{r.vNo}</td>
                          <td className="px-2 py-1 whitespace-nowrap">{shortDate(r.date)}</td>
                          <td className="px-2 py-1 text-right">{r.than || ""}</td>
                          <td className="px-2 py-1 text-right">{n2(r.mtrs)}</td>
                          <td className="px-2 py-1">{r.dying}</td>
                          <td className="px-2 py-1">{r.product}</td>
                          <td className="px-2 py-1">{r.resultedCount}</td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {r.endsWarp || r.endsWeft ? `${r.endsWarp} / ${r.endsWeft} / ${r.endsTotal}` : ""}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {r.lbsMWarp || r.lbsMWeft ? `${n4(r.lbsMWarp)} / ${n4(r.lbsMWeft)}` : ""}
                          </td>
                          <td className="px-2 py-1 text-right whitespace-nowrap">
                            {r.conTotal ? `${n2(r.conWarp)} / ${n2(r.conWeft)} / ${n2(r.conTotal)}` : ""}
                          </td>
                          <td className="px-2 py-1 text-right">{r.convRate || ""}</td>
                          <td className="px-2 py-1 text-right">{r.rate || ""}</td>
                          <td className="px-2 py-1 text-right">{n2(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold" style={{ background: "#dbeafe" }}>
                        <td className="px-2 py-1 italic" colSpan={3}>CONV.C# TOTAL</td>
                        <td className="px-2 py-1 text-right">{fmt2(sub.than)}</td>
                        <td className="px-2 py-1 text-right">{fmt2(sub.mtrs)}</td>
                        <td colSpan={5} />
                        <td className="px-2 py-1 text-right">{fmt2(sub.con)}</td>
                        <td colSpan={2} />
                        <td className="px-2 py-1 text-right">{fmt2(sub.amount)}</td>
                      </tr>
                    </tbody>
                  );
                })}
                <tfoot>
                  <tr className="font-bold border-t-2 border-black" style={{ background: "#f3e8ff" }}>
                    <td className="px-2 py-1.5 italic" colSpan={3}>GRAND TOTAL</td>
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.than)}</td>
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.mtrs)}</td>
                    <td colSpan={5} />
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.con)}</td>
                    <td colSpan={2} />
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* SUMMERY REPORT — what went out, what the cloth ate, what is left. */}
            <div className="border-2 border-black">
              <div className="bg-[var(--accent)] text-white px-3 py-1.5 text-[12px] uppercase tracking-[0.1em] font-semibold">
                Summary Report{partyQ ? ` — ${partyQ}` : ""}
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
