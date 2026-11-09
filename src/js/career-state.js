import {
  createCareerProfile,
  createEmploymentRecord,
  validateCareerProfile,
  validateEmploymentRecord
} from "./career-model.js";
import {
  createAchievementRecord,
  validateAchievementRecord
} from "./achievement-model.js";
import { validateJobRecord } from "./job-model.js";
import { validateRequirementRecord } from "./requirement-model.js";
import { validateAchievementMappingRecord } from "./achievement-mapping-model.js";
import { calculateJobFitAssessment as calculateFitAssessment } from "./fit-assessment-helpers.js";
import { createImportSession, createImportCandidate, validateImportSession } from "./import-model.js";
import { isUtcTimestamp } from "./model-validation.js";

function copyProfile(profile) {
  return profile ? copyNestedData(profile) : null;
}

function copyEmploymentRecord(record) {
  return copyNestedData(record);
}

function copyNestedData(value) {
  return copySnapshotValue(value);
}

function copyAchievementRecord(record) {
  return copyNestedData(record);
}

function copyJobRecord(record) {
  return copyNestedData(record);
}

function copySnapshotValue(value, path = "snapshot", active = new WeakSet()) {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)
    && (!Object.is(value, -0) || path.startsWith("snapshot.legacyRequirements["))
    && (!Number.isInteger(value) || Number.isSafeInteger(value))) {
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains a value that cannot be faithfully represented in JSON.`);
  }
  if (active.has(value)) {
    throw new TypeError(`${path} contains a cyclic reference.`);
  }

  active.add(value);

  let isArray;
  let prototype;
  let keys;
  try {
    isArray = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    keys = Reflect.ownKeys(value);
  } catch {
    throw new TypeError(`${path} could not be inspected safely.`);
  }

  if (isArray) {
    if (prototype !== Array.prototype) {
      throw new TypeError(`${path} contains an array with an unsupported prototype.`);
    }

    let length;
    try {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      length = lengthDescriptor?.value;
    } catch {
      throw new TypeError(`${path} array length could not be inspected safely.`);
    }
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new TypeError(`${path} has an invalid array length.`);
    }

    const copy = new Array(length);
    if (keys.length !== length + 1) {
      throw new TypeError(`${path} must be a dense array without extra properties.`);
    }
    for (const key of keys) {
      if (key === "length") {
        continue;
      }
      if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) {
        throw new TypeError(`${path} contains an unsupported array property.`);
      }

      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        throw new TypeError(`${path}[${key}] could not be inspected safely.`);
      }
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index >= length) {
        throw new TypeError(`${path} contains an unsupported array property.`);
      }
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${path}[${key}] must be an enumerable data property.`);
      }
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: copySnapshotValue(descriptor.value, `${path}[${key}]`, active)
      });
    }
    active.delete(value);
    return copy;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} contains an object with an unsupported prototype.`);
  }

  const copy = Object.create(prototype);
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new TypeError(`${path} contains an unsupported symbol-keyed property.`);
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      throw new TypeError(`${path}.${key} could not be inspected safely.`);
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${path}.${key} must be an enumerable data property.`);
    }
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: copySnapshotValue(descriptor.value, `${path}.${key}`, active)
    });
  }
  active.delete(value);
  return copy;
}

function validateRecordWithProvenance(record, validator) {
  const result = validator(record);
  if (validator === validateAchievementRecord && result.valid) {
    const visit = (value) => {
      if (value === null || typeof value !== "object") {
        return true;
      }
      if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
        return false;
      }
      return Object.values(value).every(visit);
    };
    if (!visit(record.evidence)) {
      return { valid: false, errors: [{ field: "evidence", message: "Evidence objects must be ordinary plain objects." }] };
    }
  }
  return result;
}

function constructRecord(input, metadata, constructor) {
  return constructor(copyNestedData(input), metadata);
}

function prepareSnapshotCopy(snapshot) {
  let prototype;
  let keys;
  let isArray;
  try {
    isArray = Array.isArray(snapshot);
    prototype = Object.getPrototypeOf(snapshot);
    keys = Reflect.ownKeys(snapshot);
  } catch {
    throw new TypeError("Snapshot could not be inspected safely.");
  }

  if (
    snapshot === null
    || typeof snapshot !== "object"
    || isArray
    || (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError("Snapshot must be a plain object.");
  }

  const expectedFields = [
    "profile",
    "employmentRecords",
    "achievementRecords",
    "jobs",
    "requirements",
    "legacyRequirements",
    "achievementMappings",
    "educationRecords",
    "certificationRecords",
    "import"
  ];
  const v4Fields = ["educationRecords", "certificationRecords", "import"];
  const isV4 = v4Fields.some((field) => keys.includes(field));
  const requiredFields = isV4
    ? expectedFields
    : ["profile", "employmentRecords", "achievementRecords"];
  for (const key of keys) {
    if (typeof key !== "string" || !expectedFields.includes(key)) {
      throw new TypeError(`Snapshot contains unexpected property "${String(key)}".`);
    }
  }
  const normalizedSnapshot = {};
  for (const field of expectedFields) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(snapshot, field);
    } catch {
      throw new TypeError(`Snapshot property "${field}" could not be inspected safely.`);
    }
    if (!descriptor && !requiredFields.includes(field)) {
      normalizedSnapshot[field] = field === "import"
        ? { sessions: [], completedBatches: [], importReports: [] }
        : [];
      continue;
    }
    if (!descriptor) {
      throw new TypeError(`Snapshot is missing required property "${field}".`);
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`Snapshot property "${field}" must be an enumerable data property.`);
    }
    normalizedSnapshot[field] = descriptor.value;
  }

  return { snapshot: copySnapshotValue(normalizedSnapshot), isV4 };
}

