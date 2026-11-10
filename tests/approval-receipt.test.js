import assert from "node:assert/strict";
import test from "node:test";
import { validateApprovalReceipt } from "../src/js/approval-receipt.js";
import { provenanceItem } from "./provenance-fixture.js";

function receipt() {
  return {
    sessionId: "session",
    candidateId: "candidate",
    reviewed: {
      category: "employment",
      reviewedData: { roleTitle: "Engineer" },
      validation: { status: "valid", errors: [], warnings: [] },
      fieldProvenance: { roleTitle: [provenanceItem()] }
    },
    decision: { candidateId: "candidate", action: "add" },
    acknowledgedWarnings: false,
    careerRevision: 3,
    approvedAt: "2025-04-20T14:30:00.000Z",
    expiresAt: "2025-04-27T14:30:00.000Z",
    target: null
  };
}

test("minimal add receipt validates reviewed provenance without original candidate data", () => {
  const value = receipt();
  assert.equal(validateApprovalReceipt(value), true);
  assert.equal(Object.hasOwn(value.reviewed, "originalData"), false);
  assert.equal(Object.hasOwn(value.reviewed, "possibleDuplicates"), false);
});

test("receipt rejects missing, extra, legacy and mismatched fields", () => {
  for (const change of [
    (r) => { delete r.candidateId; },
    (r) => { r.candidate = {}; },
    (r) => { r.acknowledgeWarnings = false; },
    (r) => { r.reviewed.originalData = {}; },
    (r) => { r.reviewed.possibleDuplicates = []; },
    (r) => { delete r.reviewed.fieldProvenance; },
    (r) => { r.reviewed.category = "unknown"; },
    (r) => { r.decision.candidateId = "other"; },
    (r) => { r.decision.extra = true; },
    (r) => { r.acknowledgedWarnings = null; },
    (r) => { r.careerRevision = -1; },
    (r) => { r.careerRevision = Number.MAX_SAFE_INTEGER + 1; },
    (r) => { r.approvedAt = r.expiresAt; },
    (r) => { r.expiresAt = "invalid"; },
    (r) => { r.target = {}; },
    (r) => { r.reviewed.fieldProvenance.roleTitle[0].fieldPath = "wrong"; },
    (r) => { r.reviewed.validation = { status: "invalid", errors: [{ code: "E", message: "Invalid" }], warnings: [] }; },
    (r) => { r.reviewed.validation = { status: "warning", errors: [], warnings: [{ code: "W", message: "Warning" }] }; }
  ]) {
    const value = receipt();
    change(value);
    assert.equal(validateApprovalReceipt(value), false);
  }
});

test("receipt rejects accessor fields without executing them", () => {
  const value = receipt();
  let invoked = false;
  Object.defineProperty(value.reviewed, "reviewedData", {
    enumerable: true, get() { invoked = true; return {}; }
  });
  assert.equal(validateApprovalReceipt(value), false);
  assert.equal(invoked, false);
});

test("warning acknowledgement and merge target record are validated", () => {
  const value = receipt();
  value.reviewed.category = "skill";
  value.reviewed.reviewedData = { value: "JavaScript" };
  value.reviewed.fieldProvenance = {};
  value.reviewed.validation = { status: "warning", errors: [], warnings: [{ code: "W", message: "Warning" }] };
  value.acknowledgedWarnings = true;
  value.decision = { candidateId: "candidate", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "reviewed" } };
  value.target = {
    category: "profile", id: "profile",
    record: { id: "profile", fullName: "Name", headline: "", summary: "", skills: [], provenance: [],
      createdAt: value.approvedAt, updatedAt: value.approvedAt }
  };
  assert.equal(validateApprovalReceipt(value), true);
  for (const change of [
    (r) => { r.target.category = "employment"; },
    (r) => { r.target.id = "other"; },
    (r) => { r.target.record.fullName = ""; },
    (r) => { r.target.state = r.target.record; delete r.target.record; },
    (r) => { r.decision.fieldChoices.skills = "overwrite"; }
  ]) {
    const invalid = structuredClone(value);
    change(invalid);
    assert.equal(validateApprovalReceipt(invalid), false);
  }
});
