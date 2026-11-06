import assert from "node:assert/strict";
import test from "node:test";
import {
  createRequirementRecord,
  validateRequirementRecord
} from "../src/js/requirement-model.js";

const timestamp = "2026-11-05T13:00:00.000Z";

function requirementInput(overrides = {}) {
  return {
    jobId: "job-id",
    description: "At least five years of experience building web applications",
    importance: "mandatory",
    ...overrides
  };
}

function requirementRecord(overrides = {}) {
  return {
    id: "requirement-id",
    jobId: "job-id",
    description: "At least five years of experience building web applications",
    category: "experience",
    importance: "mandatory",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field));
}

test("constructs and validates a complete Requirement", () => {
  const record = createRequirementRecord(requirementInput({
    category: "experience",
    importance: "preferred"
  }), {
    id: "supplied-requirement-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, requirementRecord({
    id: "supplied-requirement-id",
    importance: "preferred"
  }));
  assert.deepEqual(validateRequirementRecord(record), { valid: true, errors: [] });
});

test("defaults an omitted category to other", () => {
  const record = createRequirementRecord(requirementInput(), {
    id: "requirement-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, requirementRecord({ category: "other" }));
  assert.deepEqual(validateRequirementRecord(record), { valid: true, errors: [] });
});

test("requires category on complete records", () => {
  const record = requirementRecord();
  delete record.category;
  assertInvalidField(validateRequirementRecord(record), "category");
});

test("accepts every supported category and importance", () => {
  for (const category of [
    "skill",
    "experience",
    "education",
    "certification",
    "responsibility",
    "other"
  ]) {
    assert.deepEqual(
      validateRequirementRecord(requirementRecord({ category })).errors,
      []
    );
  }

  for (const importance of ["mandatory", "preferred"]) {
    assert.deepEqual(
      validateRequirementRecord(requirementRecord({ importance })).errors,
      []
    );
  }
});

test("requires non-blank IDs and Job ID", () => {
  for (const [field, value] of [
    ["id", ""],
    ["id", " \t "],
    ["jobId", ""],
    ["jobId", " \n "]
  ]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ [field]: value })),
      field
    );

    const metadata = { id: "requirement-id", createdAt: timestamp };
    const input = requirementInput();
    if (field === "id") {
      metadata.id = value;
    } else {
      input.jobId = value;
    }
    assert.throws(
      () => createRequirementRecord(input, metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }

  for (const field of ["id", "jobId"]) {
    const record = requirementRecord();
    delete record[field];
    assertInvalidField(validateRequirementRecord(record), field);

    const input = requirementInput();
    const metadata = { id: "requirement-id", createdAt: timestamp };
    if (field === "id") {
      delete metadata.id;
    } else {
      delete input.jobId;
    }
    assert.throws(
      () => createRequirementRecord(input, metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }
});

test("requires a non-blank string description and preserves its content", () => {
  const description = "  Build reliable web applications  ";
  const record = createRequirementRecord(requirementInput({ description }), {
    id: "requirement-id",
    createdAt: timestamp
  });
  assert.equal(record.description, description);
  assert.equal(validateRequirementRecord(record).valid, true);

  for (const value of ["", " \t\n "]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ description: value })),
      "description"
    );
    assert.throws(
      () => createRequirementRecord(requirementInput({ description: value }), {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "description")
    );
  }

  const missingDescription = requirementRecord();
  delete missingDescription.description;
  assertInvalidField(validateRequirementRecord(missingDescription), "description");
  const inputWithoutDescription = requirementInput();
  delete inputWithoutDescription.description;
  assert.throws(
    () => createRequirementRecord(inputWithoutDescription, {
      id: "requirement-id",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "description")
  );

  for (const value of [null, 1, false, {}]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ description: value })),
      "description"
    );
    assert.throws(
      () => createRequirementRecord(requirementInput({ description: value }), {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "description")
    );
  }
});

test("requires explicitly supplied supported importance", () => {
  const recordWithoutImportance = requirementRecord();
  delete recordWithoutImportance.importance;
  assertInvalidField(
    validateRequirementRecord(recordWithoutImportance),
    "importance"
  );

  const inputWithoutImportance = requirementInput();
  delete inputWithoutImportance.importance;
  assert.throws(
    () => createRequirementRecord(inputWithoutImportance, {
      id: "requirement-id",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "importance")
  );

  for (const importance of ["", "optional", "Mandatory", null, 1, false]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ importance })),
      "importance"
    );
    assert.throws(
      () => createRequirementRecord(requirementInput({ importance }), {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "importance")
    );
  }
});

