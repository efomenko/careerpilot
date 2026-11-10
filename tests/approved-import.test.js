import assert from "node:assert/strict";
import test from "node:test";
import { createCareerPersistence } from "../src/js/career-persistence.js";
import { provenanceItem } from "./provenance-fixture.js";
import { createEducationRecord } from "../src/js/education-model.js";
import { createCertificationRecord } from "../src/js/certification-model.js";

const start = "2025-04-20T14:30:00.000Z";
const commitAt = "2025-04-20T15:00:00.000Z";
const expiry = "2025-04-27T14:30:00.000Z";
const valid = { status: "valid", errors: [], warnings: [] };
const locks = { request: (name, options, callback) => callback() };
function candidate(id, category, reviewedData, fieldProvenance = {}) {
  return { id, category, originalData: {}, reviewedData, fieldProvenance, validation: valid,
    reviewStatus: "pending", possibleDuplicates: [] };
}
function session() {
  return { id: "session", status: "processing",
    sourceDocument: { id: "doc", fileName: "cv.pdf", mimeType: "application/pdf", language: "en",
      uploadedAt: start, deleteBy: "2025-04-21T14:30:00.000Z", status: "uploaded" },
    createdAt: start, expiresAt: expiry, lastActivityAt: start, currentCategory: null,
    candidates: [], reviewDecisions: [], processingAttempts: [] };
}
function setup(lockProvider = locks) {
  let bytes = null;
  let failure = false;
  let writes = 0;
  const storage = {
    getItem: () => bytes,
    setItem(key, value) { if (failure) throw new Error("storage failure"); bytes = value; writes += 1; }
  };
  const persistence = createCareerPersistence(storage, { locks: lockProvider, secureContext: true });
  return { persistence, storage, bytes: () => bytes, writes: () => writes, fail: () => { failure = true; } };
}
async function review(state, candidates, decisions) {
  await state.createImportSession(session());
  await state.addImportCandidates("session", candidates, start);
  await state.transitionImportSession("session", "ready_for_review", start);
  await state.transitionImportSession("session", "review_in_progress", start);
  for (const decision of decisions) await state.decideImportCandidate("session", decision, start);
}
function commit(persistence, options = {}) {
  const revisions = persistence.getRevisions();
  let n = 0;
  return persistence.commitApprovedImport({
    sessionId: "session", expectedSnapshotRevision: revisions.snapshotRevision,
    expectedCareerRevision: revisions.careerRevision, ...options.request
  }, { createId: options.createId ?? (() => `new-${++n}`), now: () => options.now ?? commitAt });
}

