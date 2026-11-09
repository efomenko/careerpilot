import assert from "node:assert/strict";
import test from "node:test";
import { createAchievementMappingRecord } from "../src/js/achievement-mapping-model.js";
import {
  createCareerPersistence,
  createPersistenceMutationState,
  createPersistenceNotifications
} from "../src/js/career-persistence.js";
import { createCareerStorage } from "../src/js/career-storage.js";
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

test("corrupt and unsupported data produce persistent warnings and are not overwritten", () => {
  for (const [raw, kind] of [
    ["not valid JSON", "corrupt"],
    [stored(snapshot(), 4), "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(fake.values.get(storageKey), raw);
    persistence.state.createProfile({
      fullName: "New profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "new-profile", createdAt: timestamp });
    assert.equal(fake.values.get(storageKey), raw);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  }
});

test("initial read failure protects existing bytes for the session after storage recovers", () => {
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
  state.createProfile({
    fullName: "New profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "new-profile", createdAt: timestamp });
  notifications.show("success", "Profile created.");

  assert.equal(state.getProfile().fullName, "New profile");
  assert.equal(persistence.getMutationSaveOutcome(), "unavailable");
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  state.updateProfile({ fullName: "Updated in memory", headline: "", summary: "", skills: [] }, timestamp);
  notifications.show("success", "Profile updated.");
  assert.equal(state.getProfile().fullName, "Updated in memory");
  assert.equal(persistence.getMutationSaveOutcome(), "unavailable");
  assert.equal(messages[1].type, "error");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  const reloaded = createCareerPersistence(fake);
  assert.deepEqual(reloaded.state.getSnapshot(), migratedV4(snapshot()));
  assert.equal(reloaded.getStatus().persistentWarning, null);
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);
});

test("an initially unreadable empty store also stays protected until reinitialization", () => {
  const fake = createFakeStorage();
  fake.getError = new Error("read failure");
  const persistence = createCareerPersistence(fake);
  fake.getError = null;

  persistence.state.createProfile({
    fullName: "Session profile", headline: "", summary: "", skills: []
  }, { id: "session-profile", createdAt: timestamp });
  assert.equal(persistence.getMutationSaveOutcome(), "unavailable");
  assert.equal(fake.values.has(storageKey), false);
  assert.deepEqual(fake.calls.setItem, []);

  const reloaded = createCareerPersistence(fake);
  reloaded.state.createProfile({
    fullName: "New profile", headline: "", summary: "", skills: []
  }, { id: "new-profile", createdAt: timestamp });
  assert.equal(reloaded.getMutationSaveOutcome(), "saved");
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.id, "new-profile");
});

test("a read failure after successful initialization can be retried safely", () => {
  const raw = stored(migratedV4(snapshot()), 4);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake);
  fake.getError = new Error("temporary read failure");
  persistence.state.updateProfile({
    fullName: "Updated", headline: "", summary: "", skills: []
  }, timestamp);

  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);

  fake.getError = null;
  persistence.state.updateProfile({
    fullName: "Retried", headline: "", summary: "", skills: []
  }, timestamp);
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Retried");
  assert.equal(fake.calls.setItem.length, 1);
});

test("adapter construction failure leaves a usable in-memory state", () => {
  const errors = [];
  const persistence = createWithDependencies(null, {
    createStorage() {
      throw new Error("adapter construction failure");
    }
  }, {
    onUnexpectedError: (error) => errors.push(error)
  });

  persistence.state.createProfile({
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-memory", createdAt: timestamp });

  assert.equal(persistence.state.getProfile().id, "profile-memory");
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.equal(errors.length, 1);
});

test("unexpected restore failure discards the partially restored state", () => {
  const rawSnapshot = snapshot();
  const originalStoredData = JSON.stringify(rawSnapshot);
  const errors = [];
  let saveCalls = 0;
  let stateNumber = 0;
  const persistence = createWithDependencies(null, {
    createStorage: () => ({
      load: () => ({ status: "loaded", snapshot: rawSnapshot }),
      save: () => {
        saveCalls += 1;
        return { status: "saved" };
      }
    }),
    createState: ({ onMutation }) => {
      stateNumber += 1;
      if (stateNumber === 1) {
        return {
          restoreSnapshot() {
            throw new Error("partial restore");
          },
          getSnapshot() {
            return {
              profile: null,
              employmentRecords: [],
              achievementRecords: [],
              jobs: [],
              requirements: [],
              achievementMappings: []
            };
          }
        };
      }
      let currentProfile = null;
      return {
        restored: false,
        restoreSnapshot() {
          throw new Error("fresh state must not be restored");
        },
        createProfile(input, { id, createdAt }) {
          currentProfile = {
            id,
            ...input,
            createdAt,
            updatedAt: createdAt
          };
          onMutation(() => ({
            profile: currentProfile,
            employmentRecords: [],
            achievementRecords: [],
            jobs: [],
            requirements: [],
            achievementMappings: []
          }));
          return currentProfile;
        },
        getProfile() {
          return currentProfile;
        }
      };
    }
  }, { onUnexpectedError: (error) => errors.push(error) });

  assert.equal(stateNumber, 2);
  assert.equal(persistence.state.restored, false);
  const createdProfile = persistence.state.createProfile({
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-memory", createdAt: timestamp });
  assert.equal(createdProfile.id, "profile-memory");
  assert.equal(persistence.state.getProfile().fullName, "In-memory profile");
  assert.equal(saveCalls, 0);
  assert.equal(JSON.stringify(rawSnapshot), originalStoredData);
  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  assert.match(errors[0].message, /partial restore/);
});

test("successful mutations save the complete post-mutation snapshot", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  const result = persistence.state.createProfile({
    fullName: "Saved profile",
    headline: "",
    summary: "",
    skills: ["Research"]
  }, { id: "profile-saved", createdAt: timestamp });

  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(result.id, "profile-saved");
  assert.equal(saved.version, 4);
  assert.deepEqual(Object.keys(saved), ["version", ...snapshotKeys]);
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

test("v1 data stays intact until a successful mutation saves complete v4", () => {
  const raw = stored(v1Snapshot(), 1);
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake);

  fake.setError = new Error("write failure");
  persistence.state.createJob(job("job-1"));
  assert.equal(fake.values.get(storageKey), raw);
  assert.equal(persistence.state.getJobs().length, 1);
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(persistence.getStatus().persistentWarning, null);

  fake.setError = null;
  persistence.state.createJob(job("job-2"));
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 4);
  assert.deepEqual(Object.keys(saved), ["version", ...snapshotKeys]);
  assert.deepEqual(saved.jobs.map((record) => record.id), ["job-1", "job-2"]);
  assert.deepEqual(saved.employmentRecords, migratedV4(snapshot()).employmentRecords);
  assert.equal(persistence.getStatus().transientWarning, null);
});

test("job create, update, archive, reactivate, and delete are persisted", () => {
  const fake = createFakeStorage();
  const { state } = createCareerPersistence(fake);
  const savedJobs = () => JSON.parse(fake.values.get(storageKey)).jobs;
  const later = "2025-04-21T10:00:00.000Z";

  state.createJob(job("job-1"));
  assert.deepEqual(savedJobs(), [job("job-1")]);

  state.updateJob("job-1", { company: "Other", updatedAt: later });
  assert.equal(savedJobs()[0].company, "Other");

  state.archiveJob("job-1", later);
  assert.equal(savedJobs()[0].status, "archived");

  state.reactivateJob("job-1", later);
  assert.equal(savedJobs()[0].status, "active");

  state.deleteJob("job-1");
  assert.deepEqual(savedJobs(), []);
});

test("no-op job updates do not write", () => {
  const fake = createFakeStorage();
  const { state } = createCareerPersistence(fake);
  state.createJob(job("job-1"));
  const writes = fake.calls.setItem.length;

  state.updateJob("job-1", { company: "Example Company" });
  assert.equal(fake.calls.setItem.length, writes);
});

test("saves keep jobs, requirements, and mappings from restored state", () => {
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
  const persistence = createCareerPersistence(fake);

  persistence.state.updateProfile({
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

test("v2 migration preserves legacy entries through restore and later v4 persistence", () => {
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
  const persistence = createCareerPersistence(fake);

  assert.deepEqual(persistence.state.getSnapshot().legacyRequirements, legacyRequirements);
  assert.deepEqual(persistence.state.getRequirements("job-1"), []);
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);

  persistence.state.updateJob("job-1", {
    notes: "Unrelated mutation",
    updatedAt: "2025-04-21T10:00:00.000Z"
  });
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 4);
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

test("corrupt v2 data and unsupported future versions are never overwritten by job mutations", () => {
  for (const [raw, kind] of [
    [stored({ ...snapshot(), jobs: "bad" }, 2), "corrupt"],
    [stored(snapshot(), 4), "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    persistence.state.createJob(job("job-1"));
    assert.equal(fake.values.get(storageKey), raw);
    assert.equal(persistence.state.getJobs().length, 1);
    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  }
});

test("verification changes and employment deletion are persisted correctly", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  const state = persistence.state;

  state.addEmploymentRecord({
    employer: "Employer",
    roleTitle: "Role",
    startDate: "2020-01-01",
    endDate: null,
    isCurrent: true,
    responsibilities: []
  }, { id: "employment-1", createdAt: timestamp });
  const created = state.addAchievementRecord({
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
  state.updateAchievementVerificationStatus(created.id, "verified", timestamp);
  let saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.achievementRecords[0].verificationStatus, "verified");

  state.deleteEmploymentRecord("employment-1");
  saved = JSON.parse(fake.values.get(storageKey));
  assert.deepEqual(saved.employmentRecords, []);
  assert.equal(saved.achievementRecords[0].employmentId, null);
  assert.equal(saved.achievementRecords[0].verificationStatus, "unverified");
});

test("reloads matching source records and recalculates the Fit Assessment", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  const state = persistence.state;

  state.createJob(createJobRecord({
    company: "Example Company",
    roleTitle: "Engineer"
  }, {
    id: "job-1",
    createdAt: timestamp
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Mandatory requirement",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-mandatory",
    createdAt: timestamp
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Preferred requirement",
    category: "skill",
    importance: "preferred"
  }, {
    id: "requirement-preferred",
    createdAt: timestamp
  }));
  state.addAchievementRecord({
    title: "Verified achievement",
    contribution: "Delivered a measurable result"
  }, {
    id: "achievement-verified",
    createdAt: timestamp
  });
  state.addAchievementRecord({
    title: "Unverified achievement",
    contribution: "Completed relevant work"
  }, {
    id: "achievement-unverified",
    createdAt: timestamp
  });
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-mandatory",
    achievementId: "achievement-verified"
  }, {
    id: "mapping-mandatory",
    createdAt: timestamp
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-preferred",
    achievementId: "achievement-unverified"
  }, {
    id: "mapping-preferred",
    createdAt: timestamp
  }));
  state.updateAchievementVerificationStatus(
    "achievement-verified",
    "verified",
    timestamp
  );

  assert.ok(fake.calls.setItem.length > 0);
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 4);
  assert.equal("fitAssessments" in saved, false);

  const writesBeforeReload = fake.calls.setItem.length;
  const readsBeforeReload = fake.calls.getItem.length;
  const reloadedPersistence = createCareerPersistence(fake);
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

  restoredState.updateAchievementVerificationStatus(
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

test("failed writes preserve in-memory mutations and a later save clears the warning", () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const persistence = createCareerPersistence(fake);

  persistence.state.createProfile({
    fullName: "In-memory profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-1", createdAt: timestamp });
  assert.equal(persistence.state.getProfile().id, "profile-1");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");

  fake.setError = null;
  persistence.state.updateProfile({
    fullName: "Updated profile",
    headline: "",
    summary: "",
    skills: []
  }, timestamp);
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Updated profile");
});

test("successful saves never clear corrupt or unsupported warnings", () => {
  for (const [raw, kind] of [
    ["bad JSON", "corrupt"],
    [stored(snapshot(), 99), "unsupported-version"],
    [stored(snapshot(), 4), "corrupt"]
  ]) {
    const fake = createFakeStorage(raw);
    const persistence = createCareerPersistence(fake);

    persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp });
    assert.equal(persistence.getStatus().persistentWarning.kind, kind);
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  }
});

test("invalid, fidelity, and disabled save outcomes do not report success", () => {
  for (const [saveStatus, warningKind] of [
    ["invalid-snapshot", "invalid-snapshot"],
    ["json-fidelity-error", "json-fidelity-error"],
    ["writes-disabled", "write-disabled"]
  ]) {
    const fake = createFakeStorage();
    const persistence = createWithDependencies(fake, {
      createStorage: () => ({
        load: () => ({ status: "missing" }),
        save: () => ({ status: saveStatus })
      })
    });

    persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp });
    assert.equal(persistence.getStatus().transientWarning.kind, warningKind);
  }
});

test("unsaved mutations never emit success notifications in protected or failed storage states", () => {
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
    { name: "unavailable read", raw: null, persistent: "unavailable", transient: null, getError: true },
    { name: "write failure", raw: null, persistent: null, transient: "write-failed", setError: true }
  ];

  for (const entry of cases) {
    const fake = createFakeStorage(entry.raw);
    if (entry.getError) fake.getError = new Error("read failure");
    if (entry.setError) fake.setError = new Error("write failure");
    const persistence = createCareerPersistence(fake);
    const state = createPersistenceMutationState(persistence);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);

    state.createProfile({
      fullName: "In-memory profile", headline: "", summary: "", skills: []
    }, { id: "profile", createdAt: timestamp });
    notifications.show("success", "Profile created.");

    assert.equal(persistence.state.getProfile().fullName, "In-memory profile", entry.name);
    assert.equal(persistence.getStatus().persistentWarning?.kind ?? null, entry.persistent, entry.name);
    assert.equal(persistence.getStatus().transientWarning?.kind ?? null, entry.transient, entry.name);
    assert.notEqual(persistence.getMutationSaveOutcome(), "saved", entry.name);
    assert.equal(messages[0].type, "error", entry.name);
    assert.match(messages[0].message, /Saving could not be completed/, entry.name);
    assert.equal(fake.values.get(storageKey) ?? null, entry.raw, entry.name);
  }
});

test("fractional precision loss blocks hydration and suppresses mutation success notifications", () => {
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
    persistence.state.createJob(job("new-job"));
    notifications.show("success", "Job created.");
    assert.equal(persistence.getMutationSaveOutcome(), "writes-disabled");
    assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
    assert.equal(persistence.state.getJobs()[0].id, "new-job");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "error");
    assert.match(messages[0].message, /Saving could not be completed/);
    assert.equal(fake.values.get(storageKey), raw);
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("successful saves and retries emit success, while unchanged mutations suppress notifications", () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const persistence = createCareerPersistence(fake);
  const state = createPersistenceMutationState(persistence);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  const input = { fullName: "Profile", headline: "", summary: "", skills: [] };

  state.createProfile(input, {
    id: "profile", createdAt: timestamp
  });
  notifications.show("success", "Profile created.");
  assert.equal(messages.at(-1).type, "error");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");

  fake.setError = null;
  state.updateProfile({ ...input, fullName: "Retry" }, timestamp);
  notifications.show("success", "Profile updated.");
  assert.deepEqual(messages.at(-1), { type: "success", message: "Profile updated." });
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.fullName, "Retry");

  state.createJob(job("job-1"));
  state.updateJob("job-1", { company: "Example Company" });
  const messageCount = messages.length;
  notifications.show("success", "Profile updated.");
  assert.equal(persistence.getMutationSaveOutcome(), "unchanged");
  assert.equal(messages.length, messageCount);
});

test("direct and application state mutations track saves and unchanged outcomes exactly once", () => {
  for (const useWrapper of [false, true]) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake);
    const state = useWrapper ? createPersistenceMutationState(persistence) : persistence.state;
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);

    assert.equal(createPersistenceMutationState(persistence), persistence.state);
    state.createJob(job("job-1"));
    assert.equal(fake.calls.setItem.length, 1);
    assert.equal(persistence.getMutationSaveOutcome(), "saved");
    notifications.show("success", "Job created.");
    assert.deepEqual(messages, [{ type: "success", message: "Job created." }]);

    state.updateJob("job-1", { company: "Example Company" });
    assert.equal(persistence.getMutationSaveOutcome(), "unchanged");
    assert.equal(fake.calls.setItem.length, 1);
    notifications.show("success", "Job updated.");
    assert.equal(messages.length, 1);

    state.updateJob("job-1", { company: "New Company", updatedAt: timestamp });
    assert.equal(fake.calls.setItem.length, 2);
    assert.equal(persistence.getMutationSaveOutcome(), "saved");
    assert.equal(JSON.parse(fake.values.get(storageKey)).jobs[0].company, "New Company");
    notifications.show("success", "Job updated.");
    assert.deepEqual(messages.at(-1), { type: "success", message: "Job updated." });

    assert.throws(() => state.updateJob("missing", { company: "Other" }));
    assert.equal(persistence.getMutationSaveOutcome(), null);
    assert.equal(fake.calls.setItem.length, 2);
  }
});

