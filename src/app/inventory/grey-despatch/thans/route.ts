import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const contNo = req.nextUrl.searchParams.get("contNo")?.trim();
  if (!contNo) return NextResponse.json([]);

  // Resolve party from either contract table
  const intRow = await db
    .select({ party: schema.intGreyConversionContract.party })
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.contNo, contNo))
    .limit(1);

  let party = intRow[0]?.party ?? null;

  if (!party) {
    const extRow = await db
      .select({ party: schema.extGreyConvContract.party })
      .from(schema.extGreyConvContract)
      .where(eq(schema.extGreyConvContract.contNo, contNo))
      .limit(1);
    party = extRow[0]?.party ?? null;
  }

  if (!party) return NextResponse.json([]);

  const rows = await db
    .select({
      id: schema.intDailyProductionSet.id,
      productionId: schema.intDailyProductionSet.productionId,
      mm: schema.intDailyProductionSet.mmThanSrNo,
      totalCount: schema.intDailyProductionSet.totalCount,
      aCount: schema.intDailyProductionSet.aCount,
      bCount: schema.intDailyProductionSet.bCount,
      cCount: schema.intDailyProductionSet.cCount,
      cpCount: schema.intDailyProductionSet.cpCount,
      rejCount: schema.intDailyProductionSet.rejCount,
      beamNo: schema.intDailyProductionSet.beamNo,
      beamSetNo: schema.intDailyProductionSet.beamSetNo,
      vNo: schema.intDailyProduction.vNo,
      vDate: schema.intDailyProduction.vDate,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
    .where(
      and(
        eq(schema.intDailyProduction.convContParty, party),
        isNotNull(schema.intDailyProductionSet.mmThanSrNo),
        or(
          sql`${schema.intDailyProductionSet.dlvStatus} IS NULL`,
          ne(schema.intDailyProductionSet.dlvStatus, "Y")
        )
      )
    )
    .orderBy(schema.intDailyProductionSet.id);

  // Daily production pairs a counts row with the beam row at the SAME index, so
  // the 2nd, 3rd … than of a single-beam voucher is stored with no beam of its
  // own. When the whole voucher ran on one beam that beam is unambiguous — show
  // it rather than a dash. Vouchers spanning several beams keep the blank.
  const beamsOfVoucher = new Map<number, Set<string>>();
  for (const r of rows) {
    if (!r.beamNo) continue;
    (beamsOfVoucher.get(r.productionId) ?? beamsOfVoucher.set(r.productionId, new Set()).get(r.productionId)!).add(r.beamNo);
  }
  const setNoOfBeam = new Map<string, string | null>();
  for (const r of rows) {
    if (r.beamNo && !setNoOfBeam.has(r.beamNo)) setNoOfBeam.set(r.beamNo, r.beamSetNo ?? null);
  }

  return NextResponse.json(
    rows.map((r) => {
      if (r.beamNo) return r;
      const only = beamsOfVoucher.get(r.productionId);
      if (!only || only.size !== 1) return r;
      const beamNo = [...only][0];
      return { ...r, beamNo, beamSetNo: r.beamSetNo ?? setNoOfBeam.get(beamNo) ?? null };
    })
  );
}
