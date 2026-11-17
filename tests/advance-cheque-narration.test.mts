import { test } from "node:test";
import assert from "node:assert/strict";
import { issueLegNarration, issueLegNote } from "../src/lib/advance-cheque-narration";

const leg = {
  party: "FM Sizing industery",
  bankAdv: "ADVANCE CHQ MEEZAN M ZAHID-7757",
  chqNo: "44363989",
  chqDate: "2026-10-25",
  amount: 400000,
  note: "Fm sizing chq issu zahid",
};

test("a cheque leg names only its own party, bank, cheque, date, amount and note", () => {
  assert.equal(
    issueLegNarration(leg),
    "ADVANCE CHQ ISSUE — FM Sizing industery — ADVANCE CHQ MEEZAN M ZAHID-7757 — CHQ #44363989 DT 25/10/2026 — 400,000 — Fm sizing chq issu zahid",
  );
  assert.equal(
    issueLegNarration({ ...leg, chqDate: null, note: null }),
    "ADVANCE CHQ ISSUE — FM Sizing industery — ADVANCE CHQ MEEZAN M ZAHID-7757 — CHQ #44363989 — 400,000",
  );
});

test("the note reads back from a per-leg narration, including one with dashes", () => {
  assert.equal(issueLegNote(issueLegNarration(leg), "44363989", 400000, 0, 6), "Fm sizing chq issu zahid");
  assert.equal(issueLegNote(issueLegNarration({ ...leg, note: "a — b" }), "44363989", 400000, 0, 6), "a — b");
  assert.equal(issueLegNote(issueLegNarration({ ...leg, note: null }), "44363989", 400000, 0, 6), "");
});

test("legacy combined narrations map back only one note per cheque", () => {
  const six = "ADVANCE CHQ ISSUE 6 CHQ #1, #2, #3, #4, #5, #6 — n1; n2; n3; n4; n5; n6";
  assert.equal(issueLegNote(six, "3", 400000, 2, 6), "n3");
  assert.equal(issueLegNote("ADVANCE CHQ ISSUE 3 CHQ #1, #2, #3 — only one", "2", 1, 1, 3), "");
  assert.equal(issueLegNote("ADVANCE CHQ ISSUE #44363995 — Fm sizing chq issu zahid", "44363995", 400000, 0, 1), "Fm sizing chq issu zahid");
  assert.equal(issueLegNote("ADVANCE CHQ ISSUE #9", "9", 1, 0, 1), "");
});
