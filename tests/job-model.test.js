import assert from "node:assert/strict";
import test from "node:test";
import {
  createJobRecord,
  validateJobRecord
} from "../src/js/job-model.js";

const timestamp = "2025-04-20T14:30:00.000Z";

function jobInput(overrides = {}) {
  return {
    company: "Example Company",
    roleTitle: "Software Engineer",
    ...overrides
  };
}

function jobRecord(overrides = {}) {
  return {
    id: "job-id",
    company: "Example Company",
    roleTitle: "Software Engineer",
    description: "",
    sourceUrl: "",
    notes: "",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function assertInvalidField(result, field) {
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.field === field));
}

test("constructs and validates a complete Job", () => {
  const record = createJobRecord(jobInput({
    description: "A role description.",
    sourceUrl: "https://example.com/jobs/1",
    notes: "Follow up next week."
  }), {
    id: "supplied-job-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, jobRecord({
    id: "supplied-job-id",
    description: "A role description.",
    sourceUrl: "https://example.com/jobs/1",
    notes: "Follow up next week."
  }));
  assert.deepEqual(validateJobRecord(record), { valid: true, errors: [] });
});

test("defaults optional fields and status", () => {
  const record = createJobRecord(jobInput(), {
    id: "job-id",
    createdAt: timestamp
  });

  assert.deepEqual(record, jobRecord());
  assert.equal(record.status, "active");
});

test("accepts archived status", () => {
  const record = createJobRecord(jobInput({ status: "archived" }), {
    id: "job-id",
    createdAt: timestamp
  });

  assert.equal(record.status, "archived");
  assert.deepEqual(validateJobRecord(record), { valid: true, errors: [] });
});

test("rejects invalid Job statuses", () => {
  for (const status of ["pending", "Active", "", null, 1, false]) {
    assertInvalidField(
      validateJobRecord(jobRecord({ status })),
      "status"
    );
    assert.throws(
      () => createJobRecord(jobInput({ status }), {
        id: "job-id",
        createdAt: timestamp
      }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === "status")
    );
  }
});

test("requires company and role title", () => {
  for (const [field, input] of [
    ["company", jobInput({ company: "" })],
    ["company", jobInput({ company: " \t " })],
    ["roleTitle", jobInput({ roleTitle: "" })],
    ["roleTitle", jobInput({ roleTitle: " \n " })]
  ]) {
    assert.throws(
      () => createJobRecord(input, { id: "job-id", createdAt: timestamp }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
    assertInvalidField(
      validateJobRecord(jobRecord({ [field]: input[field] })),
      field
    );
  }

  for (const field of ["company", "roleTitle"]) {
    const input = jobInput();
    delete input[field];
    assert.throws(
      () => createJobRecord(input, { id: "job-id", createdAt: timestamp }),
      (error) => error instanceof TypeError
        && error.errors.some((item) => item.field === field)
    );
  }
});

test("rejects non-string optional text fields", () => {
  for (const field of ["description", "sourceUrl", "notes"]) {
    for (const value of [null, 1, false, {}]) {
      assert.throws(
        () => createJobRecord(jobInput({ [field]: value }), {
          id: "job-id",
          createdAt: timestamp
        }),
        (error) => error instanceof TypeError
          && error.errors.some((item) => item.field === field)
      );
      assertInvalidField(
        validateJobRecord(jobRecord({ [field]: value })),
        field
      );
    }
  }
});

test("accepts absolute HTTP and HTTPS source URLs", () => {
  for (const sourceUrl of [
    "http://example.com/job",
    "https://example.com/job?source=careers"
  ]) {
    assert.equal(
      validateJobRecord(jobRecord({ sourceUrl })).valid,
      true
    );
  }
});

test("accepts an empty source URL", () => {
  assert.equal(validateJobRecord(jobRecord({ sourceUrl: "" })).valid, true);
});

test("rejects relative URLs and non-HTTP(S) schemes", () => {
  for (const sourceUrl of [
    "/jobs/1",
    "example.com/jobs/1",
    "ftp://example.com/jobs/1",
    "file:///jobs/1",
    "javascript:alert(1)",
    "http://"
  ]) {
    assertInvalidField(
      validateJobRecord(jobRecord({ sourceUrl })),
      "sourceUrl"
    );
  }
});

test("trims source URL whitespace without normalizing the URL", () => {
  const enteredUrl = "  HTTPS://Example.com/Job Path?q=One  ";
  const record = createJobRecord(jobInput({ sourceUrl: enteredUrl }), {
    id: "job-id",
    createdAt: timestamp
  });

  assert.equal(record.sourceUrl, "HTTPS://Example.com/Job Path?q=One");
  assert.equal(validateJobRecord(record).valid, true);
  assert.equal(
    validateJobRecord(jobRecord({ sourceUrl: enteredUrl })).valid,
    true
  );
});

test("rejects unknown Job and metadata properties", () => {
  assert.throws(
    () => createJobRecord(jobInput({ extra: "value" }), {
      id: "job-id",
      createdAt: timestamp
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "extra")
  );

  assert.throws(
    () => createJobRecord(jobInput(), {
      id: "job-id",
      createdAt: timestamp,
      extra: true
    }),
    (error) => error instanceof TypeError
      && error.errors.some((item) => item.field === "metadata.extra")
  );

  assertInvalidField(
    validateJobRecord(jobRecord({ extra: "value" })),
    "extra"
  );
});

test("uses caller-supplied ID and creation timestamp", () => {
  const record = createJobRecord(jobInput(), {
    id: "caller-job-id",
    createdAt: timestamp
  });

  assert.equal(record.id, "caller-job-id");
  assert.equal(record.createdAt, timestamp);
  assert.equal(record.updatedAt, timestamp);
});

test("allows duplicate company, role, and source URL values", () => {
  const first = createJobRecord(jobInput({
    sourceUrl: "https://example.com/jobs/1"
  }), {
    id: "job-1",
    createdAt: timestamp
  });
  const second = createJobRecord(jobInput({
    sourceUrl: "https://example.com/jobs/1"
  }), {
    id: "job-2",
    createdAt: timestamp
  });

  assert.equal(validateJobRecord(first).valid, true);
  assert.equal(validateJobRecord(second).valid, true);
  assert.equal(first.company, second.company);
  assert.equal(first.roleTitle, second.roleTitle);
  assert.equal(first.sourceUrl, second.sourceUrl);
});

test("rejects invalid timestamps and accepts updatedAt before createdAt", () => {
  assertInvalidField(
    validateJobRecord(jobRecord({ createdAt: "2025-02-30T14:30:00.000Z" })),
    "createdAt"
  );
  assertInvalidField(
    validateJobRecord(jobRecord({ updatedAt: "2025-04-20T14:30:00+00:00" })),
    "updatedAt"
  );
  assert.deepEqual(
    validateJobRecord(jobRecord({
      createdAt: "2025-04-20T14:30:01.000Z",
      updatedAt: timestamp
    })),
    { valid: true, errors: [] }
  );
});
