import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardSummary } from "../src/js/dashboard-summary-helpers.js";

const early = "2025-01-01T00:00:00.000Z";
const middle = "2025-02-01T00:00:00.000Z";
const late = "2025-03-01T00:00:00.000Z";

function job(id, status = "active", overrides = {}) {
  return {
    id,
    company: `Company ${id}`,
    roleTitle: `Role ${id}`,
    description: "",
    sourceUrl: "",
    notes: "",
    status,
    createdAt: early,
    updatedAt: early,
    ...overrides
  };
}

function requirement(id, jobId, overrides = {}) {
  return {
    id,
    jobId,
    description: `Requirement ${id}`,
    category: "skill",
    importance: "mandatory",
    createdAt: early,
    updatedAt: early,
    ...overrides
  };
}

function mapping(id, requirementId, achievementId) {
  return {
    id,
    requirementId,
    achievementId,
    createdAt: early,
    updatedAt: early
  };
}

function assessment(jobId, status, score, requirementResults = []) {
  return { jobId, status, score, requirementResults };
}

function requirementResult(requirementId, status) {
  return {
    requirementId,
    status,
    importance: "mandatory",
    category: "skill",
    verifiedAchievementIds: status === "supported" ? ["achievement-1"] : [],
    unverifiedAchievementIds: []
  };
}

test("returns zero counts and not-applicable coverage for empty input", () => {
  assert.deepEqual(getDashboardSummary([], [], [], []), {
    jobCounts: { total: 0, active: 0, archived: 0 },
    recentJobs: [],
    requirementCoverage: {
      status: "not_applicable",
      totalRequirements: 0,
      mappedRequirements: 0,
      requirementsWithoutMappedEvidence: 0,
      verifiedSupportedRequirements: 0,
      mappedCoveragePercent: null,
      verifiedCoveragePercent: null
    },
    fitAssessments: {
      assessedJobCount: 0,
      averageScore: null,
      strongestJobs: [],
      jobsNeedingEvidenceCount: 0
    }
  });
});

test("counts Active and Archived Jobs and sorts the three most recently updated", () => {
  const jobs = [
    job("old", "active", { createdAt: early, updatedAt: early }),
    job("active", "active", { createdAt: middle, updatedAt: late }),
    job("archived", "archived", { createdAt: middle, updatedAt: middle }),
    job("newest", "archived", { createdAt: early, updatedAt: late })
  ];

  const summary = getDashboardSummary(jobs, [], [], []);

  assert.deepEqual(summary.jobCounts, { total: 4, active: 2, archived: 2 });
  assert.deepEqual(
    summary.recentJobs.map(({ id }) => id),
    ["active", "newest", "archived"]
  );
});

test("orders recent Jobs deterministically when timestamps tie", () => {
  const tied = [
    job("job-b", "active", { createdAt: middle, updatedAt: late }),
    job("job-c", "active", { createdAt: middle, updatedAt: late }),
    job("job-a", "active", { createdAt: middle, updatedAt: late }),
    job("older-created", "active", { createdAt: early, updatedAt: late })
  ];

  assert.deepEqual(
    getDashboardSummary(tied, [], [], []).recentJobs.map(({ id }) => id),
    ["job-a", "job-b", "job-c"]
  );
});

test("counts Requirements across Jobs regardless of status and counts mapped Requirements once", () => {
  const requirements = [
    requirement("active-one", "active-job"),
    requirement("archived-one", "archived-job"),
    requirement("unmapped", "active-job")
  ];
  const mappings = [
    mapping("mapping-1", "active-one", "achievement-1"),
    mapping("mapping-2", "active-one", "achievement-2"),
    mapping("mapping-3", "archived-one", "achievement-3")
  ];

  const summary = getDashboardSummary(
    [job("active-job"), job("archived-job", "archived")],
    requirements,
    mappings,
    []
  );

  assert.deepEqual(summary.requirementCoverage, {
    status: "available",
    totalRequirements: 3,
    mappedRequirements: 2,
    requirementsWithoutMappedEvidence: 1,
    verifiedSupportedRequirements: 0,
    mappedCoveragePercent: (2 / 3) * 100,
    verifiedCoveragePercent: 0
  });
});

