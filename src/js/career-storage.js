import {
  validateCareerProfile,
  validateEmploymentRecord
} from "./career-model.js";
import { validateAchievementRecord } from "./achievement-model.js";
import { validateJobRecord } from "./job-model.js";

const STORAGE_KEY = "careerpilot.state";
const SCHEMA_VERSION = 2;
const v1SnapshotFields = ["profile", "employmentRecords", "achievementRecords"];
const snapshotFields = [
  ...v1SnapshotFields,
  "jobs",
  "requirements",
  "achievementMappings"
];

function emptySnapshot() {
  return {
    profile: null,
    employmentRecords: [],
    achievementRecords: [],
    jobs: [],
    requirements: [],
    achievementMappings: []
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addError(errors, error) {
  errors.push(error);
}

function inspectRecordObject(record, recordType, index, errors) {
  const recordPath = `${recordType}[${index}]`;

  try {
    if (!isPlainObject(record)) {
      addError(errors, {
        recordType,
        path: recordPath,
        field: recordPath,
        message: "Record must be a plain object."
      });
      return { recordId: undefined, safe: false };
    }

    const keys = Reflect.ownKeys(record);
    let safe = true;
    let recordId;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (typeof key !== "string" || !descriptor?.enumerable || !("value" in descriptor)) {
        safe = false;
        addError(errors, {
          recordType,
          path: `${recordPath}.${String(key)}`,
          field: String(key),
          message: "Record properties must be enumerable own string-keyed data properties."
        });
      } else if (key === "id" && typeof descriptor.value === "string") {
        recordId = descriptor.value;
      }
    }

    return { recordId, safe };
  } catch {
    addError(errors, {
      recordType,
      path: recordPath,
      field: recordPath,
      message: "Record properties could not be inspected safely."
    });
    return { recordId: undefined, safe: false };
  }
}

function inspectRecordArrays(record, recordType, index, errors) {
  const arrayFields = recordType === "profile"
    ? ["skills"]
    : recordType === "employment"
      ? ["responsibilities"]
      : ["actions", "metrics"];
  let safe = true;

  for (const field of arrayFields) {
    let value;
    try {
      value = Object.getOwnPropertyDescriptor(record, field)?.value;
      if (!Array.isArray(value)) {
        continue;
      }

      const path = `${recordType === "profile" ? "profile" : `${recordType}Records[${index}]`}.${field}`;
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        addError(errors, {
          recordType,
          recordId: record.id,
          field: path,
          path,
          message: "Arrays must use the standard Array.prototype."
        });
        safe = false;
        continue;
      }

      const keys = Reflect.ownKeys(value);
      const length = value.length;
      const indices = [];

      for (const key of keys) {
        if (key === "length") {
          continue;
        }
        const elementIndex = typeof key === "string" ? Number(key) : NaN;
        if (
          !Number.isSafeInteger(elementIndex)
          || elementIndex < 0
          || elementIndex >= length
          || String(elementIndex) !== key
        ) {
          addError(errors, {
            recordType,
            recordId: record.id,
            field: path,
            path: `${path}.${String(key)}`,
            message: "Arrays may contain only indexed elements."
          });
          safe = false;
        } else {
          indices.push(elementIndex);
        }
      }

      if (indices.length !== length) {
        addError(errors, {
          recordType,
          recordId: record.id,
          field: path,
          path,
          message: "Arrays must be dense."
        });
        safe = false;
        continue;
      }

      for (const elementIndex of indices) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(elementIndex));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          addError(errors, {
            recordType,
            recordId: record.id,
            field: path,
            path: `${path}[${elementIndex}]`,
            message: "Array elements must be enumerable data properties."
          });
          safe = false;
        } else if (field === "metrics") {
          const metric = descriptor.value;
          if (metric === null || typeof metric !== "object" || Array.isArray(metric)) {
            continue;
          }
          let metricPrototype;
          try {
            metricPrototype = Object.getPrototypeOf(metric);
          } catch {
            addError(errors, {
              recordType,
              recordId: record.id,
              field: path,
              path: `${path}[${elementIndex}]`,
              message: "Metric prototype could not be inspected safely."
            });
            safe = false;
            continue;
          }
          if (metricPrototype !== Object.prototype && metricPrototype !== null) {
            addError(errors, {
              recordType,
              recordId: record.id,
              field: path,
              path: `${path}[${elementIndex}]`,
              message: "Metrics must have Object.prototype or null as their prototype."
            });
            safe = false;
            continue;
          }
          const metricKeys = Reflect.ownKeys(metric);
          for (const metricKey of metricKeys) {
            const metricDescriptor = Object.getOwnPropertyDescriptor(metric, metricKey);
            if (
              typeof metricKey !== "string"
              || !metricDescriptor?.enumerable
              || !("value" in metricDescriptor)
            ) {
              addError(errors, {
                recordType,
                recordId: record.id,
                field: path,
                path: `${path}[${elementIndex}].${String(metricKey)}`,
                message: "Metric properties must be enumerable own string-keyed data properties."
              });
              safe = false;
            } else if (metricKey === "value" && Object.is(metricDescriptor.value, -0)) {
              addError(errors, {
                recordType,
                recordId: record.id,
                field: path,
                path: `${path}[${elementIndex}].value`,
                modelField: "value",
                message: "Metric values must not be negative zero."
              });
              safe = false;
            }
          }
        }
      }
    } catch {
      addError(errors, {
        recordType,
        recordId: typeof record.id === "string" ? record.id : undefined,
        field,
        path: `${recordType}[${index}].${field}`,
        message: "Array properties could not be inspected safely."
      });
      safe = false;
    }
  }

  return safe;
}

