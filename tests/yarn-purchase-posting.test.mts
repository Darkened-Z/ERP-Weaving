import assert from "node:assert/strict";
import { test } from "node:test";
import { unpricedPurchaseLine } from "../src/lib/yarn-purchase-posting";

test("posted purchase refuses an unpriced weight line even if another line has value", () => {
  assert.equal(unpricedPurchaseLine("Y", [
    { lbs: 100, rate: 365 },
    { lbs: 75.5, rate: null },
  ]), 2);
  assert.equal(unpricedPurchaseLine("Y", [{ lbs: 100.75, rate: 0 }]), 1);
});

test("zero-weight spare rows and unposted vouchers do not need a rate", () => {
  assert.equal(unpricedPurchaseLine("Y", [{ lbs: 100, rate: 365 }, { lbs: 0, rate: null }]), null);
  assert.equal(unpricedPurchaseLine("N", [{ lbs: 100, rate: null }]), null);
});
