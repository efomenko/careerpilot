import { dateInterval, isJsonCompatibleProvenance, isUtcTimestamp } from "./career-model.js";

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnknownFields(value, allowed, errors, prefix = "") {
  for (const field of Reflect.ownKeys(value)) {
    if (typeof field !== "string" || !allowed.includes(field)) {
      errors.push({ field: `${prefix}${String(field)}`, message: "This field is not part of the record contract." });
    }
  }
}

function addRequiredString(value, field, errors) {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field, message: "This field is required." });
  } else if (typeof value[field] !== "string") {
    errors.push({ field, message: "This field must be a string." });
  } else if (value[field].trim() === "") {
    errors.push({ field, message: "This field must not be blank." });
  }
}

function addTimestamp(value, field, errors, prefix = "") {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field: `${prefix}${field}`, message: "This field is required." });
  } else if (!isUtcTimestamp(value[field])) {
    errors.push({ field: `${prefix}${field}`, message: "Use a valid ISO 8601 UTC timestamp ending in Z." });
  }
}

function validateFields(value, spec, errors, warnings) {
  for (const field of spec.requiredStrings) addRequiredString(value, field, errors);
  for (const field of spec.optionalStrings) {
    if (!Object.hasOwn(value, field)) {
      errors.push({ field, message: "This field is required." });
    } else if (typeof value[field] !== "string") {
      errors.push({ field, message: "This field must be a string." });
    }
  }

  const intervals = {};
  for (const field of spec.dates) {
    if (!Object.hasOwn(value, field)) {
      errors.push({ field, message: "This field is required." });
    } else if (value[field] === null) {
      intervals[field] = null;
    } else {
      const interval = typeof value[field] === "string" ? undefined : dateInterval(value[field]);
      if (interval === undefined) {
        errors.push({ field, message: "Use a valid structured date or null." });
      } else {
        intervals[field] = interval;
      }
    }
  }

  if (Object.hasOwn(value, "provenance") && value.provenance !== null
    && (!Array.isArray(value.provenance) || !isJsonCompatibleProvenance(value.provenance))) {
    errors.push({ field: "provenance", message: "This field must be null or a JSON-compatible array." });
  }

  if (spec.current) {
    if (!Object.hasOwn(value, "isCurrent")) {
      errors.push({ field: "isCurrent", message: "This field is required." });
    } else if (typeof value.isCurrent !== "boolean") {
      errors.push({ field: "isCurrent", message: "This field must be a boolean." });
    } else if (value.isCurrent && intervals.endDate) {
      errors.push({ field: "endDate", message: "Current education must have a null end date." });
    }
  }

  if (spec.url && typeof value.credentialUrl === "string" && value.credentialUrl !== "") {
    let validUrl = false;
    if (/^https?:\/\//i.test(value.credentialUrl) && !/\s/.test(value.credentialUrl)) {
      try {
        const url = new URL(value.credentialUrl);
        validUrl = (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
      } catch {
        validUrl = false;
      }
    }
    if (!validUrl) {
      errors.push({ field: "credentialUrl", message: "Use an absolute HTTP or HTTPS URL." });
    }
  }

  const [startField, endField] = spec.dates;
  const start = intervals[startField];
  const end = intervals[endField];
  if (start && end) {
    if (end.end < start.start) {
      errors.push({ field: endField, message: "This date must not be earlier than the start date." });
    } else if (end.start < start.end) {
      warnings.push({ field: endField, message: "The date precision leaves chronological order uncertain." });
    }
  }
}

export function validateRecord(value, spec) {
  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ field: "record", message: `${spec.name} must be an object.` }],
      warnings: []
    };
  }

  const errors = [];
  const warnings = [];
  addUnknownFields(value, ["id", ...spec.fields, "createdAt", "updatedAt"], errors);
  addRequiredString(value, "id", errors);
  validateFields(value, spec, errors, warnings);
  addTimestamp(value, "createdAt", errors);
  addTimestamp(value, "updatedAt", errors);
  if (isUtcTimestamp(value.createdAt) && isUtcTimestamp(value.updatedAt)
    && value.updatedAt < value.createdAt) {
    errors.push({ field: "updatedAt", message: "This timestamp must not be earlier than createdAt." });
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function createRecord(input, metadata, spec) {
  const errors = [];
  const warnings = [];
  let fields;
  if (!isObject(input)) {
    errors.push({ field: "input", message: "Input must be an object containing the record fields." });
  } else {
    addUnknownFields(input, spec.fields, errors);
    fields = { ...spec.defaults };
    for (const field of spec.fields) {
      if (Object.hasOwn(input, field)) fields[field] = input[field];
    }
    validateFields(fields, spec, errors, warnings);
  }

  if (!isObject(metadata)) {
    errors.push({ field: "metadata", message: "Metadata must be an object containing an ID and creation timestamp." });
  } else {
    addUnknownFields(metadata, ["id", "createdAt"], errors, "metadata.");
    addRequiredString(metadata, "id", errors);
    addTimestamp(metadata, "createdAt", errors, "metadata.");
  }

  if (errors.length > 0) {
    const error = new TypeError(`Cannot create ${spec.name}: input or metadata is invalid.`);
    error.errors = errors;
    throw error;
  }

  const record = { id: metadata.id };
  for (const field of spec.fields) {
    const value = fields[field];
    if (spec.dates.includes(field)) {
      record[field] = value === null ? null : { ...value };
    } else if (field === "provenance") {
      record[field] = value === null ? null : [...value];
    } else {
      record[field] = value;
    }
  }
  record.createdAt = metadata.createdAt;
  record.updatedAt = metadata.createdAt;
  return record;
}
