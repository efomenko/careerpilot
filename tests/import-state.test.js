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

test("persistence outcomes and reload preserve pending session data", async () => {
  let raw = null;
  let fail = false;
  const storage = {
    getItem: () => raw,
    setItem(key, value) { if (fail) throw new Error("write failed"); raw = value; }
  };
  const persistence = createCareerPersistence(storage, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const create = persistence.state.createImportSession(session());
  await create;
  assert.equal(await persistence.getOperationOutcome(create), "saved");
  const add = persistence.state.addImportCandidates("session", [candidate()], start);
  await add;
  assert.equal(await persistence.getOperationOutcome(add), "saved");
  const reload = createCareerPersistence(storage);
  assert.equal(reload.state.getImportSession("session").candidates[0].reviewStatus, "pending");
  fail = true;
  const transition = persistence.state.transitionImportSession("session", "failed", later);
  await assert.rejects(transition, (error) => error.status === "save-failed");
  assert.equal(await persistence.getOperationOutcome(transition), "save-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(persistence.state.getImportSession("session").status, "processing");
  assert.equal(createCareerPersistence(storage).state.getImportSession("session").status, "processing");
});

function receiptPersistence() {
  let raw = null;
  let fail = false;
  const storage = {
    getItem: () => raw,
    setItem(key, value) { if (fail) throw new Error("write failed"); raw = value; }
  };
  const options = { locks: { request: (name, settings, callback) => callback() }, secureContext: true };
  return {
    storage, options,
    persistence: createCareerPersistence(storage, options),
    bytes: () => raw,
    failWrites: (value) => { fail = value; }
  };
}

async function prepareReview(state) {
  await state.createImportSession(session());
  await state.addImportCandidates("session", [candidate()], start);
  await state.transitionImportSession("session", "ready_for_review", start);
  await state.transitionImportSession("session", "review_in_progress", start);
}

test("decision writes a minimal receipt atomically and persists it across reload", async () => {
  const { persistence, storage, options } = receiptPersistence();
  await prepareReview(persistence.state);
  const before = persistence.getRevisions();
  const decision = { candidateId: "candidate", action: "add" };
  await persistence.state.decideImportCandidate("session", decision, later);
  const snapshot = persistence.state.getSnapshot();
  const reviewedCandidate = snapshot.import.sessions[0].candidates[0];
  assert.deepEqual(snapshot.import.approvalReceipts, [{
    sessionId: "session", candidateId: "candidate",
    reviewed: {
      category: reviewedCandidate.category, reviewedData: reviewedCandidate.reviewedData,
      validation: reviewedCandidate.validation, fieldProvenance: reviewedCandidate.fieldProvenance
    },
    decision, acknowledgedWarnings: false, careerRevision: before.careerRevision,
    approvedAt: later, expiresAt: expiry, target: null
  }]);
  assert.deepEqual(persistence.getRevisions(), {
    snapshotRevision: before.snapshotRevision + 1, careerRevision: before.careerRevision
  });
  assert.deepEqual(createCareerPersistence(storage, options).state.getSnapshot(), snapshot);
});

test("merge receipt captures the target and replacement, edit, revalidation and skip invalidate it", async () => {
  const { persistence } = receiptPersistence();
  const state = persistence.state;
  await state.addEmploymentRecord({
    employer: "Employer", roleTitle: "Role", startDate: "2020-01-01",
    endDate: null, isCurrent: true, responsibilities: []
  }, { id: "employment", createdAt: start });
  await prepareReview(state);
  await state.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, start);
  const decision = { candidateId: "candidate", action: "merge",
    targetRecordId: "employment", fieldChoices: { roleTitle: "reviewed" } };
  await state.decideImportCandidate("session", decision, later);
  let receipts = state.getSnapshot().import.approvalReceipts;
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0].target, {
    category: "employment", id: "employment", record: state.getEmploymentRecords()[0]
  });
  assert.deepEqual(receipts[0].decision, decision);
  assert.equal(receipts[0].careerRevision, 1);
  await state.updateImportCandidate("session", "candidate", { roleTitle: "Manager" }, warning, later);
  assert.deepEqual(state.getSnapshot().import.approvalReceipts, []);
  await assert.rejects(state.decideImportCandidate("session", decision, later), /acknowledged/);
  await state.decideImportCandidate("session", decision, later, { acknowledgeWarnings: true });
  receipts = state.getSnapshot().import.approvalReceipts;
  assert.equal(receipts[0].acknowledgedWarnings, true);
  assert.equal(receipts[0].reviewed.fieldProvenance.roleTitle[0].associationStatus, "needs_review");
  await state.updateImportCandidate("session", "candidate", { roleTitle: "Manager" }, warning, later);
  assert.deepEqual(state.getSnapshot().import.approvalReceipts, []);
  await state.decideImportCandidate("session", decision, later, { acknowledgeWarnings: true });
  await state.decideImportCandidate("session", { candidateId: "candidate", action: "skip" }, later);
  assert.deepEqual(state.getSnapshot().import.approvalReceipts, []);
});

