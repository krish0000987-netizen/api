// Pricing engine (sections 12, 13). All money values are stored as paise
// (1/100 rupee) integers to avoid floating-point drift.
//
// Pricing rules:
//   - default: product.defaultCost / product.defaultPrice
//   - customer override: PricingRule where customerId = the caller (highest
//     priority), else null (default) rule.
//   - billingModel: per_request | per_success | per_failure | subscription |
//     credits. For this engine only per_request / per_success / per_failure
//     are enforced per-call (subscription/credits are managed separately).

export type PricingResult = {
  cost: number;
  price: number;
  profit: number;
  currency: "INR";
  billable: boolean;
  ruleSource: "default" | "customer";
};

export function computePricing(input: {
  defaultCost: number;
  defaultPrice: number;
  customerRulePrice?: number | null;
  billingModel: string;
  success: boolean;
}): PricingResult {
  const { defaultCost, defaultPrice, customerRulePrice, billingModel, success } = input;

  const price = customerRulePrice !== null && customerRulePrice !== undefined ? customerRulePrice : defaultPrice;
  const cost = defaultCost;

  let billable = true;
  if (billingModel === "per_success" && !success) billable = false;
  if (billingModel === "per_failure" && success) billable = false;
  if (billingModel === "subscription" || billingModel === "credits") billable = false;

  return {
    cost,
    price: billable ? price : 0,
    profit: billable ? price - cost : -cost,
    currency: "INR",
    billable,
    ruleSource: customerRulePrice !== null && customerRulePrice !== undefined ? "customer" : "default",
  };
}

/** Format paise as a rupee string, e.g. 250 -> "₹2.50". */
export function formatMoney(paise: number): string {
  const rupees = paise / 100;
  const formatted = rupees.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
  return formatted;
}

/** Convert a rupee string/number to paise. */
export function rupeesToPaise(value: number | string): number {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}