test("a failed outer save retains its outcome when a status callback performs a no-op", () => {
  const fake = createFakeStorage();
  let persistence;
  let nestedOutcome;
  let outerAttempt;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        outerAttempt = persistence.getMutationSaveOutcome();
        persistence.state.updateJob("job-1", { company: "Changed" });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const state = createPersistenceMutationState(persistence);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });

  assert.equal(outerAttempt, "write-failed");
  assert.equal(nestedOutcome, "unchanged");
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(fake.values.get(storageKey), original);
  assert.equal(state.getJobs()[0].company, "Changed");
  notifications.show("success", "Job updated.");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("a nested successful save does not change a failed outer save outcome", () => {
  const fake = createFakeStorage();
  let persistence;
  let nestedOutcome;
  let outerAttempt;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        outerAttempt = persistence.getMutationSaveOutcome();
        fake.setError = null;
        persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  state.createJob(job());
  fake.setError = new Error("write failure");
  state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });

  assert.equal(outerAttempt, "write-failed");
  assert.equal(nestedOutcome, "saved");
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 3);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Changed");
  assert.equal(savedJob.notes, "Nested");
  assert.deepEqual(state.getJobs()[0], savedJob);
  notifications.show("success", "Job updated.");
  assert.deepEqual(messages, [{
    type: "error",
    message: "Saving could not be completed. Check the persistence status before retrying."
  }]);
});

