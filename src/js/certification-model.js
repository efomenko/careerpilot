import { createRecord, validateRecord } from "./education-certification-model.js";

const spec = {
  name: "Certification record",
  fields: ["name", "issuer", "issuedDate", "expirationDate", "credentialId", "credentialUrl", "provenance"],
  requiredStrings: ["name", "issuer"],
  optionalStrings: ["credentialId", "credentialUrl"],
  dates: ["issuedDate", "expirationDate"],
  defaults: { credentialId: "", credentialUrl: "", provenance: [] },
  url: true
};

export function createCertificationRecord(input, metadata) {
  return createRecord(input, metadata, spec);
}

export function validateCertificationRecord(value) {
  return validateRecord(value, spec);
}
