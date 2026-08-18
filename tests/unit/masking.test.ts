import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { maskValue, applyFieldPrivacy, MASK_PRESETS } from "@/lib/masking";

describe("maskValue", () => {
  test("full masks every character", () => {
    assert.equal(maskValue("123456", { mode: "full" }), "XXXXXX");
  });

  test("hidden returns placeholder", () => {
    assert.equal(maskValue("123456", { mode: "hidden" }), "<hidden>");
  });

  test("none returns unchanged", () => {
    assert.equal(maskValue("123456", { mode: "none" }), "123456");
  });

  test("partial keeps last 4 by default", () => {
    assert.equal(maskValue("1234567890", { mode: "partial" }), "XXXXXX7890");
  });

  test("aadhaar preset masks first 8 of 12", () => {
    const p = MASK_PRESETS.aadhaar;
    assert.equal(maskValue("111122223333", { mode: "partial", rule: p.rule, keepLast: p.keepLast }), "XXXXXXXX3333");
  });

  test("pan preset keeps last 5", () => {
    const p = MASK_PRESETS.pan;
    assert.equal(maskValue("ABCDE1234F", { mode: "partial", rule: p.rule, keepLast: p.keepLast }), "XXXXX1234F");
  });

  test("empty value returns empty", () => {
    assert.equal(maskValue("", { mode: "full" }), "");
    assert.equal(maskValue(null), "");
    assert.equal(maskValue(undefined), "");
  });
});

describe("applyFieldPrivacy", () => {
  test("sensitive values are masked for display and empty for store", () => {
    const r = applyFieldPrivacy("111122223333", { sensitive: true, store: false, log: false, maskRule: null });
    assert.equal(r.display, "XXXXXXXX3333");
    assert.equal(r.store, "");
    assert.equal(r.log, "");
  });

  test("store=true persists the raw value, log keeps the masked one", () => {
    const r = applyFieldPrivacy("ABCDE1234F", { sensitive: true, store: true, log: true, maskRule: "pan" });
    assert.equal(r.display, "XXXXX1234F");
    assert.equal(r.store, "ABCDE1234F");
    assert.equal(r.log, "XXXXX1234F");
  });

  test("non-sensitive values pass through untouched", () => {
    const r = applyFieldPrivacy("hello", { sensitive: false, store: true, log: true });
    assert.equal(r.display, "hello");
    assert.equal(r.store, "hello");
    assert.equal(r.log, "hello");
  });
});