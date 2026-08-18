import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computePricing, formatMoney, rupeesToPaise, paiseToRupees } from "@/lib/pricing";

describe("computePricing", () => {
  test("per_request bills cost+price on success", () => {
    const r = computePricing({ defaultCost: 50, defaultPrice: 100, billingModel: "per_request", success: true });
    assert.equal(r.price, 100);
    assert.equal(r.cost, 50);
    assert.equal(r.profit, 50);
    assert.equal(r.billable, true);
    assert.equal(r.ruleSource, "default");
  });

  test("per_success skips billing on failure", () => {
    const r = computePricing({ defaultCost: 50, defaultPrice: 100, billingModel: "per_success", success: false });
    assert.equal(r.billable, false);
    assert.equal(r.price, 0);
    assert.equal(r.profit, -50);
  });

  test("per_failure skips billing on success", () => {
    const r = computePricing({ defaultCost: 50, defaultPrice: 100, billingModel: "per_failure", success: true });
    assert.equal(r.billable, false);
  });

  test("customer override wins for price", () => {
    const r = computePricing({
      defaultCost: 50,
      defaultPrice: 100,
      customerRulePrice: 150,
      billingModel: "per_request",
      success: true,
    });
    assert.equal(r.price, 150);
    assert.equal(r.ruleSource, "customer");
  });
});

describe("money conversions", () => {
  test("rupeesToPaise", () => {
    assert.equal(rupeesToPaise(1), 100);
    assert.equal(rupeesToPaise("2.5"), 250);
    assert.equal(rupeesToPaise(0.99), 99);
  });
  test("paiseToRupees", () => {
    assert.equal(paiseToRupees(250), 2.5);
  });
  test("formatMoney", () => {
    assert.equal(formatMoney(250), "₹2.50");
    assert.equal(formatMoney(0), "₹0.00");
  });
});