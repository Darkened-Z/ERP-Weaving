import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export type ConvContract = {
  contNo: string;
  party: string | null;
  productQuality: string | null;
  productName: string | null;
  grayQltyCode: string | null;
  designNo: string | null;
  width: number | null;
  read: number | null;
  pick: number | null;
  qtyMtr: number | null;
  convRatePerMtr: number | null;
  grayRatePerMtr: number | null;
  rateMtr: number | null;
  brand: string | null;
  source: "INT" | "EXT";
};

/**
 * All running grey-conversion contracts from BOTH the internal (IGCC-) and
 * external (GCC-) tables, unified. The mill's existing contracts live in the
 * EXTERNAL table (ext_grey_conv_contract); newer ones may be internal — so every
 * conv-contract picker (daily production, grey despatch, folding stock) must see
 * both, else the picker looks empty. First warp brand is attached per contract.
 * cont_no prefixes differ (IGCC- vs GCC-) so there are no collisions.
 */
export async function loadConvContracts(): Promise<ConvContract[]> {
  const sel = <T extends typeof schema.intGreyConversionContract | typeof schema.extGreyConvContract>(t: T) => ({
    contNo: t.contNo,
    party: t.party,
    productQuality: t.productQuality,
    productName: t.productName,
    grayQltyCode: t.grayQltyCode,
    designNo: t.designNo,
    width: t.width,
    read: t.read,
    pick: t.pick,
    qtyMtr: t.qtyMtr,
    convRatePerMtr: t.convRatePerMtr,
    grayRatePerMtr: t.grayRatePerMtr,
    rateMtr: t.rateMtr,
    id: t.id,
  });

  const [intC, extC, intW, extW] = await Promise.all([
    db.select(sel(schema.intGreyConversionContract)).from(schema.intGreyConversionContract).where(eq(schema.intGreyConversionContract.status, "R")),
    db.select(sel(schema.extGreyConvContract)).from(schema.extGreyConvContract).where(eq(schema.extGreyConvContract.status, "R")),
    db.select({ contractId: schema.intGreyConversionWarp.contractId, brand: schema.intGreyConversionWarp.brand }).from(schema.intGreyConversionWarp),
    db.select({ contractId: schema.extGreyConvWarp.contractId, brand: schema.extGreyConvWarp.brand }).from(schema.extGreyConvWarp),
  ]);

  const firstBrand = (rows: { contractId: number; brand: string | null }[]) => {
    const m = new Map<number, string>();
    for (const w of rows) if (w.brand && !m.has(w.contractId)) m.set(w.contractId, w.brand);
    return m;
  };
  const intBrand = firstBrand(intW);
  const extBrand = firstBrand(extW);

  const shape = (rows: (typeof intC | typeof extC)[number][], brandMap: Map<number, string>, source: "INT" | "EXT"): ConvContract[] =>
    rows.map(({ id, ...c }) => ({ ...c, brand: brandMap.get(id) ?? null, source }));

  return [...shape(intC, intBrand, "INT"), ...shape(extC, extBrand, "EXT")];
}
