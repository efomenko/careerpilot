import {
  validateCareerProfile,
  validateEmploymentRecord
} from "./career-model.js";
import { validateAchievementRecord } from "./achievement-model.js";
import { addProvenanceErrors } from "./provenance-model.js";
import { validateJobRecord } from "./job-model.js";
import { validateRequirementRecord } from "./requirement-model.js";
import { createSnapshotWriter } from "./snapshot-writer.js";
import { validateApprovalReceipt } from "./approval-receipt.js";

const STORAGE_KEY = "careerpilot.state";
const SCHEMA_VERSION = 6;
const v1SnapshotFields = ["profile", "employmentRecords", "achievementRecords"];
const v2SnapshotFields = [
  ...v1SnapshotFields,
  "jobs",
  "requirements",
  "achievementMappings"
];
const v3SnapshotFields = [
  ...v2SnapshotFields.slice(0, -1),
  "legacyRequirements",
  "achievementMappings"
];
const v4SnapshotFields = [
  ...v3SnapshotFields,
  "educationRecords",
  "certificationRecords",
  "import"
];
const importContainerFields = ["sessions", "completedBatches", "importReports"];
const v6ImportContainerFields = [...importContainerFields, "approvalReceipts"];

function snapshotFieldsForVersion(version) {
  if (version === 1) {
    return v1SnapshotFields;
  }
  if (version === 2) {
    return v2SnapshotFields;
  }
  if (version === 3) {
    return v3SnapshotFields;
  }
  if (version === 4 || version === 5 || version === 6) {
    return v4SnapshotFields;
  }
  return [];
}

function emptySnapshot() {
  return {
    profile: null,
    employmentRecords: [],
    achievementRecords: [],
    jobs: [],
    requirements: [],
    legacyRequirements: [],
    achievementMappings: [],
    educationRecords: [],
    certificationRecords: [],
    import: {
      sessions: [],
      completedBatches: [],
      importReports: [],
      approvalReceipts: []
    }
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

function validateJsonValue(value, path, active, errors, rejectNegativeZero = false) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (rejectNegativeZero && Object.is(value, -0))
      || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      addError(errors, {
        recordType: "legacyRequirement",
        field: path,
        path,
        message: rejectNegativeZero ? "Numbers must be finite and not negative zero." : "Numbers must be finite."
      });
    }
    return;
  }
  if (typeof value !== "object") {
    addError(errors, {
      recordType: "legacyRequirement",
      field: path,
      path,
      message: `${typeof value} values cannot be represented faithfully by JSON.`
    });
    return;
  }
  if (active.has(value)) {
    addError(errors, {
      recordType: "legacyRequirement",
      field: path,
      path,
      message: "Cyclic references are not supported."
    });
    return;
  }

  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        addError(errors, {
          recordType: "legacyRequirement",
          field: path,
          path,
          message: "Arrays must use the standard Array.prototype."
        });
        return;
      }

      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || !keys.includes("length")) {
        addError(errors, {
          recordType: "legacyRequirement",
          field: path,
          path,
          message: "Arrays must be dense and cannot contain additional properties."
        });
        return;
      }
      for (let index = 0; index < value.length; index += 1) {
        const elementPath = `${path}[${index}]`;
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          addError(errors, {
            recordType: "legacyRequirement",
            field: elementPath,
            path: elementPath,
            message: "Array elements must be enumerable data properties."
          });
          continue;
        }
        validateJsonValue(descriptor.value, elementPath, active, errors, rejectNegativeZero);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      addError(errors, {
        recordType: "legacyRequirement",
        field: path,
        path,
        message: "Only plain objects are supported."
      });
      return;
    }
    for (const key of Reflect.ownKeys(value)) {
      const propertyPath = `${path}.${String(key)}`;
      if (typeof key !== "string") {
        addError(errors, {
          recordType: "legacyRequirement",
          field: propertyPath,
          path: propertyPath,
          message: "Symbol-keyed object properties are not supported."
        });
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        addError(errors, {
          recordType: "legacyRequirement",
          field: propertyPath,
          path: propertyPath,
          message: "Object properties must be enumerable data properties."
        });
        continue;
      }
      validateJsonValue(descriptor.value, propertyPath, active, errors, rejectNegativeZero);
    }
  } catch {
    addError(errors, {
      recordType: "legacyRequirement",
      field: path,
      path,
      message: "Value properties could not be inspected safely."
    });
  } finally {
    active.delete(value);
  }
}

