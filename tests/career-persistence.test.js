import assert from "node:assert/strict";
import test from "node:test";
import { createAchievementMappingRecord } from "../src/js/achievement-mapping-model.js";
import {
  createCareerPersistence,
  createPersistenceMutationState,
  createPersistenceNotifications
} from "../src/js/career-persistence.js";
import { createCareerStorage } from "../src/js/career-storage.js";
import { createCareerState } from "../src/js/career-state.js";
import { createSnapshotWriter } from "../src/js/snapshot-writer.js";
import { createJobRecord } from "../src/js/job-model.js";
import { createRequirementRecord } from "../src/js/requirement-model.js";

const timestamp = "2025-04-20T14:30:00.000Z";
const storageKey = "careerpilot.state";

function profile(overrides = {}) {
  return {
    id: "profile-1",
    fullName: "Career profile name",
    headline: "",
    summary: "",
    skills: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function employment(id = "employment-1", overrides = {}) {
  return {
    id,
    employer: "Employer",
    roleTitle: "Role",
    startDate: "2020-01-01",
    endDate: null,
    isCurrent: true,
    responsibilities: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function achievement(id = "achievement-1", overrides = {}) {
  return {
    id,
    title: "Achievement",
    context: "",
    contribution: "Contribution",
    actions: [],
    outcome: "",
    potentialImpact: "",
    metrics: [],
    evidence: [],
    employmentId: null,
    verificationStatus: "unverified",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function snapshot(overrides = {}) {
  return {
    profile: profile(),
    employmentRecords: [employment()],
    achievementRecords: [achievement("achievement-1", {
      employmentId: "employment-1"
    })],
    jobs: [],
    requirements: [],
    legacyRequirements: [],
    achievementMappings: [],
    ...overrides
  };
}

function job(id = "job-1", overrides = {}) {
  return {
    id,
    company: "Example Company",
    roleTitle: "Engineer",
    description: "",
    sourceUrl: "",
    notes: "",
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

const snapshotKeys = [
  "profile",
  "employmentRecords",
  "achievementRecords",
  "jobs",
  "requirements",
  "legacyRequirements",
  "achievementMappings",
  "educationRecords",
  "certificationRecords",
  "import"
];

function migratedV4(data) {
  const date = (value) => value === null ? null : { value, precision: "day" };
  return {
    ...data,
    profile: data.profile === null ? null : { ...data.profile, provenance: [] },
    employmentRecords: data.employmentRecords.map((record) => ({
      ...record,
      startDate: date(record.startDate),
      endDate: date(record.endDate),
      provenance: []
    })),
    achievementRecords: data.achievementRecords.map((record) => ({ ...record, provenance: [] })),
    educationRecords: [],
    certificationRecords: [],
    import: { sessions: [], completedBatches: [], importReports: [] }
  };
}

function v1Snapshot() {
  const {
    jobs,
    requirements,
    legacyRequirements,
    achievementMappings,
    ...v1
  } = snapshot();
  return v1;
}

function createFakeStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(storageKey, initialValue);
  }
  const calls = { getItem: [], setItem: [] };
  let getError = null;
  let setError = null;

  return {
    calls,
    values,
    set getError(error) {
      getError = error;
    },
    set setError(error) {
      setError = error;
    },
    getItem(key) {
      calls.getItem.push(key);
      if (getError) {
        throw getError;
      }
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      calls.setItem.push([key, value]);
      if (setError) {
        throw setError;
      }
      values.set(key, String(value));
    }
  };
}

function stored(value = snapshot(), version = 3) {
  if (version === 2) {
    const { legacyRequirements, ...v2Snapshot } = value;
    return JSON.stringify({ version, ...v2Snapshot });
  }
  return JSON.stringify({ version, ...value });
}

function createWithDependencies(storage, dependencies = {}, options = {}) {
  return createCareerPersistence(storage, options, dependencies);
}

test("coordinated persistence saves detached career and session mutations", async () => {
  const fake = createFakeStorage();
  let locked = false;
  const locks = { request: async (name, options, callback) => {
    locked = true;
    try { return await callback(); } finally { locked = false; }
  } };
  const setItem = fake.setItem.bind(fake);
  fake.setItem = (key, value) => {
    assert.equal(locked, true);
    setItem(key, value);
  };
  const persistence = createCareerPersistence(fake, { locks, secureContext: true });
  await persistence.state.createProfile({ fullName: "Name", headline: "", summary: "", skills: [] }, { id: "p", createdAt: timestamp });
  assert.deepEqual(persistence.getRevisions(), { snapshotRevision: 1, careerRevision: 1 });
  const session = {
    id: "s", status: "processing",
    sourceDocument: { id: "d", fileName: "cv.pdf", mimeType: "application/pdf", language: "en",
      uploadedAt: timestamp, deleteBy: "2025-04-21T14:30:00.000Z", status: "uploaded" },
    createdAt: timestamp, expiresAt: "2025-04-27T14:30:00.000Z", lastActivityAt: timestamp,
    currentCategory: null, candidates: [], reviewDecisions: [], processingAttempts: []
  };
  await persistence.state.createImportSession(session);
  assert.deepEqual(persistence.getRevisions(), { snapshotRevision: 2, careerRevision: 1 });
  const reloaded = createCareerPersistence(fake, { locks, secureContext: true });
  assert.equal(reloaded.state.getProfile().fullName, "Name");
  assert.equal(reloaded.state.getImportSession("s").id, "s");
  assert.deepEqual(reloaded.getRevisions(), { snapshotRevision: 2, careerRevision: 1 });
});

test("coordinated persistence rejects unavailable, stale, and failed saves without publication", async () => {
  const fake = createFakeStorage();
  const locks = { request: (name, options, callback) => callback() };
  const unavailable = createCareerPersistence(fake, { locks: null, secureContext: true });
  await assert.rejects(unavailable.state.createProfile({ fullName: "No" }, { id: "n", createdAt: timestamp }),
    (error) => error.status === "coordination-unavailable");
  assert.equal(unavailable.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
  const first = createCareerPersistence(fake, { locks, secureContext: true });
  const stale = createCareerPersistence(fake, { locks, secureContext: true });
  await first.state.createProfile({ fullName: "First", headline: "", summary: "", skills: [] }, { id: "p", createdAt: timestamp });
  const bytes = fake.values.get(storageKey);
  await assert.rejects(stale.state.createProfile({ fullName: "Stale" }, { id: "s", createdAt: timestamp }),
    (error) => error.status === "stale");
  assert.equal(stale.state.getProfile(), null);
  assert.equal(fake.values.get(storageKey), bytes);
  fake.setError = new Error("storage failure");
  await assert.rejects(first.state.updateProfile({ fullName: "Changed", headline: "", summary: "", skills: [] }, timestamp),
    (error) => error.status === "save-failed");
  assert.equal(first.state.getProfile().fullName, "First");
  assert.equal(fake.values.get(storageKey), bytes);
});

test("coordinated persistence routes every mutation entry point through the lock", async () => {
  const methods = [
    "createProfile", "updateProfile", "addEmploymentRecord", "updateEmploymentRecord",
    "deleteEmploymentRecord", "addAchievementRecord", "updateAchievementRecord",
    "updateAchievementVerificationStatus", "deleteAchievementRecord", "createJob",
    "updateJob", "archiveJob", "reactivateJob", "deleteJob", "createRequirement",
    "updateRequirement", "deleteRequirement", "createAchievementMapping", "deleteAchievementMapping",
    "restoreSnapshot", "createImportSession", "transitionImportSession", "retryImportSession",
    "addImportCandidates", "setImportCategory", "updateImportCandidate", "decideImportCandidate"
  ];
  for (const method of methods) {
    let acquisitions = 0;
    const locks = { request: async (name, options, callback) => {
      acquisitions += 1;
      return callback();
    } };
    const persistence = createCareerPersistence(createFakeStorage(), { locks, secureContext: true });
    try {
      await persistence.state[method]();
    } catch (error) {
      assert.ok(error instanceof Error, method);
    }
    assert.equal(acquisitions, 1, method);
  }
});

test("coordinated persistence handles lock acquisition failure without writes", async () => {
  const fake = createFakeStorage();
  const locks = { request: () => Promise.reject(new Error("unavailable")) };
  const persistence = createCareerPersistence(fake, { locks, secureContext: true });
  await assert.rejects(persistence.state.createProfile({}, {}), (error) => error.status === "coordination-failed");
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.calls.setItem.length, 0);
});

test("coordinated persistence discards partially restored state after a restore failure", async () => {
  const fake = createFakeStorage(stored(snapshot(), 3));
  const raw = fake.values.get(storageKey);
  let created = 0;
  const errors = [];
  const persistence = createWithDependencies(fake, {
    createState() {
      created += 1;
      if (created === 1) {
        return {
          restoreSnapshot() { throw new Error("restore failed"); }
        };
      }
      return createCareerState();
    }
  }, {
    onUnexpectedError(error) { errors.push(error.message); },
    locks: { request: (name, options, callback) => callback() },
    secureContext: true
  });
  assert.deepEqual(errors, ["restore failed"]);
  assert.equal(persistence.state.getProfile(), null);
  await assert.rejects(persistence.state.createProfile({}, {}), (error) => error.status === "writes-disabled");
  assert.equal(fake.values.get(storageKey), raw);
});

test("coordinated persistence reports storage construction errors and disables writes", async () => {
  const fake = createFakeStorage(stored(snapshot(), 3));
  const raw = fake.values.get(storageKey);
  const errors = [];
  const persistence = createWithDependencies(fake, {
    createStorage() { throw new Error("storage failure"); }
  }, { onUnexpectedError(error) { errors.push(error.message); } });
  assert.deepEqual(errors, ["storage failure"]);
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  await assert.rejects(persistence.state.createProfile({}, {}), (error) => error.status === "writes-disabled");
  assert.equal(fake.values.get(storageKey), raw);
});

test("coordinated persistence keeps staging private until a delayed save succeeds", async () => {
  const fake = createFakeStorage();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let factoryCalls = 0;
  const persistence = createWithDependencies(fake, {
    createState(options = {}) {
      assert.equal(options.onMutation, undefined);
      factoryCalls += 1;
      return createCareerState(options);
    },
    createStorage(storage) {
      const actual = createCareerStorage(storage);
      return {
        load: actual.load,
        createWriter(options) {
          return actual.createWriter({
            ...options,
            locks: {
              request: (name, lockOptions, callback) => gate.then(callback)
            }
          });
        }
      };
    }
  }, { secureContext: true });
  const pending = persistence.state.createProfile(
    { fullName: "Pending", headline: "", summary: "", skills: [] },
    { id: "p", createdAt: timestamp }
  );
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
  release();
  await pending;
  assert.equal(persistence.state.getProfile().fullName, "Pending");
  assert.ok(factoryCalls >= 2);
});

test("coordinated persistence preserves corrupt, future and lossy snapshots", async () => {
  const protectedRaw = JSON.stringify({ version: 3, ...snapshot(), legacyRequirements: [{ score: "TOKEN" }] })
    .replace('"TOKEN"', "0.1234567890123456789");
  for (const [raw, kind] of [
    ["not JSON", "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"],
    [protectedRaw, "read-only"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true
    });
    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(persistence.state.getProfile(), null);
    await assert.rejects(persistence.state.createProfile({}, {}), (error) => error.status === "writes-disabled");
    assert.equal(fake.values.get(storageKey), raw);
    assert.equal(fake.calls.setItem.length, 0);
  }
});

test("missing storage returns an empty state without warnings", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);

  assert.equal(persistence.state.getProfile(), null);
  assert.deepEqual(persistence.state.getEmploymentRecords(), []);
  assert.deepEqual(persistence.state.getAchievementRecords(), []);
  assert.deepEqual(persistence.getStatus(), {
    persistentWarning: null,
    transientWarning: null
  });
  assert.deepEqual(fake.calls.getItem, [storageKey]);
});

test("valid data is restored before the function returns", () => {
  const data = snapshot();
  const persistence = createCareerPersistence(createFakeStorage(stored(data)));

  assert.deepEqual(persistence.state.getSnapshot(), migratedV4(data));
  assert.deepEqual(persistence.getStatus(), {
    persistentWarning: null,
    transientWarning: null
  });
});

test("corrupt and unsupported data produce persistent warnings and are not overwritten", async () => {
  for (const [raw, kind] of [
    ["not valid JSON", "corrupt"],
    [stored(snapshot(), 4), "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(fake.values.get(storageKey), raw);
    await assert.rejects(persistence.state.createProfile({
      fullName: "New profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "new-profile", createdAt: timestamp }), (error) => error.status === "writes-disabled");
    assert.equal(persistence.state.getProfile(), null);
    assert.equal(fake.values.get(storageKey), raw);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  }
});

test("initial read failure protects existing bytes for the session after storage recovers", async () => {
  const raw = stored(migratedV4(snapshot()), 4);
  const fake = createFakeStorage(raw);
  fake.getError = new Error("read failure");
  const persistence = createCareerPersistence(fake);
  const state = createPersistenceMutationState(persistence);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  assert.equal(state.getProfile(), null);
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.match(persistence.getStatus().persistentWarning.message, /could not be read.*disabled.*session/);
  fake.getError = null;
  const create = state.createProfile({
    fullName: "New profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "new-profile", createdAt: timestamp });
  await assert.rejects(create, (error) => error.status === "writes-disabled");
  await notifications.show("success", "Profile created.", create);

  assert.equal(state.getProfile(), null);
  assert.equal(await persistence.getOperationOutcome(create), "writes-disabled");
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  const update = state.updateProfile({ fullName: "Updated in memory", headline: "", summary: "", skills: [] }, timestamp);
  await assert.rejects(update, (error) => error.status === "writes-disabled");
  await notifications.show("success", "Profile updated.", update);
  assert.equal(state.getProfile(), null);
  assert.equal(await persistence.getOperationOutcome(update), "writes-disabled");
  assert.equal(messages[1].type, "error");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  const reloaded = createCareerPersistence(fake);
  assert.deepEqual(reloaded.state.getSnapshot(), migratedV4(snapshot()));
  assert.equal(reloaded.getStatus().persistentWarning, null);
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);
});

test("an initially unreadable empty store also stays protected until reinitialization", async () => {
  const fake = createFakeStorage();
  fake.getError = new Error("read failure");
  const persistence = createCareerPersistence(fake);
  fake.getError = null;

  const blocked = persistence.state.createProfile({
    fullName: "Session profile", headline: "", summary: "", skills: []
  }, { id: "session-profile", createdAt: timestamp });
  await assert.rejects(blocked, (error) => error.status === "writes-disabled");
  assert.equal(await persistence.getOperationOutcome(blocked), "writes-disabled");
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
  assert.deepEqual(fake.calls.setItem, []);

  const reloaded = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const retry = reloaded.state.createProfile({
    fullName: "New profile", headline: "", summary: "", skills: []
  }, { id: "new-profile", createdAt: timestamp });
  await retry;
  assert.equal(await reloaded.getOperationOutcome(retry), "saved");
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.id, "new-profile");
});

test("a read failure after successful initialization can be retried safely", async () => {
  const raw = stored(migratedV4(snapshot()), 4);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  fake.getError = new Error("temporary read failure");
  const failed = persistence.state.updateProfile({
    fullName: "Updated", headline: "", summary: "", skills: []
  }, timestamp);
  await assert.rejects(failed, (error) => error.status === "read-failed" && error.cause === "unavailable");

  assert.equal(await persistence.getOperationOutcome(failed), "read-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "read-failed");
  assert.equal(persistence.state.getProfile().fullName, "Career profile name");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  fake.getError = null;
  const retried = persistence.state.updateProfile({
    fullName: "Retried", headline: "", summary: "", skills: []
  }, timestamp);
  await retried;
  assert.equal(await persistence.getOperationOutcome(retried), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Retried");
  assert.equal(fake.calls.setItem.length, 1);
});

test("adapter construction failure preserves empty in-memory state and disables writes", async () => {
  const errors = [];
  const persistence = createWithDependencies(null, {
    createStorage() {
      throw new Error("adapter construction failure");
    }
  }, {
    onUnexpectedError: (error) => errors.push(error)
  });

  await assert.rejects(persistence.state.createProfile({
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-memory", createdAt: timestamp }), (error) => error.status === "writes-disabled");

  assert.equal(persistence.state.getProfile(), null);
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.equal(errors.length, 1);
});

test("unexpected restore failure discards the partially restored state", async () => {
  const raw = stored(snapshot(), 3);
  const fake = createFakeStorage(raw);
  const errors = [];
  let stateNumber = 0;
  const persistence = createWithDependencies(fake, {
    createState: () => {
      stateNumber += 1;
      if (stateNumber === 1) {
        return {
          restoreSnapshot() {
            throw new Error("partial restore");
          }
        };
      }
      return createCareerState();
    }
  }, { onUnexpectedError: (error) => errors.push(error) });

  assert.equal(stateNumber, 2);
  assert.equal(persistence.state.getProfile(), null);
  await assert.rejects(persistence.state.createProfile({
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-memory", createdAt: timestamp }), (error) => error.status === "writes-disabled");
  assert.equal(persistence.state.getProfile(), null);
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.match(errors[0].message, /partial restore/);
});

test("successful mutations save the complete post-mutation snapshot", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const result = await persistence.state.createProfile({
    fullName: "Saved profile",
    headline: "",
    summary: "",
    skills: ["Research"]
  }, { id: "profile-saved", createdAt: timestamp });

  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(result.id, "profile-saved");
  assert.equal(saved.version, 5);
  assert.deepEqual(Object.keys(saved), ["version", "snapshotRevision", "careerRevision", ...snapshotKeys]);
  assert.equal(saved.snapshotRevision, 1);
  assert.equal(saved.careerRevision, 1);
  assert.deepEqual(saved.profile, persistence.state.getProfile());
  assert.deepEqual(saved.employmentRecords, []);
  assert.deepEqual(saved.achievementRecords, []);
  assert.deepEqual(saved.jobs, []);
  assert.deepEqual(saved.requirements, []);
  assert.deepEqual(saved.legacyRequirements, []);
  assert.deepEqual(saved.achievementMappings, []);
  assert.deepEqual(saved.educationRecords, []);
  assert.deepEqual(saved.certificationRecords, []);
  assert.deepEqual(saved.import, { sessions: [], completedBatches: [], importReports: [] });
});

test("restores a complete v3 snapshot without writing", () => {
  const data = snapshot({
    jobs: [job("job-1"), job("job-2", { status: "archived" })],
    requirements: [{
      id: "requirement-1",
      jobId: "job-1",
      description: "Requirement",
      category: "other",
      importance: "preferred",
      createdAt: timestamp,
      updatedAt: timestamp
    }],
    legacyRequirements: [null, { id: "legacy" }],
    achievementMappings: [{
      id: "mapping-1",
      requirementId: "requirement-1",
      achievementId: "achievement-1"
    }]
  });
  const fake = createFakeStorage(stored(data));
  const persistence = createCareerPersistence(fake);

  assert.deepEqual(persistence.state.getSnapshot(), migratedV4(data));
  assert.deepEqual(persistence.state.getJobs(), data.jobs);
  assert.deepEqual(fake.calls.setItem, []);
  assert.deepEqual(persistence.getStatus(), {
    persistentWarning: null,
    transientWarning: null
  });
});

test("restores profile null and empty new collections", () => {
  const data = snapshot({ profile: null });
  const persistence = createCareerPersistence(createFakeStorage(stored(data)));

  assert.equal(persistence.state.getProfile(), null);
  assert.deepEqual(persistence.state.getSnapshot(), migratedV4(data));
  assert.deepEqual(persistence.state.getJobs(), []);
});

test("valid v1 data is restored as migrated v4 without warning or write", () => {
  const raw = stored(v1Snapshot(), 1);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake);

  assert.deepEqual(persistence.state.getSnapshot(), migratedV4(snapshot()));
  assert.deepEqual(persistence.getStatus(), {
    persistentWarning: null,
    transientWarning: null
  });
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);
});

test("v1 data stays intact until a successful mutation saves complete v5", async () => {
  const raw = stored(v1Snapshot(), 1);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });

  fake.setError = new Error("write failure");
  await assert.rejects(persistence.state.createJob(job("job-1")), (error) => error.status === "save-failed");
  assert.equal(fake.values.get(storageKey), raw);
  assert.equal(persistence.state.getJobs().length, 0);
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(persistence.getStatus().persistentWarning, null);

  fake.setError = null;
  await persistence.state.createJob(job("job-2"));
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 5);
  assert.deepEqual(Object.keys(saved), ["version", "snapshotRevision", "careerRevision", ...snapshotKeys]);
  assert.equal(saved.snapshotRevision, 1);
  assert.equal(saved.careerRevision, 0);
  assert.deepEqual(saved.jobs.map((record) => record.id), ["job-2"]);
  assert.deepEqual(saved.employmentRecords, migratedV4(snapshot()).employmentRecords);
  assert.equal(persistence.getStatus().transientWarning, null);
});

test("job create, update, archive, reactivate, and delete are persisted", async () => {
  const fake = createFakeStorage();
  const { state } = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const savedJobs = () => JSON.parse(fake.values.get(storageKey)).jobs;
  const later = "2025-04-21T10:00:00.000Z";

  await state.createJob(job("job-1"));
  assert.deepEqual(savedJobs(), [job("job-1")]);

  await state.updateJob("job-1", { company: "Other", updatedAt: later });
  assert.equal(savedJobs()[0].company, "Other");

  await state.archiveJob("job-1", later);
  assert.equal(savedJobs()[0].status, "archived");

  await state.reactivateJob("job-1", later);
  assert.equal(savedJobs()[0].status, "active");

  await state.deleteJob("job-1");
  assert.deepEqual(savedJobs(), []);
});

test("no-op job updates do not write", async () => {
  const fake = createFakeStorage();
  const { state } = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  await state.createJob(job("job-1"));
  const writes = fake.calls.setItem.length;

  await state.updateJob("job-1", { company: "Example Company" });
  assert.equal(fake.calls.setItem.length, writes);
});

test("saves keep jobs, requirements, and mappings from restored state", async () => {
  const data = snapshot({
    jobs: [job("job-1")],
    requirements: [{
      id: "requirement-1",
      jobId: "job-1",
      description: "Requirement",
      category: "other",
      importance: "preferred",
      createdAt: timestamp,
      updatedAt: timestamp
    }],
    achievementMappings: [{ id: "mapping-1", requirementId: "requirement-1" }]
  });
  const fake = createFakeStorage(stored(data));
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });

  await persistence.state.updateProfile({
    fullName: "Updated",
    headline: "",
    summary: "",
    skills: []
  }, timestamp);
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.profile.fullName, "Updated");
  assert.deepEqual(saved.jobs, data.jobs);
  assert.deepEqual(saved.requirements, data.requirements);
  assert.deepEqual(saved.achievementMappings, data.achievementMappings);
  assert.equal("fitAssessments" in saved, false);
});

test("v2 migration preserves legacy entries through restore and later v5 persistence", async () => {
  const legacyRequirements = [
    { id: "incomplete", jobId: "job-1" },
    null,
    "legacy value"
  ];
  const data = {
    ...snapshot({
      jobs: [job("job-1")],
      requirements: legacyRequirements,
      achievementMappings: [
        { id: "orphan-map", requirementId: "orphan", extra: true },
        { id: "legacy-map", requirementId: "incomplete" }
      ]
    })
  };
  delete data.legacyRequirements;
  const raw = stored(data, 2);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });

  assert.deepEqual(persistence.state.getSnapshot().legacyRequirements, legacyRequirements);
  assert.deepEqual(persistence.state.getRequirements("job-1"), []);
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);

  await persistence.state.updateJob("job-1", {
    notes: "Unrelated mutation",
    updatedAt: "2025-04-21T10:00:00.000Z"
  });
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 5);
  assert.equal(saved.snapshotRevision, 1);
  assert.equal(saved.careerRevision, 0);
  assert.deepEqual(saved.legacyRequirements, legacyRequirements);
  assert.deepEqual(saved.achievementMappings, data.achievementMappings);
  assert.deepEqual(saved.achievementRecords, migratedV4(data).achievementRecords);
  assert.deepEqual(saved.profile, migratedV4(data).profile);
  assert.deepEqual(saved.employmentRecords, migratedV4(data).employmentRecords);
});

test("current v3 envelopes load without a warning", () => {
  const fake = createFakeStorage(stored(snapshot()));
  const persistence = createCareerPersistence(fake);

  assert.equal(persistence.getStatus().persistentWarning, null);
});

test("corrupt v2 data and unsupported future versions are never overwritten by job mutations", async () => {
  for (const [raw, kind] of [
    [stored({ ...snapshot(), jobs: "bad" }, 2), "corrupt"],
    [stored(snapshot(), 4), "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    await assert.rejects(persistence.state.createJob(job("job-1")), (error) => error.status === "writes-disabled");
    assert.equal(fake.values.get(storageKey), raw);
    assert.equal(persistence.state.getJobs().length, 0);
    assert.deepEqual(fake.calls.setItem, []);
    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  }
});

test("verification changes and employment deletion are persisted correctly", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const state = persistence.state;

  await state.addEmploymentRecord({
    employer: "Employer",
    roleTitle: "Role",
    startDate: "2020-01-01",
    endDate: null,
    isCurrent: true,
    responsibilities: []
  }, { id: "employment-1", createdAt: timestamp });
  const created = await state.addAchievementRecord({
    title: "Achievement",
    context: "",
    contribution: "Contribution",
    actions: [],
    outcome: "",
    potentialImpact: "",
    metrics: [],
    evidence: [],
    employmentId: "employment-1"
  }, { id: "achievement-1", createdAt: timestamp });
  await state.updateAchievementVerificationStatus(created.id, "verified", timestamp);
  let saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.achievementRecords[0].verificationStatus, "verified");

  await state.deleteEmploymentRecord("employment-1");
  saved = JSON.parse(fake.values.get(storageKey));
  assert.deepEqual(saved.employmentRecords, []);
  assert.equal(saved.achievementRecords[0].employmentId, null);
  assert.equal(saved.achievementRecords[0].verificationStatus, "unverified");
});

test("reloads matching source records and recalculates the Fit Assessment", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const state = persistence.state;

  await state.createJob(createJobRecord({
    company: "Example Company",
    roleTitle: "Engineer"
  }, {
    id: "job-1",
    createdAt: timestamp
  }));
  await state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Mandatory requirement",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-mandatory",
    createdAt: timestamp
  }));
  await state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Preferred requirement",
    category: "skill",
    importance: "preferred"
  }, {
    id: "requirement-preferred",
    createdAt: timestamp
  }));
  await state.addAchievementRecord({
    title: "Verified achievement",
    contribution: "Delivered a measurable result"
  }, {
    id: "achievement-verified",
    createdAt: timestamp
  });
  await state.addAchievementRecord({
    title: "Unverified achievement",
    contribution: "Completed relevant work"
  }, {
    id: "achievement-unverified",
    createdAt: timestamp
  });
  await state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-mandatory",
    achievementId: "achievement-verified"
  }, {
    id: "mapping-mandatory",
    createdAt: timestamp
  }));
  await state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-preferred",
    achievementId: "achievement-unverified"
  }, {
    id: "mapping-preferred",
    createdAt: timestamp
  }));
  await state.updateAchievementVerificationStatus(
    "achievement-verified",
    "verified",
    timestamp
  );

  assert.ok(fake.calls.setItem.length > 0);
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 5);
  assert.equal("fitAssessments" in saved, false);

  const writesBeforeReload = fake.calls.setItem.length;
  const readsBeforeReload = fake.calls.getItem.length;
  const reloadedPersistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const restoredState = reloadedPersistence.state;

  assert.equal(fake.calls.getItem.length, readsBeforeReload + 1);
  assert.equal(fake.calls.setItem.length, writesBeforeReload);
  assert.deepEqual(restoredState.getJobs().map(({ id }) => id), ["job-1"]);
  assert.deepEqual(
    restoredState.getRequirements("job-1").map(({ id, jobId, importance }) => ({
      id,
      jobId,
      importance
    })),
    [
      { id: "requirement-mandatory", jobId: "job-1", importance: "mandatory" },
      { id: "requirement-preferred", jobId: "job-1", importance: "preferred" }
    ]
  );
  assert.deepEqual(
    restoredState.getAchievementRecords().map(({ id, verificationStatus }) => ({
      id,
      verificationStatus
    })),
    [
      { id: "achievement-verified", verificationStatus: "verified" },
      { id: "achievement-unverified", verificationStatus: "unverified" }
    ]
  );
  assert.deepEqual(
    restoredState.getAchievementMappingsForRequirement("requirement-mandatory")
      .map(({ id, achievementId }) => ({ id, achievementId })),
    [{ id: "mapping-mandatory", achievementId: "achievement-verified" }]
  );
  assert.deepEqual(
    restoredState.getAchievementMappingsForRequirement("requirement-preferred")
      .map(({ id, achievementId }) => ({ id, achievementId })),
    [{ id: "mapping-preferred", achievementId: "achievement-unverified" }]
  );
  assert.equal("fitAssessments" in restoredState.getSnapshot(), false);

  const partialAssessment = restoredState.calculateJobFitAssessment("job-1");
  const mandatoryResult = partialAssessment.requirementResults.find(
    ({ requirementId }) => requirementId === "requirement-mandatory"
  );
  const preferredResult = partialAssessment.requirementResults.find(
    ({ requirementId }) => requirementId === "requirement-preferred"
  );

  assert.equal(partialAssessment.status, "assessed");
  assert.equal(partialAssessment.score, (2 / 3) * 100);
  assert.equal(partialAssessment.supportedRequirementCount, 1);
  assert.equal(partialAssessment.totalRequirementCount, 2);
  assert.equal(partialAssessment.supportedMandatoryCount, 1);
  assert.equal(partialAssessment.totalMandatoryCount, 1);
  assert.deepEqual(mandatoryResult.verifiedAchievementIds, ["achievement-verified"]);
  assert.deepEqual(mandatoryResult.unverifiedAchievementIds, []);
  assert.deepEqual(preferredResult.verifiedAchievementIds, []);
  assert.deepEqual(preferredResult.unverifiedAchievementIds, ["achievement-unverified"]);

  await restoredState.updateAchievementVerificationStatus(
    "achievement-unverified",
    "verified",
    "2025-04-21T14:30:00.000Z"
  );

  const completeAssessment = restoredState.calculateJobFitAssessment("job-1");

  assert.equal(completeAssessment.score, 100);
  assert.equal(completeAssessment.supportedRequirementCount, 2);
  assert.equal(completeAssessment.totalRequirementCount, 2);
  assert.equal(completeAssessment.supportedMandatoryCount, 1);
  assert.equal(completeAssessment.totalMandatoryCount, 1);
  assert.deepEqual(
    completeAssessment.requirementResults
      .flatMap(({ verifiedAchievementIds }) => verifiedAchievementIds)
      .sort(),
    ["achievement-unverified", "achievement-verified"]
  );
  assert.deepEqual(
    completeAssessment.requirementResults
      .flatMap(({ unverifiedAchievementIds }) => unverifiedAchievementIds),
    []
  );
});

