import assert from "node:assert/strict";
import test from "node:test";
import { calculateJobFitAssessment } from "../src/js/fit-assessment-helpers.js";

const early = "2025-01-01T00:00:00.000Z";
const middle = "2025-02-01T00:00:00.000Z";
const late = "2025-03-01T00:00:00.000Z";

function requirement(id, importance = "mandatory", overrides = {}) {
  return {
    id,
    jobId: "job-1",
    description: `Requirement ${id}`,
    category: "skill",
    importance,
    createdAt: early,
    updatedAt: early,
    ...overrides
  };
}

function mapping(requirementId, achievementId) {
  return {
    id: `mapping-${requirementId}-${achievementId}`,
    requirementId,
    achievementId,
    createdAt: early,
    updatedAt: early
  };
}

function achievement(id, verificationStatus = "verified") {
  return {
    id,
    title: `Achievement ${id}`,
    context: "",
    verificationStatus
  };
}

function result(
  requirementId,
  importance,
  category = "skill",
  status = "unsupported",
  verifiedAchievementIds = [],
  unverifiedAchievementIds = []
) {
  return {
    requirementId,
    status,
    importance,
    category,
    verifiedAchievementIds,
    unverifiedAchievementIds
  };
}

test("returns not_assessed with a null score when there are no Requirements", () => {
  assert.deepEqual(
    calculateJobFitAssessment("job-1", [], [], []),
    {
      jobId: "job-1",
      status: "not_assessed",
      score: null,
      supportedRequirementCount: 0,
      totalRequirementCount: 0,
      supportedMandatoryCount: 0,
      totalMandatoryCount: 0,
      requirementResults: []
    }
  );
});

test("returns an assessed score of zero when no Requirement has verified evidence", () => {
  const requirements = [
    requirement("mandatory"),
    requirement("preferred", "preferred")
  ];

  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    [mapping("mandatory", "unverified"), mapping("preferred", "pending")],
    [achievement("unverified", "needs_confirmation")]
  );

  assert.equal(assessment.status, "assessed");
  assert.equal(assessment.score, 0);
  assert.equal(assessment.supportedRequirementCount, 0);
});

test("returns 100 when all Requirements have verified evidence", () => {
  const requirements = [
    requirement("mandatory"),
    requirement("preferred", "preferred")
  ];
  const mappings = [
    mapping("mandatory", "achievement-1"),
    mapping("preferred", "achievement-2")
  ];

  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    mappings,
    [achievement("achievement-1"), achievement("achievement-2")]
  );

  assert.equal(assessment.status, "assessed");
  assert.equal(assessment.score, 100);
  assert.equal(assessment.supportedRequirementCount, 2);
});

test("uses Mandatory weight 2 and Preferred weight 1 for partial coverage", () => {
  const requirements = [
    requirement("supported-mandatory"),
    requirement("unsupported-preferred", "preferred")
  ];

  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    [mapping("supported-mandatory", "verified")],
    [achievement("verified")]
  );

  assert.equal(assessment.score, (2 / 3) * 100);
});

test("reports supported and total Mandatory Requirement counts", () => {
  const requirements = [
    requirement("mandatory-supported"),
    requirement("mandatory-unsupported", "mandatory", { createdAt: middle }),
    requirement("preferred-supported", "preferred", { createdAt: late })
  ];

  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    [
      mapping("mandatory-supported", "verified-1"),
      mapping("preferred-supported", "verified-2")
    ],
    [achievement("verified-1"), achievement("verified-2")]
  );

  assert.equal(assessment.supportedMandatoryCount, 1);
  assert.equal(assessment.totalMandatoryCount, 2);
});

test("reports zero Mandatory counts when there are no Mandatory Requirements", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("preferred", "preferred")],
    [],
    []
  );

  assert.equal(assessment.supportedMandatoryCount, 0);
  assert.equal(assessment.totalMandatoryCount, 0);
});

