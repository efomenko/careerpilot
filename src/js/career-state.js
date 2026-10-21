import {
  createCareerProfile,
  createEmploymentRecord,
  validateCareerProfile,
  validateEmploymentRecord
} from "./career-model.js";

function copyProfile(profile) {
  return profile ? { ...profile, skills: [...profile.skills] } : null;
}

function copyEmploymentRecord(record) {
  return { ...record, responsibilities: [...record.responsibilities] };
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
 * - getProfile(): return a safe profile copy, or null when absent.
 * - getEmploymentRecords(): return a new array containing safe record copies.
 *
 * Invalid records throw TypeError; unknown IDs and duplicate IDs throw Error.
 * No browser APIs, persistence, clock, or ID generation are used.
 */
export function createCareerState() {
  let profile = null;
  const employmentRecords = [];

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

      employmentRecords.splice(recordIndex, 1);
    },

    getProfile() {
      return copyProfile(profile);
    },

    getEmploymentRecords() {
      return employmentRecords.map(copyEmploymentRecord);
    }
  };
}
