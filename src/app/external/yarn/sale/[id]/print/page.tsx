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

export default async function YarnSaleVoucherPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const vid = parseInt(id, 10);
  if (!Number.isFinite(vid) || vid <= 0) notFound();

  const [voucher] = await db
    .select()
    .from(schema.extYarnSalVoucher)
    .where(eq(schema.extYarnSalVoucher.id, vid))
    .limit(1);
  if (!voucher) notFound();

  const lines = await db
    .select()
    .from(schema.extYarnSalVoucherLine)
    .where(eq(schema.extYarnSalVoucherLine.voucherId, vid))
    .orderBy(schema.extYarnSalVoucherLine.id);

  const partyAcc = voucher.party
    ? (
        await db
          .select()
          .from(schema.chartOfAccounts)
          .where(eq(schema.chartOfAccounts.description, voucher.party))
          .limit(1)
      )[0] ?? null
    : null;

  const rows = lines.map((l, i) => {
    const lbs = l.lbs ?? 0;
    const rate = l.rate ?? 0;
    const amount = l.amt ?? lbs * rate;
    return { i: i + 1, l, amount };
  });
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const grand = subtotal;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href={`/external/yarn/sale?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <PrintButton label="Print" />
        </div>

        <PrintHeader
          title="YARN SALE INVOICE"
          right={
            <div className="text-[11px]">
              <div>V.No: <b>{voucher.vNo}</b></div>
              <div>Date: <b>{voucher.vDate}</b></div>
              {voucher.lvNo != null ? <div>LV.No: {voucher.lvNo}</div> : null}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Bill To</div>
            <div className="font-bold text-[13px]">{voucher.party ?? "—"}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.city ? <div>{partyAcc.city}</div> : null}
            {partyAcc?.ntn ? <div>NTN: {partyAcc.ntn}</div> : null}
            {partyAcc?.gstNo ? <div>GST: {partyAcc.gstNo}</div> : null}
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {voucher.broker ? (<><div className="font-bold uppercase text-[9px]">Broker</div><div>{voucher.broker}</div></>) : null}
              {voucher.cont ? (<><div className="font-bold uppercase text-[9px]">Contract No</div><div>{voucher.cont}</div></>) : null}
              {voucher.loomType ? (<><div className="font-bold uppercase text-[9px]">Loom Type</div><div>{voucher.loomType}</div></>) : null}
              <div className="font-bold uppercase text-[9px]">Term</div><div>{voucher.term}{voucher.dueDate ? ` — Due ${voucher.dueDate}` : ""}</div>
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-8">Sr</th>
              <th className="border border-black px-1 py-1 text-left">Description</th>
              <th className="border border-black px-1 py-1 text-left">DO No</th>
              <th className="border border-black px-1 py-1 text-right">Bags</th>
              <th className="border border-black px-1 py-1 text-right">Lbs</th>
              <th className="border border-black px-1 py-1 text-right">Rate</th>
              <th className="border border-black px-1 py-1 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="border border-black px-1 py-3 text-center italic">No line items</td></tr>
            ) : rows.map(({ i, l, amount }) => (
              <tr key={l.id}>
                <td className="border border-black px-1 py-1 text-center">{i}</td>
                <td className="border border-black px-1 py-1">
                  {[l.count, l.brand, l.bld, l.pack && `Pack ${l.pack}`, l.despatchParty && `Dspt: ${l.despatchParty}`]
                    .filter(Boolean).join(" · ")}
                  {l.contNo ? <div className="text-[9px] text-[var(--muted)]">Cont: {l.contNo}</div> : null}
                  {l.remarks ? <div className="text-[9px] text-[var(--muted)]">{l.remarks}</div> : null}
                </td>
                <td className="border border-black px-1 py-1">{l.doNo ?? "—"}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.bag)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.lbs)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.rate)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Subtotal</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={6} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Grand Total</td>
              <td className="border border-black px-1 py-1 text-right font-extrabold mono text-[12px]">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(grand)}
        </div>

        {voucher.remarks ? (
          <div className="border border-black px-2 py-1 mt-2 text-[11px]">
            <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Remarks:</span>
            {voucher.remarks}
          </div>
        ) : null}

        <SignatureRow labels={["Prepared By", "Checked By", "Authorized Signatory"]} />
      </div>
    </>
  );
}