test("a nested successful save can replace the failed outer mutation's field", () => {
  const fake = createFakeStorage();
  let persistence;
  let outerAttempt;
  let nestedOutcome;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        outerAttempt = persistence.getMutationSaveOutcome();
        fake.setError = null;
        persistence.state.updateJob("job-1", { company: "Override", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  persistence.state.createJob(job());
  fake.setError = new Error("write failure");
  persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });

  assert.equal(outerAttempt, "write-failed");
  assert.equal(nestedOutcome, "saved");
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 3);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [
    job("job-1", { company: "Override" })
  ]);
  notifications.show("success", "Job updated.");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("failed outer and nested saves both remain failed", () => {
  const fake = createFakeStorage();
  let persistence;
  let outerAttempt;
  let nestedOutcome;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        outerAttempt = persistence.getMutationSaveOutcome();
        persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  persistence.state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  persistence.state.updateJob("job-1", { company: "Changed", updatedAt: timestamp });

  assert.equal(outerAttempt, "write-failed");
  assert.equal(nestedOutcome, "write-failed");
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(fake.calls.setItem.length, 3);
  assert.equal(fake.values.get(storageKey), original);
  assert.equal(persistence.state.getJobs()[0].notes, "Nested");
  notifications.show("success", "Job updated.");
  assert.equal(messages[0].type, "error");
  assert.match(messages[0].message, /Saving could not be completed/);
});

