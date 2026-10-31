import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.DEMO_DB = "";
const { cashFlowBoard, isIsoDate } = await import("../src/lib/cash-flow");

test("cash forecast caps plans at live balances and excludes undated or held items", () => {
  const board = cashFlowBoard([
    { side: "RECEIVABLE", code: "customer", name: "Customer", outstanding: 60 },
    { side: "RECEIVABLE", code: "unplanned", name: "Unplanned", outstanding: 40 },
    { side: "PAYABLE", code: "supplier", name: "Supplier", outstanding: 30 },
    { side: "PAYABLE", code: "held", name: "Held", outstanding: 20 },
  ], [
    { side: "RECEIVABLE", accCode: "customer", expectedDate: "2026-11-03", expectedAmount: 100, stage: "CONFIRMED", notes: null },
    { side: "PAYABLE", accCode: "supplier", expectedDate: "2026-10-30", expectedAmount: 10, stage: "OPEN", notes: null },
    { side: "PAYABLE", accCode: "held", expectedDate: "2026-11-01", expectedAmount: 20, stage: "ON_HOLD", notes: null },
  ], 25, "2026-10-31", [{ chqNo: "1001", chqDate: "2026-11-02", amount: 5 }]);
  assert.equal(board.receivables, 100);
  assert.equal(board.payables, 50);
  assert.equal(board.receipts7, 60);
  assert.equal(board.payments7, 10);
  assert.equal(board.projected7, 70);
  assert.equal(board.cheques7, 5);
  assert.equal(board.overduePayables, 10);
  assert.equal(board.unscheduledReceivables, 40);
  assert.equal(board.unscheduledPayables, 40);
  assert.equal(board.rows.find(r => r.code === "customer")?.scheduled, 60);
});

test("plan date validation rejects impossible calendar dates", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("31/10/2026"), false);
});
