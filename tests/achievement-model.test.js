import assert from "node:assert/strict";
import test from "node:test";
import {
  createAchievementRecord,
  validateAchievementRecord
} from "../src/js/achievement-model.js";

const timestamp = "2025-04-20T14:30:00.000Z";

function achievementInput(overrides = {}) {
  return {
    title: "Achievement title",
    contribution: "Contribution",
    ...overrides
  };
}

function achievementRecord(overrides = {}) {
  return {
    id: "achievement-id",
    title: "Achievement title",
    context: "",
    contribution: "Contribution",
    actions: [],
    outcome: "",
    potentialImpact: "",
    metrics: [],
    evidence: [],
    employmentId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field));
}

test("constructs and validates a complete achievement", () => {
  const record = createAchievementRecord(achievementInput({
    context: "Context",
    actions: ["Action"],
    outcome: "Actual result",
    potentialImpact: "Possible benefit",
    metrics: [{
      name: "Revenue",
      value: -2,
      unit: "USD",
      period: "Quarter",
      basis: "estimated"
    }],
    evidence: [{ unconstrained: true }],
    employmentId: "employment-id"
  }), {
    id: "supplied-achievement-id",
    createdAt: timestamp
  });

  assert.equal(record.id, "supplied-achievement-id");
  assert.equal(record.createdAt, timestamp);
  assert.equal(record.updatedAt, timestamp);
  assert.equal(validateAchievementRecord(record).valid, true);
});

test("defaults omitted optional fields and arrays", () => {
  const record = createAchievementRecord(achievementInput(), {
    id: "achievement-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, achievementRecord());
  assert.equal(validateAchievementRecord(record).valid, true);
});

test("validates normalized optional string fields on complete records", () => {
  for (const field of ["context", "outcome", "potentialImpact"]) {
    const record = achievementRecord();
    delete record[field];
    assertInvalidField(validateAchievementRecord(record), field);
  }
});

test("accepts empty optional strings and keeps accepted strings unchanged", () => {
  const input = achievementInput({
    title: "  Title  ",
    contribution: " Contribution ",
    context: "",
    outcome: "",
    potentialImpact: ""
  });
  const record = createAchievementRecord(input, {
    id: "  achievement-id  ",
    createdAt: timestamp
  });

  assert.equal(record.id, "  achievement-id  ");
  assert.equal(record.title, "  Title  ");
  assert.equal(record.contribution, " Contribution ");
  assert.equal(record.context, "");
  assert.equal(record.outcome, "");
  assert.equal(record.potentialImpact, "");
});

test("rejects blank IDs, titles, and contributions", () => {
  for (const [input, metadata, field] of [
    [achievementInput(), { id: " \t", createdAt: timestamp }, "id"],
    [achievementInput({ title: " " }), { id: "id", createdAt: timestamp }, "title"],
    [achievementInput({ contribution: "" }), { id: "id", createdAt: timestamp }, "contribution"]
  ]) {
    assert.throws(
      () => createAchievementRecord(input, metadata),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }

  assertInvalidField(validateAchievementRecord(achievementRecord({ id: "" })), "id");
  assertInvalidField(validateAchievementRecord(achievementRecord({ title: " " })), "title");
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ contribution: "\t" })),
    "contribution"
  );
});

test("validates actions as strings and accepts empty action strings", () => {
  assert.equal(
    validateAchievementRecord(achievementRecord({ actions: ["", "Action"] })).valid,
    true
  );
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ actions: ["Action", 4] })),
    "actions[1]"
  );
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ actions: "Action" })),
    "actions"
  );
});

test("supports multiple metrics and approved values and optional periods", () => {
  const record = achievementRecord({
    metrics: [
      { name: "Increase", value: 1, unit: "%", basis: "measured" },
      { name: "No change", value: 0, unit: "items", period: "", basis: "estimated" },
      { name: "Decrease", value: -1, unit: "USD", period: "Annual", basis: "measured" }
    ]
  });

  assert.deepEqual(validateAchievementRecord(record), { valid: true, errors: [] });
  assert.equal(Object.hasOwn(record.metrics[0], "period"), false);
});

test("rejects invalid metric names, values, units, periods, and bases", () => {
  const invalidMetrics = [
    [{ name: " ", value: 1, unit: "items", basis: "measured" }, "metrics[0].name"],
    [{ name: "Count", value: Infinity, unit: "items", basis: "measured" }, "metrics[0].value"],
    [{ name: "Count", value: NaN, unit: "items", basis: "measured" }, "metrics[0].value"],
    [{ name: "Count", value: 1, unit: "", basis: "measured" }, "metrics[0].unit"],
    [{ name: "Count", value: 1, unit: "items", period: null, basis: "measured" }, "metrics[0].period"],
    [{ name: "Count", value: 1, unit: "items", basis: "unknown" }, "metrics[0].basis"],
    [{ name: "Count", unit: "items", basis: "measured" }, "metrics[0].value"],
    [{ name: "Count", value: 1, basis: "measured" }, "metrics[0].unit"],
    [{ value: 1, unit: "items", basis: "measured" }, "metrics[0].name"]
  ];

  for (const [metric, field] of invalidMetrics) {
    assertInvalidField(
      validateAchievementRecord(achievementRecord({ metrics: [metric] })),
      field
    );
  }

  for (const basis of ["Measured", "verified", null]) {
    assertInvalidField(
      validateAchievementRecord(achievementRecord({
        metrics: [{ name: "Count", value: 1, unit: "items", basis }]
      })),
      "metrics[0].basis"
    );
  }
});