test("multiple verified Achievements support one Requirement only once", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    [
      mapping("one", "verified-1"),
      mapping("one", "verified-2")
    ],
    [achievement("verified-1"), achievement("verified-2")]
  );

  assert.equal(assessment.score, 100);
  assert.equal(assessment.supportedRequirementCount, 1);
  assert.deepEqual(
    assessment.requirementResults[0].verifiedAchievementIds,
    ["verified-1", "verified-2"]
  );
});

test("classifies verified evidence separately from unverified evidence", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    [
      mapping("one", "verified"),
      mapping("one", "unverified")
    ],
    [
      achievement("verified", "verified"),
      achievement("unverified", "unverified")
    ]
  );

  assert.equal(assessment.requirementResults[0].status, "supported");
  assert.deepEqual(
    assessment.requirementResults[0].verifiedAchievementIds,
    ["verified"]
  );
  assert.deepEqual(
    assessment.requirementResults[0].unverifiedAchievementIds,
    ["unverified"]
  );
});

test("needs_confirmation evidence is listed but does not support a Requirement", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    [mapping("one", "needs-confirmation")],
    [achievement("needs-confirmation", "needs_confirmation")]
  );

  assert.equal(assessment.score, 0);
  assert.equal(assessment.requirementResults[0].status, "unsupported");
  assert.deepEqual(
    assessment.requirementResults[0].unverifiedAchievementIds,
    ["needs-confirmation"]
  );
});

test("ignores mappings whose Achievement record is missing", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    [mapping("one", "missing")],
    []
  );

  assert.equal(assessment.score, 0);
  assert.deepEqual(assessment.requirementResults[0].verifiedAchievementIds, []);
  assert.deepEqual(assessment.requirementResults[0].unverifiedAchievementIds, []);
});

test("Requirements without mappings are unsupported", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    [],
    [achievement("unrelated")]
  );

  assert.equal(assessment.requirementResults[0].status, "unsupported");
  assert.equal(assessment.score, 0);
});

test("returns exactly the specified result fields including category", () => {
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one", "preferred", { category: "education" })],
    [],
    []
  );

  assert.deepEqual(Object.keys(assessment), [
    "jobId",
    "status",
    "score",
    "supportedRequirementCount",
    "totalRequirementCount",
    "supportedMandatoryCount",
    "totalMandatoryCount",
    "requirementResults"
  ]);
  assert.deepEqual(assessment.requirementResults[0], result(
    "one",
    "preferred",
    "education"
  ));
  assert.equal("requirementType" in assessment.requirementResults[0], false);
  assert.deepEqual(Object.keys(assessment.requirementResults[0]), [
    "requirementId",
    "status",
    "importance",
    "category",
    "verifiedAchievementIds",
    "unverifiedAchievementIds"
  ]);
});

test("orders result groups as unsupported Mandatory, unsupported Preferred, supported Mandatory, supported Preferred", () => {
  const requirements = [
    requirement("supported-preferred", "preferred", { createdAt: early }),
    requirement("supported-mandatory", "mandatory", { createdAt: early }),
    requirement("unsupported-preferred", "preferred", { createdAt: early }),
    requirement("unsupported-mandatory", "mandatory", { createdAt: early })
  ];
  const mappings = [
    mapping("supported-preferred", "verified-1"),
    mapping("supported-mandatory", "verified-2")
  ];

  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    mappings,
    [achievement("verified-1"), achievement("verified-2")]
  );

  assert.deepEqual(
    assessment.requirementResults.map(({ requirementId }) => requirementId),
    [
      "unsupported-mandatory",
      "unsupported-preferred",
      "supported-mandatory",
      "supported-preferred"
    ]
  );
});

test("orders Requirements within each group by creation date ascending", () => {
  const requirements = [
    requirement("late", "mandatory", { createdAt: late }),
    requirement("early", "mandatory", { createdAt: early }),
    requirement("middle", "mandatory", { createdAt: middle })
  ];
  const assessment = calculateJobFitAssessment("job-1", requirements, [], []);

  assert.deepEqual(
    assessment.requirementResults.map(({ requirementId }) => requirementId),
    ["early", "middle", "late"]
  );
});

