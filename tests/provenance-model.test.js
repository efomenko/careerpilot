import assert from "node:assert/strict";
import test from "node:test";
import {
  createProvenanceRecord,
  validateProvenanceRecord
} from "../src/js/provenance-model.js";

const timestamp = "2025-04-20T14:30:00.000Z";

function provenanceInput(overrides = {}) {
  return {
    sourceDocumentId: "document-id",
    sourceType: "cv",
    fieldPath: "employment.roleTitle",
    extractedValue: "Engineering Manager",
    excerpt: "Engineering Manager at Example Corp",
    language: "en",
    associationStatus: "supports",
    ...overrides
  };
}

function provenanceRecord(overrides = {}) {
  return {
    id: "provenance-id",
    ...provenanceInput(),
    createdAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field), JSON.stringify(result));
}

test("constructs and validates a complete Provenance record", () => {
  const record = createProvenanceRecord(provenanceInput(), {
    id: "supplied-provenance-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, provenanceRecord({ id: "supplied-provenance-id" }));
  assert.deepEqual(validateProvenanceRecord(record), { valid: true, errors: [] });
  assert.equal(Object.hasOwn(record, "page"), false);
  assert.equal(Object.hasOwn(record, "updatedAt"), false);
});

test("accepts each association status and both supported languages", () => {
  for (const associationStatus of ["supports", "needs_review", "context_only"]) {
    for (const language of ["en", "ru"]) {
      const record = createProvenanceRecord(provenanceInput({ associationStatus, language }), {
        id: "provenance-id",
        createdAt: timestamp
      });
      assert.equal(validateProvenanceRecord(record).valid, true);
    }
  }
});

test("requires all contract fields and rejects blank or incorrectly typed strings", () => {
  for (const field of [
    "sourceDocumentId", "sourceType", "fieldPath", "extractedValue", "excerpt",
    "language", "associationStatus"
  ]) {
    const missing = provenanceRecord();
    delete missing[field];
    assertInvalidField(validateProvenanceRecord(missing), field);
    const input = provenanceInput();
    delete input[field];
    assert.throws(
      () => createProvenanceRecord(input, { id: "id", createdAt: timestamp }),
      (error) => error instanceof TypeError && error.errors.some((item) => item.field === field)
    );
  }

  for (const field of ["sourceDocumentId", "fieldPath", "excerpt", "language"]) {
    for (const value of ["", " \t", null, 4]) {
      assertInvalidField(validateProvenanceRecord(provenanceRecord({ [field]: value })), field);
      assert.throws(
        () => createProvenanceRecord(provenanceInput({ [field]: value }), {
          id: "id", createdAt: timestamp
        }),
        (error) => error instanceof TypeError && error.errors.some((item) => item.field === field)
      );
    }
  }
});

test("restricts source type, language and association status to approved values", () => {
  for (const [field, values] of [
    ["sourceType", ["document", "CV", null]],
    ["language", ["fr", "English", null]],
    ["associationStatus", ["verified", "context-only", null]]
  ]) {
    for (const value of values) {
      assertInvalidField(validateProvenanceRecord(provenanceRecord({ [field]: value })), field);
      assert.throws(
        () => createProvenanceRecord(provenanceInput({ [field]: value }), {
          id: "id", createdAt: timestamp
        }),
        (error) => error instanceof TypeError && error.errors.some((item) => item.field === field)
      );
    }
  }
});

test("enforces the excerpt limit by Unicode code point", () => {
  const atLimit = "x".repeat(499) + "😀";
  const overLimit = `${atLimit}x`;
  assert.equal(validateProvenanceRecord(provenanceRecord({ excerpt: atLimit })).valid, true);
  assertInvalidField(validateProvenanceRecord(provenanceRecord({ excerpt: overLimit })), "excerpt");
  assert.throws(
    () => createProvenanceRecord(provenanceInput({ excerpt: overLimit }), {
      id: "id", createdAt: timestamp
    }),
    (error) => error.errors.some((item) => item.field === "excerpt")
  );
});

test("accepts an optional positive safe page number", () => {
  for (const page of [1, 2, Number.MAX_SAFE_INTEGER]) {
    const record = createProvenanceRecord(provenanceInput({ page }), {
      id: "id", createdAt: timestamp
    });
    assert.equal(record.page, page);
    assert.equal(validateProvenanceRecord(record).valid, true);
  }

  for (const page of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ page })), "page");
    assert.throws(
      () => createProvenanceRecord(provenanceInput({ page }), { id: "id", createdAt: timestamp }),
      (error) => error.errors.some((item) => item.field === "page")
    );
  }
});

