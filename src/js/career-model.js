import { isCalendarDate, isUtcTimestamp } from "./model-validation.js";
import { addProvenanceErrors, copyProvenance } from "./provenance-model.js";

export { isJsonCompatibleProvenance, isUtcTimestamp } from "./model-validation.js";

// Provenance may be absent, null, or an array; constructors default omissions to [].
const profileFields = ["fullName", "headline", "summary", "skills", "provenance"];
const employmentFields = [
  "employer",
  "roleTitle",
  "startDate",
  "endDate",
  "isCurrent",
  "responsibilities",
  "provenance"
];
const profileRecordFields = [
  "id",
  ...profileFields,
  "createdAt",
  "updatedAt"
];
const employmentRecordFields = [
  "id",
  ...employmentFields,
  "createdAt",
  "updatedAt"
];
const metadataFields = ["id", "createdAt"];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnknownFieldErrors(value, allowedFields, errors, prefix = "") {
  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) {
      errors.push({
        field: `${prefix}${field}`,
        message: "This field is not part of the record contract."
      });
    }
  }
}

function addRequiredStringError(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field, message: "This field is required." });
  } else if (typeof value[field] !== "string") {
    errors.push({ field, message: "This field must be a string." });
  } else if (value[field].trim() === "") {
    errors.push({ field, message: "This field must not be blank." });
  }
}

function addStringError(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field, message: "This field is required." });
  } else if (typeof value[field] !== "string") {
    errors.push({ field, message: "This field must be a string." });
  }
}

export function dateInterval(value) {
  if (typeof value === "string") {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
    return match && Number(match[1]) > 0 && isCalendarDate(value)
      ? { start: value, end: value }
      : undefined;
  }
  if (value === null) {
    return null;
  }
  if (!isObject(value)) {
    return undefined;
  }

  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  if (
    (prototype !== Object.prototype && prototype !== null)
    || keys.length !== 2
    || !keys.includes("value")
    || !keys.includes("precision")
    || keys.some((key) => typeof key !== "string")
  ) {
    return undefined;
  }
  const valueDescriptor = Object.getOwnPropertyDescriptor(value, "value");
  const precisionDescriptor = Object.getOwnPropertyDescriptor(value, "precision");
  if (
    !valueDescriptor?.enumerable
    || !("value" in valueDescriptor)
    || !precisionDescriptor?.enumerable
    || !("value" in precisionDescriptor)
  ) {
    return undefined;
  }
  const dateValue = valueDescriptor.value;
  const precision = precisionDescriptor.value;
  if (typeof dateValue !== "string" || typeof precision !== "string") {
    return undefined;
  }

  const yearMatch = /^(\d{4})$/.exec(dateValue);
  if (precision === "year" && yearMatch && Number(yearMatch[1]) > 0) {
    return { start: `${dateValue}-01-01`, end: `${dateValue}-12-31` };
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(dateValue);
  if (precision === "month" && monthMatch && Number(monthMatch[1]) > 0) {
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    if (month >= 1 && month <= 12) {
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [
        31,
        leapYear ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
      ][month - 1];
      return {
        start: `${dateValue}-01`,
        end: `${dateValue}-${String(daysInMonth).padStart(2, "0")}`
      };
    }
  }

  if (precision === "day") {
    const dayMatch = /^(\d{4})-\d{2}-\d{2}$/.exec(dateValue);
    if (dayMatch && Number(dayMatch[1]) > 0 && isCalendarDate(dateValue)) {
      return { start: dateValue, end: dateValue };
    }
  }

  return undefined;
}

function isValidEmploymentDate(value) {
  return value === null || dateInterval(value) !== undefined;
}

function normalizeEmploymentDate(value) {
  if (typeof value === "string") {
    return { value, precision: "day" };
  }
  return value === null ? null : { ...value };
}

function addTimestampError(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field, message: "This field is required." });
  } else if (!isUtcTimestamp(value[field])) {
    errors.push({
      field,
      message: "Use a valid ISO 8601 UTC timestamp ending in Z."
    });
  }
}

function addTimestampOrderError(value, errors) {
  if (
    isUtcTimestamp(value.createdAt)
    && isUtcTimestamp(value.updatedAt)
    && Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    errors.push({
      field: "updatedAt",
      message: "This timestamp must not be earlier than createdAt."
    });
  }
}

function addStringArrayErrors(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field, message: "This field is required." });
    return;
  }

  if (!Array.isArray(value[field])) {
    errors.push({ field, message: "This field must be an array of strings." });
    return;
  }

  value[field].forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push({
        field: `${field}[${index}]`,
        message: "Each item must be a string."
      });
    }
  });
}