test("orders equal creation dates by deterministic Requirement ID string comparison", () => {
  const requirements = [
    requirement("a"),
    requirement("Z"),
    requirement("B"),
    requirement("b")
  ];
  const assessment = calculateJobFitAssessment("job-1", requirements, [], []);

  assert.deepEqual(
    assessment.requirementResults.map(({ requirementId }) => requirementId),
    ["B", "Z", "a", "b"]
  );
});

test("preserves mapping order and deduplicates Achievement IDs in evidence lists", () => {
  const mappings = [
    mapping("one", "verified-2"),
    mapping("one", "unknown"),
    mapping("one", "unverified-1"),
    mapping("one", "verified-1"),
    mapping("one", "verified-2"),
    mapping("one", "unverified-1")
  ];
  const assessment = calculateJobFitAssessment(
    "job-1",
    [requirement("one")],
    mappings,
    [
      achievement("verified-1"),
      achievement("verified-2"),
      achievement("unverified-1", "unverified")
    ]
  );

  assert.deepEqual(
    assessment.requirementResults[0].verifiedAchievementIds,
    ["verified-2", "verified-1"]
  );
  assert.deepEqual(
    assessment.requirementResults[0].unverifiedAchievementIds,
    ["unverified-1"]
  );
});

test("does not mutate input arrays or records", () => {
  const requirements = [requirement("one")];
  const mappings = [mapping("one", "verified")];
  const achievements = [achievement("verified")];
  const originalInputs = structuredClone({
    requirements,
    mappings,
    achievements
  });

  calculateJobFitAssessment("job-1", requirements, mappings, achievements);

  assert.deepEqual({ requirements, mappings, achievements }, originalInputs);
});

test("returns newly constructed results and arrays detached from inputs", () => {
  const sourceRequirement = requirement("one");
  const sourceMapping = mapping("one", "verified");
  const sourceAchievement = achievement("verified");
  const requirements = [sourceRequirement];
  const mappings = [sourceMapping];
  const achievements = [sourceAchievement];
  const assessment = calculateJobFitAssessment(
    "job-1",
    requirements,
    mappings,
    achievements
  );
  const item = assessment.requirementResults[0];

  assert.notEqual(assessment.requirementResults, requirements);
  assert.notEqual(item, sourceRequirement);
  assert.notEqual(item.verifiedAchievementIds, mappings);
  assert.notEqual(item.unverifiedAchievementIds, achievements);

  item.verifiedAchievementIds.push("changed");
  item.unverifiedAchievementIds.push("also-changed");
  assessment.requirementResults.push(result("another", "preferred"));
  assert.equal(sourceRequirement.id, "one");
  assert.equal(sourceMapping.achievementId, "verified");
  assert.equal(sourceAchievement.verificationStatus, "verified");
});

test("rejects a blank or invalid jobId with a clear TypeError", () => {
  for (const jobId of ["", " \t ", null, 1]) {
    assert.throws(
      () => calculateJobFitAssessment(jobId, [], [], []),
      (error) => error instanceof TypeError
        && /jobId must be a non-empty string/.test(error.message)
    );
  }
});

test("rejects invalid top-level array arguments with clear TypeErrors", () => {
  const validArrays = [[], [], []];
  const argumentNames = ["requirements", "mappings", "achievementRecords"];

  argumentNames.forEach((name, index) => {
    const args = [...validArrays];
    args[index] = {};
    assert.throws(
      () => calculateJobFitAssessment("job-1", ...args),
      (error) => error instanceof TypeError
        && error.message === `${name} must be an array.`
    );
  });
});

test("repeated calculations with identical inputs are deterministic", () => {
  const inputs = [
    "job-1",
    [
      requirement("second", "preferred", { createdAt: middle }),
      requirement("first", "mandatory", { createdAt: early })
    ],
    [
      mapping("second", "unverified"),
      mapping("first", "verified")
    ],
    [
      achievement("unverified", "needs_confirmation"),
      achievement("verified")
    ]
  ];

  assert.deepEqual(
    calculateJobFitAssessment(...inputs),
    calculateJobFitAssessment(...inputs)
  );
});
