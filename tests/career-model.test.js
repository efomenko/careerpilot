import assert from "node:assert/strict";
import test from "node:test";
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
