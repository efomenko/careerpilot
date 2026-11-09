import { isJsonCompatibleProvenance } from "./career-model.js";

// Provenance may be absent, null, or an array; constructors default omissions to [].
const achievementInputFields = [
  "title",
  "context",
  "contribution",
  "actions",
  "outcome",
  "potentialImpact",
  "metrics",
  "evidence",
  "employmentId",
  "provenance"
];
const achievementRecordFields = [
  "id",
  ...achievementInputFields,
  "verificationStatus",
  "createdAt",
  "updatedAt"
];
const metadataFields = ["id", "createdAt"];
const metricFields = ["name", "value", "unit", "period", "basis"];
const verificationStatuses = ["unverified", "needs_confirmation", "verified"];

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

function addRequiredStringError(value, field, errors, prefix = "") {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field: `${prefix}${field}`, message: "This field is required." });
  } else if (typeof value[field] !== "string") {
    errors.push({ field: `${prefix}${field}`, message: "This field must be a string." });
  } else if (value[field].trim() === "") {
    errors.push({ field: `${prefix}${field}`, message: "This field must not be blank." });
  }
}

function addOptionalStringError(value, field, errors, required = false) {
  if (!Object.hasOwn(value, field) && required) {
    errors.push({ field, message: "This field is required." });
  } else if (Object.hasOwn(value, field) && typeof value[field] !== "string") {
    errors.push({ field, message: "This field must be a string." });
  }
}

function isCalendarDate(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    return false;
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
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
  ];

  return day >= 1 && day <= daysInMonth[month - 1];
}

function isUtcTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);

  if (!match || !isCalendarDate(match[1])) {
    return false;
  }

  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);

  return hour <= 23
    && minute <= 59
    && second <= 59;
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

  for (let index = 0; index < value[field].length; index += 1) {
    if (typeof value[field][index] !== "string") {
      errors.push({
        field: `${field}[${index}]`,
        message: "Each item must be a string."
      });
    }
  }
}

function addMetricsErrors(value, errors) {
  if (!Object.hasOwn(value, "metrics")) {
    errors.push({ field: "metrics", message: "This field is required." });
    return;
  }

  if (!Array.isArray(value.metrics)) {
    errors.push({ field: "metrics", message: "This field must be an array." });
    return;
  }

  for (let index = 0; index < value.metrics.length; index += 1) {
    const metric = value.metrics[index];
    const prefix = `metrics[${index}]`;

    if (!isObject(metric)) {
      errors.push({
        field: prefix,
        message: "Each metric must be an object."
      });
      continue;
    }

    addUnknownFieldErrors(metric, metricFields, errors, `${prefix}.`);
    addRequiredStringError(metric, "name", errors, `${prefix}.`);
    addRequiredStringError(metric, "unit", errors, `${prefix}.`);

    if (!Object.hasOwn(metric, "value")) {
      errors.push({ field: `${prefix}.value`, message: "This field is required." });
    } else if (typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      errors.push({
        field: `${prefix}.value`,
        message: "This field must be a finite number."
      });
    }

    if (
      Object.hasOwn(metric, "period")
      && typeof metric.period !== "string"
    ) {
      errors.push({
        field: `${prefix}.period`,
        message: "This field must be a string."
      });
    }

    if (!Object.hasOwn(metric, "basis")) {
      errors.push({ field: `${prefix}.basis`, message: "This field is required." });
    } else if (metric.basis !== "measured" && metric.basis !== "estimated") {
      errors.push({
        field: `${prefix}.basis`,
        message: 'This field must be "measured" or "estimated".'
      });
    }
  }
}

function addEmploymentIdErrors(value, errors, required) {
  if (!Object.hasOwn(value, "employmentId")) {
    if (required) {
      errors.push({ field: "employmentId", message: "This field is required." });
    }
    return;
  }

  if (value.employmentId !== null) {
    addRequiredStringError(value, "employmentId", errors);
  }
}