function validateRecordArray(records, field, recordType, validator, errors) {
  let isArray;
  try {
    isArray = Array.isArray(records);
  } catch {
    addError(errors, {
      field,
      path: field,
      message: "Record collection could not be inspected safely."
    });
    return [];
  }
  if (!isArray) {
    addError(errors, {
      field,
      path: field,
      message: "Must be an array."
    });
    return [];
  }

  const recordIds = new Set();
  let keys;
  let length;
  let indices;

  try {
    keys = Reflect.ownKeys(records);
    if (Object.getPrototypeOf(records) !== Array.prototype) {
      addError(errors, {
        field,
        path: field,
        message: "Record collections must use the standard Array.prototype."
      });
      return [];
    }
    length = records.length;
    indices = [];
    for (const key of keys) {
      if (key === "length") {
        continue;
      }
      const index = typeof key === "string" ? Number(key) : NaN;
      if (
        !Number.isSafeInteger(index)
        || index < 0
        || index >= length
        || String(index) !== key
      ) {
        addError(errors, {
          field,
          path: `${field}.${String(key)}`,
          message: "Record arrays may contain only indexed elements."
        });
      } else {
        indices.push(index);
      }
    }
    if (indices.length !== length) {
      addError(errors, {
        field,
        path: field,
        message: "Record arrays must be dense."
      });
      return [];
    }
    indices.sort((first, second) => first - second);
  } catch {
    addError(errors, {
      field,
      path: field,
      message: "Array properties could not be inspected safely."
    });
    return [];
  }

  const validatedRecords = [];
  for (const index of indices) {
    const recordPath = `${field}[${index}]`;
    let descriptor;

    try {
      descriptor = Object.getOwnPropertyDescriptor(records, String(index));
    } catch {
      addError(errors, {
        recordType,
        path: recordPath,
        field: recordPath,
        message: "Record could not be inspected safely."
      });
      continue;
    }

    if (!descriptor?.enumerable || !("value" in descriptor)) {
      addError(errors, {
        recordType,
        path: recordPath,
        field: recordPath,
        message: "Record arrays must be dense and contain data properties."
      });
      continue;
    }

    const record = descriptor.value;
    const inspected = inspectRecordObject(record, recordType, index, errors);
    const recordId = inspected.recordId;
    const arraysSafe = inspected.safe && inspectRecordArrays(
      record,
      recordType,
      index,
      errors
    );

    if (arraysSafe) {
      try {
        const result = validator(record);
        if (!result.valid) {
          for (const validationError of result.errors) {
            addError(errors, {
              recordType,
              recordId,
              field: `${recordPath}.${validationError.field}`,
              path: `${recordPath}.${validationError.field}`,
              modelField: validationError.field,
              message: validationError.message
            });
          }
        } else {
          validatedRecords.push(record);
        }
      } catch {
        addError(errors, {
          recordType,
          recordId,
          path: recordPath,
          field: recordPath,
          message: "Record validation could not be completed safely."
        });
      }
    }

    if (recordId !== undefined) {
      if (recordIds.has(recordId)) {
        addError(errors, {
          recordType,
          recordId,
          path: `${recordPath}.id`,
          field: `${recordPath}.id`,
          message: `Duplicate ${recordType} ID "${recordId}".`
        });
      } else {
        recordIds.add(recordId);
      }
    }
  }

  return validatedRecords;
}