test("requires stable field paths without numeric array-index segments", () => {
  for (const fieldPath of [
    "employment.0.roleTitle", "employment[2].roleTitle", "0.roleTitle",
    "employment.0[skill-id].name", "employment[ 2 ].roleTitle",
    'employment["2"].roleTitle', "employment['2'].roleTitle",
    "/employment/2/roleTitle", "employment/2"
  ]) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ fieldPath })), "fieldPath");
    assert.throws(
      () => createProvenanceRecord(provenanceInput({ fieldPath }), { id: "id", createdAt: timestamp }),
      (error) => error.errors.some((item) => item.field === "fieldPath")
    );
  }

  for (const fieldPath of [
    "profile.fullName", "employment.roleTitle", "education.credentialId",
    "skills[item-2].name", "/skills/item-2/name", "field2"
  ]) {
    assert.equal(validateProvenanceRecord(provenanceRecord({ fieldPath })).valid, true);
  }
});

test("supports JSON-compatible extracted values and rejects lossy values", () => {
  const accepted = [null, "text", true, 12, 1.5, ["a", { date: null }], { nested: [1, false] }];
  for (const extractedValue of accepted) {
    const record = createProvenanceRecord(provenanceInput({ extractedValue }), {
      id: "id", createdAt: timestamp
    });
    assert.deepEqual(record.extractedValue, extractedValue);
    assert.equal(validateProvenanceRecord(record).valid, true);
  }

  const cycle = {};
  cycle.self = cycle;
  const sparse = new Array(1);
  const invalidValues = [undefined, NaN, Infinity, -0, 9007199254740992, [undefined], cycle, sparse, new Date(), () => {}];
  for (const extractedValue of invalidValues) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ extractedValue })), "extractedValue");
    assert.throws(
      () => createProvenanceRecord(provenanceInput({ extractedValue }), { id: "id", createdAt: timestamp }),
      (error) => error.errors.some((item) => item.field === "extractedValue")
    );
  }
});

test("construction deeply detaches extracted values and validation does not mutate records", () => {
  const extractedValue = { education: [{ qualification: "Degree" }] };
  const record = createProvenanceRecord(provenanceInput({ extractedValue }), {
    id: "id", createdAt: timestamp
  });
  assert.notEqual(record.extractedValue, extractedValue);
  assert.notEqual(record.extractedValue.education, extractedValue.education);
  assert.notEqual(record.extractedValue.education[0], extractedValue.education[0]);
  extractedValue.education[0].qualification = "Changed";
  assert.equal(record.extractedValue.education[0].qualification, "Degree");

  const before = structuredClone(record);
  validateProvenanceRecord(record);
  assert.deepEqual(record, before);
});

test("copies JSON object keys named __proto__ without changing prototypes or losing data", () => {
  const extractedValue = JSON.parse('{"__proto__":{"items":[{"value":1}]},"nested":{"__proto__":"text"}}');
  const record = createProvenanceRecord(provenanceInput({ extractedValue }), {
    id: "id", createdAt: timestamp
  });
  assert.equal(Object.getPrototypeOf(record.extractedValue), Object.prototype);
  assert.ok(Object.hasOwn(record.extractedValue, "__proto__"));
  assert.ok(Object.hasOwn(record.extractedValue.nested, "__proto__"));
  assert.equal(JSON.stringify(record.extractedValue), JSON.stringify(extractedValue));
  assert.equal(validateProvenanceRecord(record).valid, true);
  extractedValue.__proto__.items[0].value = 2;
  assert.equal(record.extractedValue.__proto__.items[0].value, 1);
});

test("copies null-prototype extracted objects and rejects non-JSON object properties", () => {
  const extractedValue = Object.assign(Object.create(null), { nested: { value: "original" } });
  const record = createProvenanceRecord(provenanceInput({ extractedValue }), {
    id: "id", createdAt: timestamp
  });
  assert.equal(Object.getPrototypeOf(record.extractedValue), null);
  assert.notEqual(record.extractedValue.nested, extractedValue.nested);
  extractedValue.nested.value = "changed";
  assert.equal(record.extractedValue.nested.value, "original");

  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  const hidden = {};
  Object.defineProperty(hidden, "value", { value: 1 });
  for (const value of [accessor, hidden, { [Symbol("value")]: 1 }]) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ extractedValue: value })), "extractedValue");
    assert.throws(() => createProvenanceRecord(provenanceInput({ extractedValue: value }), {
      id: "id", createdAt: timestamp
    }), (error) => error.errors.some((item) => item.field === "extractedValue"));
  }
});