test("failed writes roll back mutations and a later save clears the warning", async () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });

  const profile = {
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  };
  await assert.rejects(persistence.state.createProfile(profile, { id: "profile-1", createdAt: timestamp }),
    (error) => error.status === "save-failed");
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");

  fake.setError = null;
  await persistence.state.createProfile({ ...profile, fullName: "Updated profile" },
    { id: "profile-1", createdAt: timestamp });
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Updated profile");
});

test("blocked writes never clear corrupt or unsupported warnings", async () => {
  for (const [raw, kind] of [
    ["bad JSON", "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"],
    [stored(snapshot(), 4), "corrupt"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    await assert.rejects(persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp }), (error) => error.status === "writes-disabled");
    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
    assert.equal(persistence.state.getProfile(), null);
    assert.equal(fake.values.get(storageKey), raw);
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("invalid, fidelity, and disabled save outcomes do not report success", async () => {
  for (const [saveStatus, warningKind] of [
    ["invalid-snapshot", "invalid-snapshot"],
    ["json-fidelity-error", "json-fidelity-error"],
    ["writes-disabled", "write-disabled"]
  ]) {
    const fake = createFakeStorage();
    const persistence = createWithDependencies(fake, {
      createStorage: () => ({
        load: () => ({ status: "missing" }),
        createWriter: (options) => createSnapshotWriter({
          ...options,
          storage: {
            load: () => ({ status: "missing", snapshot: options.initialSnapshot, snapshotRevision: 0, careerRevision: 0 }),
            save: () => ({ status: saveStatus })
          }
        })
      })
    }, { locks: { request: (name, options, callback) => callback() }, secureContext: true });

    await assert.rejects(persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp }), (error) => error.status === "save-failed" && error.cause === saveStatus);
    assert.equal(persistence.getStatus().transientWarning.kind, warningKind);
    assert.equal(persistence.state.getProfile(), null);
    assert.equal(fake.values.has(storageKey), false);
  }
});

test("unsaved mutations never emit success notifications in protected or failed storage states", async () => {
  const historical = JSON.stringify({
    version: 2, profile: null, employmentRecords: [], achievementRecords: [],
    jobs: [], requirements: [{ score: 0 }], achievementMappings: []
  }).replace('"score":0', '"score":-0');
  const unsafe = stored(migratedV4(snapshot({ profile: null })), 4)
    .replace('"educationRecords":[]', '"educationRecords":[{"number":9007199254740993}]');
  const cases = [
    { name: "historical negative zero", raw: historical, persistent: "read-only", transient: "write-disabled" },
    { name: "corrupt", raw: "not JSON", persistent: "corrupt", transient: "write-disabled" },
    { name: "unsupported", raw: stored(snapshot(), 99), persistent: "unsupported-version", transient: "write-disabled" },
    { name: "unsafe integer", raw: unsafe, persistent: "read-only", transient: "write-disabled" },
    { name: "unavailable read", raw: null, persistent: "unavailable", transient: "write-disabled", getError: true },
    { name: "write failure", raw: null, persistent: null, transient: "write-failed", setError: true }
  ];

  for (const entry of cases) {
    const fake = createFakeStorage(entry.raw);
    if (entry.getError) fake.getError = new Error("read failure");
    if (entry.setError) fake.setError = new Error("write failure");
    const persistence = createCareerPersistence(fake, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true
    });
    const state = createPersistenceMutationState(persistence);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);

    const operation = state.createProfile({
      fullName: "In-memory profile", headline: "", summary: "", skills: []
    }, { id: "profile", createdAt: timestamp });
    await assert.rejects(operation);
    await notifications.show("success", "Profile created.", operation);

    assert.equal(persistence.state.getProfile(), null, entry.name);
    assert.equal(persistence.getStatus().persistentWarning?.kind ?? null, entry.persistent, entry.name);
    assert.equal(persistence.getStatus().transientWarning?.kind ?? null, entry.transient, entry.name);
    assert.notEqual(await persistence.getOperationOutcome(operation), "saved", entry.name);
    assert.equal(messages[0].type, "error", entry.name);
    assert.match(messages[0].message, /Saving could not be completed/, entry.name);
    assert.equal(fake.values.get(storageKey) ?? null, entry.raw, entry.name);
  }
});

