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

export default async function KnottingBillPrint({
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
    .from(schema.intKnottingSarning)
    .where(eq(schema.intKnottingSarning.id, vid))
    .limit(1);
  if (!bill) notFound();

  const lines = await db
    .select()
    .from(schema.intKnottingSarningLine)
    .where(eq(schema.intKnottingSarningLine.knottingId, vid))
    .orderBy(schema.intKnottingSarningLine.srNo);

  const partyAcc = bill.party
    ? (await db.select().from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.description, bill.party)).limit(1))[0] ?? null
    : null;

  const subAmount = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const subExt = lines.reduce((s, l) => s + (l.extAmt ?? 0), 0);
  const subNet = lines.reduce((s, l) => s + (l.netAmt ?? 0), 0);
  const grand = subNet || subAmount + subExt;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href={`/inventory/knotting?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <PrintButton label="Print" />
        </div>

        <PrintHeader
          title="KNOTTING / SARNING BILL"
          right={
            <div className="text-[11px]">
              <div>V.No: <b>{bill.vNo}</b></div>
              <div>Date: <b>{bill.vDate}</b></div>
              {bill.billNo ? <div>Bill No: {bill.billNo}</div> : null}
              {bill.billDate ? <div>Bill Date: {bill.billDate}</div> : null}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Party</div>
            <div className="font-bold text-[13px]">{bill.party ?? "—"}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.ntn ? <div>NTN: {partyAcc.ntn}</div> : null}
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {bill.type ? (<><div className="font-bold uppercase text-[9px]">Type</div><div>{bill.type}</div></>) : null}
              {bill.ratePerEnds != null ? (<><div className="font-bold uppercase text-[9px]">Rate/Ends</div><div className="mono">{fmt(bill.ratePerEnds)}</div></>) : null}
              {bill.ratePerBeam != null ? (<><div className="font-bold uppercase text-[9px]">Rate/Beam</div><div className="mono">{fmt(bill.ratePerBeam)}</div></>) : null}
              {bill.warpContNoyy ? (<><div className="font-bold uppercase text-[9px]">Warp Cont</div><div>{bill.warpContNoyy}</div></>) : null}
              {bill.billingStatus ? (<><div className="font-bold uppercase text-[9px]">Status</div><div>{bill.billingStatus}</div></>) : null}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-8">Sr</th>
              <th className="border border-black px-1 py-1 text-left">Beam / Set</th>
              <th className="border border-black px-1 py-1 text-left">Beam No</th>
              <th className="border border-black px-1 py-1 text-right">Length</th>
              <th className="border border-black px-1 py-1 text-right">Ends</th>
              <th className="border border-black px-1 py-1 text-right">Amount</th>
              <th className="border border-black px-1 py-1 text-right">Ext.</th>
              <th className="border border-black px-1 py-1 text-right w-24">Net</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr><td colSpan={8} className="border border-black px-1 py-3 text-center italic">No line items</td></tr>
            ) : lines.map((l) => (
              <tr key={l.id}>
                <td className="border border-black px-1 py-1 text-center">{l.srNo}</td>
                <td className="border border-black px-1 py-1">
                  {[l.beamSetNo, l.setNo].filter(Boolean).join(" / ")}
                  {l.knContNo ? <div className="text-[9px] text-[var(--muted)]">KN: {l.knContNo}</div> : null}
                </td>
                <td className="border border-black px-1 py-1 mono">{l.beamNo ?? "—"}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.beamLength)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.ends)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.amount)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.extAmt)}</td>
                <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(l.netAmt)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Subtotal</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(subAmount)}</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(subExt)}</td>
              <td className="border border-black px-1 py-1 text-right font-extrabold mono text-[12px]">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(grand)}
        </div>

        {bill.rem ? (
          <div className="border border-black px-2 py-1 mt-2 text-[11px]">
            <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Remarks:</span>
            {bill.rem}
          </div>
        ) : null}

        <SignatureRow labels={["Prepared By", "Checked By", "Authorized Signatory"]} />
      </div>
    </>
  );
}
