import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const contNo = req.nextUrl.searchParams.get("contNo")?.trim();
  if (!contNo) return NextResponse.json([]);

  const keep = (req.nextUrl.searchParams.get("keep") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [prodRows, openRows] = await Promise.all([
    db
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
          eq(schema.intDailyProductionSet.contNo, contNo),
          isNotNull(schema.intDailyProductionSet.mmThanSrNo),
          or(
            sql`${schema.intDailyProductionSet.dlvStatus} IS NULL`,
            ne(schema.intDailyProductionSet.dlvStatus, "Y"),
            ...(keep.length ? [inArray(schema.intDailyProductionSet.mmThanSrNo, keep)] : [])
          )
        )
      )
      .orderBy(schema.intDailyProductionSet.id),

    db
      .select({
        id: schema.inventoryOpening.id,
        netMtr: schema.inventoryOpening.netMtr,
        openingQty: schema.inventoryOpening.openingQty,
        beamNo: schema.inventoryOpening.beamNo,
        beamSetNo: schema.inventoryOpening.beamSetNo,
        voucherNo: schema.inventoryOpening.voucherNo,
        entryDate: schema.inventoryOpening.entryDate,
        dlvStatus: schema.inventoryOpening.dlvStatus,
        description: schema.inventoryOpening.description,
        than: schema.inventoryOpening.than,
      })
      .from(schema.inventoryOpening)
      .where(
        and(
          eq(schema.inventoryOpening.convContNo, contNo),
          eq(schema.inventoryOpening.itemType, "GREY"),
          eq(schema.inventoryOpening.status, "A"),
        )
      ),
  ]);

  const beamsOfVoucher = new Map<number, Set<string>>();
  for (const r of prodRows) {
    if (!r.beamNo) continue;
    (beamsOfVoucher.get(r.productionId) ?? beamsOfVoucher.set(r.productionId, new Set()).get(r.productionId)!).add(r.beamNo);
  }
  const setNoOfBeam = new Map<string, string | null>();
  for (const r of prodRows) {
    if (r.beamNo && !setNoOfBeam.has(r.beamNo)) setNoOfBeam.set(r.beamNo, r.beamSetNo ?? null);
  }

  const mapped = prodRows.map((r) => {
    if (r.beamNo) return r;
    const only = beamsOfVoucher.get(r.productionId);
    if (!only || only.size !== 1) return r;
    const beamNo = [...only][0];
    return { ...r, beamNo, beamSetNo: r.beamSetNo ?? setNoOfBeam.get(beamNo) ?? null };
  });

  const keepSet = new Set(keep);
  const filteredOpen = openRows.filter((r) => {
    if (r.dlvStatus !== "Y") return true;
    const prefix = `OPN-${r.id}`;
    return keepSet.has(prefix) || keep.some((k) => k.startsWith(`${prefix}-`));
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const openMapped: Record<string, unknown>[] = [];
  for (const r of filteredOpen) {
    const thanCount = Math.max(r.than ?? 1, 1);
    const totalMtrs = r.netMtr ?? r.openingQty ?? 0;
    const perThan = thanCount > 1 ? round2(totalMtrs / thanCount) : totalMtrs;
    for (let i = 1; i <= thanCount; i++) {
      const mtrs = i < thanCount ? perThan : round2(totalMtrs - perThan * (thanCount - 1));
      openMapped.push({
        id: -(r.id * 1000 + i),
        productionId: 0,
        mm: `OPN-${r.id}-${i}`,
        totalCount: mtrs,
        aCount: null,
        bCount: null,
        cCount: null,
        cpCount: null,
        rejCount: null,
        beamNo: r.beamNo ?? null,
        beamSetNo: r.beamSetNo ?? null,
        vNo: r.voucherNo || `OPN-${r.id}`,
        vDate: r.entryDate ?? "",
        source: "OPN" as const,
        description: r.description ?? "",
        thanCount: 0,
      });
    }
  }

  return NextResponse.json([...openMapped, ...mapped]);
}