function validatePlainObjectArray(records, field, recordType, errors) {
  let keys;
  let length;
  try {
    if (!Array.isArray(records)) {
      addError(errors, { field, path: field, message: "Must be an array." });
      return;
    }
    if (Object.getPrototypeOf(records) !== Array.prototype) {
      addError(errors, {
        field,
        path: field,
        message: "Record collections must use the standard Array.prototype."
      });
      return;
    }
    keys = Reflect.ownKeys(records);
    length = records.length;
  } catch {
    addError(errors, {
      field,
      path: field,
      message: "Array properties could not be inspected safely."
    });
    return;
  }

  const indices = [];
  for (const key of keys) {
    if (key === "length") {
      continue;
    }
    const index = typeof key === "string" ? Number(key) : NaN;
    if (
      !Number.isSafeInteger(index)
      || index < 0
      || index >= length
      || String(index) !== key
    ) {
      addError(errors, {
        field,
        path: `${field}.${String(key)}`,
        message: "Record arrays may contain only indexed elements."
      });
    } else {
      indices.push(index);
    }
  }
  if (indices.length !== length) {
    addError(errors, {
      field,
      path: field,
      message: "Record arrays must be dense."
    });
    return;
  }

  indices.sort((first, second) => first - second);
  for (const index of indices) {
    const path = `${field}[${index}]`;
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(records, String(index));
    } catch {
      addError(errors, {
        recordType,
        field: path,
        path,
        message: "Record could not be inspected safely."
      });
      continue;
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      addError(errors, {
        recordType,
        field: path,
        path,
        message: "Record arrays must contain enumerable data properties."
      });
      continue;
    }
    inspectRecordObject(descriptor.value, recordType, index, errors);
  }
}

