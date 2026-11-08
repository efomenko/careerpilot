function matchesAchievementSearch(record, normalizedQuery) {
  return normalizedQuery.length === 0
    || record.title.toLowerCase().includes(normalizedQuery)
    || record.context.toLowerCase().includes(normalizedQuery);
}

function compareAchievementTitles(left, right) {
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

export function getAchievementMappingSelectorResults(
  records,
  query,
  mappedAchievementIds
) {
  const normalizedQuery = query.trim().toLowerCase();
  const mappedIds = new Set(mappedAchievementIds);
  const results = {
    verified: [],
    unverified: []
  };

  records.forEach((record) => {
    if (
      mappedIds.has(record.id)
      || !matchesAchievementSearch(record, normalizedQuery)
    ) {
      return;
    }

    if (record.verificationStatus === "verified") {
      results.verified.push(record);
    } else if (
      record.verificationStatus === "unverified"
      || record.verificationStatus === "needs_confirmation"
    ) {
      results.unverified.push(record);
    }
  });

  results.verified.sort(compareAchievementTitles);
  results.unverified.sort(compareAchievementTitles);
  return results;
}

export function getAchievementMappingSelectorState(
  records,
  query,
  mappedAchievementIds
) {
  const mappedIds = new Set(mappedAchievementIds);
  const results = getAchievementMappingSelectorResults(records, query, mappedIds);
  const resultCount = results.verified.length + results.unverified.length;

  if (records.length === 0) {
    return { status: "no-achievements", results };
  }
  if (resultCount > 0) {
    return { status: "results", results };
  }
  if (query.trim() !== "") {
    return { status: "no-matches", results };
  }
  if (records.every((record) => mappedIds.has(record.id))) {
    return { status: "all-mapped", results };
  }

  return { status: "no-matches", results };
}

export function getMappedAchievementEvidence(mappings, achievementRecords) {
  const achievementsById = new Map(
    achievementRecords.map((record) => [record.id, record])
  );
  const groups = {
    verified: { count: 0, entries: [] },
    unverified: { count: 0, entries: [] }
  };

  mappings.forEach((mapping) => {
    const achievement = achievementsById.get(mapping.achievementId);
    if (!achievement) {
      return;
    }

    const group = achievement.verificationStatus === "verified"
      ? groups.verified
      : achievement.verificationStatus === "unverified"
        || achievement.verificationStatus === "needs_confirmation"
        ? groups.unverified
        : null;
    if (!group) {
      return;
    }

    group.entries.push({ mapping, achievement });
    group.count += 1;
  });

  return groups;
}
