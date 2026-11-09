import assert from "node:assert/strict";
import test from "node:test";
import {
  createImportSession, validateImportSession, createSourceDocument, validateSourceDocument,
  createImportCandidate, validateImportCandidate
} from "../src/js/import-model.js";
import { provenanceItem } from "./provenance-fixture.js";

const createdAt = "2025-04-20T14:30:00.000Z";
const document = (overrides = {}) => ({
  id: "document", fileName: "cv.pdf", mimeType: "application/pdf", language: "en",
  uploadedAt: createdAt, deleteBy: "2025-04-21T14:30:00.000Z", status: "uploaded", ...overrides
});
const candidate = (overrides = {}) => ({
  id: "candidate", category: "employment", originalData: { role: "Engineer" },
  reviewedData: { role: "Engineer" }, fieldProvenance: { roleTitle: [provenanceItem()] },
  validation: { status: "valid", errors: [], warnings: [] }, reviewStatus: "pending",
  possibleDuplicates: [], ...overrides
});
const session = (overrides = {}) => ({
  id: "session", status: "processing", sourceDocument: document(), createdAt,
  expiresAt: "2025-04-27T14:30:00.000Z", lastActivityAt: createdAt,
  currentCategory: null, candidates: [candidate()], reviewDecisions: [],
  processingAttempts: [], ...overrides
});
function invalid(validate, value, field) {
  const result = validate(value);
  assert.equal(result.valid, false, field);
  assert.ok(result.errors.some((issue) => issue.field === field), `${field}: ${JSON.stringify(result.errors)}`);
}

for (const [name, create, validate, sample] of [
  ["source", createSourceDocument, validateSourceDocument, document],
  ["candidate", createImportCandidate, validateImportCandidate, candidate],
  ["session", createImportSession, validateImportSession, session]
]) {
  test(`${name}: validates complete records and rejects missing and unknown fields`, () => {
    const record = sample();
    assert.deepEqual(validate(record), { valid: true, errors: [] });
    assert.deepEqual(create(record), record);
    for (const field of Object.keys(record)) {
      const missing = { ...record };
      delete missing[field];
      invalid(validate, missing, field);
      assert.throws(() => create(missing), (error) => error instanceof TypeError
        && error.errors.some((issue) => issue.field === field));
    }
    invalid(validate, { ...record, unexpected: true }, "unexpected");
    assert.throws(() => create({ ...record, unexpected: true }), TypeError);
  });
}

test("session statuses, categories, fixed expiry and timestamp ordering", () => {
  for (const status of ["processing", "ready_for_review", "review_in_progress", "import_completed", "failed", "expired"]) {
    assert.equal(validateImportSession(session({ status })).valid, true);
  }
  for (const currentCategory of [null, "profile", "employment", "education", "certification", "skill", "achievement"]) {
    assert.equal(validateImportSession(session({ currentCategory })).valid, true);
  }
  invalid(validateImportSession, session({ status: "unknown" }), "status");
  invalid(validateImportSession, session({ currentCategory: "unknown" }), "currentCategory");
  invalid(validateImportSession, session({ expiresAt: "2025-04-27T14:30:00.001Z" }), "expiresAt");
  invalid(validateImportSession, session({ createdAt: "2025-02-30T14:30:00.000Z" }), "createdAt");
  invalid(validateImportSession, session({ lastActivityAt: "2025-04-20T14:29:59.999Z" }), "lastActivityAt");
  assert.equal(validateImportSession(session({ lastActivityAt: "2025-04-25T14:30:00.000Z" })).valid, true);
});

test("source document validates languages and 24-hour deletion deadline", () => {
  for (const language of ["en", "ru"]) assert.equal(validateSourceDocument(document({ language })).valid, true);
  invalid(validateSourceDocument, document({ language: "fr" }), "language");
  invalid(validateSourceDocument, document({ uploadedAt: "2025-02-29T14:30:00.000Z" }), "uploadedAt");
  invalid(validateSourceDocument, document({ deleteBy: "2025-04-21T14:30:00.001Z" }), "deleteBy");
  invalid(validateSourceDocument, document({ deleteBy: "2025-04-20T14:29:59.999Z" }), "deleteBy");
  assert.equal(validateSourceDocument(document({ deleteBy: createdAt })).valid, true);
  invalid(validateSourceDocument, document({ status: "" }), "status");
  invalid(validateImportSession, session({ sourceDocument: [document(), document()] }), "sourceDocument");
});

