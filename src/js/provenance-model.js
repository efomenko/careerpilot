import { isJsonCompatibleProvenance, isUtcTimestamp } from "./model-validation.js";

const provenanceFields = [
  "sourceDocumentId",
  "sourceType",
  "fieldPath",
  "extractedValue",
  "excerpt",
  "language",
  "associationStatus",
  "page"
];
const recordFields = ["id", ...provenanceFields, "createdAt"];
const metadataFields = ["id", "createdAt"];
const sourceTypes = ["cv"];
const languages = ["en", "ru"];
const associationStatuses = ["supports", "needs_review", "context_only"];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addUnknownFieldErrors(value, allowedFields, errors, prefix = "") {
  for (const field of Reflect.ownKeys(value)) {
    if (typeof field !== "string" || !allowedFields.includes(field)) {
      errors.push({
        field: `${prefix}${String(field)}`,
        message: "This field is not part of the record contract."
      });
    }
  }
}

function addRequiredStringError(value, field, errors, { nonBlank = true, prefix = "" } = {}) {
  const errorField = `${prefix}${field}`;
  if (!Object.hasOwn(value, field)) {
    errors.push({ field: errorField, message: "This field is required." });
  } else if (typeof value[field] !== "string") {
    errors.push({ field: errorField, message: "This field must be a string." });
  } else if (nonBlank && value[field].trim() === "") {
    errors.push({ field: errorField, message: "This field must not be blank." });
  }
}

function hasArrayIndex(fieldPath) {
  return /(?:^|[./])\d+(?=[./\[]|$)|\[\s*(?:\d+|"[0-9]+"|'[0-9]+')\s*\]/.test(fieldPath);
}

function addProvenanceFieldErrors(value, errors) {
  addRequiredStringError(value, "sourceDocumentId", errors);
  addRequiredStringError(value, "fieldPath", errors);
  addRequiredStringError(value, "excerpt", errors);
  addRequiredStringError(value, "language", errors);

  if (typeof value.fieldPath === "string" && hasArrayIndex(value.fieldPath)) {
    errors.push({
      field: "fieldPath",
      message: "Use a stable field path without permanent array-index references."
    });
  }

  if (Object.hasOwn(value, "sourceType") && !sourceTypes.includes(value.sourceType)) {
    errors.push({ field: "sourceType", message: 'This field must be "cv".' });
  } else if (!Object.hasOwn(value, "sourceType")) {
    errors.push({ field: "sourceType", message: "This field is required." });
  }

  if (Object.hasOwn(value, "language") && !languages.includes(value.language)) {
    errors.push({ field: "language", message: 'This field must be "en" or "ru".' });
  }

  if (Object.hasOwn(value, "associationStatus")
    && !associationStatuses.includes(value.associationStatus)) {
    errors.push({
      field: "associationStatus",
      message: `This field must be one of: ${associationStatuses.join(", ")}.`
    });
  } else if (!Object.hasOwn(value, "associationStatus")) {
    errors.push({ field: "associationStatus", message: "This field is required." });
  }

  if (Object.hasOwn(value, "extractedValue")
    && !isJsonCompatibleProvenance([value.extractedValue])) {
    errors.push({
      field: "extractedValue",
      message: "This field must be a JSON-compatible value."
    });
  } else if (!Object.hasOwn(value, "extractedValue")) {
    errors.push({ field: "extractedValue", message: "This field is required." });
  }

  if (Object.hasOwn(value, "excerpt") && typeof value.excerpt === "string"
    && Array.from(value.excerpt).length > 500) {
    errors.push({ field: "excerpt", message: "This field must not exceed 500 characters." });
  }

  if (Object.hasOwn(value, "page")
    && (!Number.isSafeInteger(value.page) || value.page < 1)) {
    errors.push({ field: "page", message: "This field must be a positive safe integer." });
  }
}

function addTimestampError(value, field, errors, prefix = "") {
  if (!Object.hasOwn(value, field)) {
    errors.push({ field: `${prefix}${field}`, message: "This field is required." });
  } else if (!isUtcTimestamp(value[field])) {
    errors.push({
      field: `${prefix}${field}`,
      message: "Use a valid ISO 8601 UTC timestamp ending in Z."
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
  addRequiredStringError(metadata, "id", errors, { prefix: "metadata." });
  addTimestampError(metadata, "createdAt", errors, "metadata.");
  return errors;
}

function copyJsonValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const length = Object.getOwnPropertyDescriptor(value, "length").value;
    const copy = new Array(length);
    for (let index = 0; index < length; index += 1) {
      copy[index] = copyJsonValue(Object.getOwnPropertyDescriptor(value, String(index)).value);
    }
    return copy;
  }

  const copy = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copyJsonValue(Object.getOwnPropertyDescriptor(value, key).value),
      enumerable: true,
      writable: true,
      configurable: true
    });
  }
  return copy;
}

