import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getByPath, mapResponse, normalizeError, buildNormalizedResponse } from "@/lib/response-mapping";
import type { MappingRule } from "@/lib/response-mapping";

function rule(partial: Partial<MappingRule>): MappingRule {
  return {
    providerPath: "",
    customerField: "",
    fieldType: "string",
    mask: false,
    maskRule: null,
    transform: null,
    template: null,
    placement: "flat",
    customerPath: null,
    required: false,
    position: 0,
    ...partial,
  };
}

describe("getByPath", () => {
  const obj = { result: { status: "VERIFIED", items: [{ id: "a" }] } };

  test("nested access", () => {
    assert.equal(getByPath(obj, "result.status"), "VERIFIED");
  });
  test("array index access", () => {
    assert.equal(getByPath(obj, "result.items[0].id"), "a");
  });
  test("missing returns undefined", () => {
    assert.equal(getByPath(obj, "result.nope"), undefined);
  });
});

describe("mapResponse", () => {
  const provider = {
    result: { status: "VERIFIED", name: "Rohit Kumar" },
    reference: "REF1234",
  };

  test("renames fields and masks when configured", () => {
    const mapped = mapResponse(provider, [
      rule({ providerPath: "result.status", customerField: "verification_status", position: 0 }),
      rule({
        providerPath: "result.name",
        customerField: "name",
        mask: true,
        maskRule: "email",
        position: 1,
      }),
    ]);
    assert.equal(mapped.verification_status, "VERIFIED");
    assert.equal(mapped.name, "XXXXXXXumar");
  });

  test("required missing fields become null", () => {
    const mapped = mapResponse(provider, [
      rule({ providerPath: "result.missing", customerField: "x", required: true, position: 0 }),
    ]);
    assert.equal(mapped.x, null);
  });

  test("optional missing fields are omitted", () => {
    const mapped = mapResponse(provider, [
      rule({ providerPath: "result.missing", customerField: "x", position: 0 }),
    ]);
    assert.equal("x" in mapped, false);
  });

  test("nested placement writes under customerPath", () => {
    const mapped = mapResponse(provider, [
      rule({
        providerPath: "result.status",
        customerField: "status",
        placement: "nested",
        customerPath: "data.verification.status",
        position: 0,
      }),
    ]);
    assert.equal((mapped.data as any).verification.status, "VERIFIED");
  });

  test("boolean_to_status transform", () => {
    const mapped = mapResponse({ ok: true }, [
      rule({ providerPath: "ok", customerField: "status", transform: "boolean_to_status", position: 0 }),
    ]);
    assert.equal(mapped.status, "verified");
  });
});

describe("normalizeError", () => {
  test("matches configured rule", () => {
    const err = normalizeError(
      { result: { status: "NOT_FOUND" }, message: "Aadhaar not found" },
      [{ match: { "result.status": "NOT_FOUND" }, code: "INVALID_DOCUMENT", message: "Document not found." }],
    );
    assert.equal(err.code, "INVALID_DOCUMENT");
    assert.equal(err.message, "Document not found.");
  });

  test("matches regex rule", () => {
    const err = normalizeError(
      { error: "rate limited" },
      [{ match: { error: "/rate/" }, code: "RATE_LIMITED", message: "Slow down." }],
    );
    assert.equal(err.code, "RATE_LIMITED");
  });

  test("infers from common shapes", () => {
    const err = normalizeError({ error_code: "E42", message: "boom" });
    assert.equal(err.code, "E42");
    assert.equal(err.message, "boom");
  });

  test("falls back to generic", () => {
    const err = normalizeError({ weird: true });
    assert.equal(err.code, "PROVIDER_ERROR");
  });
});

describe("buildNormalizedResponse", () => {
  test("success shape with data", () => {
    const r = buildNormalizedResponse({
      success: true,
      api: "aadhaar-verify",
      requestId: "req_1",
      mappedFields: { verification_status: "VERIFIED" },
    });
    assert.equal(r.success, true);
    assert.equal(r.request_id, "req_1");
    assert.deepEqual(r.data, { verification_status: "VERIFIED" });
  });

  test("error shape", () => {
    const r = buildNormalizedResponse({
      success: false,
      api: "aadhaar-verify",
      requestId: "req_1",
      mappedFields: {},
      error: { code: "INVALID_DOCUMENT", message: "Document not found." },
    });
    assert.equal(r.success, false);
    assert.deepEqual(r.error, { code: "INVALID_DOCUMENT", message: "Document not found." });
  });

  test("schema substitution", () => {
    const r = buildNormalizedResponse({
      success: true,
      api: "aadhaar-verify",
      requestId: "req_1",
      mappedFields: { verification_status: "VERIFIED" },
      schema: { verification_status: "{{verification_status}}", summary: "Done" },
    });
    assert.equal(r.verification_status, "VERIFIED");
    assert.equal(r.summary, "Done");
  });
});