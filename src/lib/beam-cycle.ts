import { db, schema } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Beam numbers are reused: warped-beam receiving stamps brDate each time a
 * beam comes back loaded. Production rows dated before that belong to an
 * earlier cycle and must not count towards this one's woven meters. A row dated
 * the SAME day as the receiving belongs to the new cycle only if it was entered
 * after the receiving — Sk-7's old last roll (L-ROLL, 6 Oct) shared its date
 * with the re-receipt and kept emptying the freshly knotted beam.
 */
export const inCurrentBeamCycle = sql`(${schema.beams.brDate} IS NULL OR ${schema.intDailyProduction.vDate} > ${schema.beams.brDate} OR (${schema.intDailyProduction.vDate} = ${schema.beams.brDate} AND COALESCE(${schema.intDailyProduction.postedDate}, '') > COALESCE((SELECT r.posted_date FROM int_warped_beam_receiving r WHERE r.v_no = ${schema.beams.brVno}), '')))`;

/** JS twin of {@link inCurrentBeamCycle} for pages that work on loaded rows. */
export function inCycle(vDate: string, postedDate: string | null, brDate: string | null, brPosted: string | null): boolean {
  if (!brDate || vDate > brDate) return true;
  return vDate === brDate && (postedDate ?? "") > (brPosted ?? "");
}

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
const OFF_LOOM = new Set([...DONE, "LOADED"]);

/** R-CUT can be re-knotted on its current loom, but never moved to another one. */
export function canKnotBeam(
  status: string | null | undefined,
  loomNo: number | null | undefined,
  targetLoomNo?: number,
  shed?: string | null,
  targetShed?: string | null,
): boolean {
  const value = (status ?? "").trim().toUpperCase();
  return value === "LOADED" ||
    (value === "R-CUT" && (loomNo == null || (loomNo === targetLoomNo && !!shed && shed === targetShed)));
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number | null | undefined, b: number | null) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.005;

/** Raised when a beam's own record would put it back on a loom another beam now holds. */
export class LoomTakenError extends Error {
  constructor(readonly loom: string, readonly holder: string) {
    super(`LOOM_TAKEN:${loom}:${holder}`);
  }
}

/** Check both mount records inside the write transaction before taking a loom. */
export async function assertLoomAvailable(tx: Tx, beamNo: string, shed: string, loomNo: number): Promise<void> {
  const [mounted] = await tx.select({ beamNo: schema.beams.beamNo }).from(schema.beams).where(and(
    eq(schema.beams.loomNo, loomNo), eq(schema.beams.shed, shed),
    sql`lower(${schema.beams.beamNo}) <> lower(${beamNo})`,
    sql`upper(coalesce(${schema.beams.statusWrk}, '')) NOT IN ('EMPTY', 'L-ROLL', 'LOADED')`,
  )).limit(1);
  if (mounted) throw new LoomTakenError(`Shed ${shed} · Loom ${loomNo}`, mounted.beamNo);
  const [holder] = await tx.select({ beamNo: schema.looms.currentBeam }).from(schema.looms)
    .leftJoin(schema.beams, sql`lower(${schema.beams.beamNo}) = lower(${schema.looms.currentBeam})`)
    .where(and(
      eq(schema.looms.loomNo, loomNo), eq(schema.looms.shed, shed),
      sql`lower(${schema.looms.currentBeam}) <> lower(${beamNo})`,
      sql`upper(coalesce(${schema.beams.statusWrk}, '')) NOT IN ('EMPTY', 'L-ROLL', 'LOADED')`,
    )).limit(1);
  if (holder?.beamNo) throw new LoomTakenError(`Shed ${shed} · Loom ${loomNo}`, holder.beamNo);
}