test("fractional precision loss blocks hydration and suppresses mutation success notifications", async () => {
  const v1 = v1Snapshot();
  v1.achievementRecords[0].evidence = [{ score: 1 }];
  const v2 = snapshot({ requirements: [{ score: 1 }] });
  const v3 = snapshot({ achievementMappings: [{ score: 1 }] });
  const v4 = migratedV4(snapshot());
  v4.import.sessions = [{ score: 1 }];
  for (const [version, data] of [[1, v1], [2, v2], [3, v3], [4, v4]]) {
    const raw = stored(data, version).replace('"score":1', '"score":0.1234567890123456789');
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);

    assert.equal(persistence.state.getProfile(), null, `version ${version}`);
    assert.deepEqual(persistence.state.getAchievementRecords(), [], `version ${version}`);
    assert.deepEqual(persistence.state.getSnapshot().import.sessions, [], `version ${version}`);
    assert.equal(persistence.getStatus().persistentWarning.kind, "read-only");
    assert.match(persistence.getStatus().persistentWarning.message, /not been loaded.*cannot be saved/);
    const operation = persistence.state.createJob(job("new-job"));
    await assert.rejects(operation, (error) => error.status === "writes-disabled");
    await notifications.show("success", "Job created.", operation);
    assert.equal(await persistence.getOperationOutcome(operation), "writes-disabled");
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
    assert.deepEqual(persistence.state.getJobs(), []);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "error");
    assert.match(messages[0].message, /Saving could not be completed/);
    assert.equal(fake.values.get(storageKey), raw);
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("successful saves and retries emit success, while unchanged mutations suppress notifications", async () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const state = createPersistenceMutationState(persistence);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  const input = { fullName: "Profile", headline: "", summary: "", skills: [] };

  const failed = state.createProfile(input, {
    id: "profile", createdAt: timestamp
  });
  await assert.rejects(failed, (error) => error.status === "save-failed");
  await notifications.show("success", "Profile created.", failed);
  assert.equal(messages.at(-1).type, "error");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");

  fake.setError = null;
  const retry = state.createProfile({ ...input, fullName: "Retry" }, { id: "profile", createdAt: timestamp });
  await retry;
  await notifications.show("success", "Profile updated.", retry);
  assert.deepEqual(messages.at(-1), { type: "success", message: "Profile updated." });
  assert.equal(await persistence.getOperationOutcome(retry), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Retry");

  await state.createJob(job("job-1"));
  const unchanged = state.updateJob("job-1", { company: "Example Company" });
  await unchanged;
  const messageCount = messages.length;
  await notifications.show("success", "Profile updated.", unchanged);
  assert.equal(await persistence.getOperationOutcome(unchanged), "unchanged");
  assert.equal(messages.length, messageCount);
});

test("direct and application state mutations track saves and unchanged outcomes exactly once", async () => {
  for (const useWrapper of [false, true]) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true
    });
    const state = useWrapper ? createPersistenceMutationState(persistence) : persistence.state;
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);

    assert.equal(createPersistenceMutationState(persistence), persistence.state);
    const created = state.createJob(job("job-1"));
    await created;
    assert.equal(fake.calls.setItem.length, 1);
    assert.equal(await persistence.getOperationOutcome(created), "saved");
    await notifications.show("success", "Job created.", created);
    assert.deepEqual(messages, [{ type: "success", message: "Job created." }]);

    const unchanged = state.updateJob("job-1", { company: "Example Company" });
    await unchanged;
    assert.equal(await persistence.getOperationOutcome(unchanged), "unchanged");
    assert.equal(fake.calls.setItem.length, 1);
    await notifications.show("success", "Job updated.", unchanged);
    assert.equal(messages.length, 1);

    const updated = state.updateJob("job-1", { company: "New Company", updatedAt: timestamp });
    await updated;
    assert.equal(fake.calls.setItem.length, 2);
    assert.equal(await persistence.getOperationOutcome(updated), "saved");
    assert.equal(JSON.parse(fake.values.get(storageKey)).jobs[0].company, "New Company");
    await notifications.show("success", "Job updated.", updated);
    assert.deepEqual(messages.at(-1), { type: "success", message: "Job updated." });

    const invalid = state.updateJob("missing", { company: "Other" });
    await assert.rejects(invalid);
    assert.equal(await persistence.getOperationOutcome(invalid), "error");
    assert.equal(fake.calls.setItem.length, 2);
  }
});

