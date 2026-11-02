import assert from "node:assert/strict";
import { test } from "node:test";
import { agingDueDate, agingOpenItems } from "../src/lib/aging-open-items";

const entry = (vno: number, vdate: string, amount: number) => ({
  vtype: amount > 0 ? "YPV" : "ADV",
  vno,
  vdate,
  dueDate: "",
  narration: "",
  amount,
});

test("cheque payment removes the oldest paid purchase and leaves the later purchase aged separately", () => {
  const result = agingOpenItems([
    entry(12, "2026-10-08", 2029900),
    entry(35, "2026-10-29", -975000),
    entry(10, "2026-10-03", 975000),
  ]);
  assert.deepEqual(result.items.map((item) => [item.vno, item.amount, item.accum]), [[12, 2029900, 2029900]]);
  assert.equal(result.closing, 2029900);
});

test("partial settlement preserves original charge and exact cents", () => {
  const result = agingOpenItems([entry(1, "2026-10-01", 100.75), entry(2, "2026-10-02", -40.25)]);
  assert.equal(result.items[0].originalAmount, 100.75);
  assert.equal(result.items[0].amount, 60.5);
  assert.equal(result.closing, 60.5);
});

test("advance payment offsets the next charge without displaying a payment row", () => {
  const result = agingOpenItems([entry(1, "2026-10-01", -20), entry(2, "2026-10-02", 50)]);
  assert.deepEqual(result.items.map((item) => item.amount), [30]);
  assert.equal(result.unappliedCredit, 0);
  assert.equal(result.closing, 30);
});

test("overpayment stays visible as a credit balance without an aging item", () => {
  const result = agingOpenItems([entry(1, "2026-10-01", 50), entry(2, "2026-10-02", -60)]);
  assert.equal(result.items.length, 0);
  assert.equal(result.unappliedCredit, 10);
  assert.equal(result.closing, -10);
});

test("cash purchases are due on their purchase date; recorded credit terms retain their date", () => {
  assert.equal(agingDueDate("2026-10-08", "CASH", null, null), "2026-10-08");
  assert.equal(agingDueDate("2026-10-08", "DUE", "2026-11-07", null), "2026-11-07");
  assert.equal(agingDueDate("2026-10-08", "DUE", null, null), "");
});
