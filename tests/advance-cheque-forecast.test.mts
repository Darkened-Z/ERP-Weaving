import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingAdvanceCheques, type AdvanceLedgerLine } from "../src/lib/advance-cheque-forecast";

test("clear and bounce settle only the matching issue, leaving reissued cheques open", () => {
  const line = (vno: number, trnType: string, debit: number, credit: number, chqNo = "123"):
    AdvanceLedgerLine => ({ fyCode: "2026", vno, srno: 2, accCode: "1.01.15.03.0001",
      chqNo, chqDate: "2026-11-03", trnType, debit, credit });
  const pending = pendingAdvanceCheques([
    line(5, "ISSUE", 0, 100),
    line(6, "BOUNCE", 100, 0),
    line(7, "ISSUE", 0, 100),
    line(8, "ISSUE", 0, 50, "456"),
    line(9, "CLEAR", 50, 0, "456"),
  ]);
  assert.deepEqual(pending, [{ chqNo: "123", chqDate: "2026-11-03", amount: 100 }]);
});