export function copyProvenance(value) {
  try {
    return value === null ? null : copyJsonValue(value);
  } catch {
    const error = new TypeError("Cannot copy provenance.");
    error.errors = [{ field: "provenance", message: "This field could not be copied safely." }];
    throw error;
  }
}

function throwConstructionError(errors) {
  const error = new TypeError("Cannot create Provenance record: input or metadata is invalid.");
  error.errors = errors;
  throw error;
}

/**
 * Creates a field-level provenance item with caller-supplied identity and creation time.
 * Throws a TypeError with an `errors` array when input or metadata is invalid.
 */
export function createProvenanceRecord(input, metadata) {
  const errors = [];
  try {
    if (!isObject(input)) {
      errors.push({ field: "input", message: "Input must be an object containing the provenance fields." });
    } else {
      Object.getPrototypeOf(input);
      addUnknownFieldErrors(input, provenanceFields, errors);
      addProvenanceFieldErrors(input, errors);
    }
  } catch {
    errors.push({ field: "input", message: "Input could not be inspected safely." });
  }

  try {
    errors.push(...addMetadataErrors(metadata));
  } catch {
    errors.push({ field: "metadata", message: "Metadata could not be inspected safely." });
  }
  if (errors.length > 0) throwConstructionError(errors);

  let extractedValue;
  try {
    extractedValue = copyJsonValue(input.extractedValue);
  } catch {
    throwConstructionError([{ field: "extractedValue", message: "This field could not be copied safely." }]);
  }

  try {
    const record = {
      id: metadata.id,
      sourceDocumentId: input.sourceDocumentId,
      sourceType: input.sourceType,
      fieldPath: input.fieldPath,
      extractedValue,
      excerpt: input.excerpt,
      language: input.language,
      associationStatus: input.associationStatus
    };
    if (Object.hasOwn(input, "page")) record.page = input.page;
    record.createdAt = metadata.createdAt;
    return record;
  } catch {
    throwConstructionError([{ field: "input", message: "Input or metadata could not be copied safely." }]);
  }
}

/**
 * Validates a field-level provenance item without modifying it.
 * Returns `{ valid, errors }`, where each error has a `field` and `message`.
 */
export function validateProvenanceRecord(value) {
  try {
    if (!isObject(value)) {
      return {
        valid: false,
        errors: [{ field: "record", message: "Provenance record must be an object." }]
      };
    }

    Object.getPrototypeOf(value);
    const errors = [];
    addUnknownFieldErrors(value, recordFields, errors);
    addRequiredStringError(value, "id", errors);
    addProvenanceFieldErrors(value, errors);
    addTimestampError(value, "createdAt", errors);
    return { valid: errors.length === 0, errors };
  } catch {
    return {
      valid: false,
      errors: [{ field: "record", message: "Provenance record could not be inspected safely." }]
    };
  }
}

export function addProvenanceErrors(value, errors) {
  try {
    inspectProvenance(value, errors);
  } catch {
    errors.push({ field: "provenance", message: "This field could not be inspected safely." });
  }
}

function inspectProvenance(value, errors) {
  if (!Object.hasOwn(value, "provenance") || value.provenance === null) return;
  const provenance = value.provenance;
  if (!Array.isArray(provenance)) {
    errors.push({ field: "provenance", message: "This field must be null or a JSON-compatible array." });
    return;
  }
  if (Object.getPrototypeOf(provenance) !== Array.prototype
    || Reflect.ownKeys(provenance).length !== provenance.length + 1) {
    errors.push({ field: "provenance", message: "This field must be a dense array without extra properties." });
    return;
  }
  if (!isJsonCompatibleProvenance(provenance)) {
    errors.push({ field: "provenance", message: "This field must be null or a JSON-compatible array." });
  }
  for (let index = 0; index < provenance.length; index += 1) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(provenance, String(index));
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        errors.push({ field: `provenance[${index}]`, message: "This item must be an enumerable data property." });
        continue;
      }
      const item = descriptor.value;
      if (isObject(item) && Reflect.ownKeys(item).some((key) => {
        const property = Object.getOwnPropertyDescriptor(item, key);
        return !property?.enumerable || !("value" in property);
      })) {
        errors.push({ field: `provenance[${index}]`, message: "This item must contain only enumerable data properties." });
        continue;
      }
      const result = validateProvenanceRecord(item);
      for (const error of result.errors) {
        errors.push({
          field: !isObject(item) && error.field === "record"
            ? `provenance[${index}]`
            : `provenance[${index}].${error.field}`,
          message: error.message
        });
      }
    } catch {
      errors.push({ field: `provenance[${index}]`, message: "This item could not be inspected safely." });
    }
  }
}