function addMetadataErrors(metadata) {
  const errors = [];

  if (!isObject(metadata)) {
    return [{
      field: "metadata",
      message: "Metadata must be an object containing an ID and creation timestamp."
    }];
  }

  addUnknownFieldErrors(metadata, metadataFields, errors, "metadata.");
  addRequiredStringError(metadata, "id", errors);

  if (!Object.hasOwn(metadata, "createdAt")) {
    errors.push({ field: "metadata.createdAt", message: "This field is required." });
  } else if (!isUtcTimestamp(metadata.createdAt)) {
    errors.push({
      field: "metadata.createdAt",
      message: "Use a valid ISO 8601 UTC timestamp ending in Z."
    });
  }

  return errors;
}

function addInputErrors(input, allowedFields, validateFields) {
  if (!isObject(input)) {
    return [{
      field: "input",
      message: "Input must be an object containing the record fields."
    }];
  }

  const errors = [];
  addUnknownFieldErrors(input, allowedFields, errors);
  validateFields(input, errors);
  return errors;
}

function throwConstructionError(recordName, errors) {
  const error = new TypeError(`Cannot create ${recordName}: input or metadata is invalid.`);
  error.errors = errors;
  throw error;
}

function validateProfileFields(value, errors) {
  addRequiredStringError(value, "fullName", errors);
  addStringError(value, "headline", errors);
  addStringError(value, "summary", errors);
  addStringArrayErrors(value, "skills", errors);
  addProvenanceErrors(value, errors);
}

function validateEmploymentFields(value, errors) {
  addRequiredStringError(value, "employer", errors);
  addRequiredStringError(value, "roleTitle", errors);

  for (const field of ["startDate", "endDate"]) {
    if (!Object.hasOwn(value, field)) {
      errors.push({ field, message: "This field is required." });
    } else if (value[field] === null) {
      continue;
    } else if (!isValidEmploymentDate(value[field])) {
      errors.push({
        field,
        message: "Use a valid structured date or null."
      });
    }
  }

  if (!Object.hasOwn(value, "isCurrent")) {
    errors.push({ field: "isCurrent", message: "This field is required." });
  } else if (typeof value.isCurrent !== "boolean") {
    errors.push({ field: "isCurrent", message: "This field must be a boolean." });
  }

  addStringArrayErrors(value, "responsibilities", errors);
  addProvenanceErrors(value, errors);

  if (
    typeof value.isCurrent === "boolean"
    && value.isCurrent
    && Object.hasOwn(value, "endDate")
    && value.endDate !== null
    && isValidEmploymentDate(value.endDate)
  ) {
    errors.push({
      field: "endDate",
      message: "A current role must have a null end date."
    });
  }

  if (
    Object.hasOwn(value, "startDate")
    && Object.hasOwn(value, "endDate")
    && dateInterval(value.startDate)
    && dateInterval(value.endDate)
    && dateInterval(value.endDate).end < dateInterval(value.startDate).start
  ) {
    errors.push({
      field: "endDate",
      message: "The end date must not be earlier than the start date."
    });
  }
}

/**
 * Creates a profile with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createCareerProfile(input, metadata) {
  const inputErrors = addInputErrors(input, profileFields, validateProfileFields);
  const metadataErrors = addMetadataErrors(metadata);
  const errors = [...inputErrors, ...metadataErrors];

  if (errors.length > 0) {
    throwConstructionError("Career Profile", errors);
  }

  return {
    id: metadata.id,
    fullName: input.fullName,
    headline: input.headline,
    summary: input.summary,
    skills: [...input.skills],
    provenance: copyProvenance(input.provenance === null ? null : (input.provenance ?? [])),
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
}

/**
 * Creates an employment record with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createEmploymentRecord(input, metadata) {
  const inputErrors = addInputErrors(input, employmentFields, validateEmploymentFields);
  const metadataErrors = addMetadataErrors(metadata);
  const errors = [...inputErrors, ...metadataErrors];

  if (errors.length > 0) {
    throwConstructionError("Employment History record", errors);
  }

  return {
    id: metadata.id,
    employer: input.employer,
    roleTitle: input.roleTitle,
    startDate: normalizeEmploymentDate(input.startDate),
    endDate: normalizeEmploymentDate(input.endDate),
    isCurrent: input.isCurrent,
    responsibilities: [...input.responsibilities],
    provenance: copyProvenance(input.provenance === null ? null : (input.provenance ?? [])),
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
}

/**
 * Validates a profile without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateCareerProfile(value) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ field: "record", message: "Career Profile must be an object." }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, profileRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  validateProfileFields(value, errors);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);
  addTimestampOrderError(value, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an employment record without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateEmploymentRecord(value) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{
        field: "record",
        message: "Employment History record must be an object."
      }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, employmentRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  validateEmploymentFields(value, errors);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);
  addTimestampOrderError(value, errors);

  return { valid: errors.length === 0, errors };
}