test("nested mutations cannot overwrite protected bytes", () => {
  const raw = "not JSON";
  const fake = createFakeStorage(raw);
  let persistence;
  let nestedOutcome;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-disabled") {
        persistence.state.updateJob("job-1", { notes: "Nested", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });

  persistence.state.createJob(job());

  assert.equal(nestedOutcome, "writes-disabled");
  assert.equal(persistence.getMutationSaveOutcome(), "writes-disabled");
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);
});

test("a successful outer save retains its outcome when a nested mutation fails", () => {
  const fake = createFakeStorage();
  let persistence;
  let nestedOutcome;
  let outerAttempt;
  let runNested = false;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (runNested && status.transientWarning === null) {
        outerAttempt = persistence.getMutationSaveOutcome();
        runNested = false;
        fake.setError = new Error("nested write failure");
        persistence.state.updateJob("job-1", { notes: "Unsaved nested", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  state.createJob(job());
  fake.setError = new Error("write failure");
  state.updateJob("job-1", { company: "Earlier", updatedAt: timestamp });
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  fake.setError = null;
  runNested = true;
  state.updateJob("job-1", { company: "Retry", updatedAt: timestamp });

  assert.equal(outerAttempt, "saved");
  assert.equal(nestedOutcome, "write-failed");
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Retry");
  assert.equal(savedJob.notes, "");
  assert.equal(state.getJobs()[0].notes, "Unsaved nested");
  notifications.show("success", "Job updated.");
  assert.deepEqual(messages, [{ type: "success", message: "Job updated." }]);
});

test("a third-level successful save preserves each ancestor's own outcome", () => {
  const fake = createFakeStorage();
  const outcomes = [];
  const saveResults = ["saved", "invalid-snapshot", "write-failed", "saved"];
  let persistence;
  let innerOutcome;
  let middleOutcome;
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        save(snapshot) {
          const outcome = saveResults[outcomes.length];
          outcomes.push(outcome);
          return outcome === "saved" ? adapter.save(snapshot) : { status: outcome };
        }
      };
    }
  }, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "invalid-snapshot") {
        assert.equal(persistence.getMutationSaveOutcome(), "invalid-snapshot");
        persistence.state.updateJob("job-1", { notes: "Middle", updatedAt: timestamp });
        middleOutcome = persistence.getMutationSaveOutcome();
      } else if (status.transientWarning?.kind === "write-failed") {
        assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
        persistence.state.updateJob("job-1", { description: "Inner", updatedAt: timestamp });
        innerOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });

  persistence.state.createJob(job());
  persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });

  assert.deepEqual(outcomes, ["saved", "invalid-snapshot", "write-failed", "saved"]);
  assert.equal(innerOutcome, "saved");
  assert.equal(middleOutcome, "write-failed");
  assert.equal(persistence.getMutationSaveOutcome(), "invalid-snapshot");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.deepEqual(savedJob, job("job-1", {
    company: "Outer", notes: "Middle", description: "Inner"
  }));
});

