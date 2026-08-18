import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  extractVariables,
  resolveVariables,
  validateFields,
  renderTemplate,
  substituteRecursive,
  buildProviderRequest,
} from "@/lib/request-builder";
import type { FieldSchema } from "@/lib/request-builder";

function field(partial: Partial<FieldSchema>): FieldSchema {
  return {
    variable: "x",
    name: "X",
    type: "text",
    required: false,
    sensitive: false,
    mask: false,
    store: false,
    log: false,
    returnToCustomer: true,
    validation: null,
    minLength: null,
    maxLength: null,
    minValue: null,
    maxValue: null,
    defaultValue: null,
    enumOptions: undefined,
    ...partial,
  };
}

describe("extractVariables", () => {
  test("finds placeholders", () => {
    assert.deepEqual(
      extractVariables("{{aadhaar_number}} / {{consent}} and {{nested.value}}"),
      ["aadhaar_number", "consent", "nested.value"],
    );
  });
  test("empty when none", () => {
    assert.deepEqual(extractVariables("no vars"), []);
  });
});

describe("resolveVariables", () => {
  test("flattens top-level keys", () => {
    assert.deepEqual(resolveVariables({ aadhaar_number: "111", consent: true }), {
      aadhaar_number: "111",
      consent: true,
    });
  });
  test("merges extra vars", () => {
    assert.deepEqual(resolveVariables({ a: 1 }, { env: "sandbox" }), { a: 1, env: "sandbox" });
  });
});

describe("validateFields", () => {
  test("requires required fields", () => {
    const { errors } = validateFields(
      [field({ variable: "aadhaar_number", name: "Aadhaar Number", required: true, type: "text" })],
      {},
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Aadhaar Number/);
  });

  test("rejects wrong type", () => {
    const { errors } = validateFields(
      [field({ variable: "age", name: "Age", type: "number" })],
      { age: "abc" },
    );
    assert.equal(errors.length, 1);
  });

  test("enforces length bounds", () => {
    const { errors } = validateFields(
      [field({ variable: "pan", name: "PAN", minLength: 10, maxLength: 10 })],
      { pan: "AB" },
    );
    assert.equal(errors.length, 1);
  });

  test("enforces regex validation", () => {
    const { errors } = validateFields(
      [field({ variable: "pan", name: "PAN", validation: "^[A-Z]{5}[0-9]{4}[A-Z]$" })],
      { pan: "ABCDE12345" },
    );
    assert.equal(errors.length, 1);
  });

  test("applies default when empty", () => {
    const { values } = validateFields(
      [field({ variable: "mode", name: "Mode", defaultValue: "sandbox" })],
      {},
    );
    assert.equal(values.mode, "sandbox");
  });

  test("valid input passes", () => {
    const { errors } = validateFields(
      [
        field({ variable: "pan", name: "PAN", required: true, type: "text", minLength: 10, maxLength: 10 }),
        field({ variable: "consent", name: "Consent", required: true, type: "boolean" }),
      ],
      { pan: "ABCDE1234F", consent: true },
    );
    assert.deepEqual(errors, []);
  });
});

describe("renderTemplate / substituteRecursive", () => {
  test("renders placeholders", () => {
    assert.equal(
      renderTemplate("{{aadhaar_number}}-{{consent}}", { aadhaar_number: "111", consent: true }),
      "111-true",
    );
  });
  test("empty for unknown vars", () => {
    assert.equal(renderTemplate("{{missing}}", {}), "");
  });
  test("deep substitution in objects", () => {
    const out = substituteRecursive(
      { aadhaar: "{{aadhaar_number}}", nested: { list: ["{{x}}", "plain"] } },
      { aadhaar_number: "111", x: "y" },
    );
    assert.deepEqual(out, { aadhaar: "111", nested: { list: ["y", "plain"] } });
  });
});

describe("buildProviderRequest", () => {
  const product = {
    method: "POST",
    baseUrl: "http://localhost:9100/sandbox",
    endpointPath: "/aadhaar-verify",
    requestBodyType: "json",
    requestBodyTemplate: { aadhaar_number: "{{aadhaar_number}}", consent: "{{consent}}" },
    queryParams: [{ name: "env", value: "{{env}}" }],
    pathParams: null,
    headers: [{ name: "X-Trace", value: "{{trace}}" }],
  } as any;

  test("builds URL, headers and JSON body", () => {
    const req = buildProviderRequest(
      product,
      { aadhaar_number: "111122223333", consent: true, env: "test", trace: "t1" },
    );
    assert.equal(req.url.toString(), "http://localhost:9100/sandbox/aadhaar-verify?env=test");
    assert.equal(req.headers["X-Trace"], "t1");
    assert.equal(req.body, JSON.stringify({ aadhaar_number: "111122223333", consent: "true" }));
    assert.equal(req.contentType, "application/json");
  });

  test("raw body renders template", () => {
    const req = buildProviderRequest(
      { ...product, requestBodyType: "raw", requestBodyTemplate: "pan={{pan_number}}" } as any,
      { pan_number: "ABCDE1234F" },
    );
    assert.equal(req.body, "pan=ABCDE1234F");
  });
});