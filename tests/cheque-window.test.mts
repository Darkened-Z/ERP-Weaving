import assert from "node:assert/strict";
import { test } from "node:test";
import { isUpcomingCheque, upcomingDays } from "../src/lib/cheque-window";

test("custom look-ahead includes the selected boundary and excludes old or settled cheques", () => {
  const asOf = "2026-10-31";
  const due = (chqDate: string, status = "ISSUED") => ({ chqDate, status });
  assert.equal(isUpcomingCheque(due("2026-11-03"), asOf, 2), false);
  assert.equal(isUpcomingCheque(due("2026-11-03"), asOf, 3), true);
  assert.equal(isUpcomingCheque(due("2026-10-31"), asOf, 3), true);
  assert.equal(isUpcomingCheque(due("2026-10-30"), asOf, 3), false);
  assert.equal(isUpcomingCheque(due("2026-11-03", "CLEARED"), asOf, 3), false);
  assert.equal(isUpcomingCheque(due("", "ISSUED"), asOf, 3), false);
});

test("look-ahead accepts whole-day windows within one year", () => {
  assert.equal(upcomingDays("4"), 4);
  assert.equal(upcomingDays("0"), null);
  assert.equal(upcomingDays("2.5"), null);
  assert.equal(upcomingDays("366"), null);
});
