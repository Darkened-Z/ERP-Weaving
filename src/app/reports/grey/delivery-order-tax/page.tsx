import Link from "next/link";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintHeader, SignatureRow, PrintStyles } from "@/components/print-shell";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function GreyDeliveryOrderTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  await requireSession();
  const { v } = await searchParams;
  const vNo = v?.trim() ?? "";

  if (!vNo) {
    const recent = await db
      .select({
        id: schema.intGreyDespatch.id,
        vNo: schema.intGreyDespatch.vNo,
        vDate: schema.intGreyDespatch.vDate,
        party: schema.intGreyDespatch.party,
        doParty: schema.intGreyDespatch.doParty,
        thanQty: schema.intGreyDespatch.thanQty,
        amtTot: schema.intGreyDespatch.amtTot,
        gpNo: schema.intGreyDespatch.gpNo,
      })
      .from(schema.intGreyDespatch)
      .orderBy(desc(schema.intGreyDespatch.vDate))
      .limit(30);

    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="page-title mb-4">Grey Delivery Order (Tax Invoice)</h1>
        <p className="text-[13px] text-[var(--muted)] mb-6">
          Registered sales-tax variant of the Delivery Order. Includes NTN, GST columns, sales tax and net totals.
        </p>
        <form method="GET" action="" className="mb-6 flex gap-2">
          <input name="v" placeholder="Enter despatch V.No (e.g. IGD-0001)" className="input-box mono flex-1" />
          <button type="submit" className="btn btn-sm">Open</button>
        </form>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>Date</th>
                <th>Party</th>
                <th>DO Party</th>
                <th className="text-right">Than</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="mono font-bold">{r.vNo}</td>
                  <td className="mono">{r.vDate}</td>
                  <td>{r.party ?? "-"}</td>
                  <td>{r.doParty ?? "-"}</td>
                  <td className="mono text-right">{r.thanQty ?? "-"}</td>
                  <td className="mono text-right">{fmt(r.amtTot)}</td>
                  <td>
                    <Link href={`/reports/grey/delivery-order-tax?v=${encodeURIComponent(r.vNo)}`} className="btn btn-outline btn-sm">
                      Open Tax DO
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const [despatch] = await db
    .select()
    .from(schema.intGreyDespatch)
    .where(eq(schema.intGreyDespatch.vNo, vNo))
    .limit(1);

  if (!despatch) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="page-title mb-4">Not Found</h1>
        <p>No despatch with V.No <span className="mono">{vNo}</span></p>
        <Link href="/reports/grey/delivery-order-tax" className="btn btn-outline btn-sm mt-4">Back</Link>
      </div>
    );
  }

  const lines = await db
    .select()
    .from(schema.intGreyDespatchLine)
    .where(eq(schema.intGreyDespatchLine.despatchId, despatch.id))
    .orderBy(schema.intGreyDespatchLine.srNo);

  const partyName = despatch.party ?? despatch.doParty ?? despatch.despatchTo ?? "—";
  const partyAcc = partyName !== "—"
    ? (await db.select().from(schema.chartOfAccounts)
        .where(eq(schema.chartOfAccounts.description, partyName)).limit(1))[0] ?? null
    : null;

  const totalMeters = lines.reduce((s, l) => s + (l.lengthMtrs ?? 0), 0);
  const convRate = despatch.convRate ?? 0;
  const gstPct = 18;

  // Per-line gross/GST/further/net.
  const rows = lines.map((l, i) => {
    const meters = l.lengthMtrs ?? 0;
    const gross = meters * convRate;
    const gst = gross * (gstPct / 100);
    // Further tax 4% applies to unregistered supplies — mirror stored value if any.
    const furtherPct = 0;
    const further = gross * (furtherPct / 100);
    const net = gross + gst + further;
    return { i: i + 1, l, meters, gross, gst, further, net };
  });

  const subGross = rows.reduce((s, r) => s + r.gross, 0) || despatch.amnt || 0;
  const subGst = despatch.gst ?? (rows.reduce((s, r) => s + r.gst, 0) || subGross * (gstPct / 100));
  const subFurther = despatch.further ?? rows.reduce((s, r) => s + r.further, 0);
  const grand = despatch.amtTot ?? subGross + subGst + subFurther;

  return (
    <>
      <PrintStyles />
      <div className="max-w-[210mm] mx-auto p-6">
        <div className="no-print flex justify-between items-center mb-4">
          <Link href="/reports/grey/delivery-order-tax" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Tax DO" />
        </div>

        <PrintHeader
          title="DELIVERY ORDER — TAX INVOICE"
          subtitle="Registered under Sales Tax Act 1990"
          right={
            <div className="text-[11px]">
              <div>DO No: <b>{despatch.vNo}</b></div>
              <div>Date: <b>{despatch.vDate}</b></div>
              {despatch.gpNo ? <div>GP: {despatch.gpNo}</div> : null}
              {despatch.vehicleNo ? <div>Vehicle: {despatch.vehicleNo}</div> : null}
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-4 text-[11px] mb-3">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold">Bill To</div>
            <div className="font-bold text-[13px]">{partyName}</div>
            {partyAcc?.address ? <div>{partyAcc.address}</div> : null}
            {partyAcc?.city ? <div>{partyAcc.city}</div> : null}
            <div className="grid grid-cols-2 gap-x-3 mt-1">
              <div><span className="font-bold text-[9px] uppercase">NTN:</span> {partyAcc?.ntn ?? "—"}</div>
              <div><span className="font-bold text-[9px] uppercase">GST/STN:</span> {partyAcc?.gstNo ?? "—"}</div>
            </div>
          </div>
          <div className="border border-black p-2">
            <div className="grid grid-cols-2 gap-y-1">
              {despatch.doParty && despatch.doParty !== partyName ? (<><div className="font-bold uppercase text-[9px]">DO Party</div><div>{despatch.doParty}</div></>) : null}
              {despatch.despatchLocation ? (<><div className="font-bold uppercase text-[9px]">Location</div><div>{despatch.despatchLocation}</div></>) : null}
              {despatch.driver ? (<><div className="font-bold uppercase text-[9px]">Driver</div><div>{despatch.driver}</div></>) : null}
              {despatch.transAdda ? (<><div className="font-bold uppercase text-[9px]">Trans Adda</div><div>{despatch.transAdda}</div></>) : null}
              {despatch.convContNo ? (<><div className="font-bold uppercase text-[9px]">Conv Cont</div><div>{despatch.convContNo}</div></>) : null}
              {despatch.greyCode ? (<><div className="font-bold uppercase text-[9px]">Quality</div><div>{despatch.greyCode}</div></>) : null}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="border border-black px-1 py-1 text-center w-6">Sr</th>
              <th className="border border-black px-1 py-1 text-left">Description</th>
              <th className="border border-black px-1 py-1 text-right">Than</th>
              <th className="border border-black px-1 py-1 text-right">Meters</th>
              <th className="border border-black px-1 py-1 text-right">Rate</th>
              <th className="border border-black px-1 py-1 text-right">Gross</th>
              <th className="border border-black px-1 py-1 text-right">GST {gstPct}%</th>
              <th className="border border-black px-1 py-1 text-right">Further</th>
              <th className="border border-black px-1 py-1 text-right w-24">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="border border-black px-1 py-1 text-center">1</td>
                <td className="border border-black px-1 py-1">{despatch.greyCode ?? "Grey Cloth"}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(despatch.thanQty)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(despatch.lbMtr ?? 0)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(convRate)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(subGross)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(subGst)}</td>
                <td className="border border-black px-1 py-1 text-right mono">{fmt(subFurther)}</td>
                <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(grand)}</td>
              </tr>
            ) : rows.map(({ i, l, meters, gross, gst, further, net }) => {
              const than = (l.a ?? 0) + (l.b ?? 0) + (l.c ?? 0) + (l.cp ?? l.cpRej ?? 0) + (l.rej ?? 0);
              return (
                <tr key={l.id}>
                  <td className="border border-black px-1 py-1 text-center">{i}</td>
                  <td className="border border-black px-1 py-1">
                    {despatch.greyCode ?? "Grey Cloth"}
                    {l.tSrNo ? <span className="text-[9px] text-[var(--muted)]"> · T#{l.tSrNo}</span> : null}
                  </td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(than || null)}</td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(meters)}</td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(convRate)}</td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(gross)}</td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(gst)}</td>
                  <td className="border border-black px-1 py-1 text-right mono">{fmt(further)}</td>
                  <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(net)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="border border-black px-2 py-1 text-right uppercase text-[9px] font-bold">Totals</td>
              <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(totalMeters)}</td>
              <td className="border border-black px-1 py-1"></td>
              <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(subGross)}</td>
              <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(subGst)}</td>
              <td className="border border-black px-1 py-1 text-right mono font-bold">{fmt(subFurther)}</td>
              <td className="border border-black px-1 py-1 text-right mono font-extrabold text-[11px]">{fmt(grand)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-2 gap-4 mt-3 text-[11px]">
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold mb-1">Tax Summary</div>
            <div className="grid grid-cols-2 gap-y-1">
              <div>Gross Value</div><div className="text-right mono">{fmt(subGross)}</div>
              <div>Sales Tax (GST)</div><div className="text-right mono">{fmt(subGst)}</div>
              <div>Further Tax</div><div className="text-right mono">{fmt(subFurther)}</div>
              <div className="font-extrabold">Net Payable</div>
              <div className="text-right mono font-extrabold">{fmt(grand)}</div>
            </div>
          </div>
          <div className="border border-black p-2">
            <div className="uppercase text-[9px] tracking-wide font-bold mb-1">Delivery</div>
            <div>Total Than: <span className="mono font-bold">{fmt(despatch.thanQty)}</span></div>
            <div>Total Meters: <span className="mono font-bold">{fmt(totalMeters)}</span></div>
            {despatch.supervisor ? <div>Supervisor: {despatch.supervisor}</div> : null}
          </div>
        </div>

        <div className="border border-black px-2 py-1 mt-3 text-[11px]">
          <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Amount in Words:</span>
          {numberToWords(grand)}
        </div>

        {despatch.remarks ? (
          <div className="border border-black px-2 py-1 mt-2 text-[11px]">
            <span className="uppercase text-[9px] tracking-wide font-bold mr-2">Remarks:</span>
            {despatch.remarks}
          </div>
        ) : null}

        <SignatureRow labels={["Prepared By", "Checked By", "Received By"]} />
      </div>
    </>
  );
}
