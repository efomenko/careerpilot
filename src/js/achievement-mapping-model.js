const achievementMappingInputFields = ["requirementId", "achievementId"];
const achievementMappingRecordFields = [
  "id",
  ...achievementMappingInputFields,
  "createdAt",
  "updatedAt"
];
const metadataFields = ["id", "createdAt"];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value) {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function isUtcTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (!match) {
    return false;
  }

  const [, date, hourText, minuteText, secondText] = match;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
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

function addMetadataErrors(metadata) {
  if (!isObject(metadata)) {
    return [{
      field: "metadata",
      message: "Metadata must be an object containing an ID and creation timestamp."
    }];
  }

  const errors = [];
  addUnknownFieldErrors(metadata, metadataFields, errors, "metadata.");
  addRequiredStringError(metadata, "id", errors, "metadata.");
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
  addUnknownFieldErrors(input, achievementMappingInputFields, errors);
  addRequiredStringError(input, "requirementId", errors);
  addRequiredStringError(input, "achievementId", errors);
  return errors;
}

function throwConstructionError(errors) {
  const error = new TypeError(
    "Cannot create Achievement Mapping record: input or metadata is invalid."
  );
  error.errors = errors;
  throw error;
}

/**
 * Creates an Achievement Mapping with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createAchievementMappingRecord(input, metadata) {
  const errors = [
    ...addInputErrors(input),
    ...addMetadataErrors(metadata)
  ];
  if (errors.length > 0) {
    throwConstructionError(errors);
  }

  const record = {
    id: metadata.id,
    requirementId: input.requirementId,
    achievementId: input.achievementId,
    createdAt: metadata.createdAt,
    updatedAt: metadata.createdAt
  };
  const result = validateAchievementMappingRecord(record);
  if (!result.valid) {
    throwConstructionError(result.errors);
  }

  return record;
}

/**
 * Validates an Achievement Mapping without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateAchievementMappingRecord(value) {
  if (!isPlainObject(value)) {
    return {
      valid: false,
      errors: [{
        field: "record",
        message: "Achievement Mapping record must be a plain object."
      }]
    };
  }

  const errors = [];
  addUnknownFieldErrors(value, achievementMappingRecordFields, errors);
  addRequiredStringError(value, "id", errors);
  addRequiredStringError(value, "requirementId", errors);
  addRequiredStringError(value, "achievementId", errors);
  addTimestampError(value, "createdAt", errors);
  addTimestampError(value, "updatedAt", errors);
  addTimestampOrderError(value, errors);

  return { valid: errors.length === 0, errors };
}
