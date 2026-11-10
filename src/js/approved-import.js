import { createCareerProfile, createEmploymentRecord, validateCareerProfile, validateEmploymentRecord } from "./career-model.js";
import { createAchievementRecord, validateAchievementRecord } from "./achievement-model.js";
import { createEducationRecord, validateEducationRecord } from "./education-model.js";
import { createCertificationRecord, validateCertificationRecord } from "./certification-model.js";
import { validateImportSession } from "./import-model.js";
import { isUtcTimestamp } from "./model-validation.js";
import { validateApprovalReceipt } from "./approval-receipt.js";
import { hasAchievementContentChanged } from "./career-state.js";

const specs = {
  profile: { fields: ["fullName", "headline", "summary", "skills"], create: createCareerProfile, validate: validateCareerProfile },
  employment: { collection: "employmentRecords", fields: ["employer", "roleTitle", "startDate", "endDate", "isCurrent", "responsibilities"], create: createEmploymentRecord, validate: validateEmploymentRecord },
  achievement: { collection: "achievementRecords", fields: ["title", "context", "contribution", "actions", "outcome", "potentialImpact", "metrics", "evidence", "employmentId"], create: createAchievementRecord, validate: validateAchievementRecord },
  education: { collection: "educationRecords", fields: ["institution", "qualification", "fieldOfStudy", "startDate", "endDate", "isCurrent"], create: createEducationRecord, validate: validateEducationRecord },
  certification: { collection: "certificationRecords", fields: ["name", "issuer", "issuedDate", "expirationDate", "credentialId", "credentialUrl"], create: createCertificationRecord, validate: validateCertificationRecord }
};

function fail(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  throw error;
}

function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

function targetFor(snapshot, category, id) {
  const spec = specs[category];
  const records = category === "profile" ? [snapshot.profile].filter(Boolean) : snapshot[spec.collection];
  const matches = records.filter((record) => record.id === id);
  return matches.length === 1 ? matches[0] : null;
}

function provenance(candidate, fields, skill = false) {
  const result = [];
  for (const [path, items] of Object.entries(candidate.fieldProvenance)) {
    if (skill ? path !== "value" && path !== "skills" : !fields.includes(path) || !Object.hasOwn(candidate.reviewedData, path)) {
      fail("invalid-mapping", "Unsupported provenance path.");
    }
    for (const item of items) result.push(skill ? { ...item, fieldPath: "skills" } : item);
  }
  return result;
}

export function findCompletedImport(snapshot, sessionId) {
  const prior = snapshot.import.completedBatches.filter((entry) => entry?.type === "approved-import-v1" && entry.sessionId === sessionId);
  if (prior.length > 1) fail("invalid-batch", "Duplicate completed import markers.");
  if (prior.length) {
    const reports = snapshot.import.importReports.filter((entry) => entry?.type === "approved-import-v1" && entry.sessionId === sessionId);
    const report = reports[0];
    const sessions = snapshot.import.sessions.filter((entry) => entry?.id === sessionId);
    if (Object.keys(prior[0]).length !== 2 || reports.length !== 1 || sessions.length !== 1
      || sessions[0].status !== "import_completed"
      || Object.keys(report).length !== 6 || report.status !== "completed" || !isUtcTimestamp(report.completedAt)
      || !Array.isArray(report.records) || !Array.isArray(report.skippedCandidateIds)
      || !report.skippedCandidateIds.every((id) => typeof id === "string" && id.trim())
      || !report.records.every((entry) => entry && Object.keys(entry).length === 4
        && typeof entry.candidateId === "string" && entry.candidateId.trim()
        && typeof entry.recordId === "string" && entry.recordId.trim()
        && ["add", "merge"].includes(entry.action) && [...Object.keys(specs), "skill"].includes(entry.category))) {
      fail("invalid-batch", "Completed import report is missing, invalid or ambiguous.");
    }
    return report;
  }
  return null;
}

