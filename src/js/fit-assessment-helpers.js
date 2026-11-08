const requirementWeights = {
  mandatory: 2,
  preferred: 1
};

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function validateInputs(jobId, requirements, mappings, achievementRecords) {
  if (typeof jobId !== "string" || jobId.trim() === "") {
    throw new TypeError("jobId must be a non-empty string.");
  }

  for (const [name, value] of [
    ["requirements", requirements],
    ["mappings", mappings],
    ["achievementRecords", achievementRecords]
  ]) {
    if (!Array.isArray(value)) {
      throw new TypeError(`${name} must be an array.`);
    }
  }
}

function compareRequirementResults(left, right) {
  const leftGroup = (left.status === "supported" ? 2 : 0)
    + (left.importance === "preferred" ? 1 : 0);
  const rightGroup = (right.status === "supported" ? 2 : 0)
    + (right.importance === "preferred" ? 1 : 0);

  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }
  if (left.createdAt !== right.createdAt) {
    return compareStrings(left.createdAt, right.createdAt);
  }
  return compareStrings(left.requirementId, right.requirementId);
}

/**
 * Calculates weighted, verified evidence coverage for a Job's Requirements.
 */
export function calculateJobFitAssessment(
  jobId,
  requirements,
  mappings,
  achievementRecords
) {
  validateInputs(jobId, requirements, mappings, achievementRecords);

  const achievementsById = new Map(
    achievementRecords.map((record) => [record.id, record])
  );
  const mappingsByRequirementId = new Map();

  mappings.forEach((mapping) => {
    const requirementMappings = mappingsByRequirementId.get(mapping.requirementId) ?? [];
    requirementMappings.push(mapping);
    mappingsByRequirementId.set(mapping.requirementId, requirementMappings);
  });

  let supportedRequirementCount = 0;
  let supportedMandatoryCount = 0;
  let totalMandatoryCount = 0;
  let supportedWeight = 0;
  let totalWeight = 0;

  const sortedResults = requirements.map((requirement) => {
    const verifiedAchievementIds = [];
    const unverifiedAchievementIds = [];
    const seenAchievementIds = new Set();
    const requirementMappings = mappingsByRequirementId.get(requirement.id) ?? [];

    requirementMappings.forEach((mapping) => {
      const achievementId = mapping.achievementId;
      if (seenAchievementIds.has(achievementId)) {
        return;
      }

      const achievement = achievementsById.get(achievementId);
      if (!achievement) {
        return;
      }

      if (achievement.verificationStatus === "verified") {
        seenAchievementIds.add(achievementId);
        verifiedAchievementIds.push(achievementId);
      } else if (
        achievement.verificationStatus === "unverified"
        || achievement.verificationStatus === "needs_confirmation"
      ) {
        seenAchievementIds.add(achievementId);
        unverifiedAchievementIds.push(achievementId);
      }
    });

    const status = verifiedAchievementIds.length > 0
      ? "supported"
      : "unsupported";
    const weight = requirementWeights[requirement.importance];

    totalWeight += weight;
    if (requirement.importance === "mandatory") {
      totalMandatoryCount += 1;
    }
    if (status === "supported") {
      supportedRequirementCount += 1;
      supportedWeight += weight;
      if (requirement.importance === "mandatory") {
        supportedMandatoryCount += 1;
      }
    }

    return {
      requirementId: requirement.id,
      status,
      importance: requirement.importance,
      category: requirement.category,
      verifiedAchievementIds,
      unverifiedAchievementIds,
      createdAt: requirement.createdAt
    };
  });

  sortedResults.sort(compareRequirementResults);

  const totalRequirementCount = requirements.length;
  return {
    jobId,
    status: totalRequirementCount === 0 ? "not_assessed" : "assessed",
    score: totalRequirementCount === 0
      ? null
      : (supportedWeight / totalWeight) * 100,
    supportedRequirementCount,
    totalRequirementCount,
    supportedMandatoryCount,
    totalMandatoryCount,
    requirementResults: sortedResults.map(({
      requirementId,
      status,
      importance,
      category,
      verifiedAchievementIds,
      unverifiedAchievementIds
    }) => ({
      requirementId,
      status,
      importance,
      category,
      verifiedAchievementIds: [...verifiedAchievementIds],
      unverifiedAchievementIds: [...unverifiedAchievementIds]
    }))
  };
}
