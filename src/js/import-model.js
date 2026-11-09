import { isUtcTimestamp } from "./model-validation.js";
import { validateProvenanceRecord } from "./provenance-model.js";

const categories = ["profile", "employment", "education", "certification", "skill", "achievement"];
const sessionStatuses = ["processing", "ready_for_review", "review_in_progress", "import_completed", "failed", "expired"];
const sessionFields = ["id", "status", "sourceDocument", "createdAt", "expiresAt", "lastActivityAt",
  "currentCategory", "candidates", "reviewDecisions", "processingAttempts"];
const sourceFields = ["id", "fileName", "mimeType", "language", "uploadedAt", "deleteBy", "status"];
const candidateFields = ["id", "category", "originalData", "reviewedData", "fieldProvenance",
  "validation", "reviewStatus", "possibleDuplicates"];
const sevenDays = 7 * 24 * 60 * 60 * 1000;
const oneDay = 24 * 60 * 60 * 1000;
const inspectionErrors = new WeakSet();

class InspectionError extends Error {
  constructor(field, message) {
    super(message);
    this.field = field;
    inspectionErrors.add(this);
  }
}

function copyValue(value, path, active) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)
    && (!Number.isInteger(value) || Number.isSafeInteger(value))) return value;
  if (typeof value !== "object" || active.has(value)) {
    throw new InspectionError(path, "Must be an acyclic JSON-compatible value.");
  }
  active.add(value);
  try {
    const array = Array.isArray(value);
    const proto = Object.getPrototypeOf(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
      throw new InspectionError(path, "Must use a plain object or array.");
    }
    const keys = Reflect.ownKeys(value);
    const length = array ? Object.getOwnPropertyDescriptor(value, "length")?.value : 0;
    if (array && (!Number.isSafeInteger(length) || keys.length !== length + 1)) {
      throw new InspectionError(path, "Must be a dense array without extra properties.");
    }
    const result = array ? new Array(length) : Object.create(proto);
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string" || (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) {
        throw new InspectionError(path, "Contains an unsupported property.");
      }
      const childPath = array ? `${path}[${key}]` : path === "record" ? key : `${path}.${key}`;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new InspectionError(childPath, "Must be an enumerable data property.");
      }
      Object.defineProperty(result, key, {
        value: copyValue(descriptor.value, childPath, active), enumerable: true, writable: true, configurable: true
      });
    }
    return result;
  } catch (error) {
    if (error !== null && (typeof error === "object" || typeof error === "function") && inspectionErrors.has(error)) {
      throw error;
    }
    throw new InspectionError(path, "Could not be inspected safely.");
  } finally {
    active.delete(value);
  }
}

function error(errors, path, message) {
  errors.push({ field: path, message });
}

function object(value, path, fields, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    error(errors, path, "Must be an object.");
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) error(errors, `${path}.${key}`.replace(/^record\./, ""), "Unknown field.");
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) error(errors, `${path}.${field}`.replace(/^record\./, ""), "This field is required.");
  }
  return true;
}

function text(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") error(errors, path, "Must be a non-blank string.");
}

function choice(value, options, path, errors) {
  if (!options.includes(value)) error(errors, path, `Must be one of: ${options.join(", ")}.`);
}

function timestamp(value, path, errors) {
  if (!isUtcTimestamp(value)) error(errors, path, "Must be a valid ISO 8601 UTC timestamp.");
}

function array(value, path, errors, visit) {
  if (!Array.isArray(value)) {
    error(errors, path, "Must be an array.");
    return;
  }
  value.forEach((item, index) => visit(item, `${path}[${index}]`, errors));
}

