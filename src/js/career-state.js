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
 * - getProfile(): return a safe profile copy, or null when absent.
 * - getEmploymentRecords(): return a new array containing safe record copies.
 * - getAchievementRecords(): return a new array containing safe record copies.
 *
 * Invalid records throw TypeError; unknown IDs and duplicate IDs throw Error.
 * No browser APIs, persistence, clock, or ID generation are used.
 */
export function createCareerState() {
  let profile = null;
  const employmentRecords = [];
  let achievementRecords = [];

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

  return {
    createProfile(input, metadata) {
      if (profile) {
        throw new Error("A Career Profile already exists.");
      }

      const newProfile = createCareerProfile(input, metadata);
      validateRecord(newProfile, validateCareerProfile, "Career Profile");
      profile = newProfile;
      return copyProfile(profile);
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
      return copyProfile(profile);
    },

    addEmploymentRecord(input, metadata) {
      const newRecord = createEmploymentRecord(input, metadata);
      validateRecord(newRecord, validateEmploymentRecord, "Employment History record");

      if (employmentRecords.some((record) => record.id === newRecord.id)) {
        throw new Error(`An Employment History record with ID "${newRecord.id}" already exists.`);
      }

      employmentRecords.push(copyEmploymentRecord(newRecord));
      return copyEmploymentRecord(newRecord);
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
      return copyEmploymentRecord(employmentRecords[recordIndex]);
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
    },

    addAchievementRecord(input, metadata) {
      const newRecord = createAchievementRecord(input, metadata);
      validateRecord(newRecord, validateAchievementRecord, "Achievement record");

      if (achievementRecords.some((record) => record.id === newRecord.id)) {
        throw new Error(`An Achievement record with ID "${newRecord.id}" already exists.`);
      }

      assertEmploymentLinkExists(newRecord);
      achievementRecords.push(copyAchievementRecord(newRecord));
      return copyAchievementRecord(newRecord);
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
      return copyAchievementRecord(achievementRecords[recordIndex]);
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
      return copyAchievementRecord(achievementRecords[recordIndex]);
    },

    deleteAchievementRecord(id) {
      const recordIndex = achievementRecords.findIndex((record) => record.id === id);

      if (recordIndex === -1) {
        throw new Error(`Achievement record "${id}" does not exist.`);
      }

      achievementRecords.splice(recordIndex, 1);
    },

    getProfile() {
      return copyProfile(profile);
    },

    getEmploymentRecords() {
      return employmentRecords.map(copyEmploymentRecord);
    },

    getAchievementRecords() {
      return achievementRecords.map(copyAchievementRecord);
    }
  };
}
