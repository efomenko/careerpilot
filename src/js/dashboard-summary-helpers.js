function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function validateInputs(jobs, requirements, mappings, assessments) {
  for (const [name, value] of [
    ["jobs", jobs],
    ["requirements", requirements],
    ["mappings", mappings],
    ["assessments", assessments]
  ]) {
    if (!Array.isArray(value)) {
      throw new TypeError(`${name} must be an array.`);
    }
  }
}

function compareRecentJobs(left, right) {
  return compareStrings(right.updatedAt, left.updatedAt)
    || compareStrings(right.createdAt, left.createdAt)
    || compareStrings(left.id, right.id);
}

/**
 * Aggregates prepared Career State records and Fit Assessment results for the
 * Dashboard without calculating or changing assessment data.
 */
export function getDashboardSummary(jobs, requirements, mappings, assessments) {
  validateInputs(jobs, requirements, mappings, assessments);

  const mappedRequirementIds = new Set(
    mappings.map((mapping) => mapping.requirementId)
  );
  const assessmentByJobId = new Map(
    assessments.map((assessment) => [assessment.jobId, assessment])
  );
  const supportedRequirementIdsByJobId = new Map();

  assessments.forEach((assessment) => {
    supportedRequirementIdsByJobId.set(
      assessment.jobId,
      new Set(
        assessment.requirementResults
          .filter((result) => result.status === "supported")
          .map((result) => result.requirementId)
      )
    );
  });

  const mappedRequirementCount = requirements.filter((requirement) =>
    mappedRequirementIds.has(requirement.id)
  ).length;
  const verifiedSupportedRequirementCount = requirements.filter(
    (requirement) => supportedRequirementIdsByJobId
      .get(requirement.jobId)
      ?.has(requirement.id)
  ).length;
  const totalRequirementCount = requirements.length;

  const assessedJobs = jobs.flatMap((job) => {
    const assessment = assessmentByJobId.get(job.id);
    return assessment?.status === "assessed"
      ? [{ job, assessment }]
      : [];
  });
  const assessedScores = assessedJobs.map(({ assessment }) => assessment.score);
  const highestScore = assessedScores.length > 0
    ? Math.max(...assessedScores)
    : null;
  const strongestJobs = highestScore === null
    ? []
    : assessedJobs
      .filter(({ assessment }) => assessment.score === highestScore)
      .map(({ job, assessment }) => ({
        jobId: job.id,
        score: assessment.score
      }))
      .sort((left, right) => compareStrings(left.jobId, right.jobId));

  return {
    jobCounts: {
      total: jobs.length,
      active: jobs.filter((job) => job.status === "active").length,
      archived: jobs.filter((job) => job.status === "archived").length
    },
    recentJobs: [...jobs]
      .sort(compareRecentJobs)
      .slice(0, 3)
      .map((job) => ({ ...job })),
    requirementCoverage: {
      status: totalRequirementCount === 0 ? "not_applicable" : "available",
      totalRequirements: totalRequirementCount,
      mappedRequirements: mappedRequirementCount,
      requirementsWithoutMappedEvidence: totalRequirementCount - mappedRequirementCount,
      verifiedSupportedRequirements: verifiedSupportedRequirementCount,
      mappedCoveragePercent: totalRequirementCount === 0
        ? null
        : (mappedRequirementCount / totalRequirementCount) * 100,
      verifiedCoveragePercent: totalRequirementCount === 0
        ? null
        : (verifiedSupportedRequirementCount / totalRequirementCount) * 100
    },
    fitAssessments: {
      assessedJobCount: assessedJobs.length,
      averageScore: assessedScores.length === 0
        ? null
        : assessedScores.reduce((total, score) => total + score, 0)
          / assessedScores.length,
      strongestJobs,
      jobsNeedingEvidenceCount: assessedJobs.filter(({ assessment }) =>
        assessment.requirementResults.some((result) => result.status === "unsupported")
      ).length
    }
  };
}