test("counts unverified mappings as mapped but takes verified support from assessment results", () => {
  const requirements = [
    requirement("supported", "job-1"),
    requirement("unverified-only", "job-1"),
    requirement("unmapped", "job-1")
  ];
  const mappings = [
    mapping("mapping-verified", "supported", "verified-achievement"),
    mapping("mapping-unverified", "unverified-only", "unverified-achievement")
  ];
  const assessments = [
    assessment("job-1", "assessed", 2 / 3 * 100, [
      requirementResult("supported", "supported"),
      requirementResult("unverified-only", "unsupported"),
      requirementResult("unmapped", "unsupported")
    ])
  ];

  const summary = getDashboardSummary(
    [job("job-1")],
    requirements,
    mappings,
    assessments
  );

  assert.equal(summary.requirementCoverage.mappedRequirements, 2);
  assert.equal(summary.requirementCoverage.verifiedSupportedRequirements, 1);
  assert.equal(summary.requirementCoverage.mappedCoveragePercent, (2 / 3) * 100);
  assert.equal(summary.requirementCoverage.verifiedCoveragePercent, (1 / 3) * 100);
});

test("returns not-applicable coverage percentages when there are no Requirements", () => {
  const coverage = getDashboardSummary([job("job-1")], [], [], [])
    .requirementCoverage;

  assert.equal(coverage.status, "not_applicable");
  assert.equal(coverage.mappedCoveragePercent, null);
  assert.equal(coverage.verifiedCoveragePercent, null);
});

test("averages only assessed Jobs, including Active and Archived Jobs", () => {
  const jobs = [
    job("active-job", "active"),
    job("archived-job", "archived"),
    job("not-assessed-job", "active")
  ];
  const assessments = [
    assessment("active-job", "assessed", 80),
    assessment("archived-job", "assessed", 60),
    assessment("not-assessed-job", "not_assessed", null)
  ];

  const summary = getDashboardSummary(jobs, [], [], assessments);

  assert.equal(summary.fitAssessments.assessedJobCount, 2);
  assert.equal(summary.fitAssessments.averageScore, 70);
});

test("returns all tied highest-scoring assessed Jobs in deterministic ID order", () => {
  const jobs = [job("job-c"), job("job-b", "archived"), job("job-a")];
  const assessments = [
    assessment("job-c", "assessed", 90),
    assessment("job-b", "assessed", 90),
    assessment("job-a", "assessed", 70)
  ];

  assert.deepEqual(
    getDashboardSummary(jobs, [], [], assessments).fitAssessments.strongestJobs,
    [
      { jobId: "job-b", score: 90 },
      { jobId: "job-c", score: 90 }
    ]
  );
});

test("counts only assessed Jobs with unsupported Requirements as needing evidence", () => {
  const jobs = [job("supported"), job("unsupported", "archived"), job("empty")];
  const assessments = [
    assessment("supported", "assessed", 100, [
      requirementResult("supported-requirement", "supported")
    ]),
    assessment("unsupported", "assessed", 0, [
      requirementResult("unsupported-requirement", "unsupported")
    ]),
    assessment("empty", "not_assessed", null, [])
  ];

  assert.equal(
    getDashboardSummary(jobs, [], [], assessments)
      .fitAssessments.jobsNeedingEvidenceCount,
    1
  );
});

test("does not mutate input records or input array order", () => {
  const jobs = [
    job("later", "active", { createdAt: middle, updatedAt: late }),
    job("earlier", "archived", { createdAt: early, updatedAt: middle })
  ];
  const requirements = [requirement("requirement-1", "later")];
  const mappings = [mapping("mapping-1", "requirement-1", "achievement-1")];
  const assessments = [
    assessment("later", "assessed", 100, [
      requirementResult("requirement-1", "supported")
    ])
  ];
  const before = structuredClone({ jobs, requirements, mappings, assessments });

  const summary = getDashboardSummary(jobs, requirements, mappings, assessments);

  assert.deepEqual({ jobs, requirements, mappings, assessments }, before);
  summary.recentJobs[0].company = "Changed summary copy";
  assert.equal(jobs[0].company, "Company later");
});

test("rejects non-array inputs", () => {
  for (const [name, value] of [
    ["jobs", null],
    ["requirements", null],
    ["mappings", null],
    ["assessments", null]
  ]) {
    assert.throws(
      () => getDashboardSummary(
        name === "jobs" ? value : [],
        name === "requirements" ? value : [],
        name === "mappings" ? value : [],
        name === "assessments" ? value : []
      ),
      new TypeError(`${name} must be an array.`)
    );
  }
});