test("success notifications wait for their own operation and fail closed without one", async () => {
  const fake = createFakeStorage();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const persistence = createCareerPersistence(fake, {
    locks: { request: async (name, options, callback) => { await gate; return callback(); } },
    secureContext: true
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  const operation = persistence.state.createJob(job());
  const notification = notifications.show("success", "Job created.", operation);
  await Promise.resolve();
  assert.deepEqual(messages, []);
  assert.equal(fake.values.has(storageKey), false);
  release();
  await operation;
  await notification;
  assert.deepEqual(messages, [{ type: "success", message: "Job created." }]);
  await notifications.show("success", "Unbound.");
  assert.equal(messages.at(-1).type, "error");
});

test("a successful reentrant mutation must not turn a failed mutation into a success notification", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        fake.setError = null;
        nested = persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });
  await persistence.state.createJob(job());
  fake.setError = new Error("write failure");
  const outer = persistence.state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await nested;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  await notifications.show("success", "Job updated.", outer);
  assert.equal(messages[0].type, "error");
  assert.equal(persistence.state.getJobs()[0].company, "Example Company");
  assert.equal(persistence.state.getJobs()[0].notes, "Nested");
});

test("a failed reentrant mutation must not turn a successful mutation into an error notification", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  let triggerNested = false;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (triggerNested && !status.transientWarning && !nested) {
        fake.setError = new Error("nested write failure");
        nested = persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });
  await persistence.state.createJob(job());
  fake.setError = new Error("outer setup failure");
  await assert.rejects(persistence.state.updateJob("job-1", { company: "Failure", updatedAt: timestamp }));
  fake.setError = null;
  triggerNested = true;
  const outer = persistence.state.updateJob("job-1", { company: "Success", updatedAt: timestamp });
  await outer;
  await assert.rejects(nested, (error) => error.status === "save-failed");
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  await notifications.show("success", "Job updated.", outer);
  await notifications.show("success", "Nested updated.", nested);
  assert.deepEqual(messages.map(({ type }) => type), ["success", "error"]);
  assert.equal(persistence.state.getJobs()[0].company, "Success");
  assert.equal(persistence.state.getJobs()[0].notes, job().notes);
  assert.equal(JSON.parse(fake.values.get(storageKey)).jobs[0].company, "Success");
});