test("imports a mixed batch once, resolves explicit Employment and preserves provenance", async () => {
  const context = setup();
  const state = context.persistence.state;
  const inputs = [
    candidate("skill", "skill", { value: " JS " }, { value: [{ ...provenanceItem(), fieldPath: "value" }] }),
    candidate("achievement", "achievement", { title: "Result", contribution: "Built", employmentId: "employment" }),
    candidate("employment", "employment", { employer: "Firm", roleTitle: "Engineer", startDate: null, endDate: null, isCurrent: false, responsibilities: [] }),
    candidate("profile", "profile", { fullName: "Name", headline: "", summary: "", skills: [] }),
    candidate("education", "education", { institution: "School", qualification: "Degree", startDate: null, endDate: null }),
    candidate("certification", "certification", { name: "Cert", issuer: "Issuer", issuedDate: null, expirationDate: null }),
    candidate("skip", "skill", { value: "Ignored" })
  ];
  await review(state, inputs, inputs.map((entry) => ({ candidateId: entry.id, action: entry.id === "skip" ? "skip" : "add" })));
  const before = context.persistence.getRevisions();
  const staleTab = createCareerPersistence(context.storage, { locks, secureContext: true });
  const writes = context.writes();
  const report = await commit(context.persistence);
  assert.equal(report.status, "completed");
  assert.equal(context.writes(), writes + 1);
  assert.deepEqual(context.persistence.getRevisions(), { snapshotRevision: before.snapshotRevision + 1, careerRevision: before.careerRevision + 1 });
  const snapshot = state.getSnapshot();
  assert.equal(snapshot.profile.skills[0], " JS ");
  assert.equal(snapshot.profile.provenance[0].fieldPath, "skills");
  assert.equal(snapshot.achievementRecords[0].employmentId, snapshot.employmentRecords[0].id);
  assert.equal(snapshot.achievementRecords[0].verificationStatus, "unverified");
  assert.equal(snapshot.educationRecords.length, 1);
  assert.equal(snapshot.certificationRecords.length, 1);
  for (const record of [snapshot.profile, ...snapshot.employmentRecords, ...snapshot.achievementRecords,
    ...snapshot.educationRecords, ...snapshot.certificationRecords]) {
    assert.equal(record.createdAt, commitAt);
    assert.equal(record.updatedAt, commitAt);
  }
  assert.deepEqual(report.skippedCandidateIds, ["skip"]);
  assert.equal(report.records.length, 6);
  assert.deepEqual(snapshot.import.approvalReceipts, []);
  assert.equal(snapshot.import.sessions[0].status, "import_completed");
  const bytes = context.bytes();
  assert.deepEqual(await commit(context.persistence), report);
  assert.equal(context.bytes(), bytes);
  assert.deepEqual(await commit(staleTab), report);
  assert.equal(context.bytes(), bytes);
  const reloaded = createCareerPersistence(context.storage, { locks, secureContext: true });
  assert.deepEqual(await commit(reloaded), report);
  assert.deepEqual(reloaded.state.getSnapshot(), snapshot);
});

test("merges Employment, Achievement, Education and Certification without changing other fields", async () => {
  const { persistence } = setup();
  const state = persistence.state;
  await state.addEmploymentRecord({ employer: "Firm", roleTitle: "Old", startDate: null, endDate: null,
    isCurrent: false, responsibilities: [] }, { id: "employment", createdAt: start });
  await state.addAchievementRecord({ title: "Old", contribution: "Original", employmentId: "employment" },
    { id: "achievement", createdAt: start });
  const initial = state.getSnapshot();
  initial.educationRecords.push(createEducationRecord({ institution: "School", qualification: "Old",
    startDate: null, endDate: null }, { id: "education", createdAt: start }));
  initial.certificationRecords.push(createCertificationRecord({ name: "Old", issuer: "Issuer",
    issuedDate: null, expirationDate: null }, { id: "certification", createdAt: start }));
  await state.restoreSnapshot(initial);
  const inputs = [
    candidate("e", "employment", { roleTitle: "New" }),
    candidate("a", "achievement", { title: "New", contribution: "Changed" }),
    candidate("ed", "education", { qualification: "New" }),
    candidate("c", "certification", { name: "New" })
  ];
  const decisions = [
    { candidateId: "e", action: "merge", targetRecordId: "employment", fieldChoices: { roleTitle: "reviewed" } },
    { candidateId: "a", action: "merge", targetRecordId: "achievement", fieldChoices: { title: "reviewed", contribution: "existing" } },
    { candidateId: "ed", action: "merge", targetRecordId: "education", fieldChoices: { qualification: "reviewed" } },
    { candidateId: "c", action: "merge", targetRecordId: "certification", fieldChoices: { name: "reviewed" } }
  ];
  await review(state, inputs, decisions);
  assert.equal((await commit(persistence)).status, "completed");
  const snapshot = state.getSnapshot();
  assert.equal(snapshot.employmentRecords[0].roleTitle, "New");
  assert.equal(snapshot.achievementRecords[0].title, "New");
  assert.equal(snapshot.achievementRecords[0].contribution, "Original");
  assert.equal(snapshot.educationRecords[0].qualification, "New");
  assert.equal(snapshot.certificationRecords[0].name, "New");
});