function source(value, path, errors) {
  if (!object(value, path, sourceFields, errors)) return;
  const field = (name) => path === "record" ? name : `${path}.${name}`;
  for (const name of ["id", "fileName", "mimeType", "status"]) text(value[name], field(name), errors);
  choice(value.language, ["en", "ru"], field("language"), errors);
  for (const name of ["uploadedAt", "deleteBy"]) timestamp(value[name], field(name), errors);
  if (isUtcTimestamp(value.uploadedAt) && isUtcTimestamp(value.deleteBy)) {
    const elapsed = Date.parse(value.deleteBy) - Date.parse(value.uploadedAt);
    if (elapsed < 0 || elapsed > oneDay) error(errors, field("deleteBy"), "Must be between upload and 24 hours after upload.");
  }
}

function finding(value, path, errors) {
  if (!object(value, path, ["code", "message"], errors)) return;
  text(value.code, `${path}.code`, errors);
  text(value.message, `${path}.message`, errors);
}

function duplicate(value, path, errors) {
  if (!object(value, path, ["targetRecordId", "similaritySignals", "matchLevel"], errors)) return;
  text(value.targetRecordId, `${path}.targetRecordId`, errors);
  array(value.similaritySignals, `${path}.similaritySignals`, errors, (signal, signalPath, target) => text(signal, signalPath, target));
  if (Array.isArray(value.similaritySignals) && value.similaritySignals.length === 0) {
    error(errors, `${path}.similaritySignals`, "At least one similarity signal is required.");
  }
  choice(value.matchLevel, ["possible", "strong"], `${path}.matchLevel`, errors);
}

function candidate(value, path, errors) {
  if (!object(value, path, candidateFields, errors)) return;
  const field = (name) => path === "record" ? name : `${path}.${name}`;
  text(value.id, field("id"), errors);
  choice(value.category, categories, field("category"), errors);
  choice(value.reviewStatus, ["pending", "accepted", "rejected", "merged"], field("reviewStatus"), errors);
  const provenance = value.fieldProvenance;
  if (provenance === null || typeof provenance !== "object" || Array.isArray(provenance)) {
    error(errors, field("fieldProvenance"), "Must be an object mapping field paths to provenance arrays.");
  } else {
    for (const [key, items] of Object.entries(provenance)) {
      const group = `${field("fieldProvenance")}.${key}`;
      text(key, group, errors);
      array(items, group, errors, (item, itemPath, target) => {
        const result = validateProvenanceRecord(item);
        for (const issue of result.errors) {
          error(target, issue.field === "record" ? itemPath : `${itemPath}.${issue.field}`, issue.message);
        }
        if (result.valid && item.fieldPath !== key) error(target, `${itemPath}.fieldPath`, "Must match the provenance group field path.");
      });
    }
  }
  const validation = value.validation;
  if (object(validation, field("validation"), ["status", "errors", "warnings"], errors)) {
    choice(validation.status, ["valid", "warning", "invalid"], `${field("validation")}.status`, errors);
    array(validation.errors, `${field("validation")}.errors`, errors, finding);
    array(validation.warnings, `${field("validation")}.warnings`, errors, finding);
    if (Array.isArray(validation.errors) && Array.isArray(validation.warnings)) {
      const expectedStatus = validation.errors.length > 0
        ? "invalid"
        : validation.warnings.length > 0 ? "warning" : "valid";
      if (validation.status !== expectedStatus) {
        error(errors, `${field("validation")}.status`, `Findings require ${expectedStatus} status.`);
      }
    }
    if (validation.status === "invalid" && ["accepted", "merged"].includes(value.reviewStatus)) {
      error(errors, field("reviewStatus"), "Invalid candidates cannot be accepted or merged.");
    }
  }
  array(value.possibleDuplicates, field("possibleDuplicates"), errors, duplicate);
}