test("a failed outer save retains its outcome when a status callback performs a no-op", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        nested = persistence.state.updateJob("job-1", { company: "Example Company" });
      }
    }
  });
  const state = createPersistenceMutationState(persistence);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  const outer = state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await nested;

  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(await persistence.getOperationOutcome(nested), "unchanged");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(fake.values.get(storageKey), original);
  assert.equal(state.getJobs()[0].company, "Example Company");
  await notifications.show("success", "Job updated.", outer);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("a nested successful save does not change a failed outer save outcome", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        fake.setError = null;
        nested = persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await state.createJob(job());
  fake.setError = new Error("write failure");
  const outer = state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await nested;

  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(await persistence.getOperationOutcome(nested), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 3);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Example Company");
  assert.equal(savedJob.notes, "Nested");
  assert.deepEqual(state.getJobs()[0], savedJob);
  await notifications.show("success", "Job updated.", outer);
  assert.deepEqual(messages, [{
    type: "error",
    message: "Saving could not be completed. Check the persistence status before retrying."
  }]);
});

test("a nested successful save can replace the failed outer mutation's field", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        fake.setError = null;
        nested = persistence.state.updateJob("job-1", { company: "Override", updatedAt: timestamp });
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await persistence.state.createJob(job());
  fake.setError = new Error("write failure");
  const outer = persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await nested;

  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(await persistence.getOperationOutcome(nested), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 3);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [
    job("job-1", { company: "Override" })
  ]);
  await notifications.show("success", "Job updated.", outer);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("failed outer and nested saves both remain failed", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        nested = persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await persistence.state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  const outer = persistence.state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await assert.rejects(nested, (error) => error.status === "save-failed");

  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(await persistence.getOperationOutcome(nested), "save-failed");
  assert.equal(fake.calls.setItem.length, 3);
  assert.equal(fake.values.get(storageKey), original);
  assert.deepEqual(persistence.state.getJobs()[0], job());
  await notifications.show("success", "Job updated.", outer);
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("nested mutations cannot overwrite protected bytes", async () => {
  const raw = "not JSON";
  const fake = createFakeStorage(raw);
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-disabled") {
        nested = persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });

  const outer = persistence.state.createJob(job());
  await assert.rejects(outer, (error) => error.status === "writes-disabled");
  await assert.rejects(nested, (error) => error.status === "writes-disabled");

  assert.equal(await persistence.getOperationOutcome(nested), "writes-disabled");
  assert.equal(await persistence.getOperationOutcome(outer), "writes-disabled");
  assert.deepEqual(persistence.state.getJobs(), []);
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);
});

