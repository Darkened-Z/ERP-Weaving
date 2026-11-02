import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgingCalendar } from "../src/app/reports/aging-detail/calendar";

test("calendar groups the unpaid voucher on its due day and retains month navigation", () => {
  const html = renderToStaticMarkup(createElement(AgingCalendar, {
    asOf: "2026-11-02",
    month: "2026-10",
    baseHref: "?asof=2026-11-02&mode=calendar",
    items: [{ party: "ABDULREHMAN LAHORI", voucher: "YPV-0012", dueDate: "2026-10-08", amount: 2029900 }],
  }));
  assert.match(html, /October 2026/);
  assert.match(html, /YPV-0012/);
  assert.match(html, /2,029,900/);
  assert.match(html, /month=2026-09/);
  assert.match(html, /month=2026-11/);
});
