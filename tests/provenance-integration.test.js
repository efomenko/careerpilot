import assert from "node:assert/strict";
import test from "node:test";
import { createCareerProfile, createEmploymentRecord, validateCareerProfile, validateEmploymentRecord } from "../src/js/career-model.js";
import { createAchievementRecord, validateAchievementRecord } from "../src/js/achievement-model.js";
import { createEducationRecord, validateEducationRecord } from "../src/js/education-model.js";
import { createCertificationRecord, validateCertificationRecord } from "../src/js/certification-model.js";
import { provenanceItem } from "./provenance-fixture.js";

const metadata = { id: "record-id", createdAt: "2025-04-20T14:30:00.000Z" };
const models = [
  ["Profile", createCareerProfile, validateCareerProfile,
    { fullName: "Name", headline: "", summary: "", skills: [] }],
  ["Employment", createEmploymentRecord, validateEmploymentRecord,
    { employer: "Employer", roleTitle: "Role", startDate: null, endDate: null, isCurrent: false, responsibilities: [] }],
  ["Achievement", createAchievementRecord, validateAchievementRecord, { title: "Title", contribution: "Contribution" }],
  ["Education", createEducationRecord, validateEducationRecord,
    { institution: "School", qualification: "Degree", startDate: null, endDate: null }],
  ["Certification", createCertificationRecord, validateCertificationRecord,
    { name: "Certificate", issuer: "Issuer", issuedDate: null, expirationDate: null }]
];

for (const [name, create, validate, input] of models) {
  test(`${name}: provenance records are validated individually by constructor and validator`, () => {
    const valid = [provenanceItem({ nested: ["source"] }), { ...provenanceItem(), id: "second" }];
    const record = create({ ...input, provenance: valid }, metadata);
    assert.equal(validate(record).valid, true);
    assert.notEqual(record.provenance[0], valid[0]);
    assert.notEqual(record.provenance[0].extractedValue, valid[0].extractedValue);
    valid[0].extractedValue.nested[0] = "changed";
    assert.equal(record.provenance[0].extractedValue.nested[0], "source");
    const before = structuredClone(record);
    validate(record);
    assert.deepEqual(record, before);
    const invalid = [valid[0], { ...valid[1], fieldPath: "items[1].name", language: "fr",
      extractedValue: NaN, record: true }, null];
    const result = validate({ ...record, provenance: invalid });
    for (const field of ["provenance[1].fieldPath", "provenance[1].language",
      "provenance[1].extractedValue", "provenance[1].record", "provenance[2]"]) {
      assert.ok(result.errors.some((error) => error.field === field), `${name}: ${field}`);
    }
    assert.throws(() => create({ ...input, provenance: invalid }, metadata),
      (error) => error instanceof TypeError && error.errors.some((item) => item.field === "provenance[1].fieldPath"));
    for (const provenance of [null, []]) {
      assert.equal(validate(create({ ...input, provenance }, metadata)).valid, true);
    }
    const omitted = { ...record };
    delete omitted.provenance;
    assert.equal(validate(omitted).valid, true);
    assert.deepEqual(create(input, metadata).provenance, []);
  });

  test(`${name}: malformed provenance containers and accessors do not escape validation`, () => {
    const item = provenanceItem();
    Object.defineProperty(item, "fieldPath", { enumerable: true, get() { throw new Error("must not execute"); } });
    const sparse = new Array(1);
    const record = create(input, metadata);
    for (const provenance of [[item], sparse, {}]) {
      const result = validate({ ...record, provenance });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.field === "provenance"));
      assert.throws(() => create({ ...input, provenance }, metadata), TypeError);
    }
  });

  test(`${name}: proxy reflection failures in provenance are field errors`, () => {
    const record = create(input, metadata);
    for (const trap of ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor", "get"]) {
      const handler = { [trap]() { throw new Error(`${trap} failed`); } };
      for (const [provenance, expected] of [
        [new Proxy([provenanceItem()], handler), "provenance"],
        [[new Proxy(provenanceItem(), handler)], "provenance[0]"]
      ]) {
        const result = validate({ ...record, provenance });
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((error) => error.field.startsWith(expected)), `${name}: ${trap} ${expected}`);
        assert.throws(() => create({ ...input, provenance }, metadata),
          (error) => error instanceof TypeError
            && error.errors.some((item) => item.field.startsWith(expected)));
      }
    }
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    assert.equal(validate({ ...record, provenance: revoked.proxy }).valid, false);
    assert.throws(() => create({ ...input, provenance: revoked.proxy }, metadata), TypeError);
    const provenance = [provenanceItem({ nested: new Proxy({}, {
      ownKeys() { throw new Error("nested reflection failed"); }
    }) })];
    const result = validate({ ...record, provenance });
    assert.ok(result.errors.some((error) => error.field === "provenance[0].extractedValue"));
    assert.throws(() => create({ ...input, provenance }, metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "provenance[0].extractedValue"));
  });

  test(`${name}: reflection failures during defensive copying are field errors`, () => {
    let inspections = 0;
    const extractedValue = new Proxy({ key: "value" }, {
      ownKeys(target) {
        inspections += 1;
        if (inspections > 2) throw new Error("copy failed");
        return Reflect.ownKeys(target);
      }
    });
    assert.throws(() => create({ ...input, provenance: [provenanceItem(extractedValue)] }, metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field.startsWith("provenance")));
  });
}