test("receipt mismatch, missing receipt and changed target all require review without writes", async () => {
  for (const kind of ["reviewed", "decision", "missing", "target", "warning", "expiry"]) {
    const context = setup();
    const state = context.persistence.state;
    await state.createProfile({ fullName: "Existing", headline: "", summary: "", skills: [] }, { id: "profile", createdAt: start });
    const decision = { candidateId: "p", action: "merge", targetRecordId: "profile", fieldChoices: { fullName: "reviewed" } };
    await review(state, [candidate("p", "profile", { fullName: "New" })], [decision]);
    const modified = state.getSnapshot();
    const receipt = modified.import.approvalReceipts[0];
    if (kind === "reviewed") receipt.reviewed.reviewedData.fullName = "Different";
    if (kind === "decision") receipt.decision.fieldChoices.fullName = "existing";
    if (kind === "target") receipt.target.record.fullName = "Previous";
    if (kind === "missing") modified.import.approvalReceipts = [];
    if (kind === "expiry") receipt.expiresAt = "2025-04-26T14:30:00.000Z";
    if (kind === "warning") modified.import.sessions[0].candidates[0].validation = {
      status: "warning", errors: [], warnings: [{ code: "W", message: "Warning" }]
    };
    await state.restoreSnapshot(modified);
    const before = state.getSnapshot();
    const bytes = context.bytes();
    const result = await commit(context.persistence);
    assert.equal(result.reason, "stale-review", kind);
    assert.deepEqual(state.getSnapshot(), before, kind);
    assert.equal(context.bytes(), bytes, kind);
  }
});

test("merge honors selected fields and skill existing and reviewed choices", async () => {
  const { persistence } = setup();
  await persistence.state.createProfile({ fullName: "Existing", headline: "", summary: "", skills: ["JS"] }, { id: "profile", createdAt: start });
  const inputs = [
    candidate("p", "profile", { fullName: "New", headline: "Headline" }),
    candidate("s1", "skill", { value: "JS" }),
    candidate("s2", "skill", { value: "Rust" })
  ];
  const decisions = [
    { candidateId: "p", action: "merge", targetRecordId: "profile", fieldChoices: { fullName: "existing", headline: "reviewed" } },
    { candidateId: "s1", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "existing" } },
    { candidateId: "s2", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "reviewed" } }
  ];
  await review(persistence.state, inputs, decisions);
  assert.equal((await commit(persistence)).status, "completed");
  assert.equal(persistence.state.getProfile().fullName, "Existing");
  assert.equal(persistence.state.getProfile().headline, "Headline");
  assert.deepEqual(persistence.state.getProfile().skills, ["JS", "Rust"]);
});

test("imports an explicitly acknowledged warning without leaking it into the report", async () => {
  const { persistence } = setup();
  const state = persistence.state;
  const entry = candidate("p", "profile", { fullName: "Name", headline: "", summary: "", skills: [] });
  entry.validation = { status: "warning", errors: [], warnings: [{ code: "W", message: "Private review text" }] };
  await state.createImportSession(session());
  await state.addImportCandidates("session", [entry], start);
  await state.transitionImportSession("session", "ready_for_review", start);
  await state.transitionImportSession("session", "review_in_progress", start);
  await state.decideImportCandidate("session", { candidateId: "p", action: "add" }, start, { acknowledgeWarnings: true });
  const report = await commit(persistence);
  assert.equal(report.status, "completed");
  assert.equal(JSON.stringify(report).includes("Private review text"), false);
});

