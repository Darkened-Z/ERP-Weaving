import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const designNo = req.nextUrl.searchParams.get("designNo")?.trim();
  if (!designNo) return NextResponse.json([]);

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
        eq(schema.intDailyProduction.designNo, designNo),
        isNotNull(schema.intDailyProductionSet.mmThanSrNo),
        or(
          sql`${schema.intDailyProductionSet.dlvStatus} IS NULL`,
          ne(schema.intDailyProductionSet.dlvStatus, "Y")
        )
      )
    );

  return NextResponse.json(rows);
}