test("three-level conflicting updates keep separate outcomes and persist the last value", () => {
  const fake = createFakeStorage();
  const outcomes = [];
  const saveResults = ["saved", "invalid-snapshot", "write-failed", "saved"];
  let persistence;
  let innerOutcome;
  let middleOutcome;
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        save(snapshot) {
          const outcome = saveResults[outcomes.length];
          outcomes.push(outcome);
          return outcome === "saved" ? adapter.save(snapshot) : { status: outcome };
        }
      };
    }
  }, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "invalid-snapshot") {
        persistence.state.updateJob("job-1", { company: "Middle", updatedAt: timestamp });
        middleOutcome = persistence.getMutationSaveOutcome();
      } else if (status.transientWarning?.kind === "write-failed") {
        persistence.state.updateJob("job-1", { company: "Inner", updatedAt: timestamp });
        innerOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });

  persistence.state.createJob(job());
  persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });

  assert.deepEqual(outcomes, ["saved", "invalid-snapshot", "write-failed", "saved"]);
  assert.equal(innerOutcome, "saved");
  assert.equal(middleOutcome, "write-failed");
  assert.equal(persistence.getMutationSaveOutcome(), "invalid-snapshot");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [
    job("job-1", { company: "Inner" })
  ]);
});

test("a nested retry after a save exception leaves the outer outcome and clears the warning", () => {
  const fake = createFakeStorage();
  let persistence;
  let throwNext = false;
  let nestedOutcome;
  const errors = [];
  persistence = createWithDependencies(fake, {
    createStorage(storage) {
      const adapter = createCareerStorage(storage);
      return {
        load: () => adapter.load(),
        save(snapshot) {
          if (throwNext) {
            throwNext = false;
            throw new Error("unexpected save error");
          }
          return adapter.save(snapshot);
        }
      };
    }
  }, {
    onUnexpectedError(error) {
      errors.push(error.message);
      assert.equal(persistence.getMutationSaveOutcome(), "unexpected-error");
      persistence.state.updateJob("job-1", { notes: "Retry", updatedAt: timestamp });
      nestedOutcome = persistence.getMutationSaveOutcome();
    }
  });

  persistence.state.createJob(job());
  throwNext = true;
  persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });

  assert.deepEqual(errors, ["unexpected save error"]);
  assert.equal(nestedOutcome, "saved");
  assert.equal(persistence.getMutationSaveOutcome(), "unexpected-error");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  const savedJob = JSON.parse(fake.values.get(storageKey)).jobs[0];
  assert.equal(savedJob.company, "Outer");
  assert.equal(savedJob.notes, "Retry");
});

test("a nested validation exception does not replace the outer failure outcome", () => {
  const fake = createFakeStorage();
  let persistence;
  let nestedOutcome;
  let nestedError;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
        try {
          persistence.state.updateJob("missing", { company: "Other" });
        } catch (error) {
          nestedError = error;
        }
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  persistence.state.createJob(job());
  const original = fake.values.get(storageKey);
  fake.setError = new Error("write failure");
  persistence.state.updateJob("job-1", { company: "Outer", updatedAt: timestamp });

  assert.match(nestedError?.message ?? "", /does not exist/);
  assert.equal(nestedOutcome, null);
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(fake.values.get(storageKey), original);
});

test("explicit runMutation wrappers retain their nested public mutation result", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  fake.setError = new Error("write failure");

  persistence.runMutation(() => persistence.state.createJob(job()));
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 1);
  assert.equal(fake.values.has(storageKey), false);

  fake.setError = null;
  persistence.runMutation(() => persistence.state.updateJob(
    "job-1", { company: "Retry", updatedAt: timestamp }
  ));
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.equal(JSON.parse(fake.values.get(storageKey)).jobs[0].company, "Retry");
});