test("invalid mappings, collisions, expiry, stale revisions and failed saves roll back", async () => {
  for (const scenario of ["invalid", "collision", "expiry", "stale", "save"]) {
    const context = setup();
    const value = scenario === "invalid" ? { value: "" } : { fullName: "Name", headline: "", summary: "", skills: [] };
    const category = scenario === "invalid" ? "skill" : "profile";
    if (scenario === "collision") await context.persistence.state.createProfile({ fullName: "Other", headline: "", summary: "", skills: [] }, { id: "collision", createdAt: start });
    await review(context.persistence.state, [candidate("c", category, value)], [{ candidateId: "c", action: "add" }]);
    const before = context.persistence.state.getSnapshot();
    const bytes = context.bytes();
    const revisions = context.persistence.getRevisions();
    if (scenario === "save") context.fail();
    const options = scenario === "collision" ? { createId: () => "collision" }
      : scenario === "expiry" ? { now: expiry }
      : scenario === "stale" ? { request: { expectedCareerRevision: revisions.careerRevision + 1 } } : {};
    const result = await commit(context.persistence, options);
    assert.equal(result.status, "failed", scenario);
    if (scenario === "collision") assert.equal(result.reason, "id-collision");
    assert.deepEqual(context.persistence.state.getSnapshot(), before, scenario);
    assert.deepEqual(context.persistence.getRevisions(), revisions, scenario);
    assert.equal(context.bytes(), bytes, scenario);
  }
});

test("Achievement merges use the existing verification reset rule", async () => {
  for (const [status, title, choice, expected] of [
    ["verified", "Changed", "reviewed", "unverified"],
    ["verified", "Original", "reviewed", "verified"],
    ["verified", "Changed", "existing", "verified"],
    ["needs_confirmation", "Changed", "reviewed", "needs_confirmation"],
    ["unverified", "Changed", "reviewed", "unverified"]
  ]) {
    const { persistence } = setup();
    const state = persistence.state;
    await state.addAchievementRecord({ title: "Original", contribution: "Built" }, { id: "achievement", createdAt: start });
    if (status !== "unverified") await state.updateAchievementVerificationStatus("achievement", status, start);
    await review(state, [candidate("a", "achievement", { title })], [{
      candidateId: "a", action: "merge", targetRecordId: "achievement", fieldChoices: { title: choice }
    }]);
    assert.equal((await commit(persistence)).status, "completed");
    const result = state.getAchievementRecords()[0];
    assert.equal(result.title, choice === "existing" ? "Original" : title);
    assert.equal(result.verificationStatus, expected);
  }
});