test("candidate categories, review states and invalid approval", () => {
  for (const category of ["profile", "employment", "education", "certification", "skill", "achievement"]) {
    for (const reviewStatus of ["pending", "accepted", "rejected", "merged"]) {
      assert.equal(validateImportCandidate(candidate({ category, reviewStatus })).valid, true);
    }
  }
  for (const reviewStatus of ["accepted", "merged"]) {
    invalid(validateImportCandidate, candidate({
      reviewStatus, validation: { status: "invalid", errors: [{ code: "E", message: "Invalid" }], warnings: [] }
    }), "reviewStatus");
  }
  invalid(validateImportCandidate, candidate({ category: "other" }), "category");
  invalid(validateImportCandidate, candidate({ reviewStatus: "other" }), "reviewStatus");
  invalid(validateImportCandidate, candidate({ validation: { status: "other", errors: [], warnings: [] } }), "validation.status");
  invalid(validateImportCandidate, candidate({ reviewStatus: "accepted", validation: {
    status: "valid", errors: [{ code: "E001", message: "Invalid" }], warnings: []
  } }), "validation.status");
  invalid(validateImportCandidate, candidate({ validation: {
    status: "valid", errors: [], warnings: [{ code: "W001", message: "Review" }]
  } }), "validation.status");
});

test("candidate validation status matches all combinations of errors and warnings", () => {
  const finding = { code: "F001", message: "Finding" };
  for (const [errors, warnings, expected] of [
    [[], [], "valid"], [[], [finding], "warning"],
    [[finding], [], "invalid"], [[finding], [finding], "invalid"]
  ]) {
    for (const status of ["valid", "warning", "invalid"]) {
      const record = candidate({ validation: { status, errors, warnings } });
      if (status === expected) {
        assert.equal(validateImportCandidate(record).valid, true);
        assert.doesNotThrow(() => createImportCandidate(record));
      } else {
        invalid(validateImportCandidate, record, "validation.status");
        invalid(validateImportSession, session({ candidates: [record] }), "candidates[0].validation.status");
        assert.throws(() => createImportCandidate(record), (error) => error instanceof TypeError
          && error.errors.some((issue) => issue.field === "validation.status"));
      }
    }
  }
});

test("validates nested findings, duplicates, provenance and error paths", () => {
  const record = candidate({
    validation: { status: "warning", errors: [], warnings: [{ code: "W001", message: "Review this" }] },
    possibleDuplicates: [{ targetRecordId: "target", similaritySignals: ["name"], matchLevel: "strong" }]
  });
  assert.equal(validateImportCandidate(record).valid, true);
  invalid(validateImportCandidate, candidate({ validation: { status: "warning", errors: [], warnings: [{ code: "", message: "x" }] } }), "validation.warnings[0].code");
  invalid(validateImportCandidate, candidate({ validation: { status: "valid", errors: [], warnings: [], extra: 1 } }), "validation.extra");
  invalid(validateImportCandidate, candidate({ possibleDuplicates: [{ targetRecordId: "", similaritySignals: ["name"], matchLevel: "possible" }] }), "possibleDuplicates[0].targetRecordId");
  invalid(validateImportCandidate, candidate({ possibleDuplicates: [{ targetRecordId: "a", similaritySignals: [], matchLevel: "high" }] }), "possibleDuplicates[0].matchLevel");
  invalid(validateImportCandidate, candidate({ fieldProvenance: { roleTitle: [{ ...provenanceItem(), language: "fr" }] } }), "fieldProvenance.roleTitle[0].language");
  invalid(validateImportCandidate, candidate({ fieldProvenance: { another: [provenanceItem()] } }), "fieldProvenance.another[0].fieldPath");
  invalid(validateImportSession, session({ candidates: [candidate({ fieldProvenance: { roleTitle: [{ ...provenanceItem(), page: 0 }] } })] }), "candidates[0].fieldProvenance.roleTitle[0].page");
});