test("explicit runMutation summarizes the last save attempt, ignoring no-ops", () => {
  const cases = [
    { name: "success then failure", steps: ["saved", "write-failed"], outcome: "write-failed", stored: ["first"] },
    { name: "failure then success", steps: ["write-failed", "saved"], outcome: "saved", stored: ["first", "second"] },
    { name: "failure then no-op", steps: ["write-failed", "unchanged"], outcome: "write-failed", stored: [] },
    { name: "two successes", steps: ["saved", "saved"], outcome: "saved", stored: ["first", "second"] },
    { name: "no mutations", steps: [], outcome: "unchanged", stored: [] }
  ];

  for (const entry of cases) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    const outcomes = [];

    const result = persistence.runMutation(() => {
      for (const [index, step] of entry.steps.entries()) {
        fake.setError = step === "write-failed" ? new Error("write failure") : null;
        if (step === "unchanged") {
          persistence.state.updateJob("first", { company: "Example Company" });
        } else {
          persistence.state.createJob(job(index === 0 ? "first" : "second"));
        }
        outcomes.push(persistence.getMutationSaveOutcome());
      }
      return "operation result";
    });

    assert.equal(result, "operation result", entry.name);
    assert.deepEqual(outcomes, entry.steps, entry.name);
    assert.equal(persistence.getMutationSaveOutcome(), entry.outcome, entry.name);
    const memoryIds = entry.steps.filter((step) => step !== "unchanged")
      .map((_, index) => index === 0 ? "first" : "second");
    assert.deepEqual(persistence.state.getJobs(), memoryIds.map((id) => job(id)), entry.name);
    const raw = fake.values.get(storageKey);
    assert.deepEqual(raw ? JSON.parse(raw).jobs : [], entry.stored.map((id) => job(id)), entry.name);
    assert.equal(fake.calls.setItem.length, entry.steps.filter((step) => step !== "unchanged").length, entry.name);
    assert.equal(
      persistence.getStatus().transientWarning?.kind ?? null,
      entry.outcome === "write-failed" ? "write-failed" : null,
      entry.name
    );
    notifications.show("success", "Jobs saved.");
    assert.deepEqual(messages.map((message) => message.type),
      entry.outcome === "unchanged" ? [] : [entry.outcome === "saved" ? "success" : "error"],
      entry.name);
  }
});

test("nested explicit wrappers summarize their own attempts without rewriting individual outcomes", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  const outcomes = [];
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  persistence.runMutation(() => {
    persistence.state.createJob(job("first"));
    outcomes.push(persistence.getMutationSaveOutcome());
    persistence.runMutation(() => {
      fake.setError = new Error("write failure");
      persistence.state.createJob(job("second"));
      outcomes.push(persistence.getMutationSaveOutcome());
      persistence.runMutation(() => {
        fake.setError = null;
        persistence.state.createJob(job("third"));
        outcomes.push(persistence.getMutationSaveOutcome());
      });
      outcomes.push(persistence.getMutationSaveOutcome());
      fake.setError = new Error("write failure");
      persistence.state.createJob(job("fourth"));
      outcomes.push(persistence.getMutationSaveOutcome());
    });
    outcomes.push(persistence.getMutationSaveOutcome());
    persistence.state.updateJob("fourth", { company: "Example Company" });
    outcomes.push(persistence.getMutationSaveOutcome());
  });

  assert.deepEqual(outcomes, ["saved", "write-failed", "saved", "saved", "write-failed", "write-failed", "unchanged"]);
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  assert.deepEqual(persistence.state.getJobs().map((record) => record.id), ["first", "second", "third", "fourth"]);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs.map((record) => record.id), ["first", "second", "third"]);
  notifications.show("success", "Jobs saved.");
  assert.deepEqual(messages.map((message) => message.type), ["error"]);
});

test("an explicit wrapper summarizes reentrant attempts while each state mutation keeps its own result", () => {
  const fake = createFakeStorage();
  let persistence;
  let nestedOutcome;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (status.transientWarning?.kind === "write-failed") {
        fake.setError = null;
        persistence.state.updateJob("first", { notes: "Nested", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  let mutationOutcome;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  persistence.runMutation(() => {
    fake.setError = new Error("write failure");
    persistence.state.createJob(job("first"));
    mutationOutcome = persistence.getMutationSaveOutcome();
  });

  assert.equal(mutationOutcome, "write-failed");
  assert.equal(nestedOutcome, "saved");
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("first", { notes: "Nested" })]);
  assert.deepEqual(persistence.state.getJobs(), [job("first", { notes: "Nested" })]);
  notifications.show("success", "Jobs saved.");
  assert.deepEqual(messages, [{ type: "success", message: "Jobs saved." }]);
});

test("an explicit wrapper reports a reentrant failure after a successful state mutation", () => {
  const fake = createFakeStorage();
  let persistence;
  let runNested = false;
  let nestedOutcome;
  persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      if (runNested && status.transientWarning === null) {
        runNested = false;
        fake.setError = new Error("nested write failure");
        persistence.state.updateJob("first", { notes: "Unsaved", updatedAt: timestamp });
        nestedOutcome = persistence.getMutationSaveOutcome();
      }
    }
  });
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  persistence.state.createJob(job("first"));
  fake.setError = new Error("write failure");
  persistence.state.updateJob("first", { company: "Earlier", updatedAt: timestamp });
  fake.setError = null;
  runNested = true;
  let mutationOutcome;
  persistence.runMutation(() => {
    persistence.state.updateJob("first", { company: "Retry", updatedAt: timestamp });
    mutationOutcome = persistence.getMutationSaveOutcome();
  });

  assert.equal(mutationOutcome, "saved");
  assert.equal(nestedOutcome, "write-failed");
  assert.equal(persistence.getMutationSaveOutcome(), "write-failed");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-failed");
  assert.equal(fake.calls.setItem.length, 4);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("first", { company: "Retry" })]);
  assert.deepEqual(persistence.state.getJobs(), [job("first", { company: "Retry", notes: "Unsaved" })]);
  notifications.show("success", "Jobs saved.");
  assert.equal(messages[0].type, "error");
});

