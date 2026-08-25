import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintHeader, SignatureRow, PrintStyles } from "@/components/print-shell";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function GreyPurchaseContractPrint({
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
    .from(schema.extGreyPurContract)
    .where(eq(schema.extGreyPurContract.id, id))
    .limit(1);
  if (!contract) notFound();

  const deliveries = await db
    .select()
    .from(schema.extGreyPurContractDelivery)
    .where(eq(schema.extGreyPurContractDelivery.contractId, id))
    .orderBy(schema.extGreyPurContractDelivery.id);

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Weaving Mills";
  const buyerName = companyName;
  const sellerName = contract.party ?? "-";

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
        <a href={`/external/contracts/grey-purchase?id=${id}`} className="btn btn-outline btn-sm">
          Back
        </a>
        <PrintButton label="Print" />
      </div>
      <div className="p-6 mx-auto" style={{ maxWidth: 900 }}>
        <PrintHeader title="GREY PURCHASE CONTRACT" right={rightBlock} />

        <div className="grid grid-cols-2 gap-6 mb-4 text-[12px]">
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Buyer</div>
            <div className="font-bold">{buyerName}</div>
            {profile?.address && <div>{profile.address}</div>}
            {profile?.ntn && <div>NTN: {profile.ntn}</div>}
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Seller</div>
            <div className="font-bold">{sellerName}</div>
            {contract.partyRefNo && <div>Ref: {contract.partyRefNo}</div>}
          </div>
        </div>

        <p className="text-[12px] mb-4 leading-relaxed">
          This GREY PURCHASE CONTRACT is made on <b>{contract.contractDate}</b> between{" "}
          <b>{buyerName}</b> (hereinafter &ldquo;Buyer&rdquo;) and{" "}
          <b>{sellerName}</b> (hereinafter &ldquo;Seller&rdquo;) for the sale and
          purchase of grey fabric on the following terms and conditions:
        </p>

        <table className="w-full text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="border border-black p-2 w-1/4 font-bold">Broker</td>
              <td className="border border-black p-2">{contract.broker ?? "-"}</td>
              <td className="border border-black p-2 w-1/4 font-bold">Brokerage %</td>
              <td className="border border-black p-2 mono">{fmt(contract.brokagPercentage)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Grey Code</td>
              <td className="border border-black p-2 mono">{contract.greyCode ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Weave</td>
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
              <td className="border border-black p-2 font-bold">Extension Mtr / Date</td>
              <td className="border border-black p-2 mono">
                {fmt(contract.extMtr)} / {contract.extDate ?? "-"}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Payment Term</td>
              <td className="border border-black p-2">{contract.paymentTerm ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Delivery Term</td>
              <td className="border border-black p-2">{contract.deliveryTerm ?? "-"}</td>
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

        <SignatureRow labels={["For Buyer", "For Seller"]} />
      </div>
    </>
  );
}
