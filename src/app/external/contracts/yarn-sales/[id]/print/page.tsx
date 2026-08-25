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

export default async function YarnSalesContractPrint({
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
    .from(schema.extYarnSalContract)
    .where(eq(schema.extYarnSalContract.id, id))
    .limit(1);
  if (!contract) notFound();

  const deliveries = await db
    .select()
    .from(schema.extYarnSalContractDelivery)
    .where(eq(schema.extYarnSalContractDelivery.contractId, id))
    .orderBy(schema.extYarnSalContractDelivery.id);

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Weaving Mills";
  const sellerName = companyName;
  const buyerCode = contract.partyCode ?? "";
  let buyerName = buyerCode;
  if (buyerCode) {
    const [buyerAcc] = await db
      .select({ description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, buyerCode))
      .limit(1);
    if (buyerAcc?.description) buyerName = buyerAcc.description;
  }

  const rightBlock = (
    <div className="text-[11px] mono">
      <div>
        <b>Contract No:</b> {contract.contNo}
      </div>
      <div>
        <b>Date:</b> {contract.contDate}
      </div>
      <div>
        <b>Status:</b> {contract.status}
      </div>
      {contract.expdDate && (
        <div>
          <b>Expires:</b> {contract.expdDate}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PrintStyles />
      <div className="no-print p-3 flex gap-2 border-b border-black">
        <a href={`/external/contracts/yarn-sales?id=${id}`} className="btn btn-outline btn-sm">
          Back
        </a>
        <PrintButton label="Print" />
      </div>
      <div className="p-6 mx-auto" style={{ maxWidth: 900 }}>
        <PrintHeader title="YARN SALES CONTRACT" right={rightBlock} />

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
            <div className="text-[11px]">Code: {buyerCode || "-"}</div>
          </div>
        </div>

        <p className="text-[12px] mb-4 leading-relaxed">
          This YARN SALES CONTRACT is made on <b>{contract.contDate}</b> between{" "}
          <b>{sellerName}</b> (hereinafter &ldquo;Seller&rdquo;) and{" "}
          <b>{buyerName}</b> (hereinafter &ldquo;Buyer&rdquo;) for the sale and
          purchase of yarn on the following terms and conditions:
        </p>

        <table className="w-full text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="border border-black p-2 w-1/4 font-bold">Contract Ref</td>
              <td className="border border-black p-2">{contract.refno ?? "-"}</td>
              <td className="border border-black p-2 w-1/4 font-bold">Broker</td>
              <td className="border border-black p-2">{contract.broker ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Count</td>
              <td className="border border-black p-2 mono">{contract.countCode ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Brand</td>
              <td className="border border-black p-2">{contract.brand ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Ratio</td>
              <td className="border border-black p-2">{contract.ratio ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Brokerage %</td>
              <td className="border border-black p-2 mono">{fmt(contract.brokagePercentage)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Quantity (Bags)</td>
              <td className="border border-black p-2 mono">{fmt(contract.qtyBags)}</td>
              <td className="border border-black p-2 font-bold">Quantity (Lbs)</td>
              <td className="border border-black p-2 mono">{fmt(contract.qtyLbs)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Rate / Lb</td>
              <td className="border border-black p-2 mono">{fmt(contract.ratePerLbs)}</td>
              <td className="border border-black p-2 font-bold">GST %</td>
              <td className="border border-black p-2 mono">{fmt(contract.agePercent)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Days</td>
              <td className="border border-black p-2 mono">{contract.days ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Expiry</td>
              <td className="border border-black p-2 mono">{contract.expdDate ?? "-"}</td>
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
              <th className="border border-black p-2 text-right" style={{ background: "#eee" }}>Bags</th>
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
                  <td className="border border-black p-2 mono text-right">{fmt(d.bags)}</td>
                  <td className="border border-black p-2">{d.ycdDlvLoc ?? "-"}</td>
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

        {(contract.remarks || contract.days) && (
          <div className="border border-black p-3 mb-4 text-[11px]">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">
              Special Conditions / Remarks
            </div>
            {contract.days ? <div>Payment Terms: {contract.days} days</div> : null}
            {contract.remarks ? <div>{contract.remarks}</div> : null}
          </div>
        )}

        <SignatureRow labels={["For Seller", "For Buyer"]} />
      </div>
    </>
  );
}
