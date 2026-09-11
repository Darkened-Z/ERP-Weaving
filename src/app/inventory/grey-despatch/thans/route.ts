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
      mm: schema.intDailyProductionSet.mmThanSrNo,
      totalCount: schema.intDailyProductionSet.totalCount,
      aCount: schema.intDailyProductionSet.aCount,
      bCount: schema.intDailyProductionSet.bCount,
      cCount: schema.intDailyProductionSet.cCount,
      cpCount: schema.intDailyProductionSet.cpCount,
      rejCount: schema.intDailyProductionSet.rejCount,
      beamNo: schema.intDailyProductionSet.beamNo,
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
    .orderBy(schema.intDailyProductionSet.mmThanSrNo);

  return NextResponse.json(rows);
}
