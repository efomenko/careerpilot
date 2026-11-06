const requirementInputFields = [
  "jobId",
  "description",
  "category",
  "importance"
];
const requirementRecordFields = [
  "id",
  ...requirementInputFields,
  "createdAt",
  "updatedAt"
];
const metadataFields = ["id", "createdAt"];
const requirementCategories = [
  "skill",
  "experience",
  "education",
  "certification",
  "responsibility",
  "other"
];
const requirementImportances = ["mandatory", "preferred"];

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

function addTimestampOrderError(value, errors) {
  if (
    isUtcTimestamp(value.createdAt)
    && isUtcTimestamp(value.updatedAt)
    && value.updatedAt < value.createdAt
  ) {
    errors.push({
      field: "updatedAt",
      message: "This timestamp must not be earlier than createdAt."
    });
  }
}

function validateRequirementFields(value, errors, requireCategory = false) {
  addRequiredStringError(value, "jobId", errors);
  addRequiredStringError(value, "description", errors);

  if (!Object.hasOwn(value, "category") && requireCategory) {
    errors.push({ field: "category", message: "This field is required." });
  } else if (
    Object.hasOwn(value, "category")
    && !requirementCategories.includes(value.category)
  ) {
    errors.push({
      field: "category",
      message: `This field must be one of: ${requirementCategories.join(", ")}.`
    });
  }

  if (!Object.hasOwn(value, "importance")) {
    errors.push({ field: "importance", message: "This field is required." });
  } else if (!requirementImportances.includes(value.importance)) {
    errors.push({
      field: "importance",
      message: 'This field must be "mandatory" or "preferred".'
    });
  }
}

function addMetadataErrors(metadata) {
  if (!isObject(metadata)) {
    return [{
      field: "metadata",
      message: "Metadata must be an object containing an ID and creation timestamp."
    }];
  }

  const errors = [];
  addUnknownFieldErrors(metadata, metadataFields, errors, "metadata.");
  addRequiredStringError(metadata, "id", errors);
  if (!Object.hasOwn(metadata, "createdAt")) {
    errors.push({
      field: "metadata.createdAt",
      message: "This field is required."
    });
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
  addUnknownFieldErrors(input, requirementInputFields, errors);
  validateRequirementFields(input, errors);
  return errors;
}

function throwConstructionError(errors) {
  const error = new TypeError(
    "Cannot create Requirement record: input or metadata is invalid."
  );
  error.errors = errors;
  throw error;
}

/**
 * Creates a Requirement with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createRequirementRecord(input, metadata) {
  const errors = [
    ...addInputErrors(input),
    ...addMetadataErrors(metadata)
  ];
  if (errors.length > 0) {
    throwConstructionError(errors);
  }

  const record = {
    id: metadata.id,
    jobId: input.jobId,
    description: input.description,
    category: Object.hasOwn(input, "category") ? input.category : "other",
    importance: input.importance,
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
  const result = validateRequirementRecord(record);
  if (!result.valid) {
    throwConstructionError(result.errors);
  }

  return record;
}

/**
 * Validates a Requirement without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateRequirementRecord(value) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{
        field: "record",
        message: "Requirement record must be an object."
      }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, requirementRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  validateRequirementFields(value, errors, true);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);
  addTimestampOrderError(value, errors);

  return { valid: errors.length === 0, errors };
}
