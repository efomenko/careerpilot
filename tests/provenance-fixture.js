export function provenanceItem(extractedValue = "source") {
  return {
    id: "provenance-id",
    sourceDocumentId: "document-id",
    sourceType: "cv",
    fieldPath: "roleTitle",
    extractedValue,
    excerpt: "source",
    language: "en",
    associationStatus: "supports",
    createdAt: "2025-04-20T14:30:00.000Z"
  };
}