export function prepareApprovedImport(snapshot, { sessionId, expectedCareerRevision, careerRevision, now, createId }) {
  if (careerRevision !== expectedCareerRevision) fail("stale-review", "Career data changed since review.",
    { expectedCareerRevision, actualCareerRevision: careerRevision });
  const sessions = snapshot.import.sessions.filter((item) => item?.id === sessionId);
  if (sessions.length !== 1 || !validateImportSession(sessions[0]).valid) fail("invalid-session", "Import session is missing, ambiguous or invalid.");
  const session = sessions[0];
  if (session.status !== "review_in_progress") fail("invalid-session", "Import session is not in review.");
  const timestamp = now();
  if (!isUtcTimestamp(timestamp) || timestamp < session.lastActivityAt) fail("invalid-time", "Invalid import timestamp.");
  if (timestamp >= session.expiresAt) fail("expired", "Import approval has expired.");
  const candidates = new Map();
  for (const candidate of session.candidates) {
    if (candidates.has(candidate.id)) fail("invalid-session", "Duplicate candidate ID.");
    candidates.set(candidate.id, candidate);
  }
  const decisions = new Map();
  for (const decision of session.reviewDecisions) {
    if (decisions.has(decision.candidateId) || !candidates.has(decision.candidateId)) fail("invalid-session", "Invalid or duplicate decision.");
    decisions.set(decision.candidateId, decision);
  }
  const approved = [];
  const skipped = [];
  for (const candidate of session.candidates) {
    const decision = decisions.get(candidate.id);
    if (candidate.reviewStatus === "pending") {
      if (decision) fail("invalid-session", "Pending candidate has a decision.");
      fail("pending-review", "All candidates must be reviewed before import.");
    }
    if (!decision || ({ accepted: "add", merged: "merge", rejected: "skip" })[candidate.reviewStatus] !== decision.action) {
      fail("invalid-session", "Candidate and decision do not match.");
    }
    if (decision.action === "skip") { skipped.push(candidate.id); continue; }
    const matches = snapshot.import.approvalReceipts.filter((r) => r.sessionId === sessionId && r.candidateId === candidate.id);
    if (matches.length !== 1 || !validateApprovalReceipt(matches[0])) fail("stale-review", "Approval receipt is missing or invalid.");
    const receipt = matches[0];
    const reviewed = { category: candidate.category, reviewedData: candidate.reviewedData,
      validation: candidate.validation, fieldProvenance: candidate.fieldProvenance };
    if (!equal(receipt.reviewed, reviewed) || !equal(receipt.decision, decision)
      || receipt.careerRevision !== careerRevision || receipt.expiresAt !== session.expiresAt
      || receipt.approvedAt > session.lastActivityAt || timestamp < receipt.approvedAt) {
      fail("stale-review", "Approval receipt no longer matches the review.");
    }
    if (decision.action === "merge") {
      const current = targetFor(snapshot, receipt.target.category, receipt.target.id);
      if (!current || !equal(current, receipt.target.record)) fail("stale-review", "Merge target changed or was deleted.");
    }
    approved.push({ candidate, decision, receipt });
  }
  const ids = new Set([snapshot.profile, ...snapshot.employmentRecords, ...snapshot.achievementRecords,
    ...snapshot.educationRecords, ...snapshot.certificationRecords, ...snapshot.jobs, ...snapshot.requirements,
    ...snapshot.legacyRequirements, ...snapshot.achievementMappings].filter(Boolean).map((record) => record.id));
  const generated = new Map();
  for (const { candidate, decision } of approved) {
    if (decision.action !== "add" || candidate.category === "skill") continue;
    const id = createId();
    if (typeof id !== "string" || !id.trim() || ids.has(id)) fail("id-collision", "Generated record ID is invalid or already used.");
    ids.add(id);
    generated.set(candidate.id, id);
  }
  const results = [];
  const mergeChoices = new Map();
  const order = ["profile", "employment", "education", "certification", "achievement", "skill"];
  for (const category of order) {
    for (const { candidate, decision, receipt } of approved.filter((entry) => entry.candidate.category === category)) {
      const data = candidate.reviewedData;
      if (!data || typeof data !== "object" || Array.isArray(data)) fail("invalid-mapping", "Reviewed data must be an object.");
      if (category === "skill") {
        if (Object.keys(data).length !== 1 || typeof data.value !== "string" || !data.value.trim()) fail("invalid-mapping", "Invalid skill.");
        const profile = snapshot.profile;
        if (!profile || (decision.action === "merge" && profile.id !== decision.targetRecordId)) fail("invalid-mapping", "Skill requires the selected Profile.");
        if (decision.action === "merge" && (Object.keys(decision.fieldChoices).length !== 1 || !["existing", "reviewed"].includes(decision.fieldChoices.skills))) fail("invalid-mapping", "Skill merge requires a skills choice.");
        if (decision.action === "merge" && decision.fieldChoices.skills === "existing" && !receipt.target.record.skills.includes(data.value)) fail("invalid-mapping", "Existing skill does not match the approved target.");
        if (decision.action === "add" || decision.fieldChoices.skills === "reviewed") profile.skills.push(data.value);
        profile.provenance = [...(profile.provenance ?? []), ...provenance(candidate, [], true)];
        profile.updatedAt = timestamp;
        if (!validateCareerProfile(profile).valid) fail("invalid-mapping", "Invalid Profile.");
        results.push({ candidateId: candidate.id, action: decision.action, category, recordId: profile.id });
        continue;
      }
      const spec = specs[category];
      if (Object.keys(data).some((field) => !spec.fields.includes(field))) fail("invalid-mapping", "Unsupported reviewed field.");
      const input = { ...data };
      if (category === "achievement" && input.employmentId != null) {
        const reference = input.employmentId;
        const candidateRef = candidates.get(reference);
        const existing = snapshot.employmentRecords.filter((record) => record.id === reference);
        if (candidateRef && existing.length) fail("invalid-mapping", "Ambiguous Employment reference.");
        if (candidateRef) {
          const entry = approved.find((item) => item.candidate.id === reference && item.candidate.category === "employment");
          if (!entry) fail("invalid-mapping", "Employment candidate is not approved.");
          input.employmentId = entry.decision.action === "add" ? generated.get(reference) : entry.decision.targetRecordId;
        } else if (existing.length !== 1) fail("invalid-mapping", "Employment reference is missing.");
      }
      const source = provenance(candidate, spec.fields);
      let record;
      if (decision.action === "add") {
        if (category === "profile" && snapshot.profile) fail("invalid-mapping", "A Profile already exists.");
        record = spec.create({ ...input, provenance: source }, { id: generated.get(candidate.id), createdAt: timestamp });
        if (category === "profile") snapshot.profile = record;
        else snapshot[spec.collection].push(record);
      } else {
        record = targetFor(snapshot, category, decision.targetRecordId);
        if (!record) fail("stale-review", "Merge target is missing.");
        const previous = category === "achievement" ? { ...record } : null;
        for (const [field, choice] of Object.entries(decision.fieldChoices)) {
          if (!spec.fields.includes(field) || !Object.hasOwn(input, field)) fail("invalid-mapping", "Unsupported merge field.");
          const key = JSON.stringify([category, decision.targetRecordId, field]);
          const selected = choice === "reviewed" ? input[field] : receipt.target.record[field];
          if (mergeChoices.has(key) && !equal(mergeChoices.get(key), selected)) {
            fail("merge-conflict", "Approved merges select conflicting values for the same target field.");
          }
          mergeChoices.set(key, selected);
          if (choice === "reviewed") record[field] = input[field];
        }
        if (previous?.verificationStatus === "verified" && hasAchievementContentChanged(previous, record)) {
          record.verificationStatus = "unverified";
        }
        record.provenance = [...(record.provenance ?? []), ...source.map((item) =>
          decision.fieldChoices[item.fieldPath] === "reviewed" || equal(input[item.fieldPath], record[item.fieldPath])
            ? item : { ...item, associationStatus: item.associationStatus === "supports" ? "needs_review" : item.associationStatus })];
        record.updatedAt = timestamp;
        if (!spec.validate(record).valid) fail("invalid-mapping", "Merged record is invalid.");
      }
      results.push({ candidateId: candidate.id, action: decision.action, category, recordId: record.id });
    }
  }
  for (const { candidate, decision } of approved) {
    if (candidate.category === "skill" && decision.action === "merge"
      && decision.fieldChoices.skills === "existing"
      && !snapshot.profile.skills.includes(candidate.reviewedData.value)) {
      fail("merge-conflict", "An approved existing skill is absent from the final Profile.");
    }
  }
  const byCandidate = new Map(results.map((entry) => [entry.candidateId, entry]));
  for (const category of ["education", "certification"]) {
    const spec = specs[category];
    const seen = new Set();
    for (const record of snapshot[spec.collection]) {
      if (!spec.validate(record).valid || seen.has(record.id)) fail("invalid-mapping", "Existing career data is invalid.");
      seen.add(record.id);
    }
  }
  const report = { type: "approved-import-v1", sessionId, status: "completed", completedAt: timestamp,
    records: session.candidates.filter((candidate) => byCandidate.has(candidate.id)).map((candidate) => byCandidate.get(candidate.id)),
    skippedCandidateIds: skipped };
  session.status = "import_completed";
  session.lastActivityAt = timestamp;
  snapshot.import.approvalReceipts = snapshot.import.approvalReceipts.filter((r) => r.sessionId !== sessionId || !byCandidate.has(r.candidateId));
  snapshot.import.completedBatches.push({ type: "approved-import-v1", sessionId });
  snapshot.import.importReports.push(report);
  return { snapshot, result: report };
}