test("rejects invalid explicitly supplied categories", () => {
  for (const category of ["", "technical", null, 1, false]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ category })),
      "category"
    );
    assert.throws(
      () => createRequirementRecord(requirementInput({ category }), {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "category")
    );
  }
});

test("validates required canonical UTC timestamps and chronological order", () => {
  for (const field of ["createdAt", "updatedAt"]) {
    const missingTimestamp = requirementRecord();
    delete missingTimestamp[field];
    assertInvalidField(
      validateRequirementRecord(missingTimestamp),
      field
    );
  }

  for (const value of [
    "2026-11-05T13:00:00Z",
    "2026-11-05T13:00:00.00Z",
    "2026-11-05T13:00:00.0000Z",
    "2026-02-30T13:00:00.000Z",
    "2026-11-05T24:00:00.000Z",
    "2026-11-05T13:00:00+00:00"
  ]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ updatedAt: value })),
      "updatedAt"
    );
  }

  assertInvalidField(
    validateRequirementRecord(requirementRecord({
      createdAt: "2026-02-30T13:00:00.000Z"
    })),
    "createdAt"
  );

  for (const metadata of [
    { id: "requirement-id" },
    { id: "requirement-id", createdAt: "2026-11-05T13:00:00+00:00" }
  ]) {
    assert.throws(
      () => createRequirementRecord(requirementInput(), metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "metadata.createdAt")
    );
  }

  assertInvalidField(
    validateRequirementRecord(requirementRecord({
      createdAt: "2026-11-05T13:00:01.000Z",
      updatedAt: timestamp
    })),
    "updatedAt"
  );

  const laterTimestamp = "2026-11-05T13:00:01.000Z";
  assert.deepEqual(
    validateRequirementRecord(requirementRecord({ updatedAt: laterTimestamp })),
    { valid: true, errors: [] }
  );
});

test("rejects unknown input, metadata, and record fields", () => {
  assert.throws(
    () => createRequirementRecord(requirementInput({ extra: true }), {
      id: "requirement-id",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "extra")
  );

  for (const field of ["id", "createdAt", "updatedAt"]) {
    assert.throws(
      () => createRequirementRecord(requirementInput({ [field]: "input-value" }), {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }

  assert.throws(
    () => createRequirementRecord(requirementInput(), {
      id: "requirement-id",
      createdAt: timestamp,
      extra: true
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.extra")
  );

  for (const field of [
    "status",
    "weight",
    "evidenceIds",
    "achievementMappings",
    "extra"
  ]) {
    assertInvalidField(
      validateRequirementRecord(requirementRecord({ [field]: [] })),
      field
    );
  }
});

test("rejects invalid input and metadata types", () => {
  for (const input of [null, [], "requirement", 1]) {
    assert.throws(
      () => createRequirementRecord(input, {
        id: "requirement-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "input")
    );
  }

  for (const metadata of [null, [], "metadata", 1]) {
    assert.throws(
      () => createRequirementRecord(requirementInput(), metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "metadata")
    );
  }

  for (const value of [null, [], "record", 1]) {
    assert.equal(validateRequirementRecord(value).valid, false);
  }
});

test("allows duplicate descriptions", () => {
  const first = createRequirementRecord(requirementInput(), {
    id: "requirement-1",
    createdAt: timestamp
  });
  const second = createRequirementRecord(requirementInput(), {
    id: "requirement-2",
    createdAt: timestamp
  });

  assert.equal(first.description, second.description);
  assert.equal(validateRequirementRecord(first).valid, true);
  assert.equal(validateRequirementRecord(second).valid, true);
});

test("does not mutate inputs or retain nested input data", () => {
  const input = requirementInput();
  const metadata = { id: "requirement-id", createdAt: timestamp };
  const originalInput = structuredClone(input);
  const originalMetadata = structuredClone(metadata);
  const record = createRequirementRecord(input, metadata);

  assert.deepEqual(input, originalInput);
  assert.deepEqual(metadata, originalMetadata);
  assert.deepEqual(Object.keys(record), [
    "id",
    "jobId",
    "description",
    "category",
    "importance",
    "createdAt",
    "updatedAt"
  ]);
  assert.equal(validateRequirementRecord(record).valid, true);
  assert.deepEqual(record, requirementRecord({ category: "other" }));

  const inputWithNestedData = requirementInput({ metadata: { mutable: true } });
  assert.throws(
    () => createRequirementRecord(inputWithNestedData, metadata),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata")
  );
});
