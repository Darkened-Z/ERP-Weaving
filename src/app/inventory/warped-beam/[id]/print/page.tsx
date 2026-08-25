import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { PrintHeader, SignatureRow, PrintStyles } from "@/components/print-shell";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function WarpedBeamBillPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const vid = parseInt(id, 10);
  if (!Number.isFinite(vid) || vid <= 0) notFound();

  const [bill] = await db
    .select()
    .from(schema.intWarpedBeamReceiving)
    .where(eq(schema.intWarpedBeamReceiving.id, vid))
    .limit(1);
  if (!bill) notFound();

  const lines = await db
    .select()
    .from(schema.intWarpedBeamReceivingLine)
    .where(eq(schema.intWarpedBeamReceivingLine.receivingId, vid))
    .orderBy(schema.intWarpedBeamReceivingLine.id);

  const partyAcc = bill.beamReceivingFrom
    ? (await db.select().from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.description, bill.beamReceivingFrom)).limit(1))[0] ?? null
    : null;

  const subtotal = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const freight = bill.freightCharges ?? 0;
  const gst = bill.gstFtx ?? 0;
  const grand = bill.totalAmountFinal ?? bill.totalAmount ?? subtotal + freight + gst;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href={`/inventory/warped-beam?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <PrintButton label="Print" />
        </div>

        <PrintHeader
          title="WARPED BEAM RECEIVING"
          subtitle="Sizing / Warping Bill"
          right={
            <div className="text-[11px]">
              <div>V.No: <b>{bill.vNo}</b></div>
              <div>Date: <b>{bill.vDate}</b></div>
              {bill.gpNo ? <div>GP No: {bill.gpNo}</div> : null}
              {bill.billNo ? <div>Bill No: {bill.billNo}</div> : null}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Received From</div>
            <div className="font-bold text-[13px]">{bill.beamReceivingFrom ?? "—"}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.ntn ? <div>NTN: {partyAcc.ntn}</div> : null}
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {bill.type ? (<><div className="font-bold uppercase text-[9px]">Type</div><div>{bill.type}</div></>) : null}
              {bill.sizingGpNo ? (<><div className="font-bold uppercase text-[9px]">Sizing GP</div><div>{bill.sizingGpNo}</div></>) : null}
              {bill.beamStockLoaded ? (<><div className="font-bold uppercase text-[9px]">Stock Loc</div><div>{bill.beamStockLoaded}</div></>) : null}
              {bill.billingStatus ? (<><div className="font-bold uppercase text-[9px]">Status</div><div>{bill.billingStatus}</div></>) : null}
              {bill.bmSaleParty ? (<><div className="font-bold uppercase text-[9px]">Sale Party</div><div>{bill.bmSaleParty}</div></>) : null}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-8">Sr</th>
              <th className="border border-black px-1 py-1 text-left">Beam</th>
              <th className="border border-black px-1 py-1 text-left">Set / Lot</th>
              <th className="border border-black px-1 py-1 text-right">Ends</th>
              <th className="border border-black px-1 py-1 text-right">Length</th>
              <th className="border border-black px-1 py-1 text-right">Wt</th>
              <th className="border border-black px-1 py-1 text-right">Rate</th>
              <th className="border border-black px-1 py-1 text-right">Conv</th>
              <th className="border border-black px-1 py-1 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={9} className="border border-black px-1 py-3 text-center italic">No line items</td></tr>
            ) : lines.map((l, i) => (
              <tr key={l.id}>
                <td className="border border-black px-1 py-1 text-center">{i + 1}</td>
                <td className="border border-black px-1 py-1 mono">{l.beamNo ?? "—"}</td>
                <td className="border border-black px-1 py-1">
                  {[l.beamSetNo, l.setNo].filter(Boolean).join(" / ") || "—"}
                  {l.yarnLotNo ? <div className="text-[9px] text-[var(--muted)]">Lot: {l.yarnLotNo}</div> : null}
                </td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.ends)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.length ?? l.beamLength)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.wt ?? l.yarnBmsNetLbs)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.rate)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.conv)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Subtotal</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(subtotal)}</td>
            </tr>
            {freight ? (
              <tr>
                <td colSpan={8} className="border border-black px-2 py-1 text-right uppercase text-[10px]">Freight</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(freight)}</td>
              </tr>
            ) : null}
            {gst ? (
              <tr>
                <td colSpan={8} className="border border-black px-2 py-1 text-right uppercase text-[10px]">GST</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(gst)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={8} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Grand Total</td>
              <td className="border border-black px-1 py-1 text-right font-extrabold mono text-[12px]">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(grand)}
        </div>

        {bill.remarksDestination ? (
          <div className="border border-black px-2 py-1 mt-2 text-[11px]">
            <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Remarks:</span>
            {bill.remarksDestination}
          </div>
        ) : null}

        <SignatureRow labels={["Prepared By", "Store Incharge", "Authorized Signatory"]} />
      </div>
    </>
  );
}
