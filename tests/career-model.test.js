import assert from "node:assert/strict";
import test from "node:test";
import { provenanceItem } from "./provenance-fixture.js";
import {
  createCareerProfile,
  createEmploymentRecord,
  validateCareerProfile,
  validateEmploymentRecord
} from "../src/js/career-model.js";

const timestamp = "2025-04-20T14:30:00.000Z";

function profileInput(overrides = {}) {
  return {
    fullName: "Career profile name",
    headline: "",
    summary: "",
    skills: [],
    ...overrides
  };
}

function employmentInput(overrides = {}) {
  return {
    employer: "Employer",
    roleTitle: "Role",
    startDate: "2020-01-01",
    endDate: null,
    isCurrent: true,
    responsibilities: [],
    ...overrides
  };
}

function profileRecord(overrides = {}) {
  return {
    id: "profile-id",
    ...profileInput(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function employmentRecord(overrides = {}) {
  return {
    id: "employment-id",
    ...employmentInput(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field));
}

test("Profile and Employment provenance contents must be JSON-compatible", () => {
  const metadata = { id: "id", createdAt: timestamp };
  const cycle = {}; cycle.self = cycle;
  for (const provenance of [[undefined], [NaN], [-0], [9007199254740992], [cycle], [new Date()], [() => {}]]) {
    assertInvalidField(validateCareerProfile(profileRecord({ provenance })), "provenance");
    assertInvalidField(validateEmploymentRecord(employmentRecord({ provenance })), "provenance");
    assert.throws(() => createCareerProfile(profileInput({ provenance }), metadata), TypeError);
    assert.throws(() => createEmploymentRecord(employmentInput({ provenance }), metadata), TypeError);
  }
  const provenance = [provenanceItem([null, 1, 1.5, true])];
  assert.equal(validateCareerProfile(createCareerProfile(profileInput({ provenance }), metadata)).valid, true);
  assert.equal(validateEmploymentRecord(createEmploymentRecord(employmentInput({ provenance }), metadata)).valid, true);
});

test("validates a complete Career Profile", () => {
  assert.deepEqual(validateCareerProfile(profileRecord()), {
    valid: true,
    errors: []
  });
});

test("validates a complete Employment History record", () => {
  assert.deepEqual(validateEmploymentRecord(employmentRecord()), {
    valid: true,
    errors: []
  });
});

test("accepts empty optional text fields and arrays", () => {
  assert.equal(
    validateCareerProfile(profileRecord({ headline: "", summary: "", skills: [] })).valid,
    true
  );
  assert.equal(
    validateEmploymentRecord(employmentRecord({ responsibilities: [] })).valid,
    true
  );
});

test("reports missing profile fields", () => {
  const record = profileRecord();
  delete record.fullName;
  delete record.skills;

  const result = validateCareerProfile(record);

  assertInvalidField(result, "fullName");
  assertInvalidField(result, "skills");
});

test("rejects blank required profile strings and incorrect profile types", () => {
  const result = validateCareerProfile(profileRecord({
    id: " ",
    fullName: " \t",
    headline: null,
    skills: "skill"
  }));

  assertInvalidField(result, "id");
  assertInvalidField(result, "fullName");
  assertInvalidField(result, "headline");
  assertInvalidField(result, "skills");
});

test("rejects non-string items in profile skills", () => {
  assertInvalidField(
    validateCareerProfile(profileRecord({ skills: ["skill", 4] })),
    "skills[1]"
  );
});

test("accepts and validates provenance containers on profiles", () => {
  assert.equal(validateCareerProfile(profileRecord({ provenance: [] })).valid, true);
  assertInvalidField(
    validateCareerProfile(profileRecord({ provenance: {} })),
    "provenance"
  );
  assert.deepEqual(
    createCareerProfile(profileInput(), { id: "profile-id", createdAt: timestamp }).provenance,
    []
  );
});

test("Profile and Employment constructors and validators agree on provenance", () => {
  for (const provenance of [undefined, null, [], [provenanceItem()]]) {
    const fields = provenance === undefined ? {} : { provenance };
    const profile = createCareerProfile(profileInput(fields), { id: "p", createdAt: timestamp });
    const employment = createEmploymentRecord(employmentInput(fields), { id: "e", createdAt: timestamp });
    const expected = provenance === undefined ? [] : provenance;
    assert.deepEqual(profile.provenance, expected);
    assert.deepEqual(employment.provenance, expected);
    assert.equal(validateCareerProfile(profile).valid, true);
    assert.equal(validateEmploymentRecord(employment).valid, true);
    assert.equal(validateCareerProfile(profileRecord(fields)).valid, true);
    assert.equal(validateEmploymentRecord(employmentRecord(fields)).valid, true);
  }
});

test("rejects invalid profile timestamps", () => {
  const result = validateCareerProfile(profileRecord({
    createdAt: "2025-02-30T14:30:00.000Z",
    updatedAt: "2025-04-20T14:30:00+00:00"
  }));

  assertInvalidField(result, "createdAt");
  assertInvalidField(result, "updatedAt");
});

test("accepts only valid Date.toISOString UTC timestamps", () => {
  const invalidTimestamps = [
    "2025-04-20T14:30:00Z",
    "2025-04-20T14:30:00.00Z",
    "2025-04-20T14:30:00.0000Z",
    "2025-04-20T24:00:00.000Z",
    "2025-04-20T14:60:00.000Z",
    "2025-04-20T14:30:60.000Z"
  ];

  for (const value of invalidTimestamps) {
    assertInvalidField(
      validateCareerProfile(profileRecord({ updatedAt: value })),
      "updatedAt"
    );
  }
});

test("rejects invalid timestamps in Employment History records", () => {
  const result = validateEmploymentRecord(employmentRecord({
    createdAt: "2025-04-20T14:30:00Z",
    updatedAt: "2025-04-20T24:00:00.000Z"
  }));

  assertInvalidField(result, "createdAt");
  assertInvalidField(result, "updatedAt");
});

test("rejects updatedAt earlier than createdAt", () => {
  assertInvalidField(
    validateCareerProfile(profileRecord({
      createdAt: "2025-04-20T14:30:01.000Z",
      updatedAt: "2025-04-20T14:30:00.999Z"
    })),
    "updatedAt"
  );
  assertInvalidField(
    validateEmploymentRecord(employmentRecord({
      createdAt: "2025-04-20T14:30:01.000Z",
      updatedAt: "2025-04-20T14:30:00.999Z"
    })),
    "updatedAt"
  );
});

test("reports missing employment fields and rejects wrong types", () => {
  const record = employmentRecord();
  delete record.employer;
  delete record.responsibilities;
  record.isCurrent = "true";

  const result = validateEmploymentRecord(record);

  assertInvalidField(result, "employer");
  assertInvalidField(result, "responsibilities");
  assertInvalidField(result, "isCurrent");
});

test("rejects blank required employment strings and non-string responsibilities", () => {
  const result = validateEmploymentRecord(employmentRecord({
    employer: " ",
    roleTitle: "",
    responsibilities: ["responsibility", null]
  }));

  assertInvalidField(result, "employer");
  assertInvalidField(result, "roleTitle");
  assertInvalidField(result, "responsibilities[1]");
});

test("accepts current employment with a null end date", () => {
  assert.equal(validateEmploymentRecord(employmentRecord({
    isCurrent: true,
    endDate: null
  })).valid, true);
});

test("accepts past employment with an unknown end date", () => {
  assert.equal(validateEmploymentRecord(employmentRecord({
    isCurrent: false,
    endDate: null
  })).valid, true);
});

test("accepts unknown start and end dates represented by null", () => {
  assert.equal(validateEmploymentRecord(employmentRecord({
    startDate: null,
    endDate: null,
    isCurrent: false
  })).valid, true);
});

test("accepts past employment with a known end date", () => {
  assert.equal(validateEmploymentRecord(employmentRecord({
    isCurrent: false,
    endDate: "2024-12-31"
  })).valid, true);
});

test("rejects current employment with a non-null end date", () => {
  assertInvalidField(
    validateEmploymentRecord(employmentRecord({
      isCurrent: true,
      endDate: "2024-12-31"
    })),
    "endDate"
  );
  assertInvalidField(
    validateEmploymentRecord(employmentRecord({
      isCurrent: true,
      endDate: { value: "2024", precision: "year" }
    })),
    "endDate"
  );
});

test("rejects a malformed non-null end date for a current role", () => {
  const result = validateEmploymentRecord(employmentRecord({
    isCurrent: true,
    endDate: "not-a-date"
  }));

  assertInvalidField(result, "endDate");
});

test("rejects impossible and malformed calendar dates", () => {
  const result = validateEmploymentRecord(employmentRecord({
    startDate: "2025-02-30",
    endDate: "2024/12/31",
    isCurrent: false
  }));

  assertInvalidField(result, "startDate");
  assertInvalidField(result, "endDate");
});

test("accepts valid leap-day calendar dates", () => {
  assert.equal(validateEmploymentRecord(employmentRecord({
    startDate: "2024-02-29",
    endDate: "2024-02-29",
    isCurrent: false
  })).valid, true);
});

test("rejects an end date before the start date", () => {
  assertInvalidField(
    validateEmploymentRecord(employmentRecord({
      startDate: "2024-03-01",
      endDate: "2024-02-29",
      isCurrent: false
    })),
    "endDate"
  );
});

test("accepts structured Employment dates at year, month, and day precision", () => {
  for (const [value, precision] of [
    ["2021", "year"],
    ["2021-05", "month"],
    ["2021-05-17", "day"]
  ]) {
    assert.equal(validateEmploymentRecord(employmentRecord({
      startDate: { value, precision },
      endDate: null
    })).valid, true);
  }
});

test("rejects malformed, mismatched, and year-zero structured Employment dates", () => {
  for (const startDate of [
    { value: "0000", precision: "year" },
    { value: "2021-13", precision: "month" },
    { value: "2021-02-29", precision: "day" },
    { value: "2021-05", precision: "day" },
    { value: "2021", precision: "month" },
    { value: "2021", precision: "decade" },
    { value: "2021", precision: "year", extra: true },
    "0000-01-01"
  ]) {
    assertInvalidField(
      validateEmploymentRecord(employmentRecord({ startDate })),
      "startDate"
    );
  }
});

test("structured-date chronology rejects only a definite reversal", () => {
  assertInvalidField(
    validateEmploymentRecord(employmentRecord({
      startDate: { value: "2021-06", precision: "month" },
      endDate: { value: "2021-05-31", precision: "day" },
      isCurrent: false
    })),
    "endDate"
  );
  assert.equal(validateEmploymentRecord(employmentRecord({
    startDate: { value: "2021", precision: "year" },
    endDate: { value: "2021-05", precision: "month" },
    isCurrent: false
  })).valid, true);
});

test("Employment construction normalizes legacy day strings and preserves structured dates", () => {
  const record = createEmploymentRecord(employmentInput({
    startDate: "2020-01-01",
    endDate: { value: "2024-12", precision: "month" },
    isCurrent: false
  }), {
    id: "employment-id",
    createdAt: timestamp
  });

  assert.deepEqual(record.startDate, { value: "2020-01-01", precision: "day" });
  assert.deepEqual(record.endDate, { value: "2024-12", precision: "month" });
  assert.equal(validateEmploymentRecord(record).valid, true);
});

test("constructs a profile with the supplied ID and matching creation timestamps", () => {
  const record = createCareerProfile(profileInput(), {
    id: "supplied-profile-id",
    createdAt: timestamp
  });

  assert.equal(record.id, "supplied-profile-id");
  assert.equal(record.createdAt, timestamp);
  assert.equal(record.updatedAt, timestamp);
  assert.equal(validateCareerProfile(record).valid, true);
});

test("constructs an employment record with the supplied ID and matching creation timestamps", () => {
  const record = createEmploymentRecord(employmentInput(), {
    id: "supplied-employment-id",
    createdAt: timestamp
  });

  assert.equal(record.id, "supplied-employment-id");
  assert.equal(record.createdAt, timestamp);
  assert.equal(record.updatedAt, timestamp);
  assert.equal(validateEmploymentRecord(record).valid, true);
});

test("rejects missing or invalid construction metadata with field errors", () => {
  for (const metadata of [
    {},
    { id: " ", createdAt: timestamp },
    { id: "id", createdAt: "not-a-timestamp" }
  ]) {
    assert.throws(
      () => createCareerProfile(profileInput(), metadata),
      (error) => error instanceof TypeError && Array.isArray(error.errors)
    );
  }
});

test("reports malformed non-object inputs and records", () => {
  assert.equal(validateCareerProfile(null).errors[0].field, "record");
  assert.equal(validateEmploymentRecord([]).errors[0].field, "record");

  assert.throws(
    () => createCareerProfile(null, { id: "id", createdAt: timestamp }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "input")
  );
});

test("construction errors identify missing fields and reject unexpected fields", () => {
  assert.throws(
    () => createCareerProfile({ headline: "", summary: "", skills: [] }, {
      id: "id",
      createdAt: timestamp
    }),
    (error) => error.errors.some((item) => item.field === "fullName")
  );
  assert.throws(
    () => createEmploymentRecord(employmentInput({ jobTitle: "Role" }), {
      id: "id",
      createdAt: timestamp
    }),
    (error) => error.errors.some((item) => item.field === "jobTitle")
  );
});

test("validation does not mutate profile or employment inputs", () => {
  const profile = profileRecord({ skills: ["skill"] });
  const employment = employmentRecord({ responsibilities: ["task"] });
  const originalProfile = structuredClone(profile);
  const originalEmployment = structuredClone(employment);

  validateCareerProfile(profile);
  validateEmploymentRecord(employment);

  assert.deepEqual(profile, originalProfile);
  assert.deepEqual(employment, originalEmployment);
});
