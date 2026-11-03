import assert from "node:assert/strict";
import test from "node:test";
import { createCareerPersistence } from "../src/js/career-persistence.js";

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
    ...overrides
  };
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

function stored(value = snapshot(), version = 1) {
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

  assert.deepEqual(persistence.state.getSnapshot(), data);
  assert.deepEqual(persistence.getStatus(), {
    persistentWarning: null,
    transientWarning: null
  });
});

test("corrupt and unsupported data produce persistent warnings and are not overwritten", () => {
  for (const [raw, kind] of [
    ["not valid JSON", "corrupt"],
    [stored(snapshot(), 2), "unsupported-version"]
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

test("initially unavailable storage warns persistently and successful retry clears it", () => {
  const fake = createFakeStorage();
  fake.getError = new Error("read failure");
  const persistence = createCareerPersistence(fake);

  assert.equal(persistence.getStatus().persistentWarning.kind, "unavailable");
  fake.getError = null;
  persistence.state.createProfile({
    fullName: "New profile",
    headline: "",
    summary: "",
    skills: []
  }, { id: "new-profile", createdAt: timestamp });

  assert.equal(persistence.getStatus().persistentWarning, null);
  assert.equal(JSON.parse(fake.values.get(storageKey)).profile.id, "new-profile");
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
            return { profile: null, employmentRecords: [], achievementRecords: [] };
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
            achievementRecords: []
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
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.profile, persistence.state.getProfile());
  assert.deepEqual(saved.employmentRecords, []);
  assert.deepEqual(saved.achievementRecords, []);
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
    [stored(snapshot(), 99), "unsupported-version"]
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
          return { profile: null, employmentRecords: [], achievementRecords: [] };
        });
      }
    })
  });

  persistence.state.mutate();
  assert.equal(calls, 1);
});