test("explicit wrapper exceptions propagate and retain the last completed save attempt", () => {
  for (const failingSave of [false, true]) {
    const fake = createFakeStorage();
    const persistence = createCareerPersistence(fake);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    let childOutcome;
    fake.setError = failingSave ? new Error("write failure") : null;

    assert.throws(() => persistence.runMutation(() => {
      persistence.state.createJob(job("first"));
      childOutcome = persistence.getMutationSaveOutcome();
      persistence.runMutation(() => persistence.state.updateJob("missing", { company: "Other" }));
    }), /does not exist/);

    const expected = failingSave ? "write-failed" : "saved";
    assert.equal(childOutcome, expected);
    assert.equal(persistence.getMutationSaveOutcome(), expected);
    assert.equal(persistence.getStatus().transientWarning?.kind ?? null, failingSave ? "write-failed" : null);
    assert.equal(fake.calls.setItem.length, 1);
    assert.deepEqual(persistence.state.getJobs(), [job("first")]);
    assert.deepEqual(fake.values.has(storageKey) ? JSON.parse(fake.values.get(storageKey)).jobs : [],
      failingSave ? [] : [job("first")]);
    notifications.show("success", "Jobs saved.");
    assert.equal(messages[0].type, failingSave ? "error" : "success");
  }

  const persistence = createCareerPersistence(createFakeStorage());
  assert.throws(() => persistence.runMutation(() => {
    throw new Error("operation failed");
  }), /operation failed/);
  assert.equal(persistence.getMutationSaveOutcome(), null);
});

test("a caught nested exception does not prevent a later save from updating the wrapper outcome", () => {
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  let failedOutcome;
  let retryOutcome;

  persistence.runMutation(() => {
    fake.setError = new Error("write failure");
    persistence.state.createJob(job("first"));
    failedOutcome = persistence.getMutationSaveOutcome();
    assert.throws(() => persistence.runMutation(() => {
      persistence.state.updateJob("missing", { company: "Other" });
    }), /does not exist/);
    fake.setError = null;
    persistence.state.createJob(job("second"));
    retryOutcome = persistence.getMutationSaveOutcome();
  });

  assert.equal(failedOutcome, "write-failed");
  assert.equal(retryOutcome, "saved");
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().transientWarning, null);
  assert.equal(fake.calls.setItem.length, 2);
  assert.deepEqual(persistence.state.getJobs(), [job("first"), job("second")]);
  assert.deepEqual(JSON.parse(fake.values.get(storageKey)).jobs, [job("first"), job("second")]);
  notifications.show("success", "Jobs saved.");
  assert.equal(messages[0].type, "success");
});

test("unchanged mutations preserve persistent and transient warnings", () => {
  const fake = createFakeStorage("not JSON");
  const persistence = createCareerPersistence(fake);
  const state = persistence.state;
  const messages = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);

  state.createJob(job());
  notifications.show("success", "Job created.");
  assert.equal(messages[0].type, "error");
  const warnings = persistence.getStatus();
  assert.equal(warnings.persistentWarning.kind, "corrupt");
  assert.equal(warnings.transientWarning.kind, "write-disabled");

  state.updateJob("job-1", { company: "Example Company" });
  assert.equal(persistence.getMutationSaveOutcome(), "unchanged");
  notifications.show("success", "Job updated.");
  assert.equal(messages.length, 1);
  assert.deepEqual(persistence.getStatus(), warnings);
  assert.equal(fake.values.get(storageKey), "not JSON");
});

test("public snapshot restoration persists once while initialization does not save", () => {
  const data = migratedV4(snapshot());
  const fake = createFakeStorage();
  const persistence = createCareerPersistence(fake);
  persistence.state.restoreSnapshot(data);
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(fake.calls.setItem.length, 1);
  assert.deepEqual(persistence.state.getSnapshot(), data);

  const loadedStorage = createFakeStorage(stored(data, 4));
  const loaded = createCareerPersistence(loadedStorage);
  assert.deepEqual(loaded.state.getSnapshot(), data);
  assert.equal(loadedStorage.calls.setItem.length, 0);
  assert.equal(loaded.getMutationSaveOutcome(), null);
});

test("public restoration respects protected storage and leaves the original bytes intact", () => {
  const raw = "not JSON";
  const fake = createFakeStorage(raw);
  const persistence = createCareerPersistence(fake);
  const data = migratedV4(snapshot());
  persistence.state.restoreSnapshot(data);

  assert.deepEqual(persistence.state.getSnapshot(), data);
  assert.equal(persistence.getMutationSaveOutcome(), "writes-disabled");
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
  assert.equal(persistence.getStatus().transientWarning.kind, "write-disabled");
  assert.equal(fake.values.get(storageKey), raw);
  assert.equal(fake.calls.setItem.length, 0);
});

test("adapter construction failures and unexpected save errors cannot emit success", () => {
  for (const dependencies of [
    { createStorage: () => { throw new Error("storage unavailable"); } },
    { createStorage: () => ({
      load: () => ({ status: "missing" }),
      save: () => { throw new Error("unexpected save error"); }
    }) }
  ]) {
    const persistence = createWithDependencies(null, dependencies, { onUnexpectedError: () => {} });
    const state = createPersistenceMutationState(persistence);
    const messages = [];
    const notifications = createPersistenceNotifications({
      show: (type, message) => messages.push({ type, message })
    }, persistence);
    state.createProfile({ fullName: "Profile", headline: "", summary: "", skills: [] }, {
      id: "profile", createdAt: timestamp
    });
    notifications.show("success", "Profile created.");
    assert.equal(state.getProfile().fullName, "Profile");
    assert.equal(messages[0].type, "error");
    assert.notEqual(persistence.getMutationSaveOutcome(), "saved");
  }
});

