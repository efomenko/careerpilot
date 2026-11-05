const searchableJobFields = ["company", "roleTitle", "description", "notes"];

export function matchesJobSearch(record, normalizedQuery) {
  return normalizedQuery.length === 0
    || searchableJobFields.some((field) =>
      record[field].toLowerCase().includes(normalizedQuery)
    );
}

export function getJobListResults(records, selectedStatus, query) {
  const normalizedQuery = query.trim().toLowerCase();
  const statusRecords = [...records]
    .filter((record) => record.status === selectedStatus)
    .sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || right.createdAt.localeCompare(left.createdAt)
    );
  const matchingRecords = statusRecords.filter((record) =>
    matchesJobSearch(record, normalizedQuery)
  );

  return { statusRecords, matchingRecords, normalizedQuery };
}