test("validates metadata, timestamps and unknown properties", () => {
  for (const id of ["", " \t", null, 4]) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ id })), "id");
  }
  for (const createdAt of ["2025-02-30T14:30:00.000Z", "2025-04-20T14:30:00Z", null]) {
    assertInvalidField(validateProvenanceRecord(provenanceRecord({ createdAt })), "createdAt");
    assert.throws(
      () => createProvenanceRecord(provenanceInput(), { id: "id", createdAt }),
      (error) => error.errors.some((item) => item.field === "metadata.createdAt")
    );
  }

  assertInvalidField(validateProvenanceRecord(provenanceRecord({ extra: true })), "extra");
  assert.throws(
    () => createProvenanceRecord(provenanceInput({ extra: true }), { id: "id", createdAt: timestamp }),
    (error) => error.errors.some((item) => item.field === "extra")
  );
  const input = provenanceInput();
  Object.defineProperty(input, "hidden", { value: true });
  assert.throws(() => createProvenanceRecord(input, { id: "id", createdAt: timestamp }),
    (error) => error.errors.some((item) => item.field === "hidden"));
  assertInvalidField(validateProvenanceRecord(provenanceRecord({ [Symbol("extra")]: true })), "Symbol(extra)");
  assert.throws(() => createProvenanceRecord(provenanceInput(), { id: "id", createdAt: timestamp, extra: true }),
    (error) => error.errors.some((item) => item.field === "metadata.extra"));
  assert.throws(() => createProvenanceRecord(provenanceInput(), { id: "", createdAt: timestamp }),
    (error) => error.errors.some((item) => item.field === "metadata.id"));
  assert.throws(() => createProvenanceRecord(null, { id: "id", createdAt: timestamp }), TypeError);
  assert.throws(() => createProvenanceRecord(provenanceInput(), null), TypeError);
  assert.deepEqual(validateProvenanceRecord(null), {
    valid: false,
    errors: [{ field: "record", message: "Provenance record must be an object." }]
  });

  test("provenance record and input proxy reflection failures are reported", () => {
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor", "get"]) {
      const handler = { [trap]() { throw new Error(`${trap} failed`); } };
      const result = validateProvenanceRecord(new Proxy(provenanceRecord(), handler));
      assertInvalidField(result, "record");
      assert.throws(() => createProvenanceRecord(new Proxy(provenanceInput(), handler), {
        id: "id", createdAt: timestamp
      }), (error) => error instanceof TypeError && error.errors.some((item) => item.field === "input"));
    }
    const revoked = Proxy.revocable(provenanceRecord(), {});
    revoked.revoke();
    assertInvalidField(validateProvenanceRecord(revoked.proxy), "record");
    assert.throws(() => createProvenanceRecord(revoked.proxy, { id: "id", createdAt: timestamp }),
      (error) => error instanceof TypeError && error.errors.some((item) => item.field === "input"));
  });

  test("nested extractedValue proxy reflection failures are field errors", () => {
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"]) {
      const extractedValue = { nested: new Proxy({ key: "value" }, {
        [trap]() { throw new Error(`${trap} failed`); }
      }) };
      assertInvalidField(validateProvenanceRecord(provenanceRecord({ extractedValue })), "extractedValue");
      assert.throws(() => createProvenanceRecord(provenanceInput({ extractedValue }), {
        id: "id", createdAt: timestamp
      }), (error) => error instanceof TypeError && error.errors.some((item) => item.field === "extractedValue"));
    }
  });

  test("construction reports extractedValue reflection failures that begin during copying", () => {
    let inspections = 0;
    const extractedValue = new Proxy({ key: "value" }, {
      ownKeys(target) {
        inspections += 1;
        if (inspections > 1) throw new Error("copy failed");
        return Reflect.ownKeys(target);
      }
    });
    assert.throws(() => createProvenanceRecord(provenanceInput({ extractedValue }), {
      id: "id", createdAt: timestamp
    }), (error) => error instanceof TypeError && error.errors.some((item) => item.field === "extractedValue"));
  });
});
