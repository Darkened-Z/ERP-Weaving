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

export default async function PackiParchiPrint({
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
    .from(schema.extPackiParchi)
    .where(eq(schema.extPackiParchi.id, vid))
    .limit(1);
  if (!parchi) notFound();

  const bags = await db
    .select()
    .from(schema.extPackiParchiBag)
    .where(eq(schema.extPackiParchiBag.parchiId, vid))
    .orderBy(schema.extPackiParchiBag.id);

  const partyAcc = parchi.purchaseParty
    ? (await db.select().from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.description, parchi.purchaseParty)).limit(1))[0] ?? null
    : null;

  const meter = parchi.meterNet ?? parchi.meterRe ?? 0;
  const greyRate = parchi.greyRate ?? 0;
  // Same purchase ladder the parchi saves with. wkcBrk is the kaat RATE code
  // (per 40 m), checkery a rate per KP meter and commission / broker are
  // percentages — adding them straight to the amount mixed codes and rates in
  // with money.
  const rnd = (v: number) => Math.round(v * 100) / 100;
  const greyAmount = rnd(meter * greyRate);
  const kaatAmt = rnd((meter / 40) * (parchi.wkcBrk ?? 0));
  const checkeryAmt = rnd((parchi.kpMeter ?? 0) * (parchi.checkery ?? 0));
  const brokerAmt = rnd((greyAmount * (parchi.brokerPercent ?? 0)) / 100);
  const commissionAmt = rnd((meter * (parchi.greyRateKp ?? 0) * (parchi.commission ?? 0)) / 100);
  const bagsTotal = bags.reduce((s, b) => s + (b.amount ?? 0), 0);
  const grand = rnd(greyAmount - kaatAmt - checkeryAmt - brokerAmt - commissionAmt + bagsTotal);

  const waLines: string[] = [
    `*PACKI PARCHI*`,
    `V.No: ${parchi.vNo}${parchi.ppNo ? ` | PP: ${parchi.ppNo}` : ""}`,
    `Date: ${parchi.vDate ?? "—"}`,
    `Party: ${parchi.purchaseParty ?? "—"}`,
    parchi.quality ? `Quality: ${parchi.quality}` : null,
    parchi.convContNo ? `Contract: ${parchi.convContNo}` : null,
    `Than: ${fmt(parchi.than)} | Meters: ${fmt(meter)}`,
    `Rate: ${fmt(greyRate)} | Grey Amt: ${fmt(greyAmount)}`,
    bags.length ? `Bags: ${bags.map((b) => `${b.section ?? ""} ${fmt(b.amount)}`).join(", ")}` : null,
    kaatAmt ? `Kaat: -${fmt(kaatAmt)}` : null,
    checkeryAmt ? `Checkery: -${fmt(checkeryAmt)}` : null,
    brokerAmt ? `Brokerage: -${fmt(brokerAmt)}` : null,
    commissionAmt ? `Commission: -${fmt(commissionAmt)}` : null,
    `*Grand Total: Rs. ${fmt(grand)}*`,
    parchi.remarks ? `Remarks: ${parchi.remarks}` : null,
  ].filter(Boolean) as string[];
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waLines.join("\n"))}`;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href={`/external/grey/packi-parchi?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <div className="flex gap-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
              style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 700 }}
            >
              WA
            </a>
            <PrintButton label="Print" />
          </div>
        </div>

        <PrintHeader
          title="PACKI PARCHI"
          subtitle="Grey Cloth Purchase Bill"
          right={
            <div className="text-[11px]">
              <div>V.No: <b>{parchi.vNo}</b></div>
              {parchi.ppNo ? <div>PP No: <b>{parchi.ppNo}</b></div> : null}
              <div>Date: <b>{parchi.vDate}</b></div>
              {parchi.kpNo ? <div>KP Ref: {parchi.kpNo}</div> : null}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Purchase Party</div>
            <div className="font-bold text-[13px]">{parchi.purchaseParty ?? "—"}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.ntn ? <div>NTN: {partyAcc.ntn}</div> : null}
            {parchi.brokerName ? <div className="mt-1">Broker: {parchi.brokerName}{parchi.brokerPercent ? ` (${parchi.brokerPercent}%)` : ""}</div> : null}
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {parchi.convContNo ? (<><div className="font-bold uppercase text-[9px]">Conv Cont</div><div>{parchi.convContNo}</div></>) : null}
              {parchi.saleParty ? (<><div className="font-bold uppercase text-[9px]">Sale Party</div><div>{parchi.saleParty}</div></>) : null}
              {parchi.type ? (<><div className="font-bold uppercase text-[9px]">Type</div><div>{parchi.type}</div></>) : null}
              {parchi.termSal ? (<><div className="font-bold uppercase text-[9px]">Term</div><div>{parchi.termSal}{parchi.dueDate ? ` — Due ${parchi.dueDate}` : ""}</div></>) : null}
              {parchi.ppDate ? (<><div className="font-bold uppercase text-[9px]">PP Date</div><div>{parchi.ppDate}</div></>) : null}
            </div>
          </div>
        </div>

        <div className="border border-black p-2 mb-3 text-[11px]">
          <div className="uppercase text-[9px] tracking-wide font-bold">Quality</div>
          <div className="font-bold">{parchi.quality ?? parchi.qualityPrint ?? "—"}</div>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-8">Sr</th>
              <th className="border border-black px-1 py-1 text-left">Description</th>
              <th className="border border-black px-1 py-1 text-right">Than</th>
              <th className="border border-black px-1 py-1 text-right">Meters</th>
              <th className="border border-black px-1 py-1 text-right">Rate</th>
              <th className="border border-black px-1 py-1 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black px-1 py-1 text-center">1</td>
              <td className="border border-black px-1 py-1">{parchi.quality ?? "Grey Cloth"}</td>
              <td className="border border-black px-1 py-1 text-right mono">{fmt(parchi.than)}</td>
              <td className="border border-black px-1 py-1 text-right mono">{fmt(meter)}</td>
              <td className="border border-black px-1 py-1 text-right mono">{fmt(greyRate)}</td>
              <td className="border border-black px-1 py-1 text-right mono">{fmt(greyAmount)}</td>
            </tr>
            {bags.map((b, i) => (
              <tr key={b.id}>
                <td className="border border-black px-1 py-1 text-center">{i + 2}</td>
                <td className="border border-black px-1 py-1">{b.section}{b.quality ? ` — ${b.quality}` : ""}{b.wtPerMeter ? ` @ ${b.wtPerMeter}/m` : ""}</td>
                <td className="border border-black px-1 py-1 text-right mono"></td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(b.bags)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(b.rate)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(b.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Subtotal</td>
              <td className="border border-black px-1 py-1 text-right font-bold mono">{fmt(greyAmount + bagsTotal)}</td>
            </tr>
            {kaatAmt ? (<tr><td colSpan={5} className="border border-black px-2 py-1 text-right uppercase text-[10px]">Less Kaat</td><td className="border border-black px-1 py-1 text-right mono">-{fmt(kaatAmt)}</td></tr>) : null}
            {checkeryAmt ? (<tr><td colSpan={5} className="border border-black px-2 py-1 text-right uppercase text-[10px]">Less Checkery</td><td className="border border-black px-1 py-1 text-right mono">-{fmt(checkeryAmt)}</td></tr>) : null}
            {brokerAmt ? (<tr><td colSpan={5} className="border border-black px-2 py-1 text-right uppercase text-[10px]">Less Brokerage</td><td className="border border-black px-1 py-1 text-right mono">-{fmt(brokerAmt)}</td></tr>) : null}
            {commissionAmt ? (<tr><td colSpan={5} className="border border-black px-2 py-1 text-right uppercase text-[10px]">Less Commission</td><td className="border border-black px-1 py-1 text-right mono">-{fmt(commissionAmt)}</td></tr>) : null}
            <tr>
              <td colSpan={5} className="border border-black px-2 py-1 text-right font-bold uppercase text-[10px]">Grand Total</td>
              <td className="border border-black px-1 py-1 text-right font-extrabold mono text-[12px]">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(grand)}
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
