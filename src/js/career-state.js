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

function copyProfile(profile) {
  return profile ? { ...profile, skills: [...profile.skills] } : null;
}

function copyEmploymentRecord(record) {
  return { ...record, responsibilities: [...record.responsibilities] };
}

function copyNestedData(value, copies = new WeakMap()) {
  if (Array.isArray(value)) {
    if (copies.has(value)) {
      return copies.get(value);
    }

    const copy = new Array(value.length);
    copies.set(value, copy);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.hasOwn(value, index)) {
        copy[index] = copyNestedData(value[index], copies);
      }
    }
    return copy;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  if (copies.has(value)) {
    return copies.get(value);
  }

  const copy = Object.create(prototype);
  copies.set(value, copy);
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: copyNestedData(value[key], copies)
    });
  }
  return copy;
}

function copyAchievementRecord(record) {
  return copyNestedData(record);
}

function copyJobRecord(record) {
  return { ...record };
}

function copySnapshotValue(value, copies = new WeakMap(), path = "snapshot") {
  if (
    value === null
    || typeof value === "undefined"
    || typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
    || typeof value === "bigint"
    || typeof value === "symbol"
  ) {
    return value;
  }

  if (typeof value === "function") {
    throw new TypeError(`${path} contains a function that cannot be safely copied.`);
  }

  if (copies.has(value)) {
    return copies.get(value);
  }

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
    copies.set(value, copy);
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
        ...descriptor,
        value: copySnapshotValue(descriptor.value, copies, `${path}[${key}]`)
      });
    }
    let lengthDescriptor;
    try {
      lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    } catch {
      throw new TypeError(`${path} array length could not be inspected safely.`);
    }
    Object.defineProperty(copy, "length", lengthDescriptor);
    return copy;
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} contains an object with an unsupported prototype.`);
  }

  const copy = Object.create(prototype);
  copies.set(value, copy);
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
      ...descriptor,
      value: copySnapshotValue(descriptor.value, copies, `${path}.${key}`)
    });
  }
  return copy;
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
    "achievementMappings"
  ];
  const requiredFields = ["profile", "employmentRecords", "achievementRecords"];
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
      normalizedSnapshot[field] = [];
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

  return copySnapshotValue(normalizedSnapshot);
}

function validateSnapshotRecords(snapshot) {
  const errors = [];
  if (snapshot.profile !== null) {
    const result = validateCareerProfile(snapshot.profile);
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
      const result = validateEmploymentRecord(record);
      if (!result.valid) {
        errors.push(...result.errors.map((error) => ({
          ...error,
          field: `employmentRecords[${index}].${error.field}`,
          recordType: "employment",
          recordId: record?.id
        })));
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
      const result = validateAchievementRecord(record);
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

    snapshot[field].forEach((record, index) => {
      if (!isPlainObject(record)) {
        errors.push({
          field: `${field}[${index}]`,
          message: `Each ${recordType} must be a plain object.`,
          recordType
        });
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

  if (errors.length > 0) {
    const error = new TypeError("Career snapshot is invalid.");
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
  const result = validator(record);

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
 * - getProfile(): return a safe profile copy, or null when absent.
 * - getEmploymentRecords(): return a new array containing safe record copies.
 * - getAchievementRecords(): return a new array containing safe record copies.
 * - getJobs(): return a new array containing safe Job copies.
 * - getRequirements(jobId): return safe Requirement copies in insertion order.
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

  const state = {
    restoreSnapshot(snapshot) {
      if (!isFresh) {
        throw new Error("A Career snapshot can only be restored into a fresh state.");
      }

      const replacement = prepareSnapshotCopy(snapshot);
      validateSnapshotRecords(replacement);

      profile = replacement.profile;
      employmentRecords = replacement.employmentRecords;
      achievementRecords = replacement.achievementRecords;
      jobs = replacement.jobs.map(copyJobRecord);
      requirements = replacement.requirements;
      legacyRequirements = replacement.legacyRequirements;
      achievementMappings = replacement.achievementMappings;
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
        achievementMappings
      });
    },

    createProfile(input, metadata) {
      if (profile) {
        throw new Error("A Career Profile already exists.");
      }

      const newProfile = createCareerProfile(input, metadata);
      validateRecord(newProfile, validateCareerProfile, "Career Profile");
      profile = newProfile;
      const result = copyProfile(profile);
      notifyMutation();
      return result;
    },

    updateProfile(input, updatedAt) {
      if (!profile) {
        throw new Error("A Career Profile does not exist.");
      }

      assertEditableInput(input, ["id", "createdAt", "updatedAt"], "Career Profile");
      const updatedProfile = {
        ...input,
        id: profile.id,
        createdAt: profile.createdAt,
        updatedAt
      };
      validateRecord(updatedProfile, validateCareerProfile, "Career Profile");
      profile = copyProfile(updatedProfile);
      const result = copyProfile(profile);
      notifyMutation();
      return result;
    },

    addEmploymentRecord(input, metadata) {
      const newRecord = createEmploymentRecord(input, metadata);
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
      const existingRecord = employmentRecords[recordIndex];
      const updatedRecord = {
        ...input,
        id: existingRecord.id,
        createdAt: existingRecord.createdAt,
        updatedAt
      };
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
      const newRecord = createAchievementRecord(input, metadata);
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
      const existingRecord = achievementRecords[recordIndex];
      const updatedRecord = createAchievementRecord(input, {
        id: existingRecord.id,
        createdAt: existingRecord.createdAt
      });
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

      achievementRecords.splice(recordIndex, 1);
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

      const newRequirement = { ...record };
      requirements.push(newRequirement);
      const createdRequirement = { ...newRequirement };
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
        return { ...existingRequirement };
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
      const updatedCopy = { ...requirements[requirementIndex] };
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
        .map((requirement) => ({ ...requirement }));
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
