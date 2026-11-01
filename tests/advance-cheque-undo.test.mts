import assert from "node:assert/strict";
import { test } from "node:test";
import { bounceToUndo, type ChequeTransitionRow } from "../src/lib/advance-cheque-undo";

const issue = { id: 10, fyCode: "2026", bankAdv: "advance-bank-a" };
const row = (id: number, trnType: string, overrides: Partial<ChequeTransitionRow> = {}): ChequeTransitionRow => ({
  id, fyCode: "2026", vno: id, vdate: "2026-10-28", trnType,
  accCode: "advance-bank-a", debit: trnType === "BOUNCE" ? 100 : 0,
  ...overrides,
});

test("undo targets only the selected issue's bank-advance debit and bounce voucher", () => {
  const result = bounceToUndo([
    row(10, "ISSUE"),
    row(11, "BOUNCE", { accCode: "dishonour-account", debit: 0 }),
    row(11, "BOUNCE"),
    row(12, "BOUNCE", { accCode: "advance-bank-b" }),
  ], issue);
  assert.equal(result.status, "ready");
  assert.equal(result.bounce?.id, 11);
});

test("undo refuses an older bounce after the cheque was re-issued", () => {
  const result = bounceToUndo([row(10, "ISSUE"), row(11, "BOUNCE"), row(12, "ISSUE")], issue);
  assert.equal(result.status, "reissued");
});

test("undo does not remove another issue's bounce or a bounce in another fiscal year", () => {
  assert.equal(bounceToUndo([row(10, "ISSUE"), row(11, "ISSUE"), row(12, "BOUNCE")], issue).status, "not_bounced");
  assert.equal(bounceToUndo([row(10, "ISSUE"), row(11, "BOUNCE", { fyCode: "2027" })], issue).status, "not_bounced");
});
