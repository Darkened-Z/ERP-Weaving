import assert from "node:assert/strict";
import { test } from "node:test";
import { outcome, score } from "../src/lib/task-performance";

test("on time, late, overdue, pending", () => {
  assert.deepEqual(outcome("2026-11-18", "2026-11-18", "2026-11-20"), { outcome: "ON_TIME", daysLate: 0 });
  assert.deepEqual(outcome("2026-11-18", "2026-11-17", "2026-11-20"), { outcome: "ON_TIME", daysLate: 0 });
  assert.deepEqual(outcome("2026-11-18", "2026-11-20", "2026-11-20"), { outcome: "LATE", daysLate: 2 });
  assert.deepEqual(outcome("2026-11-18", null, "2026-11-20"), { outcome: "OVERDUE", daysLate: 2 });
  assert.deepEqual(outcome("2026-11-20", null, "2026-11-20"), { outcome: "PENDING", daysLate: 0 });
  assert.deepEqual(outcome(null, null, "2026-11-20"), { outcome: "NO_DATE", daysLate: 0 });
});

test("score counts only tasks whose date has passed", () => {
  const s = score([
    outcome("2026-11-17", "2026-11-17", "2026-11-20"),
    outcome("2026-11-18", "2026-11-19", "2026-11-20"),
    outcome("2026-11-19", null, "2026-11-20"),
    outcome("2026-11-19", "2026-11-19", "2026-11-20"),
    outcome("2026-11-21", null, "2026-11-20"),
  ]);
  assert.equal(s.onTime, 2);
  assert.equal(s.late, 1);
  assert.equal(s.overdue, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.onTimePct, 50);
  assert.equal(s.donePct, 75);
  assert.equal(s.lateDays, 1);
});