function validateSnapshotRecords(snapshot, isV4) {
  const errors = [];
  if (snapshot.profile !== null) {
    const result = validateRecordWithProvenance(snapshot.profile, validateCareerProfile);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => ({
        ...error,
        recordType: "profile",
        recordId: snapshot.profile?.id
      })));
    }
  }

  if (!Array.isArray(snapshot.employmentRecords)) {
    errors.push({
      field: "employmentRecords",
      message: "Employment records must be an array.",
      recordType: "employment"
    });
  } else {
    const employmentIds = new Set();
    snapshot.employmentRecords.forEach((record, index) => {
      const result = validateRecordWithProvenance(record, validateEmploymentRecord);
      if (!result.valid) {
        errors.push(...result.errors.map((error) => ({
          ...error,
          field: `employmentRecords[${index}].${error.field}`,
          recordType: "employment",
          recordId: record?.id
        })));
      }
      if (isV4 && record && typeof record === "object") {
        for (const field of ["startDate", "endDate"]) {
          if (typeof record[field] === "string") {
            errors.push({
              field: `employmentRecords[${index}].${field}`,
              message: "Must be null or a valid structured date.",
              recordType: "employment",
              recordId: record.id
            });
          }
        }
      }
      if (record && typeof record.id === "string") {
        if (employmentIds.has(record.id)) {
          errors.push({
            field: `employmentRecords[${index}].id`,
            message: `Duplicate Employment History ID "${record.id}".`,
            recordType: "employment",
            recordId: record.id
          });
        } else {
          employmentIds.add(record.id);
        }
      }
    });
  }

  if (!Array.isArray(snapshot.achievementRecords)) {
    errors.push({
      field: "achievementRecords",
      message: "Achievement records must be an array.",
      recordType: "achievement"
    });
  } else {
    const achievementIds = new Set();
    snapshot.achievementRecords.forEach((record, index) => {
      const result = validateRecordWithProvenance(record, validateAchievementRecord);
      if (!result.valid) {
        errors.push(...result.errors.map((error) => ({
          ...error,
          field: `achievementRecords[${index}].${error.field}`,
          recordType: "achievement",
          recordId: record?.id
        })));
      }
      if (record && typeof record.id === "string") {
        if (achievementIds.has(record.id)) {
          errors.push({
            field: `achievementRecords[${index}].id`,
            message: `Duplicate Achievement ID "${record.id}".`,
            recordType: "achievement",
            recordId: record.id
          });
        } else {
          achievementIds.add(record.id);
        }
      }
    });
  }

  if (Array.isArray(snapshot.employmentRecords) && Array.isArray(snapshot.achievementRecords)) {
    const employmentIds = new Set(
      snapshot.employmentRecords
        .filter((record) => record && typeof record.id === "string")
        .map((record) => record.id)
    );
    snapshot.achievementRecords.forEach((record, index) => {
      if (
        record
        && record.employmentId !== null
        && typeof record.employmentId === "string"
        && !employmentIds.has(record.employmentId)
      ) {
        errors.push({
          field: `achievementRecords[${index}].employmentId`,
          message: `Employment History record "${record.employmentId}" does not exist.`,
          recordType: "achievement",
          recordId: record.id
        });
      }
    });
  }

  if (!Array.isArray(snapshot.jobs)) {
    errors.push({
      field: "jobs",
      message: "Jobs must be an array.",
      recordType: "job"
    });
  } else {
    const jobIds = new Set();
    snapshot.jobs.forEach((record, index) => {
      const result = validateJobRecord(record);
      if (!result.valid) {
        errors.push(...result.errors.map((error) => ({
          ...error,
          field: `jobs[${index}].${error.field}`,
          recordType: "job",
          recordId: record?.id
        })));
      }
      if (record && typeof record.id === "string") {
        if (jobIds.has(record.id)) {
          errors.push({
            field: `jobs[${index}].id`,
            message: `Duplicate Job ID "${record.id}".`,
            recordType: "job",
            recordId: record.id
          });
        } else {
          jobIds.add(record.id);
        }
      }
    });
  }

  for (const [field, recordType] of [
    ["requirements", "requirement"],
    ["achievementMappings", "achievement mapping"]
  ]) {
    if (!Array.isArray(snapshot[field])) {
      errors.push({
        field,
        message: `${recordType === "requirement" ? "Requirements" : "Achievement mappings"} must be an array.`,
        recordType
      });
      continue;
    }

    const recordIds = new Set();
    snapshot[field].forEach((record, index) => {
      if (!isPlainObject(record)) {
        errors.push({
          field: `${field}[${index}]`,
          message: `Each ${recordType} must be a plain object.`,
          recordType
        });
      } else if (field === "requirements") {
        const result = validateRequirementRecord(record);
        if (!result.valid) {
          errors.push(...result.errors.map((error) => ({
            ...error,
            field: `requirements[${index}].${error.field}`,
            recordType,
            recordId: record.id
          })));
        }
        if (typeof record.id === "string") {
          if (recordIds.has(record.id)) {
            errors.push({
              field: `requirements[${index}].id`,
              message: `Duplicate requirement ID "${record.id}".`,
              recordType,
              recordId: record.id
            });
          }
          recordIds.add(record.id);
        }
        if (result.valid && Array.isArray(snapshot.jobs)
          && !snapshot.jobs.some((job) => job?.id === record.jobId)) {
          errors.push({
            field: `requirements[${index}].jobId`,
            message: `Job "${record.jobId}" does not exist.`,
            recordType,
            recordId: record.id
          });
        }
      }
    });
  }

  if (!Array.isArray(snapshot.legacyRequirements)) {
    errors.push({
      field: "legacyRequirements",
      message: "Legacy Requirements must be an array.",
      recordType: "legacy requirement"
    });
  }

  for (const field of ["educationRecords", "certificationRecords"]) {
    if (!Array.isArray(snapshot[field])) {
      errors.push({ field, message: "Must be an array." });
    }
  }

  const importFields = ["sessions", "completedBatches", "importReports"];
  if (!isPlainObject(snapshot.import)) {
    errors.push({ field: "import", message: "Must be a plain object." });
  } else {
    for (const field of Object.keys(snapshot.import)) {
      if (!importFields.includes(field)) {
        errors.push({ field: `import.${field}`, message: "Unexpected property." });
      }
    }
    for (const field of importFields) {
      if (!Object.hasOwn(snapshot.import, field) || !Array.isArray(snapshot.import[field])) {
        errors.push({ field: `import.${field}`, message: "Must be an array." });
      }
    }
  }

  if (errors.length > 0) {
    const message = !isV4 && errors.some((entry) => entry.recordType === "requirement")
      ? "Career snapshot is invalid. Direct legacy snapshots require valid, linked Requirements; use storage migration for versioned data."
      : "Career snapshot is invalid.";
    const error = new TypeError(message);
    error.errors = errors;
    throw error;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function areValuesEqual(first, second, comparedPairs = new WeakMap()) {
  if (Object.is(first, second)) {
    return true;
  }

  if (Array.isArray(first) || Array.isArray(second)) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
      return false;
    }

    let comparedValues = comparedPairs.get(first);
    if (comparedValues?.has(second)) {
      return true;
    }
    if (!comparedValues) {
      comparedValues = new WeakSet();
      comparedPairs.set(first, comparedValues);
    }
    comparedValues.add(second);

    for (let index = 0; index < first.length; index += 1) {
      const firstHasValue = Object.hasOwn(first, index);
      if (firstHasValue !== Object.hasOwn(second, index)) {
        return false;
      }
      if (firstHasValue && !areValuesEqual(first[index], second[index], comparedPairs)) {
        return false;
      }
    }
    return true;
  }

  if (!isPlainObject(first) || !isPlainObject(second)) {
    return false;
  }

  let comparedValues = comparedPairs.get(first);
  if (comparedValues?.has(second)) {
    return true;
  }
  if (!comparedValues) {
    comparedValues = new WeakSet();
    comparedPairs.set(first, comparedValues);
  }
  comparedValues.add(second);

  const firstKeys = Reflect.ownKeys(first);
  const secondKeys = Reflect.ownKeys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  for (const key of firstKeys) {
    if (!Object.hasOwn(second, key)
      || !areValuesEqual(first[key], second[key], comparedPairs)) {
      return false;
    }
  }
  return true;
}

