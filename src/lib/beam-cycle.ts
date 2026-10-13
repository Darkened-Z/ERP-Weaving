import { db, schema } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";

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
const OFF_LOOM = new Set([...DONE, "LOADED", "R-CUT"]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number | null | undefined, b: number | null) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.005;

/** Raised when a beam's own record would put it back on a loom another beam now holds. */
export class LoomTakenError extends Error {
  constructor(readonly loom: string, readonly holder: string) {
    super(`LOOM_TAKEN:${loom}:${holder}`);
  }
}

/**
 * Re-derive a beam's state from what is on record:
 *
 * 1. Rcvd/Mtr, Diff and Shrinkage are re-stamped on every production row of the
 *    current cycle as a running total in ENTRY order (production id). The form
 *    only knows an opening balance; editing an older voucher used to stamp it
 *    with the newest total plus its own meters, so it outranked the L-ROLL
 *    entered after it and put a finished beam back on its loom.
 * 2. Status = the last-entered row's status, so a wrong date can't reorder it.
 *    Woven ≥ beam length also empties the beam — here, not only on save, so a
 *    later edit can't bring an exhausted beam back.
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
      length: schema.beams.length,
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

  let run = 0;
  let woven = 0;
  for (const r of rows) {
    run = r2(run + (r.totalCount ?? 0) + (r.rejCount ?? 0));
    woven += r.totalCount ?? 0;
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
  if (!DONE.has(status) && (beam.length ?? 0) > 0 && woven >= beam.length!) status = "EMPTY";

  if (OFF_LOOM.has(status) || mountLoom == null || !mountShed) {
    await tx
      .update(schema.beams)
      .set({
        statusWrk: DONE.has(status) ? "EMPTY" : OFF_LOOM.has(status) ? status : "LOADED",
        ...(DONE.has(status) ? { statusLoc: "L-ROLL" } : status === "R-CUT" ? { statusLoc: "R-CUT" } : {}),
        loomNo: null,
      })
      .where(eq(schema.beams.beamNo, beamNo));
    await tx
      .update(schema.looms)
      .set({ statusWrk: "S", currentBeam: null, currentContract: null })
      .where(sql`LOWER(${schema.looms.currentBeam}) = LOWER(${beamNo})`);
    return;
  }

  const [holder] = await tx
    .select({ beamNo: schema.beams.beamNo })
    .from(schema.looms)
    .innerJoin(schema.beams, sql`LOWER(${schema.beams.beamNo}) = LOWER(${schema.looms.currentBeam})`)
    .where(
      and(
        eq(schema.looms.loomNo, mountLoom),
        eq(schema.looms.shed, mountShed),
        sql`LOWER(${schema.looms.currentBeam}) <> LOWER(${beamNo})`,
        eq(schema.beams.loomNo, mountLoom),
        eq(schema.beams.shed, mountShed),
        sql`upper(coalesce(${schema.beams.statusWrk}, '')) NOT IN ('', 'EMPTY', 'L-ROLL', 'LOADED', 'R-CUT')`,
      ),
    )
    .limit(1);
  if (holder) throw new LoomTakenError(`Shed ${mountShed} · Loom ${mountLoom}`, holder.beamNo);

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
