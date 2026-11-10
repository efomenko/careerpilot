import { validateImportCandidate } from "./import-model.js";
import { isJsonCompatibleProvenance, isUtcTimestamp } from "./model-validation.js";
import { validateCareerProfile, validateEmploymentRecord } from "./career-model.js";
import { validateAchievementRecord } from "./achievement-model.js";
import { validateEducationRecord } from "./education-model.js";
import { validateCertificationRecord } from "./certification-model.js";

const fields = [
  "sessionId", "candidateId", "reviewed", "decision", "acknowledgedWarnings",
  "careerRevision", "approvedAt", "expiresAt", "target"
];
const reviewedFields = ["category", "reviewedData", "validation", "fieldProvenance"];
const targetValidators = {
  profile: validateCareerProfile,
  employment: validateEmploymentRecord,
  achievement: validateAchievementRecord,
  education: validateEducationRecord,
  certification: validateCertificationRecord
};

function exactFields(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === expected.length
    && expected.every((field) => Object.hasOwn(value, field));
}

function nonblank(value) {
  return typeof value === "string" && value.trim() !== "";
}

export function validateApprovalReceipt(receipt) {
  if (!isJsonCompatibleProvenance(receipt) || !exactFields(receipt, fields)) return false;
  const { candidateId, reviewed, decision, target } = receipt;
  if (!nonblank(receipt.sessionId) || !nonblank(candidateId)
    || !exactFields(reviewed, reviewedFields)) return false;
  const candidate = {
    id: candidateId,
    ...reviewed,
    originalData: null,
    reviewStatus: "pending",
    possibleDuplicates: []
  };
  if (!validateImportCandidate(candidate).valid
    || !Number.isSafeInteger(receipt.careerRevision) || receipt.careerRevision < 0
    || typeof receipt.acknowledgedWarnings !== "boolean"
    || !isUtcTimestamp(receipt.approvedAt) || !isUtcTimestamp(receipt.expiresAt)
    || receipt.approvedAt >= receipt.expiresAt
    || reviewed.validation.status === "invalid"
    || (reviewed.validation.status === "warning" && !receipt.acknowledgedWarnings)) return false;
  if (!decision || decision.candidateId !== candidateId) return false;
  if (decision.action === "add") {
    return exactFields(decision, ["candidateId", "action"])
      && target === null;
  }
  if (decision.action !== "merge"
    || !exactFields(decision, ["candidateId", "action", "targetRecordId", "fieldChoices"])
    || !nonblank(decision.targetRecordId)
    || !decision.fieldChoices || typeof decision.fieldChoices !== "object"
    || Array.isArray(decision.fieldChoices)
    || !Object.entries(decision.fieldChoices).every(([key, value]) =>
      nonblank(key) && ["existing", "reviewed"].includes(value))) return false;
  return exactFields(target, ["category", "id", "record"])
    && target.category === (reviewed.category === "skill" ? "profile" : reviewed.category)
    && target.id === decision.targetRecordId && nonblank(target.id)
    && target.record !== null && typeof target.record === "object" && !Array.isArray(target.record)
    && target.record.id === target.id && targetValidators[target.category](target.record).valid;
}
