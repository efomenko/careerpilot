import assert from "node:assert/strict";
import test from "node:test";
import {
  getAchievementMappingSelectorState,
  getMappedAchievementEvidence,
  getAchievementMappingSelectorResults
} from "../src/js/achievement-mapping-ui-helpers.js";

function achievementRecord(id, title, context, verificationStatus = "unverified") {
  return {
    id,
    title,
    context,
    contribution: `Contribution for ${title}`,
    actions: [],
    outcome: "",
    potentialImpact: "",
    metrics: [],
    evidence: [],
    employmentId: null,
    verificationStatus,
    createdAt: "2025-04-20T14:30:00.000Z",
    updatedAt: "2025-04-20T14:30:00.000Z"
  };
}

function mappingRecord(id, achievementId) {
  return {
    id,
    requirementId: "requirement-1",
    achievementId,
    createdAt: "2025-04-20T14:30:00.000Z",
    updatedAt: "2025-04-20T14:30:00.000Z"
  };
}

test("matches partial Achievement titles case-insensitively", () => {
  const record = achievementRecord("matching", "Platform Migration", "");

  const results = getAchievementMappingSelectorResults([record], "MIGR", []);

  assert.deepEqual(results.unverified, [record]);
});

test("matches partial Achievement context case-insensitively", () => {
  const record = achievementRecord(
    "matching",
    "Service Improvements",
    "Reduced latency across the PAYMENT platform"
  );

  const results = getAchievementMappingSelectorResults([record], "payment", []);

  assert.deepEqual(results.unverified, [record]);
});

test("trims the search query", () => {
  const record = achievementRecord("matching", "Platform Migration", "");

  const results = getAchievementMappingSelectorResults([record], "  MIGRATION  ", []);

  assert.deepEqual(results.unverified, [record]);
});

test("an empty query returns every eligible Achievement", () => {
  const records = [
    achievementRecord("one", "One", ""),
    achievementRecord("two", "Two", "", "verified")
  ];

  const results = getAchievementMappingSelectorResults(records, " \t ", []);

  assert.deepEqual(results.verified, [records[1]]);
  assert.deepEqual(results.unverified, [records[0]]);
});

test("excludes Achievements already mapped to the Requirement", () => {
  const records = [
    achievementRecord("mapped", "Mapped Achievement", ""),
    achievementRecord("available", "Available Achievement", "")
  ];

  const results = getAchievementMappingSelectorResults(
    records,
    "",
    new Set(["mapped"])
  );

  assert.deepEqual(results.unverified, [records[1]]);
});

test("groups verified separately and treats needs_confirmation as unverified", () => {
  const records = [
    achievementRecord("unverified", "Unverified", "", "unverified"),
    achievementRecord("needs-confirmation", "Needs confirmation", "", "needs_confirmation"),
    achievementRecord("verified", "Verified", "", "verified")
  ];

  const results = getAchievementMappingSelectorResults(records, "", []);

  assert.deepEqual(results.verified, [records[2]]);
  assert.deepEqual(results.unverified, [records[1], records[0]]);
});

test("sorts each group alphabetically by title without case sensitivity", () => {
  const records = [
    achievementRecord("z-unverified", "zulu", ""),
    achievementRecord("a-verified", "alpha", "", "verified"),
    achievementRecord("a-unverified", "Alpha", ""),
    achievementRecord("z-verified", "Zulu", "", "verified")
  ];

  const results = getAchievementMappingSelectorResults(records, "", []);

  assert.deepEqual(
    results.verified.map(({ id }) => id),
    ["a-verified", "z-verified"]
  );
  assert.deepEqual(
    results.unverified.map(({ id }) => id),
    ["a-unverified", "z-unverified"]
  );
});

test("returns empty arrays for empty groups", () => {
  assert.deepEqual(
    getAchievementMappingSelectorResults([], "", []),
    { verified: [], unverified: [] }
  );

  const results = getAchievementMappingSelectorResults(
    [achievementRecord("one", "One", "")],
    "no match",
    []
  );
  assert.deepEqual(results, { verified: [], unverified: [] });
});

