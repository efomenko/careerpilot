import assert from "node:assert/strict";
import test from "node:test";
import { createCareerState } from "../src/js/career-state.js";
import { createCareerPersistence } from "../src/js/career-persistence.js";
import { provenanceItem } from "./provenance-fixture.js";

const start = "2025-04-20T14:30:00.000Z";
const later = "2025-04-20T15:00:00.000Z";
const expiry = "2025-04-27T14:30:00.000Z";
const valid = { status: "valid", errors: [], warnings: [] };
const warning = { status: "warning", errors: [], warnings: [{ code: "W", message: "Review" }] };
const invalid = { status: "invalid", errors: [{ code: "E", message: "Invalid" }], warnings: [] };
function candidate(id = "candidate") {
  return {
    id, category: "employment", originalData: { roleTitle: "Engineer" }, reviewedData: { roleTitle: "Engineer" },
    fieldProvenance: { roleTitle: [provenanceItem()] }, validation: valid, reviewStatus: "pending", possibleDuplicates: []
  };
}
function session() {
  return {
    id: "session", status: "processing",
    sourceDocument: { id: "doc", fileName: "cv.pdf", mimeType: "application/pdf", language: "en",
      uploadedAt: start, deleteBy: "2025-04-21T14:30:00.000Z", status: "uploaded" },
    createdAt: start, expiresAt: expiry, lastActivityAt: start, currentCategory: null,
    candidates: [], reviewDecisions: [], processingAttempts: []
  };
}
function reviewing(state) {
  state.createImportSession(session());
  state.addImportCandidates("session", [candidate()], start);
  state.transitionImportSession("session", "ready_for_review", start);
  state.transitionImportSession("session", "review_in_progress", start);
}

test("sessions and candidates are detached and reject duplicates without notification", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  const source = session();
  state.createImportSession(source);
  source.sourceDocument.fileName = "changed";
  assert.equal(state.getImportSession("session").sourceDocument.fileName, "cv.pdf");
  assert.throws(() => state.createImportSession(session()), /Duplicate/);
  assert.throws(() => state.addImportCandidates("session", [candidate(), candidate()], start), /Duplicate/);
  assert.equal(notifications, 1);
  const result = state.addImportCandidates("session", [candidate()], start);
  result.candidates[0].originalData.roleTitle = "changed";
  state.getImportSessions()[0].candidates[0].reviewedData.roleTitle = "changed";
  assert.equal(state.getImportSession("session").candidates[0].originalData.roleTitle, "Engineer");
  assert.equal(state.getImportSession("session").candidates[0].reviewedData.roleTitle, "Engineer");
});

test("transition graph, retry and expiry preserve previously reviewed data", () => {
  const state = createCareerState();
  state.createImportSession(session());
  assert.throws(() => state.transitionImportSession("session", "review_in_progress", start), /transition/);
  assert.throws(() => state.transitionImportSession("session", "expired", start), /not expired/);
  assert.throws(() => state.retryImportSession("session", {}, start), /failed/);
  state.addImportCandidates("session", [candidate()], start);
  state.transitionImportSession("session", "failed", start);
  state.retryImportSession("session", { attempt: 2 }, later);
  assert.throws(() => state.addImportCandidates("session", [candidate()], later), /Duplicate/);
  state.transitionImportSession("session", "ready_for_review", later);
  state.transitionImportSession("session", "review_in_progress", later);
  state.decideImportCandidate("session", { candidateId: "candidate", action: "skip" }, later);
  assert.throws(() => state.transitionImportSession("session", "import_completed", later), /transition/);
  assert.throws(() => state.setImportCategory("session", "skill", expiry), /expired/);
  const before = state.getImportSession("session");
  const expired = state.transitionImportSession("session", "expired", expiry);
  assert.deepEqual(expired.candidates, before.candidates);
  assert.deepEqual(expired.reviewDecisions, before.reviewDecisions);
  assert.deepEqual(expired.processingAttempts, [{ attempt: 2 }]);
  assert.equal(expired.expiresAt, expiry);
  assert.throws(() => state.setImportCategory("session", "skill", expiry), /not editable/);
});