test("a successful outer save retains its outcome when a nested mutation fails", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  let runNested = false;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (runNested && status.transientWarning === null) {
        runNested = false;
        fake.setError = new Error("nested write failure");
        nested = persistence.state.updateJob("job-1", { notes: "Unsaved nested", updatedAt: timestamp });
      }
    }
  });
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await state.createJob(job());
  fake.setError = new Error("write failure");
  await assert.rejects(state.updateJob("job-1", { company: "Earlier", updatedAt: timestamp }));
  fake.setError = null;
  runNested = true;
  const outer = state.updateJob("job-1", { company: "Retry", updatedAt: timestamp });
  await outer;
  await assert.rejects(nested, (error) => error.status === "save-failed");

  assert.equal(await persistence.getOperationOutcome(outer), "saved");
  assert.equal(await persistence.getOperationOutcome(nested), "save-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Retry");
  assert.equal(savedJob.notes, "");
  assert.equal(state.getJobs()[0].notes, "");
  await notifications.show("success", "Job updated.", outer);
  assert.deepEqual(messages, [{ type: "success", message: "Job updated." }]);
});

test("a third-level successful save preserves each ancestor's own outcome", async () => {
  const fake = createFakeStorage();
  const outcomes = [];
  const saveResults = ["saved", "invalid-snapshot", "write-failed", "saved"];
  let persistence;
  let inner;
  let middle;
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        createWriter(options) {
          return createSnapshotWriter({
            ...options,
            storage: {
              load: () => adapter.load(),
              save(snapshot, revisions) {
                const outcome = saveResults[outcomes.length];
                outcomes.push(outcome);
                if (outcome !== "saved") return { status: outcome };
                storage.setItem(storageKey, JSON.stringify({ version: 5, ...revisions, ...snapshot }));
                return { status: "saved" };
              }
            }
          });
        }
      };
    }
  }, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "invalid-snapshot" && !middle) {
        middle = persistence.state.updateJob("job-1", { notes: "Middle", updatedAt: timestamp });
      } else if (status.transientWarning?.kind === "write-failed" && !inner) {
        inner = persistence.state.updateJob("job-1", { description: "Inner", updatedAt: timestamp });
      }
    }
  });

  await persistence.state.createJob(job());
  const outer = persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed" && error.cause === "invalid-snapshot");
  await assert.rejects(middle, (error) => error.status === "save-failed" && error.cause === "write-failed");
  await inner;

  assert.deepEqual(outcomes, ["saved", "invalid-snapshot", "write-failed", "saved"]);
  assert.equal(await persistence.getOperationOutcome(inner), "saved");
  assert.equal(await persistence.getOperationOutcome(middle), "save-failed");
  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.deepEqual(savedJob, job("job-1", {
    description: "Inner"
  }));
});

test("three-level conflicting updates keep separate outcomes and persist the last value", async () => {
  const fake = createFakeStorage();
  const outcomes = [];
  const saveResults = ["saved", "invalid-snapshot", "write-failed", "saved"];
  let persistence;
  let inner;
  let middle;
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        createWriter(options) {
          return createSnapshotWriter({
            ...options,
            storage: {
              load: () => adapter.load(),
              save(snapshot, revisions) {
                const outcome = saveResults[outcomes.length];
                outcomes.push(outcome);
                if (outcome !== "saved") return { status: outcome };
                storage.setItem(storageKey, JSON.stringify({ version: 5, ...revisions, ...snapshot }));
                return { status: "saved" };
              }
            }
          });
        }
      };
    }
  }, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "invalid-snapshot" && !middle) {
        middle = persistence.state.updateJob("job-1", { company: "Middle", updatedAt: timestamp });
      } else if (status.transientWarning?.kind === "write-failed" && !inner) {
        inner = persistence.state.updateJob("job-1", { company: "Inner", updatedAt: timestamp });
      }
    }
  });

  await persistence.state.createJob(job());
  const outer = persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed" && error.cause === "invalid-snapshot");
  await assert.rejects(middle, (error) => error.status === "save-failed" && error.cause === "write-failed");
  await inner;

  assert.deepEqual(outcomes, ["saved", "invalid-snapshot", "write-failed", "saved"]);
  assert.equal(await persistence.getOperationOutcome(inner), "saved");
  assert.equal(await persistence.getOperationOutcome(middle), "save-failed");
  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [
    job("job-1", { company: "Inner" })
  ]);
});

test("a nested retry after a save exception leaves the outer outcome and clears the warning", async () => {
  const fake = createFakeStorage();
  let persistence;
  let throwNext = false;
  let nested;
  const errors = [];
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        createWriter(options) {
          return createSnapshotWriter({
            ...options,
            storage: {
              load: () => adapter.load(),
              save(snapshot, revisions) {
                if (throwNext) {
                  throwNext = false;
                  throw new Error("unexpected save error");
                }
                storage.setItem(storageKey, JSON.stringify({ version: 5, ...revisions, ...snapshot }));
                return { status: "saved" };
              }
            }
          });
        }
      };
    }
  }, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onUnexpectedError(error) {
      errors.push(error.message);
      nested = persistence.state.updateJob("job-1", { notes: "Retry", updatedAt: timestamp });
    }
  });

  await persistence.state.createJob(job());
  throwNext = true;
  const outer = persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed" && error.cause === "unexpected-error");
  await nested;

  assert.deepEqual(errors, ["unexpected save error"]);
  assert.equal(await persistence.getOperationOutcome(nested), "saved");
  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Example Company");
  assert.equal(savedJob.notes, "Retry");
});

test("a nested validation exception does not replace the outer failure outcome", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        nested = persistence.state.updateJob("missing", { company: "Other" });
      }
    }
  });
  await persistence.state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  const outer = persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await assert.rejects(nested, /does not exist/);

  assert.equal(await persistence.getOperationOutcome(nested), "error");
  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(fake.values.get(storageKey), original);
  assert.deepEqual(persistence.state.getJobs()[0], job());
});

test("individual mutation operations retain their results across a retry", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  fake.setError = new Error("write failure");

  const failed = persistence.state.createJob(job());
  await assert.rejects(failed, (error) => error.status === "save-failed");
  assert.equal(await persistence.getOperationOutcome(failed), "save-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 1);
  assert.equal(fake.values.has(storageKey), false);

  fake.setError = null;
  const retry = persistence.state.createJob(job("job-1", { company: "Retry" }));
  const result = await retry;
  assert.equal(result.company, "Retry");
  assert.equal(await persistence.getOperationOutcome(retry), "saved");
  assert.equal(await persistence.getOperationOutcome(failed), "save-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(JSON.parse(fake.values.get(storageKey)).jobs[0].company, "Retry");
});

test("sequential operations keep separate save, failure, and no-op outcomes", async () => {
  const cases = [
    { name: "success then failure", steps: ["saved", "write-failed"], stored: ["first"] },
    { name: "failure then success", steps: ["write-failed", "saved"], stored: ["second"] },
    { name: "failure then no-op", steps: ["write-failed", "unchanged"], stored: [] },
    { name: "two successes", steps: ["saved", "saved"], stored: ["first", "second"] },
    { name: "no mutations", steps: [], stored: [] }
  ];

  for (const entry of cases) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true
    });
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    await persistence.state.createJob(job("baseline"));
    const operations = [];
    for (const [index, step] of entry.steps.entries()) {
      fake.setError = step === "write-failed" ? new Error("write failure") : null;
      const operation = step === "unchanged"
        ? persistence.state.updateJob("baseline", { company: "Example Company" })
        : persistence.state.createJob(job(index === 0 ? "first" : "second"));
      operations.push(operation);
      if (step === "write-failed") {
        await assert.rejects(operation, (error) => error.status === "save-failed");
      } else {
        await operation;
      }
      await notifications.show("success", "Job saved.", operation);
    }
    assert.deepEqual(await Promise.all(operations.map((operation) => persistence.getOperationOutcome(operation))),
      entry.steps.map((step) => step === "write-failed" ? "save-failed" : step), entry.name);
    const expected = ["baseline", ...entry.stored].map((id) => job(id));
    assert.deepEqual(persistence.state.getJobs(), expected, entry.name);
    assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, expected, entry.name);
    assert.equal(fake.calls.setItem.length, 1 + entry.steps.filter((step) => step !== "unchanged").length, entry.name);
    assert.equal(
      persistence.getStatus().transientWarning?.kind ?? null,
      entry.steps.includes("write-failed") && entry.steps.lastIndexOf("write-failed") > entry.steps.lastIndexOf("saved") ? "write-failed" : null,
      entry.name
    );
    assert.deepEqual(messages.map((message) => message.type),
      entry.steps.filter((step) => step !== "unchanged").map((step) => step === "saved" ? "success" : "error"),
      entry.name);
  }
});

