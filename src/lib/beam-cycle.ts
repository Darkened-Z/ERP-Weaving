import { db, schema } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Beam numbers are reused: warped-beam receiving stamps brDate each time a
 * beam comes back loaded. Production rows dated before that belong to an
 * earlier cycle and must not count towards this one's woven meters.
 */
export const inCurrentBeamCycle = sql`(${schema.beams.brDate} IS NULL OR ${schema.intDailyProduction.vDate} >= ${schema.beams.brDate})`;

/** Meters woven on a beam in its current cycle. */
export async function wovenThisCycle(tx: Tx | typeof db, beamNo: string): Promise<number> {
  const [agg] = await tx
    .select({ woven: sql<number>`COALESCE(SUM(${schema.intDailyProductionSet.totalCount}), 0)` })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProduction.id, schema.intDailyProductionSet.productionId))
    .innerJoin(schema.beams, eq(schema.beams.beamNo, schema.intDailyProductionSet.beamNo))
    .where(and(eq(schema.intDailyProductionSet.beamNo, beamNo), inCurrentBeamCycle));
  return Number(agg?.woven ?? 0);
}

const DONE = new Set(["EMPTY", "L-ROLL"]);

/**
 * Re-derive a beam's lifecycle status from what is on record, instead of from
 * whichever voucher was saved last: the latest production row of the current
 * cycle wins; with none, the knotting mount (KNOTTING), else the receiving
 * (LOADED), else EMPTY. `voucherDate` is the date of the voucher that changed —
 * one from an earlier cycle than the beam's current one leaves it untouched.
 */
export async function recomputeBeamStatus(tx: Tx, beamNo: string, voucherDate?: string | null): Promise<void> {
  const [beam] = await tx
    .select({
      brDate: schema.beams.brDate,
      brVno: schema.beams.brVno,
      knVno: schema.beams.knVno,
      shed: schema.beams.shed,
      loomNo: schema.beams.loomNo,
    })
    .from(schema.beams)
    .where(eq(schema.beams.beamNo, beamNo))
    .limit(1);
  if (!beam) return;
  if (voucherDate && beam.brDate && voucherDate < beam.brDate) return;

  const [latest] = await tx
    .select({ beamStatus: schema.intDailyProductionSet.beamStatus, loomNo: schema.intDailyProductionSet.loomNo })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProduction.id, schema.intDailyProductionSet.productionId))
    .innerJoin(schema.beams, eq(schema.beams.beamNo, schema.intDailyProductionSet.beamNo))
    .where(and(eq(schema.intDailyProductionSet.beamNo, beamNo), inCurrentBeamCycle))
    .orderBy(
      desc(schema.intDailyProduction.vDate),
      desc(schema.intDailyProduction.id),
      desc(schema.intDailyProductionSet.id),
    )
    .limit(1);

  const status = latest?.beamStatus?.trim().toUpperCase()
    ? latest.beamStatus.trim().toUpperCase()
    : beam.knVno
      ? "KNOTTING"
      : beam.brVno
        ? "LOADED"
        : "EMPTY";
  const offLoom = DONE.has(status) || status === "LOADED";

  if (offLoom) {
    await tx
      .update(schema.beams)
      .set({ statusWrk: DONE.has(status) ? "EMPTY" : status, loomNo: null })
      .where(eq(schema.beams.beamNo, beamNo));
    if (beam.shed && beam.loomNo != null) {
      await tx
        .update(schema.looms)
        .set({ statusWrk: "S", currentBeam: null, currentContract: null })
        .where(and(eq(schema.looms.loomNo, beam.loomNo), eq(schema.looms.shed, beam.shed), eq(schema.looms.currentBeam, beamNo)));
    }
    return;
  }

  // Still mounted. If an earlier last-roll had taken it off its loom, put it
  // back on the loom its production was recorded against.
  const loomNo = beam.loomNo ?? latest?.loomNo ?? null;
  await tx.update(schema.beams).set({ statusWrk: status, loomNo }).where(eq(schema.beams.beamNo, beamNo));
  if (beam.loomNo == null && loomNo != null && beam.shed) {
    await tx
      .update(schema.looms)
      .set({ statusWrk: "RUNNING", currentBeam: beamNo })
      .where(and(eq(schema.looms.loomNo, loomNo), eq(schema.looms.shed, beam.shed)));
  }
}
