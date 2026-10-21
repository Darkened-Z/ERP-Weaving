import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintHeader, SignatureRow, PrintStyles } from "@/components/print-shell";
import { PrintButton } from "@/components/print-button";
import { ExportPdfButton, WaPdfButton } from "@/components/wa-pdf-button";
import { numberToWords } from "@/lib/number-to-words";
import { countLabelMap, fullConstruction } from "@/lib/grey-quality";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function GreySalesContractPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) notFound();

  const [contract] = await db
    .select()
    .from(schema.extGreySalContract)
    .where(eq(schema.extGreySalContract.id, id))
    .limit(1);
  if (!contract) notFound();

  const deliveries = await db
    .select()
    .from(schema.extGreySalContractDelivery)
    .where(eq(schema.extGreySalContractDelivery.contractId, id))
    .orderBy(schema.extGreySalContractDelivery.id);

  // The construction is printed in full (reed × pick, warp × weft), not the bare
  // GC code — the buyer reads the cloth off the contract (owner).
  let construction = contract.greyCode ?? "";
  if (contract.greyCode) {
    const [con] = await db
      .select({
        code: schema.greyConstruction.code,
        reed: schema.greyConstruction.reed,
        pick: schema.greyConstruction.pick,
        warpCount: schema.greyConstruction.warpCount,
        warp2: schema.greyConstruction.warp2,
        weftCount: schema.greyConstruction.weftCount,
        weft2: schema.greyConstruction.weft2,
      })
      .from(schema.greyConstruction)
      .where(eq(schema.greyConstruction.code, contract.greyCode.trim()))
      .limit(1);
    if (con) {
      const counts = await db
        .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
        .from(schema.yarnCounts);
      construction = fullConstruction(con, countLabelMap(counts)) || construction;
    }
  }

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? BRAND.name;
  const sellerName = companyName;
  const buyerName = contract.party ?? "-";

  const rightBlock = (
    <div className="text-[11px] mono">
      <div>
        <b>Contract No:</b> {contract.contractNo}
      </div>
      <div>
        <b>Date:</b> {contract.contractDate}
      </div>
      <div>
        <b>Status:</b> {contract.status}
      </div>
      <div>
        <b>Type:</b> {contract.contractType === "EXT" ? "External" : "Internal"}
      </div>
      {contract.expDate && (
        <div>
          <b>Expires:</b> {contract.expDate}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PrintStyles />
      <div className="no-print p-3 flex gap-2 border-b border-black">
        <a href={`/external/contracts/grey-sales?id=${id}`} className="btn btn-outline btn-sm">
          Back
        </a>
        <ExportPdfButton contentId="grey-sal-contract-print" filename={`Grey-Sales-Contract-${contract.contractNo ?? id}.pdf`} />
        <WaPdfButton contentId="grey-sal-contract-print" filename={`Grey-Sales-Contract-${contract.contractNo ?? id}.jpg`} as="jpg" />
        <PrintButton label="Print" />
      </div>
      <div id="grey-sal-contract-print" className="p-6 mx-auto" style={{ maxWidth: 900 }}>
        <PrintHeader title="GREY SALES CONTRACT" right={rightBlock} />

        <div className="grid grid-cols-2 gap-6 mb-4 text-[12px]">
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Seller</div>
            <div className="font-bold">{sellerName}</div>
            {profile?.address && <div>{profile.address}</div>}
            {profile?.ntn && <div>NTN: {profile.ntn}</div>}
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Buyer</div>
            <div className="font-bold">{buyerName}</div>
            {contract.partyRefNo && <div>Ref: {contract.partyRefNo}</div>}
          </div>
        </div>

        <p className="text-[12px] mb-4 leading-relaxed">
          This GREY SALES CONTRACT is made on <b>{contract.contractDate}</b> between{" "}
          <b>{sellerName}</b> (hereinafter &ldquo;Seller&rdquo;) and{" "}
          <b>{buyerName}</b> (hereinafter &ldquo;Buyer&rdquo;) for the sale and
          purchase of grey fabric on the following terms and conditions:
        </p>

        <table className="w-full text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="border border-black p-2 w-1/4 font-bold">Grey Construction</td>
              <td className="border border-black p-2 mono">{construction || "-"}</td>
              <td className="border border-black p-2 w-1/4 font-bold">Weave</td>
              <td className="border border-black p-2">{contract.weave ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Selvage</td>
              <td className="border border-black p-2">{contract.salvage ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Per Mtr</td>
              <td className="border border-black p-2 mono">{fmt(contract.perMtr)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Quantity (Mtr)</td>
              <td className="border border-black p-2 mono">{fmt(contract.quantityMtr)}</td>
              <td className="border border-black p-2 font-bold">Rate / Mtr</td>
              <td className="border border-black p-2 mono">{fmt(contract.ratePerMtr)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">GST Rate %</td>
              <td className="border border-black p-2 mono">{fmt(contract.gstRate)}</td>
              <td className="border border-black p-2 font-bold">Days</td>
              <td className="border border-black p-2 mono">{contract.days ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Ext Mtr / Date</td>
              <td className="border border-black p-2 mono">
                {fmt(contract.extMtr)} / {contract.extDate ?? "-"}
              </td>
              <td className="border border-black p-2 font-bold">Payment / Delivery</td>
              <td className="border border-black p-2">
                {contract.paymentTerm ?? "-"} / {contract.deliveryTerm ?? "-"}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="text-[11px] uppercase tracking-wider font-bold mb-1">
          Delivery Schedule
        </div>
        <table className="w-full text-[11px] mb-4">
          <thead>
            <tr>
              <th className="border border-black p-2 text-left" style={{ background: "#eee" }}>#</th>
              <th className="border border-black p-2 text-left" style={{ background: "#eee" }}>Delivery Date</th>
              <th className="border border-black p-2 text-right" style={{ background: "#eee" }}>Meters</th>
              <th className="border border-black p-2 text-left" style={{ background: "#eee" }}>Location</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-black p-2 text-center italic">
                  No delivery schedule captured.
                </td>
              </tr>
            ) : (
              deliveries.map((d, i) => (
                <tr key={d.id}>
                  <td className="border border-black p-2 mono">{i + 1}</td>
                  <td className="border border-black p-2 mono">{d.deliveryDate ?? "-"}</td>
                  <td className="border border-black p-2 mono text-right">{fmt(d.meters)}</td>
                  <td className="border border-black p-2">{d.location ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex justify-between border border-black p-3 mb-4 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold">Grand Total</div>
            <div className="mono text-[11px] mt-1">
              {numberToWords(contract.amount ?? 0)}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-lg font-bold">
              PKR {fmt(contract.amount)}
            </div>
          </div>
        </div>

        {(contract.remarks || contract.specialInst) && (
          <div className="border border-black p-3 mb-4 text-[11px]">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">
              Special Conditions / Remarks
            </div>
            {contract.specialInst ? <div>{contract.specialInst}</div> : null}
            {contract.remarks ? <div>{contract.remarks}</div> : null}
          </div>
        )}

        <SignatureRow labels={["For Seller", "For Buyer"]} />
      </div>
    </>
  );
}