test("nested asynchronous flows preserve each individual operation outcome", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const operations = [];
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  operations.push(persistence.state.createJob(job("first")));
  await operations[0];
  async function nestedFlow() {
    fake.setError = new Error("write failure");
    operations.push(persistence.state.createJob(job("second")));
    await assert.rejects(operations[1], (error) => error.status === "save-failed");
    async function innerFlow() {
      fake.setError = null;
      operations.push(persistence.state.createJob(job("third")));
      await operations[2];
    }
    await innerFlow();
    fake.setError = new Error("write failure");
    operations.push(persistence.state.createJob(job("fourth")));
    await assert.rejects(operations[3], (error) => error.status === "save-failed");
  }
  await nestedFlow();
  operations.push(persistence.state.updateJob("first", { company: "Example Company" }));
  await operations[4];

  assert.deepEqual(await Promise.all(operations.map((operation) => persistence.getOperationOutcome(operation))),
    ["saved", "save-failed", "saved", "save-failed", "unchanged"]);
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  assert.deepEqual(persistence.state.getJobs().map((record) => record.id), ["first", "third"]);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs.map((record) => record.id), ["first", "third"]);
  await notifications.show("success", "Jobs saved.", operations[3]);
  assert.deepEqual(messages.map((message) => message.type), ["error"]);
});

test("reentrant async operations retain their own results despite later success", async () => {
  const fake = createFakeStorage();
  let persistence;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed" && !nested) {
        fake.setError = null;
        nested = persistence.state.updateJob("first", { notes: "Nested", updatedAt: timestamp });
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await persistence.state.createJob(job("first"));
  fake.setError = new Error("write failure");
  const outer = persistence.state.updateJob("first", { company: "Failed", updatedAt: timestamp });
  await assert.rejects(outer, (error) => error.status === "save-failed");
  await nested;
  assert.equal(await persistence.getOperationOutcome(outer), "save-failed");
  assert.equal(await persistence.getOperationOutcome(nested), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 3);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("first", { notes: "Nested" })]);
  assert.deepEqual(persistence.state.getJobs(), [job("first", { notes: "Nested" })]);
  await notifications.show("success", "Jobs saved.", outer);
  assert.equal(messages[0].type, "error");
});

test("operation notifications distinguish a reentrant failure from an outer success", async () => {
  const fake = createFakeStorage();
  let persistence;
  let runNested = false;
  let nested;
  persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() },
    secureContext: true,
    onStatusChange(status) {
      if (runNested && status.transientWarning === null) {
        runNested = false;
        fake.setError = new Error("nested write failure");
        nested = persistence.state.updateJob("first", { notes: "Unsaved", updatedAt: timestamp });
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  await persistence.state.createJob(job("first"));
  fake.setError = new Error("write failure");
  await assert.rejects(persistence.state.updateJob("first", { company: "Earlier", updatedAt: timestamp }));
  fake.setError = null;
  runNested = true;
  const outer = persistence.state.updateJob("first", { company: "Retry", updatedAt: timestamp });
  await outer;
  await assert.rejects(nested, (error) => error.status === "save-failed");

  assert.equal(await persistence.getOperationOutcome(outer), "saved");
  assert.equal(await persistence.getOperationOutcome(nested), "save-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("first", { company: "Retry" })]);
  assert.deepEqual(persistence.state.getJobs(), [job("first", { company: "Retry" })]);
  await notifications.show("success", "Nested saved.", nested);
  await notifications.show("success", "Outer saved.", outer);
  assert.equal(messages[0].type, "error");
  assert.equal(messages[1].type, "success");
});

test("validation exceptions propagate without changing earlier operation outcomes", async () => {
  for (const failingSave of [false, true]) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true
    });
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    fake.setError = failingSave ? new Error("write failure") : null;

    const first = persistence.state.createJob(job("first"));
    if (failingSave) await assert.rejects(first, (error) => error.status === "save-failed");
    else await first;
    const invalid = persistence.state.updateJob("missing", { company: "Other" });
    await assert.rejects(invalid, /does not exist/);

    assert.equal(await persistence.getOperationOutcome(first), failingSave ? "save-failed" : "saved");
    assert.equal(await persistence.getOperationOutcome(invalid), "error");
    assert.equal(persistence.getStatus().transientWarning?.kind ?? null, failingSave ? "write-failed" : null);
    assert.equal(fake.calls.setItem.length, 1);
    assert.deepEqual(persistence.state.getJobs(), failingSave ? [] : [job("first")]);
    assert.deepEqual(fake.values.has(storageKey) ? JSON.parse(fake.values.get(storageKey)).jobs : [],
      failingSave ? [] : [job("first")]);
    await notifications.show("success", "Jobs saved.", first);
    assert.equal(messages[0].type, failingSave ? "error" : "success");
  }

});

test("a caught nested exception does not prevent a later successful save", async () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  fake.setError = new Error("write failure");
  const failed = persistence.state.createJob(job("first"));
  await assert.rejects(failed, (error) => error.status === "save-failed");
  const invalid = persistence.state.updateJob("missing", { company: "Other" });
  await assert.rejects(invalid, /does not exist/);
  fake.setError = null;
  const retry = persistence.state.createJob(job("second"));
  await retry;

  assert.equal(await persistence.getOperationOutcome(failed), "save-failed");
  assert.equal(await persistence.getOperationOutcome(invalid), "error");
  assert.equal(await persistence.getOperationOutcome(retry), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.deepEqual(persistence.state.getJobs(), [job("second")]);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("second")]);
  await notifications.show("success", "Jobs saved.", retry);
  assert.equal(messages[0].type, "success");
});

test("blocked mutations preserve persistent and transient warnings", async () => {
  const fake = createFakeStorage("not JSON");
  const persistence = createCareerPersistence(fake);
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  const first = state.createJob(job());
  await assert.rejects(first, (error) => error.status === "writes-disabled");
  await notifications.show("success", "Job created.", first);
  assert.equal(messages[0].type, "error");
  const warnings = persistence.getStatus();
  assert.equal(warnings.persistentWarning.kind, "corrupt");
  assert.equal(warnings.transientWarning.kind, "write-disabled");

  const second = state.updateJob("job-1", { company: "Example Company" });
  await assert.rejects(second, (error) => error.status === "writes-disabled");
  assert.equal(await persistence.getOperationOutcome(second), "writes-disabled");
  await notifications.show("success", "Job updated.", second);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].type, "error");
  assert.deepEqual(persistence.getStatus(), warnings);
  assert.equal(fake.values.get(storageKey), "not JSON");
  assert.deepEqual(state.getJobs(), []);
});

test("public snapshot restoration persists once while initialization does not save", async () => {
  const data = migratedV4(snapshot());
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true
  });
  const operation = persistence.state.restoreSnapshot(data);
  await operation;
  assert.equal(await persistence.getOperationOutcome(operation), "saved");
  assert.equal(fake.calls.setItem.length, 1);
  assert.deepEqual(persistence.state.getSnapshot(), data);

  const loadedStorage = createFakeStorage(stored(data, 4));
  const loaded = createCareerPersistence(loadedStorage);
  assert.deepEqual(loaded.state.getSnapshot(), data);
  assert.equal(loadedStorage.calls.setItem.length, 0);
});

test("public restoration respects protected storage and leaves the original bytes intact", async () => {
  const raw = "not JSON";
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake);
  const data = migratedV4(snapshot());
  const before = persistence.state.getSnapshot();
  const operation = persistence.state.restoreSnapshot(data);
  await assert.rejects(operation, (error) => error.status === "writes-disabled");

  assert.deepEqual(persistence.state.getSnapshot(), before);
  assert.equal(await persistence.getOperationOutcome(operation), "writes-disabled");
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  assert.equal(fake.values.get(storageKey), raw);
  assert.equal(fake.calls.setItem.length, 0);
});

