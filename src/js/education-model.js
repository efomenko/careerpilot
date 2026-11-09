import { createRecord, validateRecord } from "./education-certification-model.js";

const spec = {
  name: "Education record",
  fields: ["institution", "qualification", "fieldOfStudy", "startDate", "endDate", "isCurrent", "provenance"],
  requiredStrings: ["institution", "qualification"],
  optionalStrings: ["fieldOfStudy"],
  dates: ["startDate", "endDate"],
  defaults: { fieldOfStudy: "", isCurrent: false, provenance: [] },
  current: true
};

export function createEducationRecord(input, metadata) {
  return createRecord(input, metadata, spec);
}

export function validateEducationRecord(value) {
  return validateRecord(value, spec);
}
