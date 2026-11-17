import assert from "node:assert/strict";
import { test } from "node:test";
import { splitBeamRuns, setOfBeamSetNo } from "../src/lib/beam-runs";

const row = (vNo: string, vDate: string, beamStatus: string | null, pBeamSetNo: string | null) => ({ vNo, vDate, beamStatus, pBeamSetNo });

test("a reused beam splits into one run per warping", () => {
  const runs = splitBeamRuns([
    row("IDP-1958", "2026-11-14", "F-ROLL", "44-5"),
    row("IDP-0127", "2026-10-04", "F-ROLL", "18-3"),
    row("IDP-0184", "2026-10-05", "RUNNING", "18-3"),
    row("IDP-1284", "2026-10-30", "L-ROLL", "18-3"),
    row("IDP-1959", "2026-11-14", "RUNNING", "44-5"),
  ]);
  assert.deepEqual(runs.map((r) => [r.beamSetNo, r.done, r.rows.length]), [["18-3", true, 3], ["44-5", false, 2]]);
});

test("a new set-beam starts a new run even without an L-ROLL; blank set-beam rows stay in their run", () => {
  const runs = splitBeamRuns([
    row("IDP-0046", "2026-10-01", "F-ROLL", "7-3"),
    row("IDP-0316", "2026-10-07", "F-ROLL", "16-4"),
    row("IDP-1268", "2026-10-28", null, null),
    row("IDP-1427", "2026-11-02", "L-ROLL", "16-4"),
  ]);
  assert.deepEqual(runs.map((r) => [r.beamSetNo, r.done, r.rows.length]), [["7-3", false, 1], ["16-4", true, 3]]);
  assert.equal(setOfBeamSetNo("44-5"), "44");
});