test("adapter construction failures and unexpected save errors cannot emit success", async () => {
  for (const dependencies of [
    { createStorage: () => { throw new Error("storage unavailable"); } },
    { createStorage: () => ({
      load: () => ({ status: "missing" }),
      createWriter: (options) => createSnapshotWriter({
        ...options,
        storage: {
          load: () => ({ status: "missing", snapshot: options.initialSnapshot, snapshotRevision: 0, careerRevision: 0 }),
          save: () => { throw new Error("unexpected save error"); }
        }
      })
    }) }
  ]) {
    const errors = [];
    const persistence = createWithDependencies(null, dependencies, {
      locks: { request: (name, options, callback) => callback() }, secureContext: true,
      onUnexpectedError: (error) => errors.push(error.message)
    });
    const state = createPersistenceMutationState(persistence);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    const operation = state.createProfile({ fullName: "Profile", headline: "", summary: "", skills: [] }, {
      id: "profile", createdAt: timestamp
    });
    await assert.rejects(operation);
    await notifications.show("success", "Profile created.", operation);
    assert.equal(state.getProfile(), null);
    assert.equal(messages[0].type, "error");
    assert.notEqual(await persistence.getOperationOutcome(operation), "saved");
    assert.equal(errors.length, 1);
  }
});

test("the application mutation wrapper tracks each supported mutation method", async () => {
  const methods = [
    "createProfile", "updateProfile", "addEmploymentRecord", "updateEmploymentRecord",
    "deleteEmploymentRecord", "addAchievementRecord", "updateAchievementRecord",
    "updateAchievementVerificationStatus", "deleteAchievementRecord", "createJob",
    "updateJob", "archiveJob", "reactivateJob", "deleteJob", "createRequirement",
    "updateRequirement", "deleteRequirement", "createAchievementMapping", "deleteAchievementMapping",
    "createImportSession", "transitionImportSession", "retryImportSession", "addImportCandidates",
    "setImportCategory", "updateImportCandidate", "decideImportCandidate"
  ];
  const fake = createFakeStorage();
  const persistence = createWithDependencies(fake, {
    createState() {
      const state = createCareerState();
      return new Proxy(state, {
        get(target, property) {
          if (methods.includes(property)) return () => target.createJob(job(property));
          return target[property];
        }
      });
    }
  }, { locks: { request: (name, options, callback) => callback() }, secureContext: true });
  const state = createPersistenceMutationState(persistence);
  const emptySnapshot = state.getSnapshot();
  for (const method of methods) {
    const operation = state[method]("argument");
    assert.equal((await operation).id, method);
    assert.equal(await persistence.getOperationOutcome(operation), "saved");
  }
  assert.equal(fake.calls.setItem.length, methods.length);
  const replacement = state.restoreSnapshot(emptySnapshot);
  await replacement;
  assert.equal(await persistence.getOperationOutcome(replacement), "saved");
  assert.equal(fake.calls.setItem.length, methods.length + 1);
  assert.deepEqual(state.getSnapshot(), emptySnapshot);
});

test("persistent storage warnings cannot be cleared by a blocked write", async () => {
  const fake = createFakeStorage("not JSON");
  const persistence = createCareerPersistence(fake);
  const operation = persistence.state.createProfile({
    fullName: "Profile", headline: "", summary: "", skills: []
  }, { id: "profile", createdAt: timestamp });
  await assert.rejects(operation, (error) => error.status === "writes-disabled");
  assert.equal(await persistence.getOperationOutcome(operation), "writes-disabled");
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
  assert.equal(fake.values.get(storageKey), "not JSON");
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(persistence.state.getProfile(), null);
});

test("snapshot accessor and save exceptions are contained and observable", async () => {
  const errors = [];
  const fake = createFakeStorage();
  const accessorThrow = createWithDependencies(fake, {
    createState: () => {
      const state = createCareerState();
      let changed = false;
      return new Proxy(state, {
        get(target, property) {
          if (property === "createProfile") return (...args) => {
            const result = target.createProfile(...args);
            changed = true;
            return result;
          };
          if (property === "getSnapshot") return () => {
            if (changed) throw new Error("snapshot accessor failure");
            return target.getSnapshot();
          };
          return target[property];
        }
      });
    }
  }, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true,
    onUnexpectedError: (error) => errors.push(error)
  });
  const input = { fullName: "Profile", headline: "", summary: "", skills: [] };
  await assert.rejects(accessorThrow.state.createProfile(input, { id: "profile-1", createdAt: timestamp }),
    /snapshot accessor failure/);
  assert.equal(accessorThrow.getStatus().transientWarning.kind, "unexpected-error");
  assert.match(errors[0].message, /snapshot accessor failure/);
  assert.equal(accessorThrow.state.getProfile(), null);
  assert.deepEqual(fake.calls.setItem, []);

  const saveThrow = createWithDependencies(null, {
    createStorage: () => ({
      load: () => ({ status: "missing" }),
      createWriter: (options) => createSnapshotWriter({
        ...options,
        storage: {
          load: () => ({ status: "missing", snapshot: options.initialSnapshot, snapshotRevision: 0, careerRevision: 0 }),
          save: () => { throw new Error("save failure"); }
        }
      })
    })
  }, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true,
    onUnexpectedError: (error) => errors.push(error)
  });
  await assert.rejects(saveThrow.state.createProfile(input, { id: "profile-1", createdAt: timestamp }),
    (error) => error.status === "save-failed" && error.cause === "unexpected-error");
  assert.equal(saveThrow.getStatus().transientWarning.kind, "unexpected-error");
  assert.match(errors.at(-1).message, /save failure/);
  assert.equal(saveThrow.state.getProfile(), null);
});

test("onStatusChange exceptions do not break mutations", async () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const errors = [];
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true,
    onStatusChange() {
      throw new Error("status listener failure");
    },
    onUnexpectedError: (error) => errors.push(error)
  });

  const input = {
    fullName: "Profile",
    headline: "",
    summary: "",
    skills: []
  };
  await assert.rejects(persistence.state.createProfile(input, { id: "profile-1", createdAt: timestamp }),
    (error) => error.status === "save-failed");
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
  fake.setError = null;
  const created = await persistence.state.createProfile(input, { id: "profile-1", createdAt: timestamp });

  assert.equal(created.id, "profile-1");
  assert.equal(persistence.state.getProfile().id, "profile-1");
  assert.ok(errors.some((error) => /status listener failure/.test(error.message)));
});

test("onUnexpectedError exceptions use console.error fallback and do not escape", async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const persistence = createWithDependencies(null, {
      createStorage() {
        throw new Error("adapter failure");
      }
    }, {
      onUnexpectedError() {
        throw new Error("error handler failure");
      }
    });

    await assert.rejects(persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp }), (error) => error.status === "writes-disabled");
    assert.equal(persistence.state.getProfile(), null);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(([message]) => /error handler failed/.test(message)));
  } finally {
    console.error = originalError;
  }
});

test("status objects are detached and unchanged statuses are not re-emitted", async () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const notifications = [];
  const persistence = createCareerPersistence(fake, {
    locks: { request: (name, options, callback) => callback() }, secureContext: true,
    onStatusChange(status) {
      notifications.push(status);
      status.transientWarning.message = "mutated by listener";
    }
  });
  const input = {
    fullName: "Profile",
    headline: "",
    summary: "",
    skills: []
  };
  await assert.rejects(persistence.state.createProfile(input, { id: "profile-1", createdAt: timestamp }));
  await assert.rejects(persistence.state.createProfile(input, { id: "profile-1", createdAt: timestamp }));

  assert.equal(notifications.length, 1);
  assert.equal(persistence.getStatus().transientWarning.message,
    "The change could not be saved (save-failed).");
  const detached = persistence.getStatus();
  detached.transientWarning.message = "external mutation";
  assert.notEqual(persistence.getStatus().transientWarning.message, "external mutation");
  assert.equal(persistence.state.getProfile(), null);
  assert.equal(fake.values.has(storageKey), false);
});

test("each mutation invokes the staged snapshot accessor exactly once", async () => {
  let calls = 0;
  const fake = createFakeStorage();
  const persistence = createWithDependencies(fake, {
    createState: () => {
      const state = createCareerState();
      let stagedMutation = false;
      return new Proxy(state, {
        get(target, property) {
          if (property === "createJob") return (...args) => {
            const result = target.createJob(...args);
            stagedMutation = true;
            return result;
          };
          if (property === "getSnapshot") return () => {
            if (stagedMutation) calls += 1;
            return target.getSnapshot();
          };
          return target[property];
        }
      });
    }
  }, { locks: { request: (name, options, callback) => callback() }, secureContext: true });

  await persistence.state.createJob(job());
  assert.equal(calls, 1);
  assert.equal(fake.calls.setItem.length, 1);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job()]);
});