test("failed save rolls back an Achievement merge and its staged verification reset", async () => {
  const context = setup();
  const state = context.persistence.state;
  await state.addAchievementRecord({ title: "Original", contribution: "Built" }, { id: "achievement", createdAt: start });
  await state.updateAchievementVerificationStatus("achievement", "verified", start);
  await review(state, [candidate("a", "achievement", { title: "Changed" })], [{
    candidateId: "a", action: "merge", targetRecordId: "achievement", fieldChoices: { title: "reviewed" }
  }]);
  const before = state.getSnapshot();
  const revisions = context.persistence.getRevisions();
  const bytes = context.bytes();
  context.fail();
  assert.equal((await commit(context.persistence)).reason, "save-failed");
  assert.deepEqual(state.getSnapshot(), before);
  assert.deepEqual(context.persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
  assert.equal(state.getAchievementRecords()[0].verificationStatus, "verified");
});

test("conflicting field choices on the same target abort without publishing or saving", async () => {
  for (const choices of [
    [{ title: "First" }, "reviewed", { title: "Second" }, "reviewed"],
    [{ title: "Changed" }, "reviewed", { title: "Original" }, "existing"],
    [{ title: "Original" }, "existing", { title: "Changed" }, "reviewed"]
  ]) {
    const context = setup();
    const state = context.persistence.state;
    await state.addAchievementRecord({ title: "Original", contribution: "Built" }, { id: "achievement", createdAt: start });
    await state.updateAchievementVerificationStatus("achievement", "verified", start);
    const [first, firstChoice, second, secondChoice] = choices;
    await review(state, [candidate("first", "achievement", first), candidate("second", "achievement", second)], [
      { candidateId: "first", action: "merge", targetRecordId: "achievement", fieldChoices: { title: firstChoice } },
      { candidateId: "second", action: "merge", targetRecordId: "achievement", fieldChoices: { title: secondChoice } }
    ]);
    const before = state.getSnapshot();
    const bytes = context.bytes();
    const revisions = context.persistence.getRevisions();
    const writes = context.writes();
    const result = await commit(context.persistence);
    assert.equal(result.reason, "merge-conflict");
    assert.deepEqual(state.getSnapshot(), before);
    assert.equal(context.bytes(), bytes);
    assert.deepEqual(context.persistence.getRevisions(), revisions);
    assert.equal(context.writes(), writes);
    assert.equal(state.getAchievementRecords()[0].verificationStatus, "verified");
  }
});

test("equal and disjoint merge choices to the same target succeed", async () => {
  const { persistence } = setup();
  const state = persistence.state;
  await state.addAchievementRecord({ title: "Original", contribution: "Built" }, { id: "achievement", createdAt: start });
  await review(state, [
    candidate("first", "achievement", { title: "Changed" }),
    candidate("second", "achievement", { title: "Changed", contribution: "Updated" })
  ], [
    { candidateId: "first", action: "merge", targetRecordId: "achievement", fieldChoices: { title: "reviewed" } },
    { candidateId: "second", action: "merge", targetRecordId: "achievement",
      fieldChoices: { title: "reviewed", contribution: "reviewed" } }
  ]);
  const report = await commit(persistence);
  assert.equal(report.status, "completed");
  assert.equal(report.records.length, 2);
  assert.equal(state.getAchievementRecords()[0].title, "Changed");
  assert.equal(state.getAchievementRecords()[0].contribution, "Updated");
});

test("skill existing choice uses its approved target instead of earlier staged adds", async () => {
  const context = setup();
  const state = context.persistence.state;
  await state.createProfile({ fullName: "Name", headline: "", summary: "", skills: [] }, { id: "profile", createdAt: start });
  await review(state, [candidate("add", "skill", { value: "JS" }), candidate("merge", "skill", { value: "JS" })], [
    { candidateId: "add", action: "add" },
    { candidateId: "merge", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "existing" } }
  ]);
  const before = state.getSnapshot();
  assert.deepEqual(before.import.approvalReceipts[1].target.record.skills, []);
  const bytes = context.bytes();
  const revisions = context.persistence.getRevisions();
  const result = await commit(context.persistence);
  assert.equal(result.reason, "invalid-mapping");
  assert.deepEqual(state.getSnapshot(), before);
  assert.deepEqual(context.persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
});

test("Profile merge removing an approved existing skill rolls back the transaction", async () => {
  const context = setup();
  const state = context.persistence.state;
  await state.createProfile({ fullName: "Name", headline: "", summary: "", skills: ["JS"] },
    { id: "profile", createdAt: start });
  await review(state, [
    candidate("profile-candidate", "profile", { skills: ["Rust"] }),
    candidate("skill-candidate", "skill", { value: "JS" })
  ], [
    { candidateId: "profile-candidate", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "reviewed" } },
    { candidateId: "skill-candidate", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "existing" } }
  ]);
  const before = state.getSnapshot();
  const revisions = context.persistence.getRevisions();
  const bytes = context.bytes();
  const writes = context.writes();
  const result = await commit(context.persistence);
  assert.equal(result.status, "failed");
  assert.equal(result.reason, "merge-conflict");
  assert.deepEqual(state.getSnapshot(), before);
  assert.deepEqual(context.persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
  assert.equal(context.writes(), writes);
});

test("Profile merge retaining an approved existing skill commits both decisions", async () => {
  const context = setup();
  const state = context.persistence.state;
  await state.createProfile({ fullName: "Name", headline: "", summary: "", skills: ["JS"] },
    { id: "profile", createdAt: start });
  await review(state, [
    candidate("profile-candidate", "profile", { skills: ["Rust", "JS"] }),
    candidate("skill-candidate", "skill", { value: "JS" })
  ], [
    { candidateId: "profile-candidate", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "reviewed" } },
    { candidateId: "skill-candidate", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "existing" } }
  ]);
  const writes = context.writes();
  const report = await commit(context.persistence);
  assert.equal(report.status, "completed");
  assert.deepEqual(report.records.map((entry) => entry.candidateId), ["profile-candidate", "skill-candidate"]);
  assert.deepEqual(state.getProfile().skills, ["Rust", "JS"]);
  assert.equal(context.writes(), writes + 1);
  assert.equal(state.getImportSession("session").status, "import_completed");
});