function validateSnapshot(snapshot, version = SCHEMA_VERSION) {
  const errors = [];
  const fields = version === 1 ? v1SnapshotFields : snapshotFields;
  let snapshotIsPlainObject = false;

  try {
    snapshotIsPlainObject = isPlainObject(snapshot);
  } catch {
    addError(errors, {
      field: "snapshot",
      path: "snapshot",
      message: "Snapshot properties could not be inspected safely."
    });
  }

  if (!snapshotIsPlainObject) {
    addError(errors, {
      field: "snapshot",
      path: "snapshot",
      message: "Snapshot must be a plain object."
    });
    return { valid: false, errors };
  }

  try {
    const keys = Reflect.ownKeys(snapshot);
    const expected = new Set(fields);
    for (const key of keys) {
      if (typeof key !== "string" || !expected.has(key)) {
        addError(errors, {
          field: `snapshot.${String(key)}`,
          path: `snapshot.${String(key)}`,
          message: "Snapshot contains an unexpected property."
        });
      }
    }
    for (const field of fields) {
      if (!Object.hasOwn(snapshot, field)) {
        addError(errors, {
          field,
          path: field,
          message: "Snapshot property is required."
        });
      } else {
        const descriptor = Object.getOwnPropertyDescriptor(snapshot, field);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          addError(errors, {
            field,
            path: field,
            message: "Snapshot properties must be enumerable data properties."
          });
        }
      }
    }
  } catch {
    addError(errors, {
      field: "snapshot",
      path: "snapshot",
      message: "Snapshot properties could not be inspected safely."
    });
    return { valid: false, errors };
  }

  let profile;
  let employmentRecords;
  let achievementRecords;
  let jobs = [];
  let requirements = [];
  let achievementMappings = [];
  try {
    profile = Object.getOwnPropertyDescriptor(snapshot, "profile")?.value;
    employmentRecords = Object.getOwnPropertyDescriptor(snapshot, "employmentRecords")?.value;
    achievementRecords = Object.getOwnPropertyDescriptor(snapshot, "achievementRecords")?.value;
    if (version === SCHEMA_VERSION) {
      jobs = Object.getOwnPropertyDescriptor(snapshot, "jobs")?.value;
      requirements = Object.getOwnPropertyDescriptor(snapshot, "requirements")?.value;
      achievementMappings = Object.getOwnPropertyDescriptor(
        snapshot,
        "achievementMappings"
      )?.value;
    }
  } catch {
    addError(errors, {
      field: "snapshot",
      path: "snapshot",
      message: "Snapshot values could not be read safely."
    });
    return { valid: false, errors };
  }

  if (profile !== null) {
    const inspected = inspectRecordObject(profile, "profile", 0, errors);
    const profileId = inspected.recordId;
    const arraysSafe = inspected.safe && inspectRecordArrays(
      profile,
      "profile",
      0,
      errors
    );
    if (arraysSafe) {
      try {
        const result = validateCareerProfile(profile);
        if (!result.valid) {
          for (const validationError of result.errors) {
            addError(errors, {
              recordType: "profile",
              recordId: profileId,
              field: `profile.${validationError.field}`,
              path: `profile.${validationError.field}`,
              modelField: validationError.field,
              message: validationError.message
            });
          }
        }
      } catch {
        addError(errors, {
          recordType: "profile",
          recordId: profileId,
          field: "profile",
          path: "profile",
          message: "Profile validation could not be completed safely."
        });
      }
    }
  }

  const validEmploymentRecords = validateRecordArray(
    employmentRecords,
    "employmentRecords",
    "employment",
    validateEmploymentRecord,
    errors
  );
  const validAchievementRecords = validateRecordArray(
    achievementRecords,
    "achievementRecords",
    "achievement",
    validateAchievementRecord,
    errors
  );
  const validJobs = version === SCHEMA_VERSION
    ? validateRecordArray(jobs, "jobs", "job", validateJobRecord, errors)
    : [];
  if (version === SCHEMA_VERSION) {
    validatePlainObjectArray(requirements, "requirements", "requirement", errors);
    validatePlainObjectArray(
      achievementMappings,
      "achievementMappings",
      "achievement mapping",
      errors
    );
  }
  const employmentIds = new Set(validEmploymentRecords.map((record) => record.id));

  for (let index = 0; index < validAchievementRecords.length; index += 1) {
    const record = validAchievementRecords[index];
    if (record.employmentId !== null && !employmentIds.has(record.employmentId)) {
      addError(errors, {
        recordType: "achievement",
        recordId: record.id,
        field: `achievementRecords[${index}].employmentId`,
        path: `achievementRecords[${index}].employmentId`,
        modelField: "employmentId",
        message: `Employment History record "${record.employmentId}" does not exist.`
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    snapshot: version === 1
      ? { profile, employmentRecords, achievementRecords }
      : {
        profile,
        employmentRecords,
        achievementRecords,
        jobs: validJobs,
        requirements,
        achievementMappings
      }
  };
}

function evidenceError(achievementId, path, message) {
  return {
    recordType: "achievement",
    recordId: achievementId,
    field: "evidence",
    path: `achievementRecords[${achievementId}].evidence${path}`,
    message
  };
}

function validateEvidenceValue(value, achievementId, path, active, errors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      addError(errors, evidenceError(
        achievementId,
        path,
        "Numbers must be finite and must not be negative zero."
      ));
    }
    return;
  }

  if (typeof value !== "object") {
    addError(errors, evidenceError(
      achievementId,
      path,
      `${typeof value} values cannot be represented faithfully by JSON.`
    ));
    return;
  }

  if (active.has(value)) {
    addError(errors, evidenceError(achievementId, path, "Cyclic references are not supported."));
    return;
  }

  active.add(value);
  try {
    let isArray;
    try {
      isArray = Array.isArray(value);
    } catch {
      addError(errors, evidenceError(
        achievementId,
        path,
        "Evidence properties could not be inspected safely."
      ));
      return;
    }

    if (isArray) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        addError(errors, evidenceError(
          achievementId,
          path,
          "Arrays must use the standard Array.prototype."
        ));
        return;
      }
      const keys = Reflect.ownKeys(value);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0) {
        addError(errors, evidenceError(achievementId, path, "Array length is invalid."));
        return;
      }

      const expectedKeyCount = length + 1;
      if (keys.length !== expectedKeyCount || !keys.includes("length")) {
        addError(errors, evidenceError(
          achievementId,
          path,
          "Arrays must be dense and cannot contain additional properties."
        ));
        return;
      }

      for (let index = 0; index < length; index += 1) {
        const key = String(index);
        if (!keys.includes(key)) {
          addError(errors, evidenceError(
            achievementId,
            `${path}[${index}]`,
            "Sparse arrays are not supported."
          ));
          continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          addError(errors, evidenceError(
            achievementId,
            `${path}[${index}]`,
            "Array elements must be enumerable data properties."
          ));
          continue;
        }
        validateEvidenceValue(
          descriptor.value,
          achievementId,
          `${path}[${index}]`,
          active,
          errors
        );
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype) {
      addError(errors, evidenceError(
        achievementId,
        path,
        "Only ordinary plain objects are supported."
      ));
      return;
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        addError(errors, evidenceError(
          achievementId,
          path,
          "Symbol-keyed object properties are not supported."
        ));
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        addError(errors, evidenceError(
          achievementId,
          `${path}.${key}`,
          "Object properties must be enumerable data properties."
        ));
        continue;
      }
      validateEvidenceValue(
        descriptor.value,
        achievementId,
        `${path}.${key}`,
        active,
        errors
      );
    }
  } catch {
    addError(errors, evidenceError(
      achievementId,
      path,
      "Evidence properties could not be inspected safely."
    ));
  } finally {
    active.delete(value);
  }
}

