import assert from "node:assert/strict";
import { test } from "node:test";
import { occurrences, reminderAt, repeatLabel } from "../src/lib/task-schedule";

// 2026-11-16 is a Monday.
test("weekly on picked weekdays", () => {
  assert.deepEqual(
    occurrences("2026-11-16", { rule: "WEEKLY", days: [1, 4] }, "2026-11-30"),
    ["2026-11-16", "2026-11-19", "2026-11-23", "2026-11-26", "2026-11-30"],
  );
  assert.deepEqual(occurrences("2026-11-16", { rule: "WEEKLY" }, "2026-11-30"), ["2026-11-16", "2026-11-23", "2026-11-30"]);
});

test("monthly on picked dates, short months use the last day", () => {
  assert.deepEqual(
    occurrences("2026-01-05", { rule: "MONTHLY", dates: [5, 31] }, "2026-03-10"),
    ["2026-01-05", "2026-01-31", "2026-02-05", "2026-02-28", "2026-03-05"],
  );
  assert.deepEqual(occurrences("2026-01-31", { rule: "MONTHLY" }, "2026-04-30"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(occurrences("2026-02-10", { rule: "MONTHLY", dates: [0] }, "2026-04-30"), ["2026-02-10", "2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("custom every 2 weeks / every 3 months", () => {
  assert.deepEqual(
    occurrences("2026-11-16", { rule: "CUSTOM", unit: "WEEK", every: 2, days: [1, 5] }, "2026-12-14"),
    ["2026-11-16", "2026-11-20", "2026-11-30", "2026-12-04", "2026-12-14"],
  );
  assert.deepEqual(
    occurrences("2026-01-15", { rule: "CUSTOM", unit: "MONTH", every: 3, dates: [1, 15] }, "2026-08-01"),
    ["2026-01-15", "2026-04-01", "2026-04-15", "2026-07-01", "2026-07-15"],
  );
});

test("daily, periodically, yearly and the end date", () => {
  assert.deepEqual(occurrences("2026-11-16", { rule: "DAILY", end: "2026-11-18" }, "2026-12-31"), ["2026-11-16", "2026-11-17", "2026-11-18"]);
  assert.deepEqual(occurrences("2026-11-16", { rule: "PERIODICALLY", every: 10 }, "2026-12-10"), ["2026-11-16", "2026-11-26", "2026-12-06"]);
  assert.deepEqual(occurrences("2024-02-29", { rule: "YEARLY" }, "2026-03-01"), ["2024-02-29", "2025-02-28", "2026-02-28"]);
  assert.deepEqual(occurrences("2026-12-01", { rule: "DAILY" }, "2026-11-30"), []);
});

test("labels and reminder times", () => {
  assert.equal(repeatLabel({ rule: "WEEKLY", days: [1, 4] }), "Weekly · Mon, Thu");
  assert.equal(repeatLabel({ rule: "MONTHLY", dates: [1, 0] }), "Monthly · 1st, last day");
  assert.equal(repeatLabel({ rule: "CUSTOM", unit: "MONTH", every: 3, dates: [22] }), "Every 3 months · 22nd");
  assert.equal(reminderAt("2026-11-17", "10:00", 10, "minutes", "BEFORE"), "2026-11-17T09:50");
  assert.equal(reminderAt("2026-11-17", null, 1, "days", "AFTER"), "2026-11-18T09:00");
});
