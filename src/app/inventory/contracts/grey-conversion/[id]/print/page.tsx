import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PrintStyles } from "@/components/print-shell";
import { PrintButton } from "@/components/print-button";
import { ExportPdfButton, WaPdfButton } from "@/components/wa-pdf-button";
import { GreyConvContractSheet } from "@/components/grey-conv-contract-sheet";

export const dynamic = "force-dynamic";

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
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.id, id))
    .limit(1);
  if (!contract) notFound();

  const [warp, weft] = await Promise.all([
    db
      .select()
      .from(schema.intGreyConversionWarp)
      .where(eq(schema.intGreyConversionWarp.contractId, id))
      .orderBy(schema.intGreyConversionWarp.srNo),
    db
      .select()
      .from(schema.intGreyConversionWeft)
      .where(eq(schema.intGreyConversionWeft.contractId, id))
      .orderBy(schema.intGreyConversionWeft.srNo),
  ]);

  return (
    <>
      <PrintStyles />
      <style>{`@page { size: A4 landscape; margin: 8mm; }`}</style>
      <div className="no-print p-3 flex gap-2 border-b border-black">
        <a href={`/inventory/contracts/grey-conversion?id=${id}`} className="btn btn-outline btn-sm">
          Back
        </a>
        <ExportPdfButton contentId="int-grey-conv-print" filename={`Grey-Conversion-Contract-${contract.contNo ?? id}.pdf`} onePage />
        <WaPdfButton contentId="int-grey-conv-print" filename={`Grey-Conversion-Contract-${contract.contNo ?? id}.jpg`} as="jpg" />
        <PrintButton label="Print" />
      </div>
      <GreyConvContractSheet id="int-grey-conv-print" title="GREY CONVERSION CONTRACT" contract={contract} warp={warp} weft={weft} />
    </>
  );
}
