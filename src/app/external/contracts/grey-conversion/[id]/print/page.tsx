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

export default async function GreyConversionContractPrint({
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
    .from(schema.extGreyConvContract)
    .where(eq(schema.extGreyConvContract.id, id))
    .limit(1);
  if (!contract) notFound();

  const [warp, weft] = await Promise.all([
    db
      .select()
      .from(schema.extGreyConvWarp)
      .where(eq(schema.extGreyConvWarp.contractId, id))
      .orderBy(schema.extGreyConvWarp.srNo),
    db
      .select()
      .from(schema.extGreyConvWeft)
      .where(eq(schema.extGreyConvWeft.contractId, id))
      .orderBy(schema.extGreyConvWeft.srNo),
  ]);

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Weaving Mills";
  // For conversion contracts: company is Principal, party is Converter/Weaver.
  const principalName = companyName;
  const converterName = contract.party ?? "-";

  const grandTotal =
    (contract.qtyMtr ?? 0) *
    ((contract.convRatePerMtr ?? contract.rateMtr ?? 0));

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
      {contract.expDate && (
        <div>
          <b>Expires:</b> {contract.expDate}
        </div>
      )}
      <div>
        <b>Type:</b> {contract.type}
      </div>
    </div>
  );

  return (
    <>
      <PrintStyles />
      <div className="no-print p-3 flex gap-2 border-b border-black">
        <a href={`/external/contracts/grey-conversion?id=${id}`} className="btn btn-outline btn-sm">
          Back
        </a>
        <PrintButton label="Print" />
      </div>
      <div className="p-6 mx-auto" style={{ maxWidth: 900 }}>
        <PrintHeader title="GREY CONVERSION CONTRACT" right={rightBlock} />

        <div className="grid grid-cols-2 gap-6 mb-4 text-[12px]">
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Principal</div>
            <div className="font-bold">{principalName}</div>
            {profile?.address && <div>{profile.address}</div>}
            {profile?.ntn && <div>NTN: {profile.ntn}</div>}
          </div>
          <div className="border border-black p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">Converter</div>
            <div className="font-bold">{converterName}</div>
            {contract.broker && <div>Broker: {contract.broker}</div>}
          </div>
        </div>

        <p className="text-[12px] mb-4 leading-relaxed">
          This GREY CONVERSION CONTRACT is made on <b>{contract.contDate}</b>{" "}
          between <b>{principalName}</b> (hereinafter &ldquo;Principal&rdquo;)
          and <b>{converterName}</b> (hereinafter &ldquo;Converter&rdquo;) for
          weaving/conversion services on the following terms and conditions:
        </p>

        <table className="w-full text-[11px] mb-4">
          <tbody>
            <tr>
              <td className="border border-black p-2 w-1/4 font-bold">Product</td>
              <td className="border border-black p-2">{contract.productName ?? "-"}</td>
              <td className="border border-black p-2 w-1/4 font-bold">Quality</td>
              <td className="border border-black p-2">{contract.productQuality ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Gray Code</td>
              <td className="border border-black p-2 mono">{contract.grayCode ?? "-"}</td>
              <td className="border border-black p-2 font-bold">Design No</td>
              <td className="border border-black p-2 mono">{contract.designNo ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Weave / Loom</td>
              <td className="border border-black p-2">
                {contract.weaveFrame ?? "-"} / {contract.loomType ?? "-"}
              </td>
              <td className="border border-black p-2 font-bold">Selvage</td>
              <td className="border border-black p-2">
                {contract.selvType ?? "-"} {contract.slvName ? "· " + contract.slvName : ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Reed / Pick / Width</td>
              <td className="border border-black p-2 mono">
                {fmt(contract.read)} / {fmt(contract.pick)} / {fmt(contract.width)}
              </td>
              <td className="border border-black p-2 font-bold">Season</td>
              <td className="border border-black p-2">{contract.seasonType ?? "-"}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Quantity (Mtr)</td>
              <td className="border border-black p-2 mono">{fmt(contract.qtyMtr)}</td>
              <td className="border border-black p-2 font-bold">Rate / Pick</td>
              <td className="border border-black p-2 mono">{fmt(contract.ratePerPick)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Conv Rate / Mtr</td>
              <td className="border border-black p-2 mono">{fmt(contract.convRatePerMtr)}</td>
              <td className="border border-black p-2 font-bold">Gray Rate / Mtr</td>
              <td className="border border-black p-2 mono">{fmt(contract.grayRatePerMtr)}</td>
            </tr>
            <tr>
              <td className="border border-black p-2 font-bold">Cost / Mtr</td>
              <td className="border border-black p-2 mono">{fmt(contract.costPerMtr)}</td>
              <td className="border border-black p-2 font-bold">Lakhai/Border Cost</td>
              <td className="border border-black p-2 mono">{fmt(contract.costLakhaiBorderMtr)}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold mb-1">
              Warp Yarn
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>#</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Count</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Brand</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Ends</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Rate/Lb</th>
                </tr>
              </thead>
              <tbody>
                {warp.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border border-black p-1 text-center italic">-</td>
                  </tr>
                ) : (
                  warp.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-black p-1 mono">{r.srNo}</td>
                      <td className="border border-black p-1 mono">{r.count ?? "-"}</td>
                      <td className="border border-black p-1">{r.brand ?? "-"}</td>
                      <td className="border border-black p-1 mono text-right">{r.ends ?? "-"}</td>
                      <td className="border border-black p-1 mono text-right">{fmt(r.ratePerLbs)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold mb-1">
              Weft Yarn
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>#</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Count</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Brand</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Ends</th>
                  <th className="border border-black p-1" style={{ background: "#eee" }}>Rate/Lb</th>
                </tr>
              </thead>
              <tbody>
                {weft.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border border-black p-1 text-center italic">-</td>
                  </tr>
                ) : (
                  weft.map((r) => (
                    <tr key={r.id}>
                      <td className="border border-black p-1 mono">{r.srNo}</td>
                      <td className="border border-black p-1 mono">{r.count ?? "-"}</td>
                      <td className="border border-black p-1">{r.brand ?? "-"}</td>
                      <td className="border border-black p-1 mono text-right">{r.ends ?? "-"}</td>
                      <td className="border border-black p-1 mono text-right">{fmt(r.ratePerLbs)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between border border-black p-3 mb-4 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold">Grand Total (Conversion)</div>
            <div className="mono text-[11px] mt-1">
              {numberToWords(grandTotal)}
            </div>
          </div>
          <div className="text-right">
            <div className="mono text-lg font-bold">
              PKR {fmt(grandTotal)}
            </div>
          </div>
        </div>

        {contract.remarks && (
          <div className="border border-black p-3 mb-4 text-[11px]">
            <div className="text-[10px] uppercase tracking-wider font-bold mb-1">
              Special Conditions / Remarks
            </div>
            <div>{contract.remarks}</div>
          </div>
        )}

        <SignatureRow labels={["For Principal", "For Converter"]} />
      </div>
    </>
  );
}
