import assert from "node:assert/strict";
import test from "node:test";
import { provenanceItem } from "./provenance-fixture.js";
import { createEducationRecord, validateEducationRecord } from "../src/js/education-model.js";
import { createCertificationRecord, validateCertificationRecord } from "../src/js/certification-model.js";

const createdAt = "2025-04-20T14:30:00.000Z";
const metadata = { id: "supplied-id", createdAt };
const year = (value) => ({ value, precision: "year" });
const month = (value) => ({ value, precision: "month" });
const day = (value) => ({ value, precision: "day" });

const cases = [
  {
    name: "Education",
    create: createEducationRecord,
    validate: validateEducationRecord,
    input: { institution: " School ", qualification: " Degree ", startDate: null, endDate: null },
    required: ["institution", "qualification"],
    optional: ["fieldOfStudy"],
    dates: ["startDate", "endDate"],
    defaults: { fieldOfStudy: "", isCurrent: false, provenance: [] }
  },
  {
    name: "Certification",
    create: createCertificationRecord,
    validate: validateCertificationRecord,
    input: { name: " Certificate ", issuer: " Issuer ", issuedDate: null, expirationDate: null },
    required: ["name", "issuer"],
    optional: ["credentialId", "credentialUrl"],
    dates: ["issuedDate", "expirationDate"],
    defaults: { credentialId: "", credentialUrl: "", provenance: [] }
  }
];

function assertField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field), `${field}: ${JSON.stringify(result)}`);
}

for (const model of cases) {
  const record = (overrides = {}) => ({ ...model.create(model.input, metadata), ...overrides });

  test(`${model.name}: constructor defaults, caller metadata and validator result shape`, () => {
    const result = model.create(model.input, metadata);
    assert.equal(result.id, metadata.id);
    assert.equal(result.createdAt, createdAt);
    assert.equal(result.updatedAt, createdAt);
    for (const [field, value] of Object.entries(model.defaults)) assert.deepEqual(result[field], value);
    for (const field of model.required) assert.equal(result[field], model.input[field]);
    assert.deepEqual(model.validate(result), { valid: true, errors: [], warnings: [] });
    assert.deepEqual(model.validate(null), {
      valid: false,
      errors: [{ field: "record", message: `${model.name} record must be an object.` }],
      warnings: []
    });
  });

  test(`${model.name}: rejects unknown, missing, blank and incorrectly typed fields`, () => {
    for (const field of model.required) {
      for (const value of ["", " \t", null, 2]) {
        assertField(model.validate(record({ [field]: value })), field);
        assert.throws(() => model.create({ ...model.input, [field]: value }, metadata),
          (error) => error instanceof TypeError && error.errors.some((item) => item.field === field));
      }
      const missing = { ...model.input };
      delete missing[field];
      assert.throws(() => model.create(missing, metadata), (error) => error.errors.some((item) => item.field === field));
    }
    for (const field of model.optional) {
      assertField(model.validate(record({ [field]: null })), field);
      const missing = record();
      delete missing[field];
      assertField(model.validate(missing), field);
    }
    assertField(model.validate(record({ extra: 1 })), "extra");
    assert.throws(() => model.create({ ...model.input, extra: 1 }, metadata),
      (error) => error.errors.some((item) => item.field === "extra"));
    const hidden = { ...model.input };
    Object.defineProperty(hidden, "extra", { value: true });
    assert.throws(() => model.create(hidden, metadata),
      (error) => error.errors.some((item) => item.field === "extra"));
    const symbol = Symbol("extra");
    assertField(model.validate(record({ [symbol]: true })), "Symbol(extra)");
    assert.throws(() => model.create({ ...model.input, [symbol]: true }, metadata),
      (error) => error.errors.some((item) => item.field === "Symbol(extra)"));
    assert.throws(() => model.create(null, metadata),
      (error) => error instanceof TypeError && error.errors.some((item) => item.field === "input"));
  });

  test(`${model.name}: validates metadata and timestamp ordering`, () => {
    for (const invalid of ["", " ", null, 7]) assertField(model.validate(record({ id: invalid })), "id");
    for (const timestamp of [
      "2025-02-29T14:30:00.000Z", "2025-04-20T24:00:00.000Z",
      "2025-04-20T14:30:00Z", "2025-04-20T14:30:00.000+00:00", null
    ]) {
      assertField(model.validate(record({ createdAt: timestamp })), "createdAt");
      assertField(model.validate(record({ updatedAt: timestamp })), "updatedAt");
      assert.throws(() => model.create(model.input, { id: "id", createdAt: timestamp }),
        (error) => error.errors.some((item) => item.field === "metadata.createdAt"));
    }
    assertField(model.validate(record({ updatedAt: "2025-04-20T14:29:59.999Z" })), "updatedAt");
    assert.equal(model.validate(record({ updatedAt: "2025-04-20T14:30:00.001Z" })).valid, true);
    assert.throws(() => model.create(model.input, { ...metadata, extra: true }),
      (error) => error.errors.some((item) => item.field === "metadata.extra"));
    assert.throws(() => model.create(model.input, null),
      (error) => error.errors.some((item) => item.field === "metadata"));
    assert.throws(() => model.create(model.input, { id: "", createdAt }),
      (error) => error.errors.some((item) => item.field === "id"));
  });

  test(`${model.name}: structured dates are required, Gregorian and defensively copied`, () => {
    const [start, end] = model.dates;
    for (const value of [year("0001"), year("9999"), month("2024-02"), day("2000-02-29"), null]) {
      assert.equal(model.validate(record({ [start]: value })).valid, true);
    }
    for (const value of [
      "2020-01-01", undefined, {}, year("0000"), year("10000"), month("2020-00"),
      month("2020-13"), day("1900-02-29"), day("2025-04-31"),
      { value: "2025-01", precision: "day" }, { value: "2025", precision: "decade" },
      { value: "2025", precision: "year", extra: true }
    ]) {
      assertField(model.validate(record({ [start]: value })), start);
      assert.throws(() => model.create({ ...model.input, [start]: value }, metadata),
        (error) => error.errors.some((item) => item.field === start));
    }
    for (const field of model.dates) {
      const input = { ...model.input };
      delete input[field];
      assert.throws(() => model.create(input, metadata),
        (error) => error.errors.some((item) => item.field === field));
      const missing = record();
      delete missing[field];
      assertField(model.validate(missing), field);
    }
    const supplied = day("2020-01-01");
    const input = { ...model.input, [start]: supplied, [end]: null };
    const output = model.create(input, metadata);
    assert.notEqual(output[start], supplied);
    supplied.value = "2022-01-01";
    assert.equal(output[start].value, "2020-01-01");
  });

  test(`${model.name}: compares possible intervals and reports warnings separately`, () => {
    const [start, end] = model.dates;
    const validate = (a, b) => model.validate(record({ [start]: a, [end]: b }));
    assertField(validate(year("2021"), year("2020")), end);
    assertField(validate(day("2020-05-02"), day("2020-05-01")), end);
    for (const [a, b] of [[year("2020"), year("2020")], [month("2020-05"), day("2020-05-01")]]) {
      const result = validate(a, b);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
      assert.equal(result.warnings.length, 1);
      assert.equal(result.warnings[0].field, end);
      assert.equal(typeof result.warnings[0].message, "string");
      assert.doesNotThrow(() => model.create({ ...model.input, [start]: a, [end]: b }, metadata));
    }
    for (const [a, b] of [
      [year("2020"), day("2021-01-01")], [day("2020-05-01"), month("2020-05")],
      [day("2020-05-01"), day("2020-05-01")], [null, year("0001")],
      [year("9998"), year("9999")]
    ]) {
      assert.deepEqual(validate(a, b), { valid: true, errors: [], warnings: [] });
    }
    const invalidWithWarning = model.validate(record({ id: "", [start]: year("2020"), [end]: year("2020") }));
    assertField(invalidWithWarning, "id");
    assert.equal(invalidWithWarning.warnings.length, 1);
  });

  test(`${model.name}: provenance follows JSON-compatible existing model rules`, () => {
    const cycle = {}; cycle.self = cycle;
    const sparse = new Array(1);
    const accessor = {}; Object.defineProperty(accessor, "source", { enumerable: true, get: () => "cv" });
    for (const value of [{}, [undefined], [NaN], [Infinity], [-0], [9007199254740992], [cycle], [new Date()], [sparse], [accessor]]) {
      assertField(model.validate(record({ provenance: value })), "provenance");
      assert.throws(() => model.create({ ...model.input, provenance: value }, metadata),
        (error) => error.errors.some((item) => item.field === "provenance"));
    }
    for (const provenance of [null, [], [provenanceItem([null, true, 1.5])]]) {
      const result = model.create({ ...model.input, provenance }, metadata);
      assert.deepEqual(result.provenance, provenance);
      assert.equal(model.validate(result).valid, true);
      if (provenance !== null) assert.notEqual(result.provenance, provenance);
    }
    const absent = record();
    delete absent.provenance;
    assert.equal(model.validate(absent).valid, true);
  });

  test(`${model.name}: validation does not mutate input`, () => {
    const value = record({ provenance: [provenanceItem()], [model.dates[0]]: year("2020") });
    const before = structuredClone(value);
    model.validate(value);
    assert.deepEqual(value, before);
  });
}