test("pending candidates block completion and remain reviewable", async () => {
  const context = setup();
  const state = context.persistence.state;
  await review(state, [
    candidate("approved", "profile", { fullName: "Name", headline: "", summary: "", skills: [] }),
    candidate("pending", "skill", { value: "JS" })
  ], [{ candidateId: "approved", action: "add" }]);
  const before = state.getSnapshot();
  const bytes = context.bytes();
  const revisions = context.persistence.getRevisions();
  assert.equal((await commit(context.persistence)).reason, "pending-review");
  assert.deepEqual(state.getSnapshot(), before);
  assert.deepEqual(context.persistence.getRevisions(), revisions);
  assert.equal(context.bytes(), bytes);
  await state.decideImportCandidate("session", { candidateId: "pending", action: "skip" }, start);
  const report = await commit(context.persistence);
  assert.equal(report.status, "completed");
  assert.deepEqual(report.skippedCandidateIds, ["pending"]);
});

test("competing imports serialize under the shared lock and commit only once", async () => {
  let tail = Promise.resolve();
  let active = 0;
  let maxActive = 0;
  let requests = 0;
  let callbackEntries = 0;
  let holdNext = false;
  let verifyCommit = false;
  let publishedUnderLock = false;
  let release;
  let acquired;
  const held = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { acquired = resolve; });
  const serialLocks = {
    request(name, options, callback) {
      assert.equal(name, "careerpilot.snapshot");
      assert.deepEqual(options, { mode: "exclusive" });
      requests += 1;
      const next = tail.then(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (holdNext) {
            holdNext = false;
            acquired();
            await held;
          }
          callbackEntries += 1;
          const result = await callback();
          if (verifyCommit && result.status === "saved") {
            assert.equal(active, 1);
            assert.equal(context.persistence.state.getProfile().fullName, "Name");
            publishedUnderLock = true;
          }
          return result;
        } finally {
          active -= 1;
        }
      });
      tail = next.catch(() => {});
      return next;
    }
  };
  const context = setup(serialLocks);
  await review(context.persistence.state, [candidate("p", "profile", {
    fullName: "Name", headline: "", summary: "", skills: []
  })], [{ candidateId: "p", action: "add" }]);
  const second = createCareerPersistence(context.storage, { locks: serialLocks, secureContext: true });
  const originalGet = context.storage.getItem;
  const originalSet = context.storage.setItem;
  let lockedReads = 0;
  let lockedWrites = 0;
  context.storage.getItem = (...args) => {
    assert.equal(active, 1);
    lockedReads += 1;
    return originalGet(...args);
  };
  context.storage.setItem = (...args) => {
    assert.equal(active, 1);
    assert.equal(context.persistence.state.getProfile(), null);
    lockedWrites += 1;
    return originalSet(...args);
  };
  const oldBytes = context.bytes();
  const oldWrites = context.writes();
  const beforeEntries = callbackEntries;
  const beforeRequests = requests;
  holdNext = true;
  verifyCommit = true;
  const firstImport = commit(context.persistence, { createId: () => {
    assert.equal(active, 1);
    assert.equal(context.persistence.state.getProfile(), null);
    return "new-profile";
  } });
  await entered;
  const secondImport = commit(second);
  try {
    assert.equal(requests, beforeRequests + 2);
    assert.equal(callbackEntries, beforeEntries);
    assert.equal(context.bytes(), oldBytes);
    assert.equal(context.persistence.state.getProfile(), null);
    assert.equal(second.state.getProfile(), null);
  } finally {
    release();
  }
  const [first, retry] = await Promise.all([firstImport, secondImport]);
  assert.equal(first.status, "completed");
  assert.deepEqual(retry, first);
  assert.equal(maxActive, 1);
  assert.ok(lockedReads >= 2);
  assert.equal(lockedWrites, 1);
  assert.equal(publishedUnderLock, true);
  assert.equal(callbackEntries, beforeEntries + 2);
  assert.equal(context.writes(), oldWrites + 1);
  assert.equal(context.persistence.state.getProfile().fullName, "Name");
  assert.equal(second.state.getProfile(), null);
});

