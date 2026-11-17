/**
 * A physical beam (AJ-1 …) is re-warped and mounted again set after set, so its
 * production history holds many runs. One run = one warping of the beam, from
 * its first roll to its L-ROLL. A new run starts after an L-ROLL, or when the
 * row names a different set-beam ("44-5" after "18-3"). Rows with no set-beam
 * stay in the run they fall in.
 */
export type RunRow = { vNo: string | null; vDate: string | null; beamStatus: string | null; pBeamSetNo: string | null };

const vNoNum = (v: string | null) => Number((v ?? "").replace(/\D/g, "")) || 0;

export function splitBeamRuns<T extends RunRow>(rows: T[]): { beamSetNo: string; done: boolean; rows: T[] }[] {
  const sorted = [...rows].sort((a, b) => (a.vDate ?? "").localeCompare(b.vDate ?? "") || vNoNum(a.vNo) - vNoNum(b.vNo));
  const runs: { beamSetNo: string; done: boolean; rows: T[] }[] = [];
  let cur: (typeof runs)[number] | null = null;
  for (const r of sorted) {
    const bs = r.pBeamSetNo?.trim() ?? "";
    if (!cur || cur.done || (bs && cur.beamSetNo && bs !== cur.beamSetNo)) {
      cur = { beamSetNo: bs, done: false, rows: [] };
      runs.push(cur);
    }
    if (!cur.beamSetNo && bs) cur.beamSetNo = bs;
    cur.rows.push(r);
    if ((r.beamStatus ?? "").toUpperCase() === "L-ROLL") cur.done = true;
  }
  return runs;
}

/** "44-5" → "44". */
export const setOfBeamSetNo = (beamSetNo: string) => beamSetNo.split("-")[0]?.trim() ?? "";
