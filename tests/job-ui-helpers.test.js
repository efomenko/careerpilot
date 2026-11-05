import assert from "node:assert/strict";
import test from "node:test";
import {
  getJobListResults,
  matchesJobSearch
} from "../src/js/job-ui-helpers.js";

const timestamp = "2025-04-20T14:30:00.000Z";

function jobRecord(overrides = {}) {
  return {
    id: "job-id",
    company: "Example Company",
    roleTitle: "Software Engineer",
    description: "Build useful products.",
    sourceUrl: "",
    notes: "Follow up next week.",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

test("matches each searchable Job field", () => {
  const record = jobRecord();

  for (const [field, query] of [
    ["company", "example"],
    ["roleTitle", "engineer"],
    ["description", "useful"],
    ["notes", "follow up"]
  ]) {
    assert.equal(matchesJobSearch(record, query), true, `${field} should match`);
  }
});

test("search matching is case-insensitive and supports partial values", () => {
  assert.equal(matchesJobSearch(jobRecord({ roleTitle: "sOfTwArE Engineer" }), "soft"), true);
  assert.equal(matchesJobSearch(jobRecord(), "not present"), false);
});

test("empty normalized search matches all Jobs", () => {
  const record = jobRecord();
  assert.equal(matchesJobSearch(record, ""), true);
});

test("normalizes query and combines active status filtering with search", () => {
  const activeMatch = jobRecord({ id: "active-match" });
  const archivedMatch = jobRecord({ id: "archived-match", status: "archived" });
  const activeNonMatch = jobRecord({ id: "active-other", company: "Other" });

  const results = getJobListResults(
    [archivedMatch, activeNonMatch, activeMatch],
    "active",
    "  EXAMPLE  "
  );

  assert.equal(results.normalizedQuery, "example");
  assert.deepEqual(results.statusRecords.map(({ id }) => id), [
    "active-other",
    "active-match"
  ]);
  assert.deepEqual(results.matchingRecords.map(({ id }) => id), ["active-match"]);
});

test("archived status selection combines with search", () => {
  const active = jobRecord({ id: "active" });
  const archivedMatch = jobRecord({ id: "archived-match", status: "archived" });
  const archivedOther = jobRecord({
    id: "archived-other",
    company: "Different Company",
    roleTitle: "Product Designer",
    status: "archived"
  });

  const results = getJobListResults(
    [active, archivedOther, archivedMatch],
    "archived",
    "engineer"
  );

  assert.deepEqual(results.statusRecords.map(({ id }) => id), [
    "archived-other",
    "archived-match"
  ]);
  assert.deepEqual(results.matchingRecords.map(({ id }) => id), ["archived-match"]);
});

test("empty query returns all Jobs in the selected status", () => {
  const records = [
    jobRecord({ id: "archived", status: "archived" }),
    jobRecord({ id: "active" })
  ];

  const results = getJobListResults(records, "active", " \t ");

  assert.equal(results.normalizedQuery, "");
  assert.deepEqual(results.matchingRecords.map(({ id }) => id), ["active"]);
});

test("returns empty arrays when there are no Jobs or no Jobs in selected status", () => {
  assert.deepEqual(
    getJobListResults([], "active", "").statusRecords,
    []
  );

  const archived = jobRecord({ status: "archived" });
  const results = getJobListResults([archived], "active", "");
  assert.deepEqual(results.statusRecords, []);
  assert.deepEqual(results.matchingRecords, []);
});

test("returns no search matches without changing the status result set", () => {
  const record = jobRecord();
  const results = getJobListResults([record], "active", "missing");

  assert.equal(results.statusRecords.length, 1);
  assert.deepEqual(results.matchingRecords, []);
});

test("sorts by updatedAt descending, then createdAt descending", () => {
  const records = [
    jobRecord({
      id: "older-created-tie",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-04-20T00:00:00.000Z"
    }),
    jobRecord({
      id: "newest-updated",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2025-05-01T00:00:00.000Z"
    }),
    jobRecord({
      id: "newer-created-tie",
      createdAt: "2025-02-01T00:00:00.000Z",
      updatedAt: "2025-04-20T00:00:00.000Z"
    })
  ];

  const results = getJobListResults(records, "active", "");

  assert.deepEqual(results.statusRecords.map(({ id }) => id), [
    "newest-updated",
    "newer-created-tie",
    "older-created-tie"
  ]);
});

test("does not mutate the input array order or Job records", () => {
  const records = [
    jobRecord({ id: "older", updatedAt: "2025-01-01T00:00:00.000Z" }),
    jobRecord({ id: "newer", updatedAt: "2025-05-01T00:00:00.000Z" })
  ];
  const originalRecords = structuredClone(records);

  getJobListResults(records, "active", "example");

  assert.deepEqual(records, originalRecords);
  assert.deepEqual(records.map(({ id }) => id), ["older", "newer"]);
});