test("retry preserves reviewed candidates and decisions in restored failed sessions", () => {
  const source = createCareerState();
  reviewing(source);
  source.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, start);
  const snapshot = source.getSnapshot();
  snapshot.import.sessions[0].status = "failed";
  const state = createCareerState();
  state.restoreSnapshot(snapshot);
  const before = state.getImportSession("session");
  const retried = state.retryImportSession("session", { attempt: 2 }, later);
  assert.deepEqual(retried.candidates, before.candidates);
  assert.deepEqual(retried.reviewDecisions, before.reviewDecisions);
  assert.throws(() => state.addImportCandidates("session", [candidate()], later), /Duplicate/);
  assert.deepEqual(state.getImportSession("session").candidates, before.candidates);
});

test("unsupported provenance paths fail closed and leave the candidate unchanged", () => {
  const state = createCareerState();
  const input = candidate();
  input.fieldProvenance = { "skills[item-id].name": [{ ...provenanceItem(), fieldPath: "skills[item-id].name" }] };
  state.createImportSession(session());
  state.addImportCandidates("session", [input], start);
  state.transitionImportSession("session", "ready_for_review", start);
  state.transitionImportSession("session", "review_in_progress", start);
  const before = state.getSnapshot();
  assert.throws(() => state.updateImportCandidate("session", "candidate", { roleTitle: "Manager" }, valid, later), /Cannot resolve/);
  assert.deepEqual(state.getSnapshot(), before);
});

test("review edits require validation, preserve originals, and invalidate decisions and provenance", () => {
  const state = createCareerState();
  reviewing(state);
  state.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, start);
  const result = state.updateImportCandidate("session", "candidate", { roleTitle: "Manager" }, warning, later);
  assert.equal(result.candidates[0].originalData.roleTitle, "Engineer");
  assert.equal(result.candidates[0].fieldProvenance.roleTitle[0].extractedValue, "source");
  assert.equal(result.candidates[0].fieldProvenance.roleTitle[0].associationStatus, "needs_review");
  assert.equal(result.candidates[0].reviewStatus, "pending");
  assert.deepEqual(result.reviewDecisions, []);
  assert.throws(() => state.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, later), /acknowledged/);
  state.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, later, { acknowledgeWarnings: true });
  state.updateImportCandidate("session", "candidate", { roleTitle: "Manager" }, invalid, later);
  assert.throws(() => state.decideImportCandidate("session", { candidateId: "candidate", action: "merge",
    targetRecordId: "target", fieldChoices: {} }, later, { acknowledgeWarnings: true }), TypeError);
  assert.deepEqual(state.getImportSession("session").reviewDecisions, []);
});

test("decisions validate details and failures do not partially change state", () => {
  const state = createCareerState();
  reviewing(state);
  state.setImportCategory("session", "employment", start);
  const before = state.getSnapshot();
  assert.throws(() => state.decideImportCandidate("session", { candidateId: "candidate", action: "merge" }, start), TypeError);
  assert.throws(() => state.updateImportCandidate("session", "candidate", {}, { status: "valid" }, start), TypeError);
  assert.deepEqual(state.getSnapshot(), before);
  const updated = state.decideImportCandidate("session", { candidateId: "candidate", action: "merge",
    targetRecordId: "target", fieldChoices: { roleTitle: "reviewed" } }, start);
  assert.equal(updated.candidates[0].reviewStatus, "merged");
  assert.equal(updated.reviewDecisions.length, 1);
});

test("persistence outcomes and reload preserve pending session data", () => {
  let raw = null;
  let fail = false;
  const storage = {
    getItem: () => raw,
    setItem(key, value) { if (fail) throw new Error("write failed"); raw = value; }
  };
  const persistence = createCareerPersistence(storage);
  persistence.state.createImportSession(session());
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  persistence.state.addImportCandidates("session", [candidate()], start);
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  const reload = createCareerPersistence(storage);
  assert.equal(reload.state.getImportSession("session").candidates[0].reviewStatus, "pending");
  fail = true;
  persistence.state.transitionImportSession("session", "failed", later);
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(persistence.state.getImportSession("session").status, "failed");
  assert.equal(createCareerPersistence(storage).state.getImportSession("session").status, "processing");
});