/** Knotting bills reserve only the loom on which their beam is mounted now. */
export async function currentKnottingMounts(tx: Tx | typeof db) {
  return tx
    .select({
      beamNo: schema.intKnottingSarningLine.beamNo,
      shed: schema.intKnottingSarningLine.shdHash,
      loomNo: schema.intKnottingSarningLine.lmHash,
    })
    .from(schema.intKnottingSarningLine)
    .innerJoin(schema.intKnottingSarning, eq(schema.intKnottingSarning.id, schema.intKnottingSarningLine.knottingId))
    .innerJoin(schema.beams, eq(schema.beams.beamNo, schema.intKnottingSarningLine.beamNo))
    .where(sql`${schema.intKnottingSarningLine.lmHash} IS NOT NULL
      AND upper(coalesce(${schema.beams.statusWrk}, '')) NOT IN ('', 'EMPTY', 'L-ROLL', 'LOADED')
      AND ${schema.beams.shed} = ${schema.intKnottingSarningLine.shdHash}
      AND CAST(${schema.beams.loomNo} AS TEXT) = trim(${schema.intKnottingSarningLine.lmHash})
      AND (${schema.beams.knVno} IS NULL OR ${schema.beams.knVno} = ${schema.intKnottingSarning.vNo})`);
}

/**
 * Re-derive a beam's state from what is on record:
 *
 * 1. Rcvd/Mtr, Diff and Shrinkage are re-stamped on every production row of the
 *    current cycle as a running total in ENTRY order (production id). Only the
 *    than on the beam's own row counts: Shed 1 and 2 weave two widths, so the
 *    voucher's second than (row B) comes off the same warp and must not be added
 *    again — counting it doubled their meters and emptied AJ-16 mid-run. The form
 *    only knows an opening balance; editing an older voucher used to stamp it
 *    with the newest total plus its own meters, so it outranked the L-ROLL
 *    entered after it and put a finished beam back on its loom.
 * 2. Status = the last-entered row's status, so a wrong date can't reorder it.
 *    Reaching the recorded beam length does NOT finish the beam: actual output
 *    can exceed that estimate. Only an entered finishing status releases it.
 * 3. With no production yet, the beam is KNOTTING only if its knotting bill
 *    still carries it and that knotting belongs to this cycle; else LOADED/EMPTY.
 * 4. A beam going back on a loom never takes it from another beam mounted there.
 *
 * `voucherDate` is the date of the voucher that changed — one from an earlier
 * cycle than the beam's current one leaves it untouched.
 */