function validateEvidence(snapshot) {
  const errors = [];
  for (const record of snapshot.achievementRecords) {
    validateEvidenceValue(record.evidence, record.id, "", new WeakSet(), errors);
  }
  return errors;
}

function validateEnvelope(envelope, version) {
  if (!isPlainObject(envelope)) {
    return [{
      field: "envelope",
      path: "envelope",
      message: "Stored envelope must be a plain object."
    }];
  }

  const errors = [];
  let keys;
  try {
    keys = Reflect.ownKeys(envelope);
  } catch {
    return [{
      field: "envelope",
      path: "envelope",
      message: "Stored envelope properties could not be inspected safely."
    }];
  }

  const fields = version === 1
    ? v1SnapshotFields
    : version === SCHEMA_VERSION
      ? snapshotFields
      : [];
  const envelopeFields = ["version", ...fields];
  const expected = new Set(envelopeFields);
  for (const key of keys) {
    if (typeof key !== "string" || !expected.has(key)) {
      addError(errors, {
        field: `envelope.${String(key)}`,
        path: `envelope.${String(key)}`,
        message: "Stored envelope contains an unexpected property."
      });
    }
  }
  for (const field of envelopeFields) {
    if (!Object.hasOwn(envelope, field)) {
      addError(errors, {
        field: `envelope.${field}`,
        path: `envelope.${field}`,
        message: "Stored envelope property is required."
      });
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(envelope, field);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        addError(errors, {
          field: `envelope.${field}`,
          path: `envelope.${field}`,
          message: "Stored envelope properties must be enumerable data properties."
        });
      }
    }
  }
  return errors;
}

function makeCorruptError(errors) {
  return {
    message: "Stored Career Knowledge Base data is invalid.",
    errors
  };
}

/**
 * Creates a storage adapter using an injected Storage-like object.
 *
 * Public API:
 * - load(): return `missing`, `loaded`, `corrupt`, `unsupported-version`, or
 *   `unavailable`, with a validated snapshot where applicable.
 * - save(snapshot): validate and persist the complete version-2 envelope,
 *   returning a status result.
 *
 * Valid version-1 snapshots are returned as version-2 data in memory. Loading
 * never writes storage; corrupt or unsupported data disables writes for this
 * adapter instance.
 */