function validateAchievementFields(value, errors) {
  addRequiredStringError(value, "title", errors);
  addOptionalStringError(value, "context", errors, true);
  addRequiredStringError(value, "contribution", errors);
  addStringArrayErrors(value, "actions", errors);
  addOptionalStringError(value, "outcome", errors, true);
  addOptionalStringError(value, "potentialImpact", errors, true);
  addMetricsErrors(value, errors);

  if (!Object.hasOwn(value, "evidence")) {
    errors.push({ field: "evidence", message: "This field is required." });
  } else if (!Array.isArray(value.evidence)) {
    errors.push({ field: "evidence", message: "This field must be an array." });
  }

  addEmploymentIdErrors(value, errors, true);

  if (Object.hasOwn(value, "provenance") && value.provenance !== null
    && (!Array.isArray(value.provenance) || !isJsonCompatibleProvenance(value.provenance))) {
    errors.push({ field: "provenance", message: "This field must be null or a JSON-compatible array." });
  }

  if (!Object.hasOwn(value, "verificationStatus")) {
    errors.push({
      field: "verificationStatus",
      message: "This field is required."
    });
  } else if (!verificationStatuses.includes(value.verificationStatus)) {
    errors.push({
      field: "verificationStatus",
      message: 'This field must be "unverified", "needs_confirmation", or "verified".'
    });
  }
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

function addInputErrors(input) {
  if (!isObject(input)) {
    return [{
      field: "input",
      message: "Input must be an object containing the record fields."
    }];
  }

  const errors = [];
  addUnknownFieldErrors(input, achievementInputFields, errors);
  addRequiredStringError(input, "title", errors);
  addOptionalStringError(input, "context", errors);
  addRequiredStringError(input, "contribution", errors);

  if (Object.hasOwn(input, "actions")) {
    addStringArrayErrors(input, "actions", errors);
  }

  addOptionalStringError(input, "outcome", errors);
  addOptionalStringError(input, "potentialImpact", errors);

  if (Object.hasOwn(input, "metrics")) {
    addMetricsErrors(input, errors);
  }

  if (Object.hasOwn(input, "evidence") && !Array.isArray(input.evidence)) {
    errors.push({ field: "evidence", message: "This field must be an array." });
  }

  if (Object.hasOwn(input, "provenance") && input.provenance !== null
    && (!Array.isArray(input.provenance) || !isJsonCompatibleProvenance(input.provenance))) {
    errors.push({ field: "provenance", message: "This field must be null or a JSON-compatible array." });
  }

  addEmploymentIdErrors(input, errors, false);
  return errors;
}

function throwConstructionError(errors) {
  const error = new TypeError("Cannot create Achievement record: input or metadata is invalid.");
  error.errors = errors;
  throw error;
}

/**
 * Creates an achievement with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createAchievementRecord(input, metadata) {
  const inputErrors = addInputErrors(input);
  const metadataErrors = addMetadataErrors(metadata);
  const errors = [...inputErrors, ...metadataErrors];

  if (errors.length > 0) {
    throwConstructionError(errors);
  }

  const recordInput = {
    title: input.title,
    context: input.context ?? "",
    contribution: input.contribution,
    actions: input.actions ?? [],
    outcome: input.outcome ?? "",
    potentialImpact: input.potentialImpact ?? "",
    metrics: input.metrics ?? [],
    evidence: input.evidence ?? [],
    provenance: Object.hasOwn(input, "provenance") ? input.provenance : [],
    employmentId: input.employmentId ?? null,
    verificationStatus: "unverified"
  };
  const record = {
    id: metadata.id,
    ...recordInput,
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
  const recordResult = validateAchievementRecord(record);

  if (!recordResult.valid) {
    throwConstructionError(recordResult.errors);
  }

  return {
    ...record,
    actions: [...record.actions],
    metrics: record.metrics.map((metric) => ({ ...metric })),
    evidence: [...record.evidence],
    provenance: record.provenance === null ? null : [...record.provenance]
  };
}

/**
 * Validates an achievement without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateAchievementRecord(value) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{
        field: "record",
        message: "Achievement record must be an object."
      }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, achievementRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  validateAchievementFields(value, errors);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);
  addTimestampOrderError(value, errors);

  return { valid: errors.length === 0, errors };
}