function decision(value, path, errors) {
  const isMerge = value !== null && typeof value === "object" && !Array.isArray(value) && value.action === "merge";
  const fields = isMerge ? ["candidateId", "action", "targetRecordId", "fieldChoices"] : ["candidateId", "action"];
  if (!object(value, path, fields, errors)) return;
  text(value.candidateId, `${path}.candidateId`, errors);
  choice(value.action, ["add", "merge", "skip"], `${path}.action`, errors);
  if (isMerge) {
    text(value.targetRecordId, `${path}.targetRecordId`, errors);
    if (value.fieldChoices === null || typeof value.fieldChoices !== "object" || Array.isArray(value.fieldChoices)) {
      error(errors, `${path}.fieldChoices`, "Must be an object mapping field paths to conflict choices.");
    } else {
      for (const [fieldPath, selection] of Object.entries(value.fieldChoices)) {
        const choicePath = `${path}.fieldChoices.${fieldPath}`;
        text(fieldPath, choicePath, errors);
        choice(selection, ["existing", "reviewed"], choicePath, errors);
      }
    }
  }
}

function session(value, path, errors) {
  if (!object(value, path, sessionFields, errors)) return;
  const field = (name) => path === "record" ? name : `${path}.${name}`;
  text(value.id, field("id"), errors);
  choice(value.status, sessionStatuses, field("status"), errors);
  source(value.sourceDocument, field("sourceDocument"), errors);
  for (const name of ["createdAt", "expiresAt", "lastActivityAt"]) timestamp(value[name], field(name), errors);
  if (isUtcTimestamp(value.createdAt) && isUtcTimestamp(value.expiresAt)
    && Date.parse(value.expiresAt) - Date.parse(value.createdAt) !== sevenDays) {
    error(errors, field("expiresAt"), "Must be exactly seven days after createdAt.");
  }
  if (isUtcTimestamp(value.createdAt) && isUtcTimestamp(value.lastActivityAt)
    && Date.parse(value.lastActivityAt) < Date.parse(value.createdAt)) {
    error(errors, field("lastActivityAt"), "Must not precede createdAt.");
  }
  if (value.currentCategory !== null) choice(value.currentCategory, categories, field("currentCategory"), errors);
  array(value.candidates, field("candidates"), errors, candidate);
  array(value.reviewDecisions, field("reviewDecisions"), errors, decision);
  array(value.processingAttempts, field("processingAttempts"), errors, (attempt, attemptPath, target) => {
    if (attempt === null || typeof attempt !== "object" || Array.isArray(attempt)) {
      error(target, attemptPath, "Must be a JSON-compatible object.");
    }
  });
}

function inspect(value, check) {
  let detached;
  try {
    detached = copyValue(value, "record", new WeakSet());
  } catch (issue) {
    return { valid: false, errors: [{ field: issue.field, message: issue.message }], detached: null };
  }
  const errors = [];
  check(detached, "record", errors);
  return { valid: errors.length === 0, errors, detached };
}

function validate(value, check) {
  const { valid, errors } = inspect(value, check);
  return { valid, errors };
}

function freezeOriginal(value) {
  if (value === null || typeof value !== "object") return;
  for (const item of Object.values(value)) freezeOriginal(item);
  Object.freeze(value);
}

function protectOriginal(record) {
  freezeOriginal(record.originalData);
  Object.defineProperty(record, "originalData", {
    value: record.originalData, enumerable: true, writable: false, configurable: false
  });
}

function construct(value, check, name) {
  const result = inspect(value, check);
  if (!result.valid) {
    const exception = new TypeError(`Cannot create ${name}: record is invalid.`);
    exception.errors = result.errors;
    throw exception;
  }
  if (check === candidate) protectOriginal(result.detached);
  if (check === session) for (const item of result.detached.candidates) protectOriginal(item);
  return result.detached;
}

export function validateImportSession(value) { return validate(value, session); }
export function createImportSession(value) { return construct(value, session, "Import session"); }
export function validateSourceDocument(value) { return validate(value, source); }
export function createSourceDocument(value) { return construct(value, source, "Source document"); }
export function validateImportCandidate(value) { return validate(value, candidate); }
export function createImportCandidate(value) { return construct(value, candidate, "Import candidate"); }
