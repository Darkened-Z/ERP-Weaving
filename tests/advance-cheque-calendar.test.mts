import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdvanceChequeCalendar } from "../src/app/finance/advance-cheque/calendar";
import { bankFundingThrough, chequesOnDate, type CalendarCheque } from "../src/lib/advance-cheque-calendar";

const cheque = (overrides: Partial<CalendarCheque>): CalendarCheque => ({
  issueId: 1, vno: 36, vdate: "2026-10-29", chqNo: "44363955",
  chqDate: "2026-11-03", bankAdv: "MEEZAN-ZAHID", party: "LAHORI",
  amount: 975000, status: "ISSUED", ...overrides,
});

test("calendar separates issue date from cheque date and excludes settled cheques from funding", () => {
  const rows = [
    cheque({}),
    cheque({ issueId: 2, chqNo: "44363939", amount: 500000, status: "CLEARED" }),
    cheque({ issueId: 3, chqNo: "11406216", bankAdv: "MEEZAN-KARIM", amount: 330474 }),
  ];
  assert.equal(chequesOnDate(rows, "2026-10-29").issued.length, 3);
  assert.equal(chequesOnDate(rows, "2026-11-03").due.length, 2);
  assert.deepEqual(bankFundingThrough(rows, "2026-11-03").map(({ bankAdv, amount }) => ({ bankAdv, amount })), [
    { bankAdv: "MEEZAN-KARIM", amount: 330474 },
    { bankAdv: "MEEZAN-ZAHID", amount: 975000 },
  ]);
});

test("future bank cover includes earlier uncleared dates and omits undated cheques", () => {
  const rows = [
    cheque({ chqDate: "2026-11-01", amount: 100000 }),
    cheque({ issueId: 2, chqNo: "B", chqDate: "2026-11-05", amount: 250000 }),
    cheque({ issueId: 3, chqNo: "C", chqDate: "", amount: 900000 }),
    cheque({ issueId: 4, chqNo: "D", chqDate: "2026-11-02", amount: 50000, status: "BOUNCED" }),
  ];
  assert.equal(bankFundingThrough(rows, "2026-11-03")[0].amount, 100000);
  assert.equal(bankFundingThrough(rows, "2026-11-05")[0].amount, 350000);
});

test("calendar month links reopen the calendar view", () => {
  const html = renderToStaticMarkup(createElement(AdvanceChequeCalendar, {
    cheques: [], names: new Map(), asOf: "2026-11-04", month: "2026-11", find: "",
  }));
  assert.match(html, /href="\/finance\/advance-cheque\?view=calendar&amp;month=2026-10"/);
  assert.match(html, /href="\/finance\/advance-cheque\?view=calendar&amp;month=2026-12"/);
  assert.match(html, /Advance Cheque Calendar|Cheque calendar/);
});