test("session nested decisions and attempts use documented minimal shapes", () => {
  for (const action of ["add", "skip"]) {
    assert.equal(validateImportSession(session({ reviewDecisions: [{ candidateId: "candidate", action }] })).valid, true);
  }
  const merge = {
    candidateId: "candidate", action: "merge", targetRecordId: "target",
    fieldChoices: { roleTitle: "reviewed", employer: "existing" }
  };
  for (const fieldChoices of [merge.fieldChoices, {}]) {
    const record = session({ reviewDecisions: [{ ...merge, fieldChoices }] });
    assert.equal(validateImportSession(record).valid, true);
    assert.deepEqual(createImportSession(record), record);
  }
  for (const [change, path] of [
    [{ targetRecordId: "" }, "reviewDecisions[0].targetRecordId"],
    [{ fieldChoices: null }, "reviewDecisions[0].fieldChoices"],
    [{ fieldChoices: [] }, "reviewDecisions[0].fieldChoices"],
    [{ fieldChoices: { roleTitle: "automatic" } }, "reviewDecisions[0].fieldChoices.roleTitle"],
    [{ fieldChoices: { " ": "existing" } }, "reviewDecisions[0].fieldChoices. "]
  ]) {
    const record = session({ reviewDecisions: [{ ...merge, ...change }] });
    invalid(validateImportSession, record, path);
    assert.throws(() => createImportSession(record),
      (error) => error instanceof TypeError && error.errors.some((issue) => issue.field === path));
  }
  for (const field of ["targetRecordId", "fieldChoices"]) {
    const missing = { ...merge };
    delete missing[field];
    invalid(validateImportSession, session({ reviewDecisions: [missing] }), `reviewDecisions[0].${field}`);
  }
  for (const action of ["add", "skip"]) {
    invalid(validateImportSession, session({
      reviewDecisions: [{ candidateId: "candidate", action, targetRecordId: "target" }]
    }), "reviewDecisions[0].targetRecordId");
  }
  invalid(validateImportSession, session({ reviewDecisions: [{ candidateId: "candidate", action: "auto" }] }), "reviewDecisions[0].action");
  invalid(validateImportSession, session({ processingAttempts: [null] }), "processingAttempts[0]");
  assert.equal(validateImportSession(session({ processingAttempts: [{ detail: [1, true] }] })).valid, true);
});

test("constructors detach input, preserve frozen original data and leave reviewed data editable", () => {
  const input = session();
  const output = createImportSession(input);
  assert.notEqual(output.candidates[0], input.candidates[0]);
  assert.ok(Object.isFrozen(output.candidates[0].originalData));
  assert.throws(() => { output.candidates[0].originalData.role = "changed"; }, TypeError);
  assert.throws(() => { output.candidates[0].originalData = {}; }, TypeError);
  output.candidates[0].reviewedData.role = "edited";
  assert.equal(input.candidates[0].reviewedData.role, "Engineer");
  input.candidates[0].fieldProvenance.roleTitle[0].excerpt = "changed";
  assert.equal(output.candidates[0].fieldProvenance.roleTitle[0].excerpt, "source");
  assert.ok(Object.isFrozen(createImportCandidate(candidate()).originalData));
});

test("rejects lossy values, cycles, accessors and throwing proxies without mutation", () => {
  const cyclic = {}; cyclic.self = cyclic;
  for (const value of [undefined, NaN, -0, Infinity, 1n, new Date(), new Array(1)]) {
    invalid(validateImportCandidate, candidate({ originalData: value }), "originalData");
    assert.throws(() => createImportCandidate(candidate({ originalData: value })), TypeError);
  }
  invalid(validateImportCandidate, candidate({ originalData: cyclic }), "originalData.self");
  const getter = {};
  Object.defineProperty(getter, "key", { enumerable: true, get() { throw new Error("getter"); } });
  invalid(validateImportCandidate, candidate({ reviewedData: getter }), "reviewedData.key");
  const proxy = new Proxy({}, { ownKeys() { throw new Error("proxy"); } });
  invalid(validateImportCandidate, candidate({ reviewedData: proxy }), "reviewedData");
  const input = candidate();
  const before = structuredClone(input);
  validateImportCandidate(input);
  assert.deepEqual(input, before);
});