test("invalid target and failed receipt writes leave decisions, state, revisions and bytes unchanged", async () => {
  const context = receiptPersistence();
  const { persistence } = context;
  await prepareReview(persistence.state);
  const before = persistence.state.getSnapshot();
  const revisions = persistence.getRevisions();
  const bytes = context.bytes();
  await assert.rejects(persistence.state.decideImportCandidate("session", {
    candidateId: "candidate", action: "merge", targetRecordId: "missing", fieldChoices: {}
  }, later), /target/);
  await assert.rejects(persistence.state.decideImportCandidate("session", {
    candidateId: "candidate", action: "add"
  }, later, { acknowledgeWarnings: null }), /receipt/);
  assert.deepEqual(persistence.state.getSnapshot(), before);
  assert.deepEqual(persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
  context.failWrites(true);
  await assert.rejects(persistence.state.decideImportCandidate("session", {
    candidateId: "candidate", action: "add"
  }, later), (error) => error.status === "save-failed");
  assert.deepEqual(persistence.state.getSnapshot(), before);
  assert.deepEqual(persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
});

test("legacy approvals stay receiptless on reload until a fresh decision", async () => {
  const source = createCareerState();
  reviewing(source);
  source.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, start);
  const context = receiptPersistence();
  await context.persistence.state.restoreSnapshot(source.getSnapshot());
  const reloaded = createCareerPersistence(context.storage, context.options);
  assert.equal(reloaded.state.getImportSession("session").reviewDecisions.length, 1);
  assert.deepEqual(reloaded.state.getSnapshot().import.approvalReceipts, []);
  await reloaded.state.decideImportCandidate("session", { candidateId: "candidate", action: "add" }, later);
  assert.equal(reloaded.state.getSnapshot().import.approvalReceipts.length, 1);
});

test("skill merge captures the profile and expiry rejects a fresh approval", async () => {
  const { persistence } = receiptPersistence();
  const state = persistence.state;
  await state.createProfile({ fullName: "Name", headline: "", summary: "", skills: [] },
    { id: "profile", createdAt: start });
  const skill = { ...candidate(), category: "skill", originalData: { value: "JS" },
    reviewedData: { value: "JS" }, fieldProvenance: {} };
  await state.createImportSession(session());
  await state.addImportCandidates("session", [skill], start);
  await state.transitionImportSession("session", "ready_for_review", start);
  await state.transitionImportSession("session", "review_in_progress", start);
  const decision = { candidateId: "candidate", action: "merge", targetRecordId: "profile",
    fieldChoices: { skills: "reviewed" } };
  await state.decideImportCandidate("session", decision, later);
  const receipt = state.getSnapshot().import.approvalReceipts[0];
  assert.deepEqual(receipt.target, { category: "profile", id: "profile", record: state.getProfile() });
  const before = state.getSnapshot();
  await assert.rejects(state.decideImportCandidate("session", decision, expiry), /expired/);
  assert.deepEqual(state.getSnapshot(), before);
});

test("stale receipt decision cannot change published state or stored bytes", async () => {
  const context = receiptPersistence();
  await prepareReview(context.persistence.state);
  const stale = createCareerPersistence(context.storage, context.options);
  const before = stale.state.getSnapshot();
  await context.persistence.state.setImportCategory("session", "employment", later);
  const bytes = context.bytes();
  await assert.rejects(stale.state.decideImportCandidate("session", {
    candidateId: "candidate", action: "add"
  }, later), (error) => error.status === "stale");
  assert.deepEqual(stale.state.getSnapshot(), before);
  assert.equal(context.bytes(), bytes);
});