function validateRequirementArrayShape(records, field, errors) {
  if (!Array.isArray(records)) {
    addError(errors, { field, path: field, message: "Must be an array." });
    return;
  }
  validateJsonValue(records, field, new WeakSet(), errors);
}

function copyValidatedJson(value, active = new WeakSet()) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (active.has(value)) {
    throw new TypeError("Cyclic references cannot be copied.");
  }
  active.add(value);
  try {
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Unsupported object prototype.");
    }
    const keys = Reflect.ownKeys(value);
    const lengthDescriptor = isArray ? Object.getOwnPropertyDescriptor(value, "length") : null;
    const length = isArray ? lengthDescriptor?.value : 0;
    if (isArray && (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1)) {
      throw new TypeError("Array must be dense and contain no extra properties.");
    }
    const copy = isArray ? new Array(length) : Object.create(prototype);
    for (const key of keys) {
      if (isArray && key === "length") {
        continue;
      }
      if (typeof key !== "string"
        || (isArray && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) {
        throw new TypeError("Unsupported property.");
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError("Properties must be enumerable data properties.");
      }
      Object.defineProperty(copy, key, {
        value: copyValidatedJson(descriptor.value, active),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return copy;
  } finally {
    active.delete(value);
  }
}

function migrateV2Requirements(snapshot) {
  const idCounts = new Map();
  for (const record of snapshot.requirements) {
    if (isPlainObject(record) && typeof record.id === "string") {
      idCounts.set(record.id, (idCounts.get(record.id) ?? 0) + 1);
    }
  }

  const jobIds = new Set(snapshot.jobs.map((job) => job.id));
  const requirements = [];
  const legacyRequirements = [];
  for (const record of snapshot.requirements) {
    if (!isPlainObject(record)) {
      legacyRequirements.push(record);
      continue;
    }

    const result = validateRequirementRecord(record);
    if (
      result.valid
      && idCounts.get(record.id) === 1
      && jobIds.has(record.jobId)
    ) {
      requirements.push(record);
    } else {
      legacyRequirements.push(record);
    }
  }

  return { requirements, legacyRequirements };
}

function stripV4Provenance(record) {
  return Object.fromEntries(
    Object.keys(record)
      .filter((field) => field !== "provenance")
      .map((field) => [field, Object.getOwnPropertyDescriptor(record, field).value])
  );
}

function validateProvenance(record) {
  const errors = [];
  addProvenanceErrors(record, errors);
  return errors;
}

function validateWithProvenance(record, validator) {
  const result = validator(stripV4Provenance(record));
  const errors = [...result.errors, ...validateProvenance(record)];
  return { valid: errors.length === 0, errors };
}

function validateV4ProfileRecord(record) {
  return validateWithProvenance(record, validateCareerProfile);
}

function isValidStructuredDate(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 2
    || !keys.includes("value")
    || !keys.includes("precision")
    || keys.some((key) => typeof key !== "string")
  ) {
    return false;
  }
  const valueDescriptor = Object.getOwnPropertyDescriptor(value, "value");
  const precisionDescriptor = Object.getOwnPropertyDescriptor(value, "precision");
  if (
    !valueDescriptor?.enumerable
    || !("value" in valueDescriptor)
    || !precisionDescriptor?.enumerable
    || !("value" in precisionDescriptor)
  ) {
    return false;
  }
  const dateValue = valueDescriptor.value;
  const precision = precisionDescriptor.value;
  if (typeof dateValue !== "string" || typeof precision !== "string") {
    return false;
  }

  const yearMatch = /^(\d{4})$/.exec(dateValue);
  if (precision === "year") {
    return Boolean(yearMatch && Number(yearMatch[1]) >= 1);
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(dateValue);
  if (precision === "month") {
    return Boolean(
      monthMatch
      && Number(monthMatch[1]) >= 1
      && Number(monthMatch[2]) >= 1
      && Number(monthMatch[2]) <= 12
    );
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (precision !== "day" || !dayMatch || Number(dayMatch[1]) < 1) {
    return false;
  }

  const year = Number(dayMatch[1]);
  const month = Number(dayMatch[2]);
  const day = Number(dayMatch[3]);
  if (month < 1 || month > 12) {
    return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2
    ? leapYear ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day >= 1 && day <= daysInMonth;
}

function structuredDateInterval(value) {
  if (value === null) {
    return null;
  }
  if (!isValidStructuredDate(value)) {
    return undefined;
  }
  const { value: dateValue, precision } = value;
  if (precision === "year") {
    return { start: `${dateValue}-01-01`, end: `${dateValue}-12-31` };
  }
  if (precision === "month") {
    const [year, month] = dateValue.split("-").map(Number);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = month === 2
      ? leapYear ? 29 : 28
      : [4, 6, 9, 11].includes(month) ? 30 : 31;
    return {
      start: `${dateValue}-01`,
      end: `${dateValue}-${String(daysInMonth).padStart(2, "0")}`
    };
  }
  return { start: dateValue, end: dateValue };
}

function validateV4EmploymentRecord(record) {
  const errors = [];
  const startInterval = structuredDateInterval(record.startDate);
  const endInterval = structuredDateInterval(record.endDate);
  if (startInterval === undefined) {
    errors.push({
      field: "startDate",
      message: "Must be null or a valid structured date."
    });
  }
  if (endInterval === undefined) {
    errors.push({
      field: "endDate",
      message: "Must be null or a valid structured date."
    });
  }
  if (
    startInterval
    && endInterval
    && endInterval.end < startInterval.start
  ) {
    errors.push({
      field: "endDate",
      message: "The end date must not be definitely earlier than the start date."
    });
  }

  const modelResult = validateWithProvenance(record, validateEmploymentRecord);
  errors.push(...modelResult.errors);

  return { valid: errors.length === 0, errors };
}

function validateV4AchievementRecord(record) {
  return validateWithProvenance(record, validateAchievementRecord);
}

function validateHistoricalEmploymentRecord(record) {
  const errors = [];
  for (const field of ["startDate", "endDate"]) {
    const value = record[field];
    if (field === "endDate" && value === null) {
      continue;
    }
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push({ field, message: "Historical Employment dates must be full date strings." });
    } else if (value.startsWith("0000-")) {
      errors.push({ field, message: "Year 0000 cannot be represented in snapshot version 4." });
    } else if (!isValidStructuredDate({ value, precision: "day" })) {
      errors.push({ field, message: "Use a valid historical calendar date." });
    }
  }
  if (record.isCurrent === true && record.endDate !== null) {
    errors.push({ field: "endDate", message: "A current role must have a null end date." });
  }
  if (errors.length === 0 && record.endDate !== null && record.endDate < record.startDate) {
    errors.push({ field: "endDate", message: "The end date must not be earlier than the start date." });
  }
  const result = validateEmploymentRecord(stripV4Provenance(record));
  errors.push(
    ...result.errors.filter((error) => error.field !== "startDate" && error.field !== "endDate"),
    ...validateProvenance(record)
  );
  return { valid: errors.length === 0, errors };
}

function validateContainerArray(value, field, errors) {
  let validArray = false;
  try {
    validArray = Array.isArray(value);
    if (validArray && Object.getPrototypeOf(value) !== Array.prototype) {
      validArray = false;
    }
  } catch {
    validArray = false;
  }
  if (!validArray) {
    addError(errors, { field, path: field, message: "Must be an array." });
  }
}

function validateV4Containers(snapshot, errors, version) {
  const containerFields = version === 6 ? v6ImportContainerFields : importContainerFields;
  validateContainerArray(snapshot.educationRecords, "educationRecords", errors);
  validateContainerArray(snapshot.certificationRecords, "certificationRecords", errors);

  const importValue = snapshot.import;
  let importIsPlainObject = false;
  try {
    importIsPlainObject = isPlainObject(importValue);
  } catch {
    addError(errors, {
      field: "import",
      path: "import",
      message: "Import container could not be inspected safely."
    });
    return;
  }
  if (!importIsPlainObject) {
    addError(errors, {
      field: "import",
      path: "import",
      message: "Must be a plain object."
    });
    return;
  }

  let keys;
  try {
    keys = Reflect.ownKeys(importValue);
  } catch {
    addError(errors, {
      field: "import",
      path: "import",
      message: "Import container properties could not be inspected safely."
    });
    return;
  }
  for (const key of keys) {
    if (typeof key !== "string" || !containerFields.includes(key)) {
      addError(errors, {
        field: `import.${String(key)}`,
        path: `import.${String(key)}`,
        message: "Import container contains an unexpected property."
      });
    }
  }
  for (const field of containerFields) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(importValue, field);
    } catch {
      addError(errors, {
        field: `import.${field}`,
        path: `import.${field}`,
        message: "Import container property could not be inspected safely."
      });
      continue;
    }
    if (!descriptor) {
      addError(errors, {
        field: `import.${field}`,
        path: `import.${field}`,
        message: "Import container property is required."
      });
      continue;
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      addError(errors, {
        field: `import.${field}`,
        path: `import.${field}`,
        message: "Import container properties must be enumerable data properties."
      });
    } else {
      validateContainerArray(descriptor.value, `import.${field}`, errors);
      if (field === "approvalReceipts") {
        if (!isJsonCompatibleReceiptArray(descriptor.value)) {
          addError(errors, {
            field: "import.approvalReceipts",
            path: "import.approvalReceipts",
            message: "Approval receipts must contain valid, unique receipts."
          });
        }
      }
    }
  }
}

function isJsonCompatibleReceiptArray(receipts) {
  try {
    if (!Array.isArray(receipts)) return false;
    const detached = copyValidatedJson(receipts);
    const keys = new Set();
    return detached.every((receipt) => {
      if (!validateApprovalReceipt(receipt)) return false;
      const key = JSON.stringify([receipt.sessionId, receipt.candidateId]);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
  } catch {
    return false;
  }
}

function migrateV3ToV4(snapshot) {
  const errors = [];
  const migrateEmploymentDate = (date, recordId, index, field) => {
    if (date === null) {
      return null;
    }
    if (date.startsWith("0000-")) {
      addError(errors, {
        recordType: "employment",
        recordId,
        field: `employmentRecords[${index}].${field}`,
        path: `employmentRecords[${index}].${field}`,
        message: "Year 0000 cannot be represented in snapshot version 4."
      });
      return null;
    }
    return { value: date, precision: "day" };
  };
  const migrateRecord = (record) => ({
    ...record,
    ...(!Object.hasOwn(record, "provenance") ? { provenance: [] } : {})
  });
  const employmentRecords = snapshot.employmentRecords.map((record, index) => ({
    ...record,
    startDate: migrateEmploymentDate(record.startDate, record.id, index, "startDate"),
    endDate: migrateEmploymentDate(record.endDate, record.id, index, "endDate"),
    ...(!Object.hasOwn(record, "provenance") ? { provenance: [] } : {})
  }));
  if (errors.length > 0) {
    return { errors };
  }

  return {
    snapshot: {
      ...snapshot,
      profile: snapshot.profile === null ? null : migrateRecord(snapshot.profile),
      employmentRecords,
      achievementRecords: snapshot.achievementRecords.map(migrateRecord),
      educationRecords: [],
      certificationRecords: [],
      import: {
        sessions: [],
        completedBatches: [],
        importReports: []
      }
    },
    errors
  };
}

function validateSnapshot(snapshot, version = 6) {
  const errors = [];
  const fields = snapshotFieldsForVersion(version);
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
  let legacyRequirements = [];
  let achievementMappings = [];
  let educationRecords = [];
  let certificationRecords = [];
  let importValue;
  try {
    profile = Object.getOwnPropertyDescriptor(snapshot, "profile")?.value;
    employmentRecords = Object.getOwnPropertyDescriptor(snapshot, "employmentRecords")?.value;
    achievementRecords = Object.getOwnPropertyDescriptor(snapshot, "achievementRecords")?.value;
    if (version >= 2) {
      jobs = Object.getOwnPropertyDescriptor(snapshot, "jobs")?.value;
      requirements = Object.getOwnPropertyDescriptor(snapshot, "requirements")?.value;
      achievementMappings = Object.getOwnPropertyDescriptor(
        snapshot,
        "achievementMappings"
      )?.value;
      if (version >= 3) {
        legacyRequirements = Object.getOwnPropertyDescriptor(
          snapshot,
          "legacyRequirements"
        )?.value;
      }
      if (version >= 4) {
        educationRecords = Object.getOwnPropertyDescriptor(
          snapshot,
          "educationRecords"
        )?.value;
        certificationRecords = Object.getOwnPropertyDescriptor(
          snapshot,
          "certificationRecords"
        )?.value;
        importValue = Object.getOwnPropertyDescriptor(snapshot, "import")?.value;
      }
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
        const result = version === 4
          ? validateV4ProfileRecord(profile)
          : validateV4ProfileRecord(profile);
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
    version >= 4 ? validateV4EmploymentRecord : validateHistoricalEmploymentRecord,
    errors
  );
  const validAchievementRecords = validateRecordArray(
    achievementRecords,
    "achievementRecords",
    "achievement",
    validateV4AchievementRecord,
    errors
  );
  if (version >= 4) {
    validateV4Containers(snapshot, errors, version);
  }
  const validJobs = version >= 2
    ? validateRecordArray(jobs, "jobs", "job", validateJobRecord, errors)
    : [];
  let validRequirements = requirements;
  if (version === 2) {
    validateRequirementArrayShape(requirements, "requirements", errors);
    validatePlainObjectArray(
      achievementMappings,
      "achievementMappings",
      "achievement mapping",
      errors
    );
  } else if (version >= 3) {
    validRequirements = validateRecordArray(
      requirements,
      "requirements",
      "requirement",
      validateRequirementRecord,
      errors
    );
    const jobIds = new Set(validJobs.map((job) => job.id));
    validRequirements.forEach((requirement, index) => {
      if (!jobIds.has(requirement.jobId)) {
        addError(errors, {
          recordType: "requirement",
          recordId: requirement.id,
          field: `requirements[${index}].jobId`,
          path: `requirements[${index}].jobId`,
          modelField: "jobId",
          message: `Job "${requirement.jobId}" does not exist.`
        });
      }
    });
    validateRequirementArrayShape(
      legacyRequirements,
      "legacyRequirements",
      errors
    );
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
        requirements: version >= 3
          ? validRequirements
          : requirements,
        ...(version >= 3 ? { legacyRequirements } : {}),
        achievementMappings,
        ...(version >= 4 ? {
          educationRecords,
          certificationRecords,
          import: importValue
        } : {})
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

  const fields = snapshotFieldsForVersion(version);
  const envelopeFields = ["version", ...(version >= 5 ? ["snapshotRevision", "careerRevision"] : []), ...fields];
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
      if (version >= 5) {
        const snapshotRevision = Object.getOwnPropertyDescriptor(envelope, "snapshotRevision")?.value;
        const careerRevision = Object.getOwnPropertyDescriptor(envelope, "careerRevision")?.value;
        if (![snapshotRevision, careerRevision].every((value) => Number.isSafeInteger(value) && value >= 0)
          || careerRevision > snapshotRevision) {
          addError(errors, {
            field: "envelope.snapshotRevision",
            path: "envelope.snapshotRevision",
            message: "Revisions must be non-negative safe integers and careerRevision cannot exceed snapshotRevision."
          });
        }
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

function normalizedDecimal(token) {
  const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const [whole, fraction = ""] = (negative ? mantissa.slice(1) : mantissa).split(".");
  const digits = (whole + fraction).replace(/^0+/, "");
  if (!digits) {
    return { digits: "0", scale: 0, negative: false };
  }
  const significant = digits.replace(/0+$/, "");
  const scale = Number(exponent) - fraction.length + digits.length - significant.length;
  if (!Number.isSafeInteger(scale)) {
    return null;
  }
  return { digits: significant, scale, negative };
}

// Compare decimal values rather than spelling; never expand an exponent into zeros.
function numericTokenProtectionReason(raw) {
  const numberPattern = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  let precisionLoss = false;
  for (let index = 0; index < raw.length;) {
    if (raw[index] === '"') {
      index += 1;
      while (index < raw.length) {
        if (raw[index] === "\\") index += 2;
        else if (raw[index++] === '"') break;
      }
      continue;
    }
    if (raw[index] === "-" || (raw[index] >= "0" && raw[index] <= "9")) {
      numberPattern.lastIndex = index;
      const token = numberPattern.exec(raw)[0];
      index = numberPattern.lastIndex;
      const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
      const unsigned = mantissa.replace("-", "");
      const [whole, fraction = ""] = unsigned.split(".");
      const digits = (whole + fraction).replace(/^0+/, "");
      if (!digits) continue;
      const scale = Number(exponent) - fraction.length;
      let integerDigits = digits;
      let isInteger = true;
      if (scale < 0) {
        const trailingZeros = (digits.match(/0*$/) || [""])[0].length;
        if (-scale > trailingZeros) {
          isInteger = false;
        } else {
          integerDigits = digits.slice(0, digits.length + scale);
        }
      }
      const length = integerDigits.length + Math.max(0, scale);
      if (isInteger && (length > 16 || (length === 16
        && (scale > 0 ? integerDigits + "0".repeat(scale) : integerDigits) > "9007199254740991"))) {
        return "unsafe-integer";
      }

      const parsed = Number(token);
      if (!Number.isFinite(parsed)) {
        precisionLoss = true;
        continue;
      }
      const original = normalizedDecimal(token);
      const serialized = normalizedDecimal(JSON.stringify(parsed));
      if (!original || !serialized || original.digits !== serialized.digits
        || original.scale !== serialized.scale || original.negative !== serialized.negative) {
        precisionLoss = true;
      }
      continue;
    }
    index += 1;
  }
  return precisionLoss ? "numeric-precision" : null;
}

/**
 * Creates a storage adapter using an injected Storage-like object.
 *
 * Public API:
 * - load(): return `missing`, `loaded`, `protected`, `corrupt`, `unsupported-version`, or
 *   `unavailable`, with a validated snapshot where applicable.
 * - createWriter(options): create the coordinated writer for complete v6 snapshots.
 *
 * Valid historical snapshots are migrated in memory to version 6.
 * Loading never writes storage; corrupt or unsupported data disables writes for
 * this adapter instance. Each save rechecks stored data. Historical negative
 * zero and unsafe raw numeric tokens disable writes to prevent lossy replacement.
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

  function loadStored() {
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
        return { status: "missing", snapshot: emptySnapshot(), snapshotRevision: 0, careerRevision: 0 };
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

      const numericProtectionReason = numericTokenProtectionReason(raw);
      if (numericProtectionReason) {
        writesDisabled = true;
        return { status: "protected", reason: numericProtectionReason, writesDisabled: true };
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
      if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6) {
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
        const fields = snapshotFieldsForVersion(version);
        for (const field of fields) {
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

      const validation = validateSnapshot(snapshot, version === 5 ? 4 : version);
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
      const snapshotFidelityErrors = [];
      validateJsonValue(validation.snapshot, "snapshot", new WeakSet(), snapshotFidelityErrors);
      if (snapshotFidelityErrors.length > 0) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(snapshotFidelityErrors),
          writesDisabled: true
        };
      }
      const negativeZeroErrors = [];
      validateJsonValue(validation.snapshot, "snapshot", new WeakSet(), negativeZeroErrors, true);
      const historicalNegativeZero = version < 4 && negativeZeroErrors.length > 0
        && negativeZeroErrors.every((error) =>
          (version === 2 && error.path.startsWith("snapshot.requirements["))
          || (version === 3 && error.path.startsWith("snapshot.legacyRequirements["))
        );
      if (negativeZeroErrors.length > 0 && !historicalNegativeZero) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(negativeZeroErrors),
          writesDisabled: true
        };
      }

      const v2Snapshot = version === 1
        ? {
          ...validation.snapshot,
          jobs: [],
          requirements: [],
          achievementMappings: []
        }
        : validation.snapshot;
      const v2Validation = version === 1
        ? validateSnapshot(v2Snapshot, 2)
        : validation;
      if (!v2Validation.valid) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(v2Validation.errors),
          writesDisabled: true
        };
      }

      const migratedV3Snapshot = version < 3
        ? {
          ...v2Validation.snapshot,
          ...migrateV2Requirements(v2Validation.snapshot)
        }
        : v2Validation.snapshot;
      const v3Validation = version < 3
        ? validateSnapshot(migratedV3Snapshot, 3)
        : validation;
      if (!v3Validation.valid) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(v3Validation.errors),
          writesDisabled: true
        };
      }

      if (version >= 4) {
        return {
          status: "loaded",
          snapshot: version === 6 ? v3Validation.snapshot : {
            ...v3Validation.snapshot,
            import: { ...v3Validation.snapshot.import, approvalReceipts: [] }
          },
          snapshotRevision: version >= 5 ? envelope.snapshotRevision : 0,
          careerRevision: version >= 5 ? envelope.careerRevision : 0,
          ...(version < 6 ? { needsMigration: true } : {})
        };
      }

      let migration;
      try {
        migration = migrateV3ToV4(v3Validation.snapshot);
      } catch {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError([{
            field: "snapshot",
            path: "snapshot",
            message: "Historical snapshot could not be migrated safely."
          }]),
          writesDisabled: true
        };
      }
      if (migration.errors.length > 0) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(migration.errors),
          writesDisabled: true
        };
      }
      const finalValidation = validateSnapshot(migration.snapshot, 4);
      if (!finalValidation.valid) {
        writesDisabled = true;
        return {
          status: "corrupt",
          error: makeCorruptError(finalValidation.errors),
          writesDisabled: true
        };
      }

      finalValidation.snapshot.import.approvalReceipts = [];
      if (historicalNegativeZero) {
        writesDisabled = true;
        return { status: "loaded", snapshot: finalValidation.snapshot, snapshotRevision: 0, careerRevision: 0, writesDisabled: true, needsMigration: true };
      }
      return { status: "loaded", snapshot: finalValidation.snapshot, snapshotRevision: 0, careerRevision: 0, needsMigration: true };
  }
  function validateForSave(snapshot) {
      const validation = validateSnapshot(snapshot);
      if (!validation.valid) {
        return { status: "invalid-snapshot", errors: validation.errors };
      }

      const fidelityErrors = validateEvidence(validation.snapshot);
      if (fidelityErrors.length > 0) {
        return { status: "json-fidelity-error", errors: fidelityErrors };
      }
      const snapshotFidelityErrors = [];
      validateJsonValue(validation.snapshot, "snapshot", new WeakSet(), snapshotFidelityErrors, true);
      if (snapshotFidelityErrors.length > 0) {
        return { status: "json-fidelity-error", errors: snapshotFidelityErrors };
      }
      return { status: "valid", snapshot: validation.snapshot };
  }
  function saveUnderLock(snapshot, revisions) {
      if (writesDisabled) {
        return { status: "writes-disabled" };
      }
      const existing = loadStored();
      if (existing.status === "unavailable") {
        return { status: "write-failed", error: existing.error };
      }
      if (writesDisabled || existing.writesDisabled) {
        return { status: "writes-disabled" };
      }
      const validation = validateForSave(snapshot);
      if (validation.status !== "valid") return validation;

      let detached;
      try {
        detached = copyValidatedJson(validation.snapshot);
      } catch {
        return {
          status: "json-fidelity-error",
          errors: [{ field: "snapshot", path: "snapshot", message: "Snapshot could not be copied faithfully." }]
        };
      }
      const detachedValidation = validateSnapshot(detached);
      if (!detachedValidation.valid) {
        return { status: "invalid-snapshot", errors: detachedValidation.errors };
      }
      const detachedErrors = validateEvidence(detachedValidation.snapshot);
      validateJsonValue(detachedValidation.snapshot, "snapshot", new WeakSet(), detachedErrors, true);
      if (detachedErrors.length > 0) {
        return { status: "json-fidelity-error", errors: detachedErrors };
      }

      let serialized;
      try {
        serialized = JSON.stringify({
          version: SCHEMA_VERSION,
          ...revisions,
          ...detachedValidation.snapshot
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

      // Storage has no compare-and-swap; another writer can still race this
      // final check and setItem. Do not treat this as cross-tab locking.
      const latest = loadStored();
      if (latest.status === "unavailable") {
        return { status: "write-failed", error: latest.error };
      }
      if (writesDisabled || latest.writesDisabled) {
        return { status: "writes-disabled" };
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
  return {
    load: loadStored,
    createWriter(options) {
      return createSnapshotWriter({
        ...options,
        storage: { load: loadStored, save: saveUnderLock },
        validatePrepared: validateForSave
      });
    }
  };
}
