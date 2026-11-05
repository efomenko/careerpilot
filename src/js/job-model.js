const jobInputFields = [
  "company",
  "roleTitle",
  "description",
  "sourceUrl",
  "notes",
  "status"
];
const jobRecordFields = [
  "id",
  ...jobInputFields,
  "createdAt",
  "updatedAt"
];
const metadataFields = ["id", "createdAt"];
const jobStatuses = ["active", "archived"];

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

function addOptionalStringError(value, field, errors) {
  if (Object.hasOwn(value, field) && typeof value[field] !== "string") {
    errors.push({ field, message: "This field must be a string." });
  }
}

function isUtcTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
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

  return month >= 1
    && month <= 12
    && day >= 1
    && day <= daysInMonth[month - 1]
    && hour <= 23
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

function addSourceUrlError(value, errors) {
  if (!Object.hasOwn(value, "sourceUrl") || typeof value.sourceUrl !== "string") {
    return;
  }

  const sourceUrl = value.sourceUrl.trim();
  if (sourceUrl === "") {
    return;
  }

  try {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      errors.push({
        field: "sourceUrl",
        message: "Use an absolute HTTP or HTTPS URL."
      });
    }
  } catch {
    errors.push({
      field: "sourceUrl",
      message: "Use an absolute HTTP or HTTPS URL."
    });
  }
}

function validateJobFields(value, errors) {
  addRequiredStringError(value, "company", errors);
  addRequiredStringError(value, "roleTitle", errors);

  for (const field of ["description", "sourceUrl", "notes"]) {
    addOptionalStringError(value, field, errors);
  }

  addSourceUrlError(value, errors);

  if (
    Object.hasOwn(value, "status")
    && !jobStatuses.includes(value.status)
  ) {
    errors.push({
      field: "status",
      message: 'This field must be "active" or "archived".'
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
  addTimestampError(metadata, "createdAt", errors);
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
  addUnknownFieldErrors(input, jobInputFields, errors);
  validateJobFields(input, errors);
  return errors;
}

function throwConstructionError(errors) {
  const error = new TypeError("Cannot create Job record: input or metadata is invalid.");
  error.errors = errors;
  throw error;
}

/**
 * Creates a Job with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createJobRecord(input, metadata) {
  const errors = [
    ...addInputErrors(input),
    ...addMetadataErrors(metadata)
  ];
  if (errors.length > 0) {
    throwConstructionError(errors);
  }

  const record = {
    id: metadata.id,
    company: input.company,
    roleTitle: input.roleTitle,
    description: input.description ?? "",
    sourceUrl: input.sourceUrl?.trim() ?? "",
    notes: input.notes ?? "",
    status: input.status ?? "active",
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
  const result = validateJobRecord(record);
  if (!result.valid) {
    throwConstructionError(result.errors);
  }

  return record;
}

/**
 * Validates a Job record without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateJobRecord(value) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ field: "record", message: "Job record must be an object." }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, jobRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  validateJobFields(value, errors);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);

  return { valid: errors.length === 0, errors };
}