test("the application mutation wrapper tracks each supported mutation method", () => {
  const methods = [
    "createProfile", "updateProfile", "addEmploymentRecord", "updateEmploymentRecord",
    "deleteEmploymentRecord", "addAchievementRecord", "updateAchievementRecord",
    "updateAchievementVerificationStatus", "deleteAchievementRecord", "createJob",
    "updateJob", "archiveJob", "reactivateJob", "deleteJob", "createRequirement",
    "updateRequirement", "deleteRequirement", "createAchievementMapping", "deleteAchievementMapping",
    "restoreSnapshot"
  ];
  let runs = 0;
  const persistence = {
    state: Object.fromEntries(methods.map((method) => [method, (arg) => `${method}:${arg}`])),
    runMutation(operation) {
      runs += 1;
      return operation();
    }
  };
  const state = createPersistenceMutationState(persistence);
  for (const method of methods) {
    assert.equal(state[method]("argument"), `${method}:argument`);
  }
  assert.equal(runs, methods.length);
});

test("successful saves do not clear unrelated persistent warnings", () => {
  const persistence = createWithDependencies(createFakeStorage(), {
    createStorage: () => ({
      load: () => ({ status: "corrupt" }),
      save: () => ({ status: "saved" })
    })
  });
  persistence.runMutation(() => persistence.state.createProfile({
    fullName: "Profile", headline: "", summary: "", skills: []
  }, { id: "profile", createdAt: timestamp }));
  assert.equal(persistence.getMutationSaveOutcome(), "saved");
  assert.equal(persistence.getStatus().persistentWarning.kind, "corrupt");
});

test("snapshot accessor and save exceptions are contained and observable", () => {
  const errors = [];
  const accessorThrow = createWithDependencies(null, {
    createStorage: () => ({
      load: () => ({ status: "missing" }),
      save: () => ({ status: "saved" })
    }),
    createState: ({ onMutation }) => {
      const state = {
        createProfile() {
          onMutation(() => {
            throw new Error("snapshot accessor failure");
          });
        }
      };
      return state;
    }
  }, { onUnexpectedError: (error) => errors.push(error) });
  accessorThrow.state.createProfile();
  assert.equal(accessorThrow.getStatus().transientWarning.kind, "unexpected-error");
  assert.match(errors[0].message, /snapshot accessor failure/);

  const saveThrow = createWithDependencies(null, {
    createStorage: () => ({
      load: () => ({ status: "missing" }),
      save() {
        throw new Error("save failure");
      }
    })
  }, { onUnexpectedError: (error) => errors.push(error) });
  saveThrow.state.createProfile({
    fullName: "Profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-1", createdAt: timestamp });
  assert.equal(saveThrow.getStatus().transientWarning.kind, "unexpected-error");
  assert.match(errors.at(-1).message, /save failure/);
});

test("onStatusChange exceptions do not break mutations", () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const errors = [];
  const persistence = createCareerPersistence(fake, {
    onStatusChange() {
      throw new Error("status listener failure");
    },
    onUnexpectedError: (error) => errors.push(error)
  });

  const created = persistence.state.createProfile({
    fullName: "Profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-1", createdAt: timestamp });

  assert.equal(created.id, "profile-1");
  assert.equal(persistence.state.getProfile().id, "profile-1");
  assert.ok(errors.some((error) => /status listener failure/.test(error.message)));
});

test("onUnexpectedError exceptions use console.error fallback and do not escape", () => {
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

    persistence.state.createProfile({
      fullName: "Profile",
      headline: "",
      summary: "",
      skills: []
    }, { id: "profile-1", createdAt: timestamp });
    assert.equal(persistence.state.getProfile().id, "profile-1");
    assert.ok(errors.length > 0);
    assert.ok(errors.some(([message]) => /error handler failed/.test(message)));
  } finally {
    console.error = originalError;
  }
});

test("status objects are detached and unchanged statuses are not re-emitted", () => {
  const fake = createFakeStorage();
  fake.setError = new Error("write failure");
  const notifications = [];
  const persistence = createCareerPersistence(fake, {
    onStatusChange(status) {
      notifications.push(status);
      status.transientWarning.message = "mutated by listener";
    }
  });
  persistence.state.createProfile({
    fullName: "Profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "profile-1", createdAt: timestamp });
  persistence.state.updateProfile({
    fullName: "Updated",
    headline: "",
    summary: "",
    skills: []
  }, timestamp);

  assert.equal(notifications.length, 1);
  assert.equal(persistence.getStatus().transientWarning.message,
    "This change is available in this session but could not be saved.");
  const detached = persistence.getStatus();
  detached.transientWarning.message = "external mutation";
  assert.notEqual(persistence.getStatus().transientWarning.message, "external mutation");
});

test("each mutation invokes the snapshot accessor exactly once", () => {
  let calls = 0;
  const persistence = createWithDependencies(null, {
    createStorage: () => ({
      load: () => ({ status: "missing" }),
      save: () => ({ status: "saved" })
    }),
    createState: ({ onMutation }) => ({
      mutate() {
        onMutation(() => {
          calls += 1;
          return {
            profile: null,
            employmentRecords: [],
            achievementRecords: [],
            jobs: [],
            requirements: [],
            achievementMappings: []
          };
        });
      }
    })
  });

  persistence.state.mutate();
  assert.equal(calls, 1);
});