export async function recomputeBeamStatus(tx: Tx, beamNo: string, voucherDate?: string | null): Promise<void> {
  const [beam] = await tx
    .select({
      brDate: schema.beams.brDate,
      brVno: schema.beams.brVno,
      knVno: schema.beams.knVno,
      knDate: schema.beams.knDate,
      shed: schema.beams.shed,
      loomNo: schema.beams.loomNo,
      statusLoc: schema.beams.statusLoc,
    })
    .from(schema.beams)
    .where(eq(schema.beams.beamNo, beamNo))
    .limit(1);
  if (!beam) return;
  if (voucherDate && beam.brDate && voucherDate < beam.brDate) return;

  const rows = await tx
    .select({
      id: schema.intDailyProductionSet.id,
      productionId: schema.intDailyProductionSet.productionId,
      beamStatus: schema.intDailyProductionSet.beamStatus,
      loomNo: schema.intDailyProductionSet.loomNo,
      shedNo: schema.intDailyProduction.shedNo,
      totalCount: schema.intDailyProductionSet.totalCount,
      rejCount: schema.intDailyProductionSet.rejCount,
      bLength: schema.intDailyProductionSet.bLength,
      rcvdMtr: schema.intDailyProductionSet.rcvdMtr,
      diff: schema.intDailyProductionSet.diff,
      shrinkage: schema.intDailyProductionSet.shrinkage,
    })
    .from(schema.intDailyProductionSet)
    .innerJoin(schema.intDailyProduction, eq(schema.intDailyProduction.id, schema.intDailyProductionSet.productionId))
    .innerJoin(schema.beams, eq(schema.beams.beamNo, schema.intDailyProductionSet.beamNo))
    .where(and(eq(schema.intDailyProductionSet.beamNo, beamNo), inCurrentBeamCycle))
    .orderBy(asc(schema.intDailyProduction.id), asc(schema.intDailyProductionSet.id));

  // One running total per voucher; every row of this beam in a voucher carries it.
  const byVoucher: (typeof rows)[] = [];
  for (const r of rows) {
    const last = byVoucher[byVoucher.length - 1];
    if (last && last[0].productionId === r.productionId) last.push(r);
    else byVoucher.push([r]);
  }
  let run = 0;
  for (const vr of byVoucher) {
    run = r2(run + vr.reduce((a, r) => a + (r.totalCount ?? 0) + (r.rejCount ?? 0), 0));
    for (const r of vr) {
      const bl = r.bLength ?? 0;
      const rcvdMtr = run || null;
      const diff = bl > 0 ? r2(bl - run) : null;
      const shrinkage = bl > 0 && diff != null ? r2((diff / bl) * 100) : null;
      if (same(r.rcvdMtr, rcvdMtr) && same(r.diff, diff) && same(r.shrinkage, shrinkage)) continue;
      await tx
        .update(schema.intDailyProductionSet)
        .set({ rcvdMtr, diff, shrinkage })
        .where(eq(schema.intDailyProductionSet.id, r.id));
    }
  }

  const latest = rows[rows.length - 1];
  let status = latest?.beamStatus?.trim().toUpperCase() ?? "";
  let mountShed = beam.shed ?? latest?.shedNo ?? null;
  let mountLoom = beam.loomNo ?? latest?.loomNo ?? null;
  if (!status) {
    const knottedThisCycle = beam.knVno && (!beam.brDate || !beam.knDate || beam.knDate >= beam.brDate);
    const [line] = knottedThisCycle
      ? await tx
          .select({ shed: schema.intKnottingSarningLine.shdHash, loom: schema.intKnottingSarningLine.lmHash })
          .from(schema.intKnottingSarningLine)
          .innerJoin(schema.intKnottingSarning, eq(schema.intKnottingSarning.id, schema.intKnottingSarningLine.knottingId))
          .where(
            and(
              eq(schema.intKnottingSarning.vNo, beam.knVno!),
              sql`upper(${schema.intKnottingSarningLine.beamNo}) = upper(${beamNo})`,
            ),
          )
          .limit(1)
      : [];
    const lineLoom = line?.loom ? parseInt(line.loom, 10) : NaN;
    if (line && Number.isFinite(lineLoom)) {
      status = "KNOTTING";
      mountShed = beam.shed ?? line.shed ?? null;
      mountLoom = beam.loomNo ?? lineLoom;
    } else {
      status = beam.brVno ? "LOADED" : "EMPTY";
    }
  }
  if (OFF_LOOM.has(status) || mountLoom == null || !mountShed) {
    await tx
      .update(schema.beams)
      .set({
        statusWrk: DONE.has(status) ? "EMPTY" : OFF_LOOM.has(status) ? status : "LOADED",
        ...(DONE.has(status) ? { statusLoc: "L-ROLL" } : {}),
        loomNo: null,
      })
      .where(eq(schema.beams.beamNo, beamNo));
    await tx
      .update(schema.looms)
      .set({ statusWrk: "S", currentBeam: null, currentContract: null })
      .where(sql`LOWER(${schema.looms.currentBeam}) = LOWER(${beamNo})`);
    return;
  }

  await assertLoomAvailable(tx, beamNo, mountShed, mountLoom);

  // A finished beam that went back on its loom must not keep reading L-ROLL /
  // R-CUT in Status Loc — the Beams page treats that as "done".
  const staleLoc = ["L-ROLL", "R-CUT", "EMPTY"].includes((beam.statusLoc ?? "").toUpperCase());
  await tx
    .update(schema.beams)
    .set({ statusWrk: status, loomNo: mountLoom, shed: mountShed, ...(staleLoc ? { statusLoc: "RUNNING" } : {}) })
    .where(eq(schema.beams.beamNo, beamNo));
  // One loom, one beam: if this beam was recorded on another loom, let that one go.
  await tx
    .update(schema.looms)
    .set({ statusWrk: "S", currentBeam: null, currentContract: null })
    .where(
      and(
        sql`LOWER(${schema.looms.currentBeam}) = LOWER(${beamNo})`,
        sql`NOT (${schema.looms.loomNo} = ${mountLoom} AND ${schema.looms.shed} = ${mountShed})`,
      ),
    );
  await tx
    .update(schema.looms)
    .set({ statusWrk: "RUNNING", currentBeam: beamNo })
    .where(and(eq(schema.looms.loomNo, mountLoom), eq(schema.looms.shed, mountShed)));
}