export function createCareerStorage(storage) {
  if (
    storage === null
    || (typeof storage !== "object" && typeof storage !== "function")
    || typeof storage.getItem !== "function"
    || typeof storage.setItem !== "function"
  ) {
    throw new TypeError("Storage must provide getItem(key) and setItem(key, value).");
  }

  let writesDisabled = false;

  return {
    load() {
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
      } catch {
        return {
          status: "unavailable",
          error: { message: "Storage could not be read." }
        };
      }

      if (raw === null) {
        return { status: "missing", snapshot: emptySnapshot() };
      }
      if (typeof raw !== "string") {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "storedValue",
            path: "storedValue",
            message: "Stored value must be a string."
          }]),
          writesDisabled: true
        };
      }

      let envelope;
      try {
        envelope = JSON.parse(raw);
      } catch {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "json",
            path: "json",
            message: "Stored value is not valid JSON."
          }]),
          writesDisabled: true
        };
      }

      if (!isPlainObject(envelope)) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(validateEnvelope(envelope, undefined)),
          writesDisabled: true
        };
      }

      let version;
      try {
        const descriptor = Object.getOwnPropertyDescriptor(envelope, "version");
        if (!descriptor) {
          writesDisabled = true;
          return {
            status: "corrupt",
            error: makeCorruptError([{
              field: "envelope.version",
              path: "envelope.version",
              message: "Stored envelope property is required."
            }]),
            writesDisabled: true
          };
        }
        if (!descriptor.enumerable || !("value" in descriptor)) {
          writesDisabled = true;
          return {
            status: "corrupt",
            error: makeCorruptError([{
              field: "envelope.version",
              path: "envelope.version",
              message: "Stored envelope properties must be enumerable data properties."
            }]),
            writesDisabled: true
          };
        }
        version = descriptor.value;
      } catch {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "version",
            path: "version",
            message: "Envelope version could not be read safely."
          }]),
          writesDisabled: true
        };
      }

      if (typeof version !== "number") {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "version",
            path: "version",
            message: "Envelope version must be a number."
          }]),
          writesDisabled: true
        };
      }
      if (version !== 1 && version !== SCHEMA_VERSION) {
        writesDisabled = true;
        return { status: "unsupported-version", version, writesDisabled: true };
      }

      const envelopeErrors = validateEnvelope(envelope, version);
      if (envelopeErrors.length > 0) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(envelopeErrors),
          writesDisabled: true
        };
      }

      let snapshot;
      try {
        snapshot = {};
        for (const field of version === 1 ? v1SnapshotFields : snapshotFields) {
          snapshot[field] = Object.getOwnPropertyDescriptor(envelope, field).value;
        }
      } catch {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "envelope",
            path: "envelope",
            message: "Stored envelope values could not be read safely."
          }]),
          writesDisabled: true
        };
      }

      const validation = validateSnapshot(snapshot, version);
      if (!validation.valid) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(validation.errors),
          writesDisabled: true
        };
      }

      const fidelityErrors = validateEvidence(validation.snapshot);
      if (fidelityErrors.length > 0) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(fidelityErrors),
          writesDisabled: true
        };
      }

      const migratedSnapshot = version === 1
        ? {
          ...validation.snapshot,
          jobs: [],
          requirements: [],
          achievementMappings: []
        }
        : validation.snapshot;
      return { status: "loaded", snapshot: migratedSnapshot };
    },

    save(snapshot) {
      if (writesDisabled) {
        return { status: "writes-disabled" };
      }

      const validation = validateSnapshot(snapshot);
      if (!validation.valid) {
        return { status: "invalid-snapshot", errors: validation.errors };
      }

      const fidelityErrors = validateEvidence(validation.snapshot);
      if (fidelityErrors.length > 0) {
        return { status: "json-fidelity-error", errors: fidelityErrors };
      }

      let serialized;
      try {
        serialized = JSON.stringify({
          version: SCHEMA_VERSION,
          profile: validation.snapshot.profile,
          employmentRecords: validation.snapshot.employmentRecords,
          achievementRecords: validation.snapshot.achievementRecords,
          jobs: validation.snapshot.jobs,
          requirements: validation.snapshot.requirements,
          achievementMappings: validation.snapshot.achievementMappings
        });
      } catch {
        return {
          status: "json-fidelity-error",
          errors: [{
            field: "snapshot",
            path: "snapshot",
            message: "Snapshot could not be serialized faithfully."
          }]
        };
      }

      try {
        storage.setItem(STORAGE_KEY, serialized);
      } catch {
        return {
          status: "write-failed",
          error: { message: "Storage could not save the Career Knowledge Base." }
        };
      }

      return { status: "saved" };
    }
  };
}