const achievementContentFields = [
  "title",
  "context",
  "contribution",
  "actions",
  "outcome",
  "potentialImpact",
  "metrics",
  "evidence",
  "employmentId"
];

function hasAchievementContentChanged(existingRecord, updatedRecord) {
  return achievementContentFields.some((field) =>
    !areValuesEqual(existingRecord[field], updatedRecord[field])
  );
}

function throwValidationError(recordName, errors) {
  const details = errors.map(({ field, message }) => `${field}: ${message}`).join(" ");
  const error = new TypeError(`${recordName} is invalid. ${details}`);
  error.errors = errors;
  throw error;
}

function throwJobValidationError(recordName, errors) {
  const details = errors.map(({ field, message }) => `${field}: ${message}`).join(" ");
  const error = new TypeError(`${recordName} is invalid. ${details}`);
  error.code = "VALIDATION_ERROR";
  error.errors = errors;
  throw error;
}

function createJobStateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateRecord(record, validator, recordName) {
  const result = validateRecordWithProvenance(record, validator);

  if (!result.valid) {
    throwValidationError(recordName, result.errors);
  }
}

function assertEditableInput(input, reservedFields, recordName) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError(`${recordName} updates require an object of record fields.`);
  }

  const suppliedReservedField = reservedFields.find((field) =>
    Object.hasOwn(input, field)
  );

  if (suppliedReservedField) {
    throw new TypeError(`${recordName} updates cannot change ${suppliedReservedField}.`);
  }
}

/**
 * Creates an isolated, in-memory CareerPilot state.
 * Direct unversioned snapshots must already contain v4-valid Requirements;
 * versioned historical data should be migrated by career-storage instead.
 *
 * Returned API:
 * - createProfile(input, metadata): create the single profile using
 *   `{ id, createdAt }` supplied by the caller.
 * - updateProfile(input, updatedAt): update all profile fields while preserving
 *   its ID and creation timestamp.
 * - addEmploymentRecord(input, metadata): add a record using caller-supplied
 *   `{ id, createdAt }`.
 * - updateEmploymentRecord(id, input, updatedAt): update all record fields
 *   while preserving its ID and creation timestamp.
 * - deleteEmploymentRecord(id): remove a record by ID.
 * - addAchievementRecord(input, metadata): add a record using caller-supplied
 *   `{ id, createdAt }`, and validate any employment link.
 * - updateAchievementRecord(id, input, updatedAt): update all record fields
 *   while preserving its ID and creation timestamp.
 * - updateAchievementVerificationStatus(id, status, updatedAt): deliberately
 *   update verification status while preserving the record content.
 * - deleteAchievementRecord(id): remove a record by ID.
 * - createJob(job): add a complete Job record.
 * - updateJob(id, updates): partially update a Job with caller-supplied updatedAt.
 * - archiveJob(id, updatedAt) / reactivateJob(id, updatedAt): change Job status.
 * - deleteJob(id): remove a Job and its requirements and achievement mappings.
 * - createRequirement(record): add a complete Requirement for an existing Job.
 * - updateRequirement(id, updates): partially update a Requirement while
 *   preserving its ID, Job, and creation timestamp.
 * - deleteRequirement(id): remove a Requirement and its achievement mappings.
 * - createAchievementMapping(record): add a mapping for an existing Requirement
 *   and Achievement, rejecting duplicate IDs and Requirement-Achievement pairs.
 * - deleteAchievementMapping(id): remove a mapping by ID.
 * - getProfile(): return a safe profile copy, or null when absent.
 * - getEmploymentRecords(): return a new array containing safe record copies.
 * - getAchievementRecords(): return a new array containing safe record copies.
 * - getJobs(): return a new array containing safe Job copies.
 * - getRequirements(jobId): return safe Requirement copies in insertion order.
 * - calculateJobFitAssessment(jobId): calculate a fresh assessment from
 *   current Requirements, mappings, and Achievements for an existing Job.
 * - getAchievementMappingsForRequirement(requirementId): return safe mapping
 *   copies in insertion order.
 * - getAchievementMappingsForAchievement(achievementId): return safe mapping
 *   copies in insertion order.
 *
 * Invalid records throw TypeError; unknown IDs and duplicate IDs throw Error.
 * No browser APIs, persistence, clock, or ID generation are used.
 */
