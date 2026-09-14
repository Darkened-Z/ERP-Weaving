import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { fmt2, todayIso } from "../../_shared";
import { loadConvContracts } from "@/lib/conv-contracts";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

function monthsBack(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCMonth(dt.getUTCMonth() - n);
  return dt.toISOString().slice(0, 10);
}

/** 2026-08-17 → 17-08-26, the way the Oracle sheet prints dates. */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y.slice(2)}`;
}

/**
 * GREY DELIVERY ORDER PARTY WISE (WVG) — Oracle WVG_YARN_DESPATCH parity.
 *
 * One block per (party, OGP#) pair — the gate-pass number groups the despatch
 * lines — with a Party Total under each and a Grand Total at the end. Blocks
 * come out in gp_no text order, which is what the Oracle sheet does (2, 24, 28,
 * 38, 45, 50, 8 — lexicographic, not numeric).
 *
 * Meters are summed from the despatch LINES rather than the header: the header
 * has no qty_mtrs column, and the lines are what actually carry the thaan
 * lengths (same source Daily Folding Stock uses for its despatch figure).
 */
export default async function DeliveryOrderPartyWisePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; party?: string }>;
}) {
  const p = await searchParams;
  const to = p.to?.trim() || todayIso();
  const from = p.from?.trim() || monthsBack(to, 2);
  // Short Title: no party picked = every party, exactly as the Oracle form behaves.
  const partyQ = p.party?.trim() || "";

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
      gpNo: schema.intGreyDespatch.gpNo,
      convContNo: schema.intGreyDespatch.convContNo,
      brand: schema.intGreyDespatch.productBrand,
      location: schema.intGreyDespatch.despatchLocation,
      thanQty: schema.intGreyDespatch.thanQty,
      rate: schema.intGreyDespatch.convRate,
      amnt: schema.intGreyDespatch.amnt,
      designNo: schema.intGreyDespatch.designNo,
      greyCode: schema.intGreyDespatch.greyCode,
    })
    .from(schema.intGreyDespatch)
    .where(and(...conds))
    .orderBy(schema.intGreyDespatch.vDate, schema.intGreyDespatch.vNo);

  // Meters per despatch, summed off the thaan lines.
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

  // Count Desc — the woven construction off the contract, the same string the
  // despatch form shows as Quality.
  const allContracts = await loadConvContracts();
  const partyOpts = [...new Set(
    [...heads.map((h) => h.party), ...allContracts.map((c) => c.party)].filter((x): x is string => !!x),
  )].sort();
  const intIds = allContracts.filter((c) => c.source === "INT").map((c) => c.contNo);
  const intRows = intIds.length
    ? await db
        .select({ id: schema.intGreyConversionContract.id, contNo: schema.intGreyConversionContract.contNo })
        .from(schema.intGreyConversionContract)
        .where(inArray(schema.intGreyConversionContract.contNo, intIds))
    : [];
  const idByCont = new Map(intRows.map((r) => [r.contNo, r.id]));
  const contractIds = [...idByCont.values()];
  const warp = contractIds.length
    ? await db.select({ contractId: schema.intGreyConversionWarp.contractId, descr: schema.intGreyConversionWarp.descr })
        .from(schema.intGreyConversionWarp)
        .where(inArray(schema.intGreyConversionWarp.contractId, contractIds))
    : [];
  const weft = contractIds.length
    ? await db.select({ contractId: schema.intGreyConversionWeft.contractId, descr: schema.intGreyConversionWeft.descr })
        .from(schema.intGreyConversionWeft)
        .where(inArray(schema.intGreyConversionWeft.contractId, contractIds))
    : [];
  const countDescByCont = new Map<string, string>();
  for (const c of allContracts) {
    const cid = idByCont.get(c.contNo);
    const w = cid == null ? "" : warp.find((r) => r.contractId === cid)?.descr ?? "";
    const f = cid == null ? "" : weft.find((r) => r.contractId === cid)?.descr ?? "";
    // Oracle prints it as {read}X{pick}/{warp}X{weft}"{width}, e.g.
    // 124X88/36/S PV  PV 90;10X36/S PV  PV 90;10"61
    const rp = c.read != null && c.pick != null ? `${c.read}X${c.pick}` : "";
    const yarn = w && f ? `${w}X${f}` : w || f;
    const wid = c.width != null ? `"${c.width}` : "";
    countDescByCont.set(c.contNo, `${rp}${rp && yarn ? "/" : ""}${yarn}${wid}`);
  }

  type Row = {
    date: string; vNo: string; countDesc: string; brand: string; location: string;
    than: number; mtrs: number; rate: number; amount: number; designNo: string;
  };
  // (party, OGP#) → rows, in gp_no text order the way Oracle groups them.
  const blocks = new Map<string, { party: string; gpNo: string; rows: Row[] }>();
  for (const h of heads) {
    const party = h.party ?? "—";
    const gpNo = (h.gpNo ?? "").trim() || "—";
    const key = `${party}||${gpNo}`;
    const blk = blocks.get(key) ?? { party, gpNo, rows: [] };
    blk.rows.push({
      date: h.vDate,
      vNo: h.vNo,
      countDesc: (h.convContNo ? countDescByCont.get(h.convContNo) : "") || h.greyCode || "",
      brand: h.brand ?? "",
      location: h.location ?? "",
      than: Number(h.thanQty ?? 0),
      mtrs: mtrsById.get(h.id) ?? 0,
      rate: Number(h.rate ?? 0),
      amount: Number(h.amnt ?? 0),
      designNo: h.designNo ?? "",
    });
    blocks.set(key, blk);
  }
  const ordered = [...blocks.values()].sort(
    (a, b) => a.party.localeCompare(b.party) || a.gpNo.localeCompare(b.gpNo),
  );

  const sumOf = (rows: Row[]) =>
    rows.reduce(
      (a, r) => ({ than: a.than + r.than, mtrs: a.mtrs + r.mtrs, amount: a.amount + r.amount }),
      { than: 0, mtrs: 0, amount: 0 },
    );
  const grand = sumOf(ordered.flatMap((b) => b.rows));

  const excelRows = ordered.flatMap((b) =>
    b.rows.map((r) => ({
      party: b.party, ogp: b.gpNo, date: shortDate(r.date), vNo: r.vNo,
      countDesc: r.countDesc, brand: r.brand, location: r.location,
      than: r.than, mtrs: r.mtrs, rate: r.rate, amount: r.amount, designNo: r.designNo,
    })),
  );
  const excelCols = [
    { key: "party", label: "Party" }, { key: "ogp", label: "OGP #" },
    { key: "date", label: "Date" }, { key: "vNo", label: "V.No" },
    { key: "countDesc", label: "Count Desc" }, { key: "brand", label: "Brand" },
    { key: "location", label: "Location" }, { key: "than", label: "Than" },
    { key: "mtrs", label: "Mtr" }, { key: "rate", label: "Rate" },
    { key: "amount", label: "Amount" }, { key: "designNo", label: "Design #" },
  ];

  const HEADS = ["Date", "V.NO", "Count Desc", "Brand", "Location", "Than", "Mtr", "Rate", "Amount", "Design #"];

  return (
    <Shell active="w-do-partywise">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Delivery Order Party Wise (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              One block per party and OGP # · From {from} to {to}
              {partyQ ? ` · ${partyQ}` : " · all parties"}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <ExcelExportButton rows={excelRows} columns={excelCols} filename="delivery-order-partywise" title="Grey Delivery Order Party Wise (WVG)" />
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
            <label className="label block mb-1">Short Title (Party)</label>
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
            No grey despatches in this range.
          </div>
        ) : (
          <>
            {ordered.map((b) => {
              const sub = sumOf(b.rows);
              return (
                <div key={`${b.party}||${b.gpNo}`} className="mb-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="mono font-bold text-[14px] text-[var(--accent)]">{b.party}</div>
                    <div className="mono font-bold text-[14px] text-[var(--accent)]">OGP #:{b.gpNo}</div>
                  </div>
                  <div className="overflow-x-auto border border-black">
                    <table className="mono text-[12px] w-full" style={{ minWidth: 900 }}>
                      <thead>
                        <tr className="border-b border-black bg-gray-100">
                          {HEADS.map((h, i) => (
                            <th key={h} className={`px-2 py-1 ${i >= 5 && i <= 8 ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, i) => (
                          <tr key={`${r.vNo}-${i}`} className="border-b border-[var(--border-light)]">
                            <td className="px-2 py-1 whitespace-nowrap">{shortDate(r.date)}</td>
                            <td className="px-2 py-1">{r.vNo}</td>
                            <td className="px-2 py-1 text-[11px]">{r.countDesc}</td>
                            <td className="px-2 py-1">{r.brand}</td>
                            <td className="px-2 py-1">{r.location}</td>
                            <td className="px-2 py-1 text-right">{r.than || ""}</td>
                            <td className="px-2 py-1 text-right">{r.mtrs ? fmt2(r.mtrs) : ""}</td>
                            <td className="px-2 py-1 text-right">{r.rate || ""}</td>
                            <td className="px-2 py-1 text-right">{r.amount ? fmt2(r.amount) : ""}</td>
                            <td className="px-2 py-1">{r.designNo}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold" style={{ background: "#dbeafe" }}>
                          <td className="px-2 py-1 italic text-center" colSpan={5}>Party Total</td>
                          <td className="px-2 py-1 text-right">{fmt2(sub.than)}</td>
                          <td className="px-2 py-1 text-right">{fmt2(sub.mtrs)}</td>
                          <td />
                          <td className="px-2 py-1 text-right">{fmt2(sub.amount)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })}

            <div className="overflow-x-auto border-2 border-black">
              <table className="mono text-[12px] w-full" style={{ minWidth: 900 }}>
                <tbody>
                  <tr className="font-bold" style={{ background: "#f3e8ff" }}>
                    <td className="px-2 py-1.5 italic text-center" style={{ width: "50%" }}>Grand Total</td>
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.than)}</td>
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.mtrs)}</td>
                    <td />
                    <td className="px-2 py-1.5 text-right">{fmt2(grand.amount)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