test("relationship and skill mapping failures preserve the complete snapshot", async () => {
  for (const kind of ["missing-employment", "wrong-category", "skill-no-profile", "skill-existing-missing", "provenance", "generated-collision"]) {
    const context = setup();
    const state = context.persistence.state;
    if (kind === "skill-existing-missing" || kind === "provenance") {
      await state.createProfile({ fullName: "Existing", headline: "", summary: "", skills: [] },
        { id: "profile", createdAt: start });
    }
    let candidates;
    let decisions;
    if (kind === "missing-employment" || kind === "wrong-category") {
      candidates = [candidate("achievement", "achievement", { title: "Result", contribution: "Built", employmentId: "other" })];
      if (kind === "wrong-category") candidates.push(candidate("other", "skill", { value: "JS" }));
      decisions = candidates.map((item) => ({ candidateId: item.id, action: "add" }));
    } else if (kind === "generated-collision") {
      candidates = [
        candidate("one", "profile", { fullName: "Name", headline: "", summary: "", skills: [] }),
        candidate("two", "achievement", { title: "Result", contribution: "Built" })
      ];
      decisions = candidates.map((item) => ({ candidateId: item.id, action: "add" }));
    } else {
      const source = kind === "provenance" ? { unknown: [{ ...provenanceItem(), fieldPath: "unknown" }] } : {};
      candidates = [candidate("skill", "skill", { value: "JS" }, source)];
      decisions = [kind === "skill-existing-missing"
        ? { candidateId: "skill", action: "merge", targetRecordId: "profile", fieldChoices: { skills: "existing" } }
        : { candidateId: "skill", action: "add" }];
    }
    await review(state, candidates, decisions);
    const before = state.getSnapshot();
    const bytes = context.bytes();
    const result = await commit(context.persistence, kind === "generated-collision" ? { createId: () => "same" } : {});
    assert.equal(result.status, "failed", kind);
    assert.deepEqual(state.getSnapshot(), before, kind);
    assert.equal(context.bytes(), bytes, kind);
  }
});

test("stale snapshot and unavailable coordination cannot import", async () => {
  const context = setup();
  await review(context.persistence.state, [candidate("p", "profile", {
    fullName: "Name", headline: "", summary: "", skills: []
  })], [{ candidateId: "p", action: "add" }]);
  const stale = createCareerPersistence(context.storage, { locks, secureContext: true });
  const unavailable = createCareerPersistence(context.storage, { locks: null, secureContext: true });
  await context.persistence.state.setImportCategory("session", "profile", start);
  const bytes = context.bytes();
  const before = stale.state.getSnapshot();
  assert.equal((await commit(stale)).reason, "stale");
  assert.deepEqual(stale.state.getSnapshot(), before);
  assert.equal((await commit(unavailable)).reason, "coordination-unavailable");
  assert.equal(context.bytes(), bytes);
});

test("invalid legacy opaque career records prevent importing without losing their bytes", async () => {
  const context = setup();
  const state = context.persistence.state;
  const snapshot = state.getSnapshot();
  snapshot.educationRecords.push({ opaque: "legacy" });
  await state.restoreSnapshot(snapshot);
  await review(state, [candidate("p", "profile", { fullName: "Name", headline: "", summary: "", skills: [] })],
    [{ candidateId: "p", action: "add" }]);
  const before = state.getSnapshot();
  const bytes = context.bytes();
  assert.equal((await commit(context.persistence)).reason, "invalid-mapping");
  assert.deepEqual(state.getSnapshot(), before);
  assert.equal(context.bytes(), bytes);
});