export function createCareerState({ onMutation, onMutationError } = {}) {
  if (onMutation !== undefined && typeof onMutation !== "function") {
    throw new TypeError("onMutation must be a function.");
  }
  if (onMutationError !== undefined && typeof onMutationError !== "function") {
    throw new TypeError("onMutationError must be a function.");
  }

  let profile = null;
  let employmentRecords = [];
  let achievementRecords = [];
  let jobs = [];
  let requirements = [];
  let legacyRequirements = [];
  let achievementMappings = [];
  let educationRecords = [];
  let certificationRecords = [];
  let importData = { sessions: [], completedBatches: [], importReports: [] };
  let isFresh = true;

  function reportMutationError(error) {
    if (onMutationError) {
      try {
        onMutationError(error);
        return;
      } catch (handlerError) {
        try {
          console.error("Career state mutation error handler failed.", handlerError, error);
        } catch {
          // The committed mutation result must not be changed by error reporting.
        }
        return;
      }
    }

    try {
      console.error("Career state mutation notification failed.", error);
    } catch {
      return;
    }
  }

  function notifyMutation() {
    isFresh = false;
    if (!onMutation) {
      return;
    }

    try {
      onMutation(() => state.getSnapshot());
    } catch (error) {
      reportMutationError(error);
    }
  }

  function assertEmploymentLinkExists(record) {
    if (
      record.employmentId !== null
      && !employmentRecords.some((employment) => employment.id === record.employmentId)
    ) {
      throw new Error(
        `Employment History record "${record.employmentId}" does not exist.`
      );
    }
  }

  function importSessionIndex(id) {
    const matches = [];
    for (let index = 0; index < importData.sessions.length; index += 1) {
      if (importData.sessions[index]?.id === id) matches.push(index);
    }
    if (matches.length !== 1) throw new Error(`Import session "${id}" is missing or ambiguous.`);
    const record = importData.sessions[matches[0]];
    const result = validateImportSession(record);
    if (!result.valid) throwValidationError("Import session", result.errors);
    return matches[0];
  }

  function importTime(record, at, expiring = false) {
    if (!isUtcTimestamp(at) || at < record.lastActivityAt) {
      throw new TypeError("Import activity must use a valid UTC timestamp not earlier than lastActivityAt.");
    }
    if (record.status === "expired" || record.status === "import_completed") {
      throw new Error("This import session is not editable.");
    }
    if (expiring ? at < record.expiresAt : at >= record.expiresAt) {
      throw new Error(expiring ? "The import session has not expired." : "The import session has expired.");
    }
  }

  function updateImportSession(index, replacement) {
    const result = validateImportSession(replacement);
    if (!result.valid) throwValidationError("Import session", result.errors);
    importData.sessions[index] = copyNestedData(replacement);
    const output = copyNestedData(importData.sessions[index]);
    notifyMutation();
    return output;
  }

  function candidateIndex(session, id) {
    const matches = session.candidates.map((item, index) => item.id === id ? index : -1).filter((index) => index >= 0);
    if (matches.length !== 1) throw new Error(`Import candidate "${id}" is missing or ambiguous.`);
    return matches[0];
  }

  function reviewField(data, path) {
    const segments = path.split(".");
    if (segments.some((part) => !part || /[\[\]\/]/.test(part))) {
      throw new Error(`Cannot resolve provenance field path "${path}".`);
    }
    let value = data;
    for (const part of segments) {
      if (value === null || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, part)) {
        return { present: false };
      }
      value = value[part];
    }
    return { present: true, value };
  }

  const state = {
    restoreSnapshot(snapshot) {
      if (!isFresh) {
        throw new Error("A Career snapshot can only be restored into a fresh state.");
      }

      const prepared = prepareSnapshotCopy(snapshot);
      const replacement = prepared.snapshot;
      validateSnapshotRecords(replacement, prepared.isV4);

      if (!prepared.isV4) {
        if (replacement.profile && !Object.hasOwn(replacement.profile, "provenance")) {
          replacement.profile = { ...replacement.profile, provenance: [] };
        }
        replacement.employmentRecords = replacement.employmentRecords.map((record) => ({
          ...record,
          startDate: typeof record.startDate === "string"
            ? { value: record.startDate, precision: "day" }
            : record.startDate,
          endDate: typeof record.endDate === "string"
            ? { value: record.endDate, precision: "day" }
            : record.endDate,
          ...(!Object.hasOwn(record, "provenance") ? { provenance: [] } : {})
        }));
        replacement.achievementRecords = replacement.achievementRecords.map((record) =>
          Object.hasOwn(record, "provenance") ? record : { ...record, provenance: [] }
        );
      }

      profile = replacement.profile;
      employmentRecords = replacement.employmentRecords;
      achievementRecords = replacement.achievementRecords;
      jobs = replacement.jobs.map(copyJobRecord);
      requirements = replacement.requirements;
      legacyRequirements = replacement.legacyRequirements;
      achievementMappings = replacement.achievementMappings;
      educationRecords = replacement.educationRecords;
      certificationRecords = replacement.certificationRecords;
      importData = replacement.import;
      isFresh = false;
    },

    getSnapshot() {
      return prepareSnapshotCopy({
        profile,
        employmentRecords,
        achievementRecords,
        jobs,
        requirements,
        legacyRequirements,
        achievementMappings,
        educationRecords,
        certificationRecords,
        import: importData
      }).snapshot;
    },

    getImportSessions() {
      return copyNestedData(importData.sessions);
    },

    getImportSession(id) {
      return copyNestedData(importData.sessions[importSessionIndex(id)]);
    },

    createImportSession(record) {
      const session = createImportSession(record);
      if (session.status !== "processing") throw new Error("New import sessions must be processing.");
      if (importData.sessions.some((item) => item?.id === session.id)) throw new Error("Duplicate import session ID.");
      if (new Set(session.candidates.map((item) => item.id)).size !== session.candidates.length) {
        throw new Error("Duplicate import candidate ID.");
      }
      if (session.candidates.some((item) => item.reviewStatus !== "pending") || session.reviewDecisions.length) {
        throw new Error("New import sessions cannot contain review decisions.");
      }
      importData.sessions.push(copyNestedData(session));
      const result = copyNestedData(session);
      notifyMutation();
      return result;
    },

    transitionImportSession(id, status, at) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at, status === "expired");
      const allowed = {
        processing: ["ready_for_review", "failed", "expired"],
        ready_for_review: ["review_in_progress", "expired"],
        review_in_progress: ["expired"],
        failed: ["expired"]
      };
      if (!allowed[session.status]?.includes(status)) throw new Error("Invalid import session transition.");
      return updateImportSession(index, { ...session, status, lastActivityAt: at });
    },

    retryImportSession(id, attempt, at) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at);
      if (session.status !== "failed") throw new Error("Only failed sessions can be retried.");
      const detached = copyNestedData(attempt);
      if (!isPlainObject(detached)) throw new TypeError("Processing attempt must be an object.");
      return updateImportSession(index, {
        ...session, status: "processing", lastActivityAt: at,
        processingAttempts: [...session.processingAttempts, detached]
      });
    },

    addImportCandidates(id, candidates, at) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at);
      if (session.status !== "processing") throw new Error("Candidates can only be added while processing.");
      if (!Array.isArray(candidates)) throw new TypeError("Candidates must be an array.");
      const additions = copyNestedData(candidates).map((item) => createImportCandidate(item));
      if (additions.some((item) => item.reviewStatus !== "pending")) throw new Error("New candidates must be pending.");
      const ids = [...session.candidates, ...additions].map((item) => item.id);
      if (new Set(ids).size !== ids.length) throw new Error("Duplicate import candidate ID.");
      return updateImportSession(index, {
        ...session, candidates: [...session.candidates, ...additions], lastActivityAt: at
      });
    },

    setImportCategory(id, category, at) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at);
      if (!["ready_for_review", "review_in_progress"].includes(session.status)) throw new Error("Session is not ready for review.");
      return updateImportSession(index, { ...session, currentCategory: category, lastActivityAt: at });
    },

    updateImportCandidate(id, candidateId, reviewedData, validation, at) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at);
      if (session.status !== "review_in_progress") throw new Error("Session is not in review.");
      const itemIndex = candidateIndex(session, candidateId);
      const current = session.candidates[itemIndex];
      const data = copyNestedData(reviewedData);
      const provenance = copyNestedData(current.fieldProvenance);
      for (const [path, items] of Object.entries(provenance)) {
        const before = reviewField(current.reviewedData, path);
        const after = reviewField(data, path);
        if (!areValuesEqual(before, after)) {
          for (const item of items) if (item.associationStatus === "supports") item.associationStatus = "needs_review";
        }
      }
      const updated = createImportCandidate({
        ...current, reviewedData: data, validation: copyNestedData(validation),
        fieldProvenance: provenance, reviewStatus: "pending"
      });
      const candidates = [...session.candidates];
      candidates[itemIndex] = updated;
      return updateImportSession(index, {
        ...session, candidates, reviewDecisions: session.reviewDecisions.filter((item) => item.candidateId !== candidateId),
        lastActivityAt: at
      });
    },

    decideImportCandidate(id, decision, at, { acknowledgeWarnings = false } = {}) {
      const index = importSessionIndex(id);
      const session = importData.sessions[index];
      importTime(session, at);
      if (session.status !== "review_in_progress") throw new Error("Session is not in review.");
      const detached = copyNestedData(decision);
      if (!isPlainObject(detached)) throw new TypeError("Review decision must be an object.");
      const itemIndex = candidateIndex(session, detached.candidateId);
      const item = session.candidates[itemIndex];
      if (["add", "merge"].includes(detached.action) && item.validation.status === "warning" && acknowledgeWarnings !== true) {
        throw new Error("Warnings must be acknowledged.");
      }
      const status = { add: "accepted", merge: "merged", skip: "rejected" }[detached.action];
      if (!status) throw new Error("Invalid review decision action.");
      const candidates = [...session.candidates];
      candidates[itemIndex] = createImportCandidate({ ...item, reviewStatus: status });
      const reviewDecisions = [...session.reviewDecisions.filter((entry) => entry.candidateId !== item.id), detached];
      return updateImportSession(index, { ...session, candidates, reviewDecisions, lastActivityAt: at });
    },

    createProfile(input, metadata) {
      if (profile) {
        throw new Error("A Career Profile already exists.");
      }

      const newProfile = constructRecord(input, metadata, createCareerProfile);
      validateRecord(newProfile, validateCareerProfile, "Career Profile");
      profile = copyProfile(newProfile);
      const result = copyProfile(profile);
      notifyMutation();
      return result;
    },

    updateProfile(input, updatedAt) {
      if (!profile) {
        throw new Error("A Career Profile does not exist.");
      }

      assertEditableInput(input, ["id", "createdAt", "updatedAt"], "Career Profile");
      input = copyNestedData(input);
      const updatedProfile = {
        ...input,
        id: profile.id,
        createdAt: profile.createdAt,
        updatedAt,
        ...(!Object.hasOwn(input, "provenance") && Object.hasOwn(profile, "provenance")
          ? { provenance: profile.provenance }
          : {})
      };
      validateRecord(updatedProfile, validateCareerProfile, "Career Profile");
      profile = copyProfile(updatedProfile);
      const result = copyProfile(profile);
      notifyMutation();
      return result;
    },

    addEmploymentRecord(input, metadata) {
      const newRecord = constructRecord(input, metadata, createEmploymentRecord);
      validateRecord(newRecord, validateEmploymentRecord, "Employment History record");

      if (employmentRecords.some((record) => record.id === newRecord.id)) {
        throw new Error(`An Employment History record with ID "${newRecord.id}" already exists.`);
      }

      employmentRecords.push(copyEmploymentRecord(newRecord));
      const result = copyEmploymentRecord(newRecord);
      notifyMutation();
      return result;
    },

    updateEmploymentRecord(id, input, updatedAt) {
      const recordIndex = employmentRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Employment History record "${id}" does not exist.`);
      }

      assertEditableInput(input, ["id", "createdAt", "updatedAt"], "Employment History");
      input = copyNestedData(input);
      const existingRecord = employmentRecords[recordIndex];
      const hasProvenance = Object.hasOwn(input, "provenance") || Object.hasOwn(existingRecord, "provenance");
      const provenance = Object.hasOwn(input, "provenance") ? input.provenance : existingRecord.provenance;
      const constructionInput = { ...input };
      if (provenance === null || !hasProvenance) {
        delete constructionInput.provenance;
      } else {
        constructionInput.provenance = provenance;
      }
      const updatedRecord = createEmploymentRecord(constructionInput, {
        id: existingRecord.id,
        createdAt: existingRecord.createdAt
      });
      if (hasProvenance) {
        updatedRecord.provenance = provenance;
      } else {
        delete updatedRecord.provenance;
      }
      updatedRecord.updatedAt = updatedAt;
      validateRecord(updatedRecord, validateEmploymentRecord, "Employment History record");
      employmentRecords[recordIndex] = copyEmploymentRecord(updatedRecord);
      const result = copyEmploymentRecord(employmentRecords[recordIndex]);
      notifyMutation();
      return result;
    },

    deleteEmploymentRecord(id) {
      const recordIndex = employmentRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Employment History record "${id}" does not exist.`);
      }

      const updatedAchievements = achievementRecords.map((record) => {
        if (record.employmentId !== id) {
          return record;
        }

        const updatedRecord = {
          ...copyAchievementRecord(record),
          employmentId: null,
          verificationStatus: record.verificationStatus === "verified"
            ? "unverified"
            : record.verificationStatus
        };
        validateRecord(updatedRecord, validateAchievementRecord, "Achievement record");
        return updatedRecord;
      });

      employmentRecords.splice(recordIndex, 1);
      achievementRecords = updatedAchievements;
      notifyMutation();
    },

    addAchievementRecord(input, metadata) {
      const newRecord = constructRecord(input, metadata, createAchievementRecord);
      validateRecord(newRecord, validateAchievementRecord, "Achievement record");

      if (achievementRecords.some((record) => record.id === newRecord.id)) {
        throw new Error(`An Achievement record with ID "${newRecord.id}" already exists.`);
      }

      assertEmploymentLinkExists(newRecord);
      achievementRecords.push(copyAchievementRecord(newRecord));
      const result = copyAchievementRecord(newRecord);
      notifyMutation();
      return result;
    },

    updateAchievementRecord(id, input, updatedAt) {
      const recordIndex = achievementRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Achievement record "${id}" does not exist.`);
      }

      assertEditableInput(
        input,
        ["id", "createdAt", "updatedAt", "verificationStatus"],
        "Achievement"
      );
      input = copyNestedData(input);
      const existingRecord = achievementRecords[recordIndex];
      const constructionInput = { ...input };
      if (constructionInput.provenance === null) {
        delete constructionInput.provenance;
      }
      const updatedRecord = createAchievementRecord(constructionInput, {
        id: existingRecord.id,
        createdAt: existingRecord.createdAt
      });
      if (Object.hasOwn(input, "provenance")) {
        updatedRecord.provenance = input.provenance;
      } else if (Object.hasOwn(existingRecord, "provenance")) {
        updatedRecord.provenance = copyNestedData(existingRecord.provenance);
      } else {
        delete updatedRecord.provenance;
      }
      updatedRecord.updatedAt = updatedAt;
      const contentChanged = hasAchievementContentChanged(existingRecord, updatedRecord);
      updatedRecord.verificationStatus = contentChanged
        && existingRecord.verificationStatus === "verified"
        ? "unverified"
        : existingRecord.verificationStatus;
      validateRecord(updatedRecord, validateAchievementRecord, "Achievement record");
      assertEmploymentLinkExists(updatedRecord);

      achievementRecords[recordIndex] = copyAchievementRecord(updatedRecord);
      const result = copyAchievementRecord(achievementRecords[recordIndex]);
      notifyMutation();
      return result;
    },

    updateAchievementVerificationStatus(id, status, updatedAt) {
      const recordIndex = achievementRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Achievement record "${id}" does not exist.`);
      }

      const existingRecord = achievementRecords[recordIndex];
      const updatedRecord = {
        ...copyAchievementRecord(existingRecord),
        verificationStatus: status,
        updatedAt
      };
      validateRecord(updatedRecord, validateAchievementRecord, "Achievement record");

      achievementRecords[recordIndex] = copyAchievementRecord(updatedRecord);
      const result = copyAchievementRecord(achievementRecords[recordIndex]);
      notifyMutation();
      return result;
    },

    deleteAchievementRecord(id) {
      const recordIndex = achievementRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Achievement record "${id}" does not exist.`);
      }

      const remainingAchievements = achievementRecords.filter(
        (record) => record.id !== id
      );
      const remainingMappings = achievementMappings.filter(
        (mapping) => mapping.achievementId !== id
      );

      achievementRecords = remainingAchievements;
      achievementMappings = remainingMappings;
      notifyMutation();
    },

    createJob(job) {
      const result = validateJobRecord(job);
      if (!result.valid) {
        throwJobValidationError("Job record", result.errors);
      }
      if (jobs.some((record) => record.id === job.id)) {
        throw createJobStateError(
          "DUPLICATE_ID",
          `A Job with ID "${job.id}" already exists.`
        );
      }

      const newJob = copyJobRecord(job);
      jobs.push(newJob);
      notifyMutation();
      return copyJobRecord(newJob);
    },

    updateJob(jobId, updates) {
      const jobIndex = jobs.findIndex((record) => record.id === jobId);
      if (jobIndex === -1) {
        throw createJobStateError("NOT_FOUND", `Job "${jobId}" does not exist.`);
      }
      if (
        updates === null
        || typeof updates !== "object"
        || Array.isArray(updates)
      ) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          "Job updates require an object of Job fields."
        );
      }
      updates = copyNestedData(updates);

      for (const field of ["id", "createdAt"]) {
        if (Object.hasOwn(updates, field)) {
          throw createJobStateError(
            "IMMUTABLE_FIELD",
            `Job updates cannot change ${field}.`
          );
        }
      }
      if (Object.hasOwn(updates, "status")) {
        throw createJobStateError(
          "INVALID_OPERATION",
          "Job status must be changed with archiveJob or reactivateJob."
        );
      }

      const allowedFields = new Set([
        "company",
        "roleTitle",
        "description",
        "sourceUrl",
        "notes",
        "updatedAt"
      ]);
      const unknownField = Object.keys(updates)
        .find((field) => !allowedFields.has(field));
      if (unknownField) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          `Job updates contain unknown field "${unknownField}".`
        );
      }

      const existingJob = jobs[jobIndex];
      const updatedFields = Object.keys(updates)
        .filter((field) => field !== "updatedAt");
      const hasChanges = updatedFields.some((field) =>
        !Object.is(existingJob[field], updates[field])
      );
      if (!hasChanges) {
        return copyJobRecord(existingJob);
      }
      if (!Object.hasOwn(updates, "updatedAt")) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          "A changed Job requires a caller-supplied updatedAt timestamp."
        );
      }

      const updatedJob = {
        ...existingJob,
        ...updates
      };
      const result = validateJobRecord(updatedJob);
      if (!result.valid) {
        throwJobValidationError("Job record", result.errors);
      }

      jobs[jobIndex] = copyJobRecord(updatedJob);
      notifyMutation();
      return copyJobRecord(jobs[jobIndex]);
    },

    archiveJob(jobId, updatedAt) {
      return updateJobStatus(jobId, "archived", updatedAt);
    },

    reactivateJob(jobId, updatedAt) {
      return updateJobStatus(jobId, "active", updatedAt);
    },

    deleteJob(jobId) {
      const jobIndex = jobs.findIndex((record) => record.id === jobId);
      if (jobIndex === -1) {
        throw createJobStateError("NOT_FOUND", `Job "${jobId}" does not exist.`);
      }

      const deletedRequirements = requirements.filter(
        (requirement) => requirement.jobId === jobId
      );
      const deletedRequirementIds = new Set(
        deletedRequirements
          .map((requirement) => requirement.id)
          .filter((id) => typeof id === "string")
      );
      const deletedMappings = achievementMappings.filter(
        (mapping) => deletedRequirementIds.has(mapping.requirementId)
      );
      const remainingJobs = jobs.filter((record) => record.id !== jobId);
      const remainingRequirements = requirements.filter(
        (requirement) => requirement.jobId !== jobId
      );
      const remainingMappings = achievementMappings.filter(
        (mapping) => !deletedRequirementIds.has(mapping.requirementId)
      );

      jobs = remainingJobs;
      requirements = remainingRequirements;
      achievementMappings = remainingMappings;
      notifyMutation();
      return {
        jobId,
        deletedRequirements: deletedRequirements.length,
        deletedAchievementMappings: deletedMappings.length
      };
    },

    createRequirement(record) {
      record = copyNestedData(record);
      const result = validateRequirementRecord(record);
      if (!result.valid) {
        throwJobValidationError("Requirement record", result.errors);
      }
      if (!jobs.some((job) => job.id === record.jobId)) {
        throw createJobStateError(
          "NOT_FOUND",
          `Job "${record.jobId}" does not exist.`
        );
      }
      if (requirements.some((requirement) => requirement.id === record.id)) {
        throw createJobStateError(
          "DUPLICATE_ID",
          `A Requirement with ID "${record.id}" already exists.`
        );
      }

      const newRequirement = copyNestedData(record);
      requirements.push(newRequirement);
      const createdRequirement = copyNestedData(newRequirement);
      notifyMutation();
      return createdRequirement;
    },

    updateRequirement(id, updates) {
      const requirementIndex = requirements.findIndex(
        (requirement) => requirement.id === id
      );
      if (requirementIndex === -1) {
        throw createJobStateError(
          "NOT_FOUND",
          `Requirement "${id}" does not exist.`
        );
      }
      if (
        updates === null
        || typeof updates !== "object"
        || Array.isArray(updates)
      ) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          "Requirement updates require an object of Requirement fields."
        );
      }
      updates = copyNestedData(updates);

      for (const field of ["id", "jobId", "createdAt"]) {
        if (Object.hasOwn(updates, field)) {
          throw createJobStateError(
            "IMMUTABLE_FIELD",
            `Requirement updates cannot change ${field}.`
          );
        }
      }

      const allowedFields = new Set(["description", "category", "importance", "updatedAt"]);
      const unknownField = Object.keys(updates)
        .find((field) => !allowedFields.has(field));
      if (unknownField) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          `Requirement updates contain unknown field "${unknownField}".`
        );
      }

      const existingRequirement = requirements[requirementIndex];
      const updatedFields = Object.keys(updates)
        .filter((field) => field !== "updatedAt");
      const hasChanges = updatedFields.some((field) =>
        !Object.is(existingRequirement[field], updates[field])
      );
      if (!hasChanges) {
        return copyNestedData(existingRequirement);
      }
      if (!Object.hasOwn(updates, "updatedAt")) {
        throw createJobStateError(
          "VALIDATION_ERROR",
          "A changed Requirement requires a caller-supplied updatedAt timestamp."
        );
      }

      const updatedRequirement = {
        ...existingRequirement,
        ...updates
      };
      const result = validateRequirementRecord(updatedRequirement);
      if (!result.valid) {
        throwJobValidationError("Requirement record", result.errors);
      }

      requirements[requirementIndex] = { ...updatedRequirement };
      const updatedCopy = copyNestedData(requirements[requirementIndex]);
      notifyMutation();
      return updatedCopy;
    },

    deleteRequirement(id) {
      const requirementIndex = requirements.findIndex(
        (requirement) => requirement.id === id
      );
      if (requirementIndex === -1) {
        throw createJobStateError(
          "NOT_FOUND",
          `Requirement "${id}" does not exist.`
        );
      }

      const remainingRequirements = requirements.filter(
        (requirement) => requirement.id !== id
      );
      const remainingMappings = achievementMappings.filter(
        (mapping) => mapping.requirementId !== id
      );

      requirements = remainingRequirements;
      achievementMappings = remainingMappings;
      notifyMutation();
    },

    createAchievementMapping(record) {
      record = copyNestedData(record);
      const result = validateAchievementMappingRecord(record);
      if (!result.valid) {
        throwJobValidationError("Achievement Mapping record", result.errors);
      }
      if (!requirements.some((requirement) => requirement.id === record.requirementId)) {
        throw createJobStateError(
          "NOT_FOUND",
          `Requirement "${record.requirementId}" does not exist.`
        );
      }
      if (!achievementRecords.some((achievement) => achievement.id === record.achievementId)) {
        throw createJobStateError(
          "NOT_FOUND",
          `Achievement "${record.achievementId}" does not exist.`
        );
      }
      if (achievementMappings.some((mapping) => mapping.id === record.id)) {
        throw createJobStateError(
          "DUPLICATE_ID",
          `An Achievement Mapping with ID "${record.id}" already exists.`
        );
      }
      if (achievementMappings.some((mapping) =>
        mapping.requirementId === record.requirementId
        && mapping.achievementId === record.achievementId
      )) {
        throw createJobStateError(
          "DUPLICATE_PAIR",
          `Requirement "${record.requirementId}" is already mapped to Achievement "${record.achievementId}".`
        );
      }

      const newMapping = copyNestedData(record);
      achievementMappings.push(newMapping);
      const createdMapping = copyNestedData(newMapping);
      notifyMutation();
      return createdMapping;
    },

    deleteAchievementMapping(id) {
      const mappingIndex = achievementMappings.findIndex((mapping) => mapping.id === id);
      if (mappingIndex === -1) {
        throw createJobStateError(
          "NOT_FOUND",
          `Achievement Mapping "${id}" does not exist.`
        );
      }

      achievementMappings.splice(mappingIndex, 1);
      notifyMutation();
    },

    getProfile() {
      return copyProfile(profile);
    },

    getEmploymentRecords() {
      return employmentRecords.map(copyEmploymentRecord);
    },

    getAchievementRecords() {
      return achievementRecords.map(copyAchievementRecord);
    },

    getJobs() {
      return jobs.map(copyJobRecord);
    },

    getRequirements(jobId) {
      return requirements
        .filter((requirement) => requirement.jobId === jobId)
        .map((requirement) => copyNestedData(requirement));
    },

    calculateJobFitAssessment(jobId) {
      if (
        typeof jobId !== "string"
        || jobId.trim() === ""
        || !state.getJobs().some((job) => job.id === jobId)
      ) {
        throw createJobStateError("NOT_FOUND", `Job "${jobId}" does not exist.`);
      }

      const jobRequirements = state.getRequirements(jobId);
      const mappings = jobRequirements.flatMap((requirement) =>
        state.getAchievementMappingsForRequirement(requirement.id)
      );
      const achievementRecords = state.getAchievementRecords();

      return calculateFitAssessment(
        jobId,
        jobRequirements,
        mappings,
        achievementRecords
      );
    },

    getAchievementMappingsForRequirement(requirementId) {
      return achievementMappings
        .filter((mapping) => mapping.requirementId === requirementId)
        .map((mapping) => copyNestedData(mapping));
    },

    getAchievementMappingsForAchievement(achievementId) {
      return achievementMappings
        .filter((mapping) => mapping.achievementId === achievementId)
        .map((mapping) => copyNestedData(mapping));
    }
  };

  function updateJobStatus(jobId, status, updatedAt) {
    const jobIndex = jobs.findIndex((record) => record.id === jobId);
    if (jobIndex === -1) {
      throw createJobStateError("NOT_FOUND", `Job "${jobId}" does not exist.`);
    }

    const existingJob = jobs[jobIndex];
    if (existingJob.status === status) {
      return copyJobRecord(existingJob);
    }

    const updatedJob = { ...existingJob, status, updatedAt };
    const result = validateJobRecord(updatedJob);
    if (!result.valid) {
      throwJobValidationError("Job record", result.errors);
    }

    jobs[jobIndex] = copyJobRecord(updatedJob);
    notifyMutation();
    return copyJobRecord(jobs[jobIndex]);
  }

  return state;
}