test("Education: current records require a null end date and boolean isCurrent", () => {
  const input = cases[0].input;
  assert.equal(validateEducationRecord(createEducationRecord({ ...input, isCurrent: true }, metadata)).valid, true);
  assert.throws(() => createEducationRecord({ ...input, isCurrent: true, endDate: year("2020") }, metadata),
    (error) => error.errors.some((item) => item.field === "endDate"));
  assertField(validateEducationRecord({ ...createEducationRecord(input, metadata), isCurrent: "true" }), "isCurrent");
  assert.throws(() => createEducationRecord({ ...input, isCurrent: null }, metadata),
    (error) => error.errors.some((item) => item.field === "isCurrent"));
});

test("Certification: credential URL must be absolute HTTP(S), without rewriting", () => {
  const input = cases[1].input;
  for (const url of ["", "https://Example.COM/path?x=1#proof", "HTTP://example.com:80/a%20b"]) {
    const record = createCertificationRecord({ ...input, credentialUrl: url }, metadata);
    assert.equal(record.credentialUrl, url);
    assert.equal(validateCertificationRecord(record).valid, true);
  }
  for (const url of ["example.com", "/certificate", "ftp://example.com", "https:example.com",
    "https://", "https://example.com/a b", " https://example.com", "javascript:alert(1)"]) {
    assert.throws(() => createCertificationRecord({ ...input, credentialUrl: url }, metadata),
      (error) => error.errors.some((item) => item.field === "credentialUrl"));
    assertField(validateCertificationRecord({ ...createCertificationRecord(input, metadata), credentialUrl: url }), "credentialUrl");
  }
});
