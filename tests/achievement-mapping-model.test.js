import assert from "node:assert/strict";
import test from "node:test";
import {
  createAchievementMappingRecord,
  validateAchievementMappingRecord
} from "../src/js/achievement-mapping-model.js";

const timestamp = "2026-11-05T13:00:00.000Z";

function mappingInput(overrides = {}) {
  return {
    requirementId: "requirement-id",
    achievementId: "achievement-id",
    ...overrides
  };
}

function mappingRecord(overrides = {}) {
  return {
    id: "mapping-id",
    requirementId: "requirement-id",
    achievementId: "achievement-id",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field));
}

test("creates and validates a complete Achievement Mapping", () => {
  const record = createAchievementMappingRecord(mappingInput(), {
    id: "supplied-mapping-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, mappingRecord({ id: "supplied-mapping-id" }));
  assert.equal(record.updatedAt, timestamp);
  assert.deepEqual(validateAchievementMappingRecord(record), {
    valid: true,
    errors: []
  });
});

test("rejects missing input and metadata fields", () => {
  for (const field of ["requirementId", "achievementId"]) {
    const input = mappingInput();
    delete input[field];
    assert.throws(
      () => createAchievementMappingRecord(input, {
        id: "mapping-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }

  for (const [metadata, field] of [
    [{ createdAt: timestamp }, "metadata.id"],
    [{ id: "mapping-id" }, "metadata.createdAt"]
  ]) {
    assert.throws(
      () => createAchievementMappingRecord(mappingInput(), metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }

  for (const field of ["id", "requirementId", "achievementId", "createdAt", "updatedAt"]) {
    const record = mappingRecord();
    delete record[field];
    assertInvalidField(validateAchievementMappingRecord(record), field);
  }
});

test("rejects empty and whitespace-only mapping identifiers", () => {
  for (const field of ["id", "requirementId", "achievementId"]) {
    for (const value of ["", " \t "]) {
      assertInvalidField(
        validateAchievementMappingRecord(mappingRecord({ [field]: value })),
        field
      );
    }
  }

  assert.throws(
    () => createAchievementMappingRecord(mappingInput(), {
      id: " \n ",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.id")
  );
});

test("rejects non-string identifiers and invalid creation timestamps", () => {
  for (const field of ["id", "requirementId", "achievementId"]) {
    assertInvalidField(
      validateAchievementMappingRecord(mappingRecord({ [field]: 42 })),
      field
    );
  }

  assert.throws(
    () => createAchievementMappingRecord(mappingInput(), {
      id: "mapping-id",
      createdAt: "not-a-timestamp"
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.createdAt")
  );
});

test("rejects invalid timestamp formats and calendar values", () => {
  for (const value of [
    "2026-11-05T13:00:00Z",
    "2026-11-05T13:00:00.00Z",
    "2026-11-05T13:00:00.000+00:00",
    "2026-02-29T13:00:00.000Z",
    "2026-11-05T24:00:00.000Z"
  ]) {
    assertInvalidField(
      validateAchievementMappingRecord(mappingRecord({ updatedAt: value })),
      "updatedAt"
    );
  }
});

test("rejects an invalid createdAt timestamp", () => {
  assertInvalidField(
    validateAchievementMappingRecord(mappingRecord({
      createdAt: "2026-11-05T13:00:00Z"
    })),
    "createdAt"
  );
});

test("rejects updatedAt earlier than createdAt", () => {
  assertInvalidField(
    validateAchievementMappingRecord(mappingRecord({
      createdAt: "2026-11-06T13:00:00.000Z",
      updatedAt: timestamp
    })),
    "updatedAt"
  );
});

test("rejects unknown fields during creation and validation", () => {
  assert.throws(
    () => createAchievementMappingRecord(
      mappingInput({ extra: true }),
      { id: "mapping-id", createdAt: timestamp }
    ),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "extra")
  );

  assert.throws(
    () => createAchievementMappingRecord(mappingInput(), {
      id: "mapping-id",
      createdAt: timestamp,
      extra: true
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.extra")
  );

  assertInvalidField(
    validateAchievementMappingRecord(mappingRecord({ extra: true })),
    "extra"
  );
});

test("rejects non-object creation inputs and non-plain mapping values", () => {
  for (const value of [null, [], "input", 1]) {
    assert.throws(
      () => createAchievementMappingRecord(value, {
        id: "mapping-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "input")
    );
  }

  for (const value of [null, [], "record", 1, new Date()]) {
    assert.equal(validateAchievementMappingRecord(value).valid, false);
  }
});

test("construction does not retain references and validation does not mutate", () => {
  const input = mappingInput();
  const metadata = { id: "mapping-id", createdAt: timestamp };
  const originalInput = structuredClone(input);
  const originalMetadata = structuredClone(metadata);
  const record = createAchievementMappingRecord(input, metadata);

  assert.deepEqual(input, originalInput);
  assert.deepEqual(metadata, originalMetadata);
  assert.deepEqual(Object.keys(record), [
    "id",
    "requirementId",
    "achievementId",
    "createdAt",
    "updatedAt"
  ]);
  input.requirementId = "changed";
  metadata.id = "changed";
  assert.deepEqual(record, mappingRecord());

  const candidate = mappingRecord();
  const originalCandidate = structuredClone(candidate);
  validateAchievementMappingRecord(candidate);
  assert.deepEqual(candidate, originalCandidate);
});
