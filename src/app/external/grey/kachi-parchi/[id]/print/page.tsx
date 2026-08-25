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

export default async function KachiParchiPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const vid = parseInt(id, 10);
  if (!Number.isFinite(vid) || vid <= 0) notFound();

  const [parchi] = await db
    .select()
    .from(schema.extKachiParchi)
    .where(eq(schema.extKachiParchi.id, vid))
    .limit(1);
  if (!parchi) notFound();

  const lines = await db
    .select()
    .from(schema.extKachiParchiLine)
    .where(eq(schema.extKachiParchiLine.parchiId, vid))
    .orderBy(schema.extKachiParchiLine.srNo);

  const partyAcc = parchi.purchaseParty
    ? (await db.select().from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.description, parchi.purchaseParty)).limit(1))[0] ?? null
    : null;

  const meter = parchi.meter ?? 0;
  const convAmount = (parchi.convRate ?? 0) * meter;
  const greyAmount = (parchi.greyRate ?? 0) * meter;
  const total = convAmount + greyAmount;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href={`/external/grey/kachi-parchi?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <PrintButton label="Print" />
        </div>

        <PrintHeader
          title="KACHI PARCHI"
          subtitle="Grey Cloth Purchase Bill"
          right={
            <div className="text-[11px]">
              <div>V.No: <b>{parchi.vNo}</b></div>
              {parchi.kpNo ? <div>KP No: <b>{parchi.kpNo}</b></div> : null}
              <div>Date: <b>{parchi.vDate}</b></div>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Purchase Party</div>
            <div className="font-bold text-[13px]">{parchi.purchaseParty ?? "—"}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.ntn ? <div>NTN: {partyAcc.ntn}</div> : null}
            {parchi.brokerName ? <div className="mt-1">Broker: {parchi.brokerName}</div> : null}
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {parchi.contNo ? (<><div className="font-bold uppercase text-[9px]">Conv Cont</div><div>{parchi.contNo}</div></>) : null}
              {parchi.saleParty ? (<><div className="font-bold uppercase text-[9px]">Sale Party</div><div>{parchi.saleParty}</div></>) : null}
              {parchi.type ? (<><div className="font-bold uppercase text-[9px]">Type</div><div>{parchi.type}</div></>) : null}
              {parchi.term ? (<><div className="font-bold uppercase text-[9px]">Term</div><div>{parchi.term}{parchi.dueDate ? ` — Due ${parchi.dueDate}` : ""}</div></>) : null}
            </div>
          </div>
        </div>

        <div className="border border-black p-2 mb-3 text-[11px]">
          <div className="uppercase text-[9px] tracking-wide font-bold">Quality</div>
          <div className="font-bold">{parchi.dspQuality ?? parchi.qualityPrint ?? "—"}</div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-8">Sr</th>
              <th className="border border-black px-1 py-1 text-right">Than</th>
              <th className="border border-black px-1 py-1 text-right">Meters</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td className="border border-black px-1 py-1 text-center">1</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(parchi.than)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(parchi.meter)}</td>
              </tr>
            ) : lines.map((l) => (
              <tr key={l.id}>
                <td className="border border-black px-1 py-1 text-center">{l.srNo}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.than)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(l.mtr)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Total</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(parchi.than ?? lines.reduce((s, l) => s + (l.than ?? 0), 0))}</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(parchi.meter ?? lines.reduce((s, l) => s + (l.mtr ?? 0), 0))}</td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-2 gap-4 mt-3 text-[11px]">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold mb-1">Rates</div>
            <div className="grid grid-cols-2 gap-y-1">
              <div>Conv Rate</div><div className="text-right mono">{fmt(parchi.convRate)}</div>
              <div>Grey Rate</div><div className="text-right mono">{fmt(parchi.greyRate)}</div>
              <div>Sale Rate</div><div className="text-right mono">{fmt(parchi.rateSal)}</div>
              <div>Pur Rate</div><div className="text-right mono">{fmt(parchi.ratePur)}</div>
              <div>Kaat %</div><div className="text-right mono">{fmt(parchi.badCumiNum)}/{fmt(parchi.badCumiDen)}</div>
            </div>
          </div>
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold mb-1">Bill Summary</div>
            <div className="grid grid-cols-2 gap-y-1">
              <div>Conv Amount</div><div className="text-right mono">{fmt(convAmount)}</div>
              <div>Grey Amount</div><div className="text-right mono">{fmt(greyAmount)}</div>
              <div className="font-extrabold text-[12px]">Grand Total</div>
              <div className="text-right mono font-extrabold text-[12px]">{fmt(total)}</div>
            </div>
          </div>
        </div>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(total)}
        </div>

        {parchi.remarks ? (
          <div className="border border-black px-2 py-1 mt-2 text-[11px]">
            <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Remarks:</span>
            {parchi.remarks}
          </div>
        ) : null}

        <SignatureRow labels={["Prepared By", "Checked By", "Authorized Signatory"]} />
      </div>
    </>
  );
}