test("rejects non-object metrics and unexpected metric properties", () => {
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ metrics: [null] })),
    "metrics[0]"
  );
  assertInvalidField(
    validateAchievementRecord(achievementRecord({
      metrics: [{ name: "Count", value: 1, unit: "items", basis: "measured", source: "x" }]
    })),
    "metrics[0].source"
  );
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ metrics: {} })),
    "metrics"
  );
});

test("rejects unexpected achievement and metadata properties", () => {
  const inputWithUnknown = achievementInput({ verificationStatus: "verified" });
  assert.throws(
    () => createAchievementRecord(inputWithUnknown, {
      id: "id",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "verificationStatus")
  );

  assert.throws(
    () => createAchievementRecord(achievementInput(), {
      id: "id",
      createdAt: timestamp,
      extra: true
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.extra")
  );

  assertInvalidField(
    validateAchievementRecord(achievementRecord({ extra: true })),
    "extra"
  );
});

test("accepts arbitrary evidence array items without item-level validation", () => {
  const evidence = [null, "reference", { anything: true }, 12];
  const record = createAchievementRecord(achievementInput({ evidence }), {
    id: "id",
    createdAt: timestamp
  });

  assert.deepEqual(record.evidence, evidence);
  assert.equal(validateAchievementRecord(achievementRecord({ evidence })).valid, true);
  assertInvalidField(
    validateAchievementRecord(achievementRecord({ evidence: "reference" })),
    "evidence"
  );
});

test("defaults employmentId to null and accepts null or non-empty strings", () => {
  const withDefault = createAchievementRecord(achievementInput(), {
    id: "id",
    createdAt: timestamp
  });
  assert.equal(withDefault.employmentId, null);

  for (const employmentId of [null, "employment-id", " employment-id "]) {
    assert.equal(
      validateAchievementRecord(achievementRecord({ employmentId })).valid,
      true
    );
  }

  for (const employmentId of ["", " ", 4, undefined]) {
    assertInvalidField(
      validateAchievementRecord(achievementRecord({ employmentId })),
      "employmentId"
    );
  }
});

test("validates strict ISO UTC timestamps and timestamp ordering", () => {
  const invalidTimestamps = [
    "2025-04-20T14:30:00Z",
    "2025-04-20T14:30:00.00Z",
    "2025-04-20T14:30:00.0000Z",
    "2025-02-30T14:30:00.000Z",
    "2025-04-20T24:00:00.000Z",
    "2025-04-20T14:30:00+00:00"
  ];

  for (const value of invalidTimestamps) {
    assertInvalidField(
      validateAchievementRecord(achievementRecord({ updatedAt: value })),
      "updatedAt"
    );
  }

  assertInvalidField(
    validateAchievementRecord(achievementRecord({
      createdAt: "2025-04-20T14:30:01.000Z",
      updatedAt: timestamp
    })),
    "updatedAt"
  );

  const earlyYearTimestamp = "0000-02-29T14:30:00.000Z";
  assert.equal(validateAchievementRecord(achievementRecord({
    createdAt: earlyYearTimestamp,
    updatedAt: earlyYearTimestamp
  })).valid, true);
});

test("reports constructor errors as TypeErrors with field/message entries", () => {
  assert.throws(
    () => createAchievementRecord(null, { id: "id", createdAt: timestamp }),
    (error) => error instanceof TypeError
      && Array.isArray(error.errors)
      && error.errors.some((item) => item.field === "input" && typeof item.message === "string")
  );

  assert.throws(
    () => createAchievementRecord(achievementInput(), {}),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "id")
      && error.errors.some((item) => item.field === "metadata.createdAt")
  );

  assert.throws(
    () => createAchievementRecord({ title: "", contribution: 2 }, {
      id: " ",
      createdAt: "invalid"
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "title")
      && error.errors.some((item) => item.field === "contribution")
      && error.errors.some((item) => item.field === "metadata.createdAt")
  );
});

test("validation and construction do not mutate inputs or nested metric objects", () => {
  const input = achievementInput({
    actions: ["Action"],
    metrics: [{
      name: "Count",
      value: 2,
      unit: "items",
      period: "Year",
      basis: "measured"
    }],
    evidence: [{ source: "unstructured" }]
  });
  const originalInput = structuredClone(input);
  const record = createAchievementRecord(input, {
    id: "id",
    createdAt: timestamp
  });

  assert.deepEqual(input, originalInput);
  assert.notEqual(record.actions, input.actions);
  assert.notEqual(record.metrics, input.metrics);
  assert.notEqual(record.metrics[0], input.metrics[0]);
  assert.notEqual(record.evidence, input.evidence);

  const originalRecord = structuredClone(record);
  validateAchievementRecord(record);
  assert.deepEqual(record, originalRecord);
});