test("does not mutate input arrays or Achievement records", () => {
  const records = [
    achievementRecord("z", "Zulu", "Context"),
    achievementRecord("a", "Alpha", "Context", "verified")
  ];
  const originalRecords = structuredClone(records);
  const mappedIds = ["missing"];

  getAchievementMappingSelectorResults(records, "context", mappedIds);

  assert.deepEqual(records, originalRecords);
  assert.deepEqual(records.map(({ id }) => id), ["z", "a"]);
  assert.deepEqual(mappedIds, ["missing"]);
});

test("groups verified Achievements and counts resolved entries", () => {
  const achievement = achievementRecord("verified", "Verified", "", "verified");
  const mapping = mappingRecord("mapping-1", achievement.id);

  const groups = getMappedAchievementEvidence([mapping], [achievement]);

  assert.equal(groups.verified.count, 1);
  assert.deepEqual(groups.verified.entries, [{ mapping, achievement }]);
  assert.equal(groups.unverified.count, 0);
  assert.deepEqual(groups.unverified.entries, []);
});

test("groups unverified Achievements and counts resolved entries", () => {
  const achievement = achievementRecord("unverified", "Unverified", "", "unverified");
  const mapping = mappingRecord("mapping-1", achievement.id);

  const groups = getMappedAchievementEvidence([mapping], [achievement]);

  assert.equal(groups.verified.count, 0);
  assert.deepEqual(groups.unverified.entries, [{ mapping, achievement }]);
  assert.equal(groups.unverified.count, 1);
});

test("groups needs_confirmation Achievements as unverified", () => {
  const achievement = achievementRecord(
    "needs-confirmation",
    "Needs confirmation",
    "",
    "needs_confirmation"
  );
  const mapping = mappingRecord("mapping-1", achievement.id);

  const groups = getMappedAchievementEvidence([mapping], [achievement]);

  assert.equal(groups.unverified.count, 1);
  assert.deepEqual(groups.unverified.entries, [{ mapping, achievement }]);
});

test("returns empty groups when there are no resolved mappings", () => {
  const groups = getMappedAchievementEvidence([], []);

  assert.deepEqual(groups, {
    verified: { count: 0, entries: [] },
    unverified: { count: 0, entries: [] }
  });
});

test("skips mappings whose Achievement record is missing", () => {
  const mapping = mappingRecord("orphaned-mapping", "missing-achievement");

  const groups = getMappedAchievementEvidence([mapping], []);

  assert.deepEqual(groups, {
    verified: { count: 0, entries: [] },
    unverified: { count: 0, entries: [] }
  });
});

test("does not mutate the supplied mappings or Achievement records", () => {
  const mappings = [
    mappingRecord("mapping-verified", "verified"),
    mappingRecord("mapping-unverified", "unverified"),
    mappingRecord("mapping-orphaned", "missing")
  ];
  const achievements = [
    achievementRecord("verified", "Verified", "", "verified"),
    achievementRecord("unverified", "Unverified", "", "needs_confirmation")
  ];
  const originalMappings = structuredClone(mappings);
  const originalAchievements = structuredClone(achievements);

  getMappedAchievementEvidence(mappings, achievements);

  assert.deepEqual(mappings, originalMappings);
  assert.deepEqual(achievements, originalAchievements);
});

test("classifies an empty Achievement collection", () => {
  assert.equal(
    getAchievementMappingSelectorState([], "", []).status,
    "no-achievements"
  );
});

test("classifies when every existing Achievement is already mapped", () => {
  const records = [
    achievementRecord("one", "One", ""),
    achievementRecord("two", "Two", "", "verified")
  ];

  assert.equal(
    getAchievementMappingSelectorState(records, "", ["one", "two"]).status,
    "all-mapped"
  );
});

test("classifies no matches for a non-empty search", () => {
  const records = [achievementRecord("one", "One", "")];

  assert.equal(
    getAchievementMappingSelectorState(records, "missing", []).status,
    "no-matches"
  );
});

test("classifies eligible selector results", () => {
  const records = [achievementRecord("one", "One", "")];

  assert.equal(
    getAchievementMappingSelectorState(records, "", []).status,
    "results"
  );
});
