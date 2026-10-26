import Link from "next/link";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq, or } from "drizzle-orm";
import { countLabelMap, richConstruction } from "@/lib/grey-quality";

const fmt2 = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type Kind = "conv" | "sale";

/**
 * Despatch behind one contract's "Despatch" figure on the grey sale reports
 * (owner 2026-10-26: the per-parchi breakdown crowded the report and its print,
 * so the report shows the total and this page the detail). Same source as the
 * report's total: Pakki Parchis booked on the contract — for a conversion
 * contract on either side (purchase: conv_cont_no, sale: conv_cont_sale2), for
 * a sale contract its sale side (conv_cont_no_sale).
 */
export async function DespatchDetailReport({ kind, contNo, backHref, active }: { kind: Kind; contNo: string; backHref: string; active: string }) {
  const P = schema.extPackiParchi;
  const contract =
    kind === "conv"
      ? (await db.select().from(schema.extGreyConvContract).where(eq(schema.extGreyConvContract.contNo, contNo)).limit(1)).map((c) => ({
          party: c.party,
          quality: c.productName,
          qty: c.qtyMtr ?? 0,
        }))[0]
      : (await db.select().from(schema.extGreySalContract).where(eq(schema.extGreySalContract.contractNo, contNo)).limit(1)).map((c) => ({
          party: c.party,
          quality: c.construction,
          qty: c.quantityMtr ?? 0,
        }))[0];

  const parchis = contNo
    ? await db
        .select({
          id: P.id,
          vNo: P.vNo,
          vDate: P.vDate,
          purchaseParty: P.purchaseParty,
          saleParty: P.saleParty,
          convContNo: P.convContNo,
          quality: P.quality,
          qualityPrint: P.qualityPrint,
          than: P.than,
          meterNet: P.meterNet,
        })
        .from(P)
        .where(kind === "conv" ? or(eq(P.convContNo, contNo), eq(P.convContSale2, contNo)) : eq(P.convContNoSale, contNo))
    : [];

  // A parchi stores its quality as a construction code (GC-021): show it the
  // way the Pakki Parchi screen does, reed × pick and warp × weft.
  const [constructions, counts] = await Promise.all([
    db.select().from(schema.greyConstruction),
    db.select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type }).from(schema.yarnCounts),
  ]);
  const labels = countLabelMap(counts);
  const qualityByCode = new Map(constructions.map((c) => [c.code, richConstruction(c, labels) || c.description || c.code]));
  // quality_print is mostly just the code again, so only a real print name wins.
  const qualityOf = (q: string | null, print: string | null) => (print && print !== q ? print : q ? qualityByCode.get(q) ?? q : "");

  const lines = parchis
    .map((p) => ({
      ...p,
      // Which side of the parchi the contract sits on decides whose name it is.
      party: (kind === "conv" && p.convContNo === contNo ? p.purchaseParty : p.saleParty) ?? "-",
      meter: p.meterNet ?? 0,
    }))
    .sort((a, b) => a.party.localeCompare(b.party) || a.vDate.localeCompare(b.vDate) || a.vNo.localeCompare(b.vNo));

  const byParty = new Map<string, typeof lines>();
  for (const l of lines) byParty.set(l.party, [...(byParty.get(l.party) ?? []), l]);
  const totalMeter = lines.reduce((s, l) => s + l.meter, 0);
  const totalThan = lines.reduce((s, l) => s + (l.than ?? 0), 0);

  const excelRows = lines.map((l) => ({
    parchi: l.vNo,
    date: l.vDate,
    contNo,
    party: l.party,
    quality: qualityOf(l.quality, l.qualityPrint),
    than: l.than ?? "",
    meter: l.meter,
  }));

  return (
    <Shell active={active}>
      <div className="animate-in">
        <style>{`@media print {
  @page { size: A4 portrait; margin: 10mm; }
  .dd-report th, .dd-report td { font-weight: 700 !important; color: #000 !important; border-color: #000 !important; padding: 3px 5px !important; }
  .dd-report tr { background: #fff !important; }
  .dd-report thead th { border-bottom: 1.5pt solid #000 !important; }
  .dd-report tr.dd-sub td { border-top: 1pt solid #000 !important; }
  .dd-report tfoot { display: table-row-group; }
  .dd-report tfoot td { border-top: 2pt solid #000 !important; border-bottom: 2pt solid #000 !important; font-size: 12px !important; }
}`}</style>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-3">
          <div>
            <h1 className="page-title">PAKKI PARCHI REPORT — {contNo || "—"}</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {contract ? (
                <>
                  {contract.party ?? "-"} ·{" "}
                  {(contract.quality && (qualityByCode.get(contract.quality) ?? contract.quality)) ||
                    (lines[0] ? qualityOf(lines[0].quality, lines[0].qualityPrint) : "-")}
                </>
              ) : (
                "Contract not found"
              )}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <Link href={backHref} className="btn btn-outline btn-sm">Back</Link>
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "parchi", label: "PP #" },
                { key: "date", label: "PP Date" },
                { key: "contNo", label: "Cont #" },
                { key: "party", label: "Party" },
                { key: "quality", label: "Description" },
                { key: "than", label: "Than" },
                { key: "meter", label: "Meter" },
              ]}
              filename={`pakki-parchi-${contNo}`}
              sheetName="Pakki Parchi"
              title={`Pakki Parchi report — ${contNo}`}
              totals={{ parchi: "Total", than: totalThan, meter: Math.round(totalMeter * 100) / 100 }}
            />
            <PrintButton />
          </div>
        </div>

        {contract && (
          <div className="grid grid-cols-3 gap-px bg-black border-2 border-black mb-4 max-w-2xl">
            <div className="bg-white p-3">
              <div className="mono text-lg font-bold">{fmt2(contract.qty)}</div>
              <div className="stat-label">Contract qty (mtr)</div>
            </div>
            <div className="bg-white p-3">
              <div className="mono text-lg font-bold">{fmt2(totalMeter)}</div>
              <div className="stat-label">Despatched · {lines.length} parchi{lines.length === 1 ? "" : "s"}</div>
            </div>
            <div className="bg-white p-3">
              <div className="mono text-lg font-bold">{fmt2(contract.qty - totalMeter)}</div>
              <div className="stat-label">Balance</div>
            </div>
          </div>
        )}

        <div className="border border-black dd-report">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left">PP #</th>
                  <th className="px-2 py-2 text-left">PP Date</th>
                  <th className="px-2 py-2 text-left">Cont #</th>
                  <th className="px-2 py-2 text-left">Party</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-right">Than</th>
                  <th className="px-2 py-2 text-right">Meter</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[var(--muted)] py-8">No Pakki Parchi on this contract yet.</td>
                  </tr>
                )}
                {[...byParty.entries()].map(([party, ls]) => (
                  <PartyBlock key={party} party={party} contNo={contNo} lines={ls} multi={byParty.size > 1} qualityOf={qualityOf} />
                ))}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <tr className="font-bold" style={{ borderTop: "2px solid black" }}>
                    <td className="px-2 py-2" colSpan={5}>Total</td>
                    <td className="px-2 py-2 mono text-right">{totalThan || ""}</td>
                    <td className="px-2 py-2 mono text-right">{fmt2(totalMeter)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function PartyBlock({
  party,
  contNo,
  lines,
  multi,
  qualityOf,
}: {
  party: string;
  contNo: string;
  lines: { id: number; vNo: string; vDate: string; quality: string | null; qualityPrint: string | null; than: number | null; meter: number }[];
  multi: boolean;
  qualityOf: (q: string | null, print: string | null) => string;
}) {
  return (
    <>
      {lines.map((l) => (
        <tr key={l.id}>
          <td className="px-2 py-1.5 mono font-bold whitespace-nowrap">
            <Link href={`/external/grey/packi-parchi?id=${l.id}`} className="underline underline-offset-2 print:no-underline">{l.vNo}</Link>
          </td>
          <td className="px-2 py-1.5 mono whitespace-nowrap">{l.vDate}</td>
          <td className="px-2 py-1.5 mono whitespace-nowrap">{contNo}</td>
          <td className="px-2 py-1.5">{party}</td>
          <td className="px-2 py-1.5 text-[12px]">{qualityOf(l.quality, l.qualityPrint)}</td>
          <td className="px-2 py-1.5 mono text-right">{l.than ?? ""}</td>
          <td className="px-2 py-1.5 mono text-right">{fmt2(l.meter)}</td>
        </tr>
      ))}
      {multi && (
        <tr className="dd-sub font-semibold bg-gray-50">
          <td className="px-2 py-1.5" colSpan={5}>{party} — {lines.length} parchi{lines.length === 1 ? "" : "s"}</td>
          <td className="px-2 py-1.5 mono text-right">{lines.reduce((s, l) => s + (l.than ?? 0), 0) || ""}</td>
          <td className="px-2 py-1.5 mono text-right">{fmt2(lines.reduce((s, l) => s + l.meter, 0))}</td>
        </tr>
      )}
    </>
  );
}
