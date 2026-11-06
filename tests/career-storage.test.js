import assert from "node:assert/strict";
import test from "node:test";
import { createCareerStorage } from "../src/js/career-storage.js";

const timestamp = "2025-04-20T14:30:00.000Z";
const storageKey = "careerpilot.state";

function profileRecord(overrides = {}) {
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

function employmentRecord(overrides = {}) {
  return {
    id: "employment-1",
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

function achievementRecord(overrides = {}) {
  return {
    id: "achievement-1",
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

function jobRecord(overrides = {}) {
  return {
    id: "job-1",
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

function requirementRecord(overrides = {}) {
  return {
    id: "requirement-1",
    jobId: "job-1",
    description: "At least five years of experience",
    category: "experience",
    importance: "mandatory",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function snapshot(overrides = {}) {
  return {
    profile: profileRecord(),
    employmentRecords: [employmentRecord()],
    achievementRecords: [achievementRecord()],
    jobs: [],
    requirements: [],
    legacyRequirements: [],
    achievementMappings: [],
    ...overrides
  };
}

function v2Snapshot(overrides = {}) {
  const { legacyRequirements, ...value } = snapshot(overrides);
  return value;
}

function v1Snapshot(overrides = {}) {
  return {
    profile: profileRecord(),
    employmentRecords: [employmentRecord()],
    achievementRecords: [achievementRecord()],
    ...overrides
  };
}

function envelope(value = snapshot(), overrides = {}) {
  return { version: 3, ...value, ...overrides };
}

function v2Envelope(value = v2Snapshot(), overrides = {}) {
  return { version: 2, ...value, ...overrides };
}

function v1Envelope(value = v1Snapshot(), overrides = {}) {
  return { version: 1, ...value, ...overrides };
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

function stored(value = snapshot(), overrides = {}) {
  return JSON.stringify(envelope(value, overrides));
}

function storedV2(value = v2Snapshot(), overrides = {}) {
  return JSON.stringify(v2Envelope(value, overrides));
}

test("missing storage returns an empty snapshot", () => {
  const fake = createFakeStorage();
  const result = createCareerStorage(fake).load();

  assert.deepEqual(result, {
    status: "missing",
    snapshot: snapshot({
      profile: null,
      employmentRecords: [],
      achievementRecords: []
    })
  });
  assert.deepEqual(fake.calls.getItem, [storageKey]);
});

test("loads a valid version-3 envelope", () => {
  const data = snapshot({ jobs: [jobRecord()] });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, data);
  assert.deepEqual(Object.keys(result.snapshot), [
    "profile",
    "employmentRecords",
    "achievementRecords",
    "jobs",
    "requirements",
    "legacyRequirements",
    "achievementMappings"
  ]);
});

test("loads JSON-compatible legacy Requirements without constraining entry types", () => {
  const legacyRequirements = [
    null,
    "legacy requirement",
    42,
    ["legacy", { detail: true }],
    { id: "incomplete", extra: ["preserved"] }
  ];
  const data = snapshot({ legacyRequirements });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot.legacyRequirements, legacyRequirements);
});

test("rejects non-array legacy Requirements when loading a v3 envelope", () => {
  for (const legacyRequirements of [{ legacy: true }, "legacy requirement"]) {
    const data = snapshot({ legacyRequirements });
    const result = createCareerStorage(createFakeStorage(stored(data))).load();

    assert.equal(result.status, "corrupt");
    assert.ok(result.error.errors.some((error) =>
      error.field === "legacyRequirements"
        && error.message === "Must be an array."
    ));
  }
});

test("saving non-array legacy Requirements fails validation without writing", () => {
  const original = stored(snapshot());
  const fake = createFakeStorage(original);
  const adapter = createCareerStorage(fake);
  const data = snapshot({ legacyRequirements: { legacy: true } });
  const result = adapter.save(data);

  assert.equal(result.status, "invalid-snapshot");
  assert.ok(result.errors.some((error) =>
    error.field === "legacyRequirements"
      && error.message === "Must be an array."
  ));
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), original);
});

test("loads a valid version-2 envelope and migrates its Requirements", () => {
  const data = v2Snapshot({
    jobs: [jobRecord()],
    requirements: [requirementRecord()],
    achievementMappings: [{
      id: "mapping-1",
      requirementId: "requirement-1",
      achievementId: "achievement-1"
    }]
  });
  const result = createCareerStorage(createFakeStorage(storedV2(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, {
    ...data,
    legacyRequirements: []
  });
});

test("classifies v2 Requirements while preserving data, mappings, and relative order", () => {
  const jobs = [
    jobRecord(),
    jobRecord({ id: "job-2", company: "Second Company" })
  ];
  const validFirst = requirementRecord({ id: "valid-first" });
  const invalidDescription = requirementRecord({
    id: "invalid-description",
    description: " \t"
  });
  const invalidCategory = requirementRecord({
    id: "invalid-category",
    category: "other-category"
  });
  const invalidImportance = requirementRecord({
    id: "invalid-importance",
    importance: "optional"
  });
  const invalidTimestamp = requirementRecord({
    id: "invalid-timestamp",
    updatedAt: "not-a-timestamp"
  });
  const unknownField = requirementRecord({
    id: "unknown-field",
    extra: true
  });
  const invalidJob = requirementRecord({
    id: "invalid-job",
    jobId: "missing-job"
  });
  const duplicateOne = requirementRecord({ id: "duplicate" });
  const duplicateTwo = requirementRecord({
    id: "duplicate",
    description: "Duplicate with different content"
  });
  const nonObjectValues = [null, "legacy text", 7, ["legacy array"]];
  const requirements = [
    validFirst,
    invalidDescription,
    ...nonObjectValues,
    invalidCategory,
    duplicateOne,
    invalidImportance,
    duplicateTwo,
    invalidTimestamp,
    unknownField,
    invalidJob,
    requirementRecord({
      id: "valid-second",
      jobId: "job-2",
      category: "skill",
      importance: "preferred"
    })
  ];
  const mappings = [
    { id: "mapping-legacy", requirementId: "invalid-description", unresolved: true },
    { requirementId: "orphan-requirement", achievementId: "missing-achievement" },
    { id: "mapping-valid", requirementId: "valid-first", achievementId: "achievement-1" }
  ];
  const data = v2Snapshot({
    jobs,
    requirements,
    achievementMappings: mappings
  });
  const original = JSON.parse(JSON.stringify(data));
  const fake = createFakeStorage(storedV2(data));
  const result = createCareerStorage(fake).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot.requirements, [
    validFirst,
    requirementRecord({
      id: "valid-second",
      jobId: "job-2",
      category: "skill",
      importance: "preferred"
    })
  ]);
  assert.deepEqual(result.snapshot.legacyRequirements, [
    invalidDescription,
    ...nonObjectValues,
    invalidCategory,
    duplicateOne,
    invalidImportance,
    duplicateTwo,
    invalidTimestamp,
    unknownField,
    invalidJob
  ]);
  assert.deepEqual(result.snapshot.achievementMappings, mappings);
  assert.deepEqual(result.snapshot.profile, original.profile);
  assert.deepEqual(result.snapshot.employmentRecords, original.employmentRecords);
  assert.deepEqual(result.snapshot.achievementRecords, original.achievementRecords);
  assert.deepEqual(result.snapshot.jobs, jobs);
  assert.deepEqual(data, original);
  assert.deepEqual(fake.calls.setItem, []);
});

test("migrates valid empty version-1 snapshots through version 3 without writing", () => {
  const data = {
    profile: null,
    employmentRecords: [],
    achievementRecords: []
  };
  const original = JSON.stringify(v1Envelope(data));
  const fake = createFakeStorage(original);
  const result = createCareerStorage(fake).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, snapshot({
    profile: null,
    employmentRecords: [],
    achievementRecords: []
  }));
  assert.deepEqual(data, {
    profile: null,
    employmentRecords: [],
    achievementRecords: []
  });
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), original);
});

test("migrates populated version-1 snapshots through version 3", () => {
  const data = v1Snapshot({
    achievementRecords: [achievementRecord({
      employmentId: "employment-1",
      verificationStatus: "verified"
    })]
  });
  const originalSnapshot = JSON.parse(JSON.stringify(data));
  const original = JSON.stringify(v1Envelope(data));
  const fake = createFakeStorage(original);
  const adapter = createCareerStorage(fake);
  const result = adapter.load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, snapshot({
    ...originalSnapshot,
    jobs: [],
    requirements: [],
    achievementMappings: []
  }));
  assert.deepEqual(data, originalSnapshot);
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), original);
  fake.setError = new Error("quota exceeded during migration");
  assert.equal(adapter.save(result.snapshot).status, "write-failed");
  assert.equal(fake.values.get(storageKey), original);
  fake.setError = null;
  assert.equal(adapter.save(result.snapshot).status, "saved");
  const saved = JSON.parse(fake.values.get(storageKey));
  assert.equal(saved.version, 3);
  assert.deepEqual(saved, { version: 3, ...result.snapshot });
});

test("rejects malformed version-1 snapshots during migration", () => {
  const invalidSnapshots = [
    { profile: null, employmentRecords: [] },
    v1Snapshot({ profile: profileRecord({ fullName: "" }) }),
    v1Snapshot({ employmentRecords: "not-an-array" }),
    v1Snapshot({ achievementRecords: [achievementRecord({
      verificationStatus: "invalid"
    })] }),
    v1Snapshot({ extra: true })
  ];

  for (const data of invalidSnapshots) {
    const original = JSON.stringify(v1Envelope(data));
    const fake = createFakeStorage(original);
    const adapter = createCareerStorage(fake);
    const result = adapter.load();

    assert.equal(result.status, "corrupt");
    assert.equal(fake.values.get(storageKey), original);
    assert.deepEqual(adapter.save(snapshot()), { status: "writes-disabled" });
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("rejects missing and malformed version-2 collections and records", () => {
  const invalidSnapshots = [
    {
      profile: null,
      employmentRecords: [],
      achievementRecords: [],
      requirements: [],
      achievementMappings: []
    },
    {
      profile: null,
      employmentRecords: [],
      achievementRecords: [],
      jobs: [],
      achievementMappings: []
    },
    {
      profile: null,
      employmentRecords: [],
      achievementRecords: [],
      jobs: [],
      requirements: []
    },
    v2Snapshot({ jobs: "not-an-array" }),
    v2Snapshot({ requirements: "not-an-array" }),
    v2Snapshot({ achievementMappings: "not-an-array" }),
    v2Snapshot({ achievementMappings: ["mapping"] }),
    v2Snapshot({ jobs: [jobRecord({ sourceUrl: "relative/path" })] }),
    v2Snapshot({
      jobs: [
        jobRecord(),
        jobRecord({ company: "Second Company" })
      ]
    }),
    v2Snapshot({ profile: profileRecord({ fullName: "" }) }),
    v2Snapshot({ employmentRecords: [employmentRecord({ startDate: "bad" })] }),
    v2Snapshot({ achievementRecords: [achievementRecord({
      verificationStatus: "invalid"
    })] }),
    v2Snapshot({ extra: true }),
    v2Snapshot({ fitAssessment: { score: 100 } })
  ];

  for (const data of invalidSnapshots) {
    const result = createCareerStorage(createFakeStorage(storedV2(data))).load();
    assert.equal(result.status, "corrupt");
    assert.ok(result.error.errors.length > 0);
  }
});

test("accepts multiple Jobs and classifies Requirement and Mapping entries", () => {
  const data = v2Snapshot({
    jobs: [
      jobRecord(),
      jobRecord({
        id: "job-2",
        company: "Other Company",
        status: "archived"
      })
    ],
    requirements: [
      requirementRecord(),
      { id: "incomplete", jobId: "job-1" }
    ],
    achievementMappings: [{
      id: "mapping-1",
      requirementId: "requirement-1",
      achievementId: "achievement-1"
    }]
  });
  const result = createCareerStorage(createFakeStorage(storedV2(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, {
    ...data,
    requirements: [requirementRecord()],
    legacyRequirements: [{ id: "incomplete", jobId: "job-1" }]
  });
});

test("classifies valid Requirements in source order and invalid entries as legacy", () => {
  const valid = [
    requirementRecord({ id: "valid-1", category: "skill", importance: "preferred" }),
    requirementRecord({ id: "valid-2", category: "education", importance: "mandatory" }),
    requirementRecord({ id: "valid-3", category: "certification", importance: "preferred" }),
    requirementRecord({ id: "valid-4", category: "responsibility", importance: "mandatory" }),
    requirementRecord({ id: "valid-5", category: "other", importance: "preferred" })
  ];
  const missingDescription = requirementRecord({ id: "missing-description" });
  delete missingDescription.description;
  const missingCategory = requirementRecord({ id: "missing-category" });
  delete missingCategory.category;
  const missingImportance = requirementRecord({ id: "missing-importance" });
  delete missingImportance.importance;
  const missingTimestamp = requirementRecord({ id: "missing-time" });
  delete missingTimestamp.createdAt;
  const invalid = [
    missingDescription,
    { ...requirementRecord({ id: "blank-description" }), description: " " },
    missingCategory,
    { ...requirementRecord({ id: "invalid-category" }), category: null },
    missingImportance,
    { ...requirementRecord({ id: "invalid-importance" }), importance: "" },
    missingTimestamp,
    { ...requirementRecord({ id: "invalid-time" }), updatedAt: "not-a-timestamp" },
    { ...requirementRecord({ id: "unknown-field" }), status: "active" },
    requirementRecord({ id: "invalid-job", jobId: "absent-job" }),
    null,
    "not-an-object"
  ];
  const data = v2Snapshot({
    jobs: [jobRecord()],
    requirements: [valid[0], ...invalid.slice(0, 3), ...valid.slice(1), ...invalid.slice(3)]
  });
  const result = createCareerStorage(createFakeStorage(storedV2(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot.requirements, valid);
  assert.deepEqual(result.snapshot.legacyRequirements, invalid);
});

test("moves every Requirement in a duplicate-ID group to legacy", () => {
  const first = requirementRecord({ id: "duplicate" });
  const second = requirementRecord({
    id: "duplicate",
    description: "A distinct duplicate record"
  });
  const unique = requirementRecord({ id: "unique" });
  const data = v2Snapshot({
    jobs: [jobRecord()],
    requirements: [first, unique, second]
  });
  const result = createCareerStorage(createFakeStorage(storedV2(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot.requirements, [unique]);
  assert.deepEqual(result.snapshot.legacyRequirements, [first, second]);
});

test("accepts an empty v2 Requirements and mappings database and does not write on migration", () => {
  const data = v2Snapshot({ requirements: [], achievementMappings: [] });
  const raw = storedV2(data);
  const fake = createFakeStorage(raw);
  const result = createCareerStorage(fake).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, snapshot({
    ...data,
    legacyRequirements: []
  }));
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);
});

test("malformed v2 Requirements fail safely without overwriting stored data", () => {
  const raw = storedV2(v2Snapshot({ requirements: "not-an-array" }));
  const fake = createFakeStorage(raw);
  const adapter = createCareerStorage(fake);
  const result = adapter.load();

  assert.equal(result.status, "corrupt");
  assert.equal(result.writesDisabled, true);
  assert.ok(result.error.errors.some((error) => error.field === "requirements"));
  assert.equal(fake.values.get(storageKey), raw);
  assert.deepEqual(fake.calls.setItem, []);
  assert.deepEqual(adapter.save(snapshot()), { status: "writes-disabled" });
});

test("preserves finite JSON numbers in legacy Requirement entries", () => {
  const data = v2Snapshot({ requirements: [{ id: "legacy", unsupported: -0 }] });
  const raw = storedV2(data).replace('"unsupported":0', '"unsupported":-0');
  const result = createCareerStorage(createFakeStorage(raw)).load();

  assert.equal(result.status, "loaded");
  assert.equal(result.snapshot.legacyRequirements.length, 1);
  assert.equal(
    Object.is(result.snapshot.legacyRequirements[0].unsupported, -0),
    true
  );
});

test("repeated v3 loads preserve records and do not write", () => {
  const data = snapshot({
    jobs: [jobRecord()],
    requirements: [requirementRecord()],
    legacyRequirements: [null, { oldRequirement: true }],
    achievementMappings: [{ requirementId: "missing" }]
  });
  const raw = stored(data);
  const fake = createFakeStorage(raw);
  const adapter = createCareerStorage(fake);

  assert.deepEqual(adapter.load(), { status: "loaded", snapshot: data });
  assert.deepEqual(adapter.load(), { status: "loaded", snapshot: data });
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), raw);
});

test("loads null profile, empty arrays, and unlinked achievements", () => {
  const data = snapshot({
    profile: null,
    employmentRecords: [],
    achievementRecords: [achievementRecord()]
  });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.deepEqual(result, { status: "loaded", snapshot: data });
});

test("reports invalid JSON as corrupt and preserves the stored value", () => {
  const original = "{not valid json";
  const fake = createFakeStorage(original);
  const result = createCareerStorage(fake).load();

  assert.equal(result.status, "corrupt");
  assert.equal(result.writesDisabled, true);
  assert.ok(result.error.errors.some((error) => error.field === "json"));
  assert.equal(fake.values.get(storageKey), original);
});

test("rejects stored negative-zero evidence as corrupt", () => {
  const raw = JSON.stringify(envelope(snapshot()));
  const withNegativeZero = raw.replace('"evidence":[]', '"evidence":[-0]');
  const result = createCareerStorage(createFakeStorage(withNegativeZero)).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) => error.path.includes("evidence")));
});

test("rejects missing and additional envelope properties", () => {
  for (const json of [
    JSON.stringify({ version: 3, profile: null, employmentRecords: [] }),
    JSON.stringify({ ...envelope(), extra: true })
  ]) {
    const result = createCareerStorage(createFakeStorage(json)).load();
    assert.equal(result.status, "corrupt");
    assert.ok(result.error.errors.length > 0);
  }
});

test("rejects a non-numeric envelope version as corrupt", () => {
  const result = createCareerStorage(
    createFakeStorage(JSON.stringify(envelope(snapshot(), { version: "1" })))
  ).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) => error.field === "version"));
});

test("reports a numeric unsupported version distinctly and disables writes", () => {
  const original = JSON.stringify(envelope(snapshot(), { version: 4 }));
  const fake = createFakeStorage(original);
  const adapter = createCareerStorage(fake);
  const result = adapter.load();

  assert.deepEqual(result, {
    status: "unsupported-version",
    version: 4,
    writesDisabled: true
  });
  assert.deepEqual(adapter.save(snapshot()), { status: "writes-disabled" });
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), original);
});

test("rejects invalid profiles with record and model field context", () => {
  const result = createCareerStorage(createFakeStorage(stored(snapshot({
    profile: profileRecord({ fullName: "" })
  })))).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) =>
    error.recordType === "profile"
      && error.recordId === "profile-1"
      && error.modelField === "fullName"
      && error.message
  ));
});

test("rejects invalid employment and achievement records", () => {
  const cases = [
    snapshot({ employmentRecords: [employmentRecord({ startDate: "2020-02-31" })] }),
    snapshot({ achievementRecords: [achievementRecord({ verificationStatus: "pending" })] })
  ];

  for (const data of cases) {
    const result = createCareerStorage(createFakeStorage(stored(data))).load();
    assert.equal(result.status, "corrupt");
    assert.ok(result.error.errors.some((error) => error.recordType));
  }
});

test("rejects duplicate employment IDs", () => {
  const data = snapshot({
    employmentRecords: [
      employmentRecord(),
      employmentRecord({ employer: "Second employer" })
    ]
  });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) => /Duplicate employment ID/.test(error.message)));
});

test("rejects duplicate achievement IDs", () => {
  const data = snapshot({
    achievementRecords: [
      achievementRecord(),
      achievementRecord({ title: "Another achievement" })
    ]
  });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) => /Duplicate achievement ID/.test(error.message)));
});

test("rejects achievements linked to nonexistent employment", () => {
  const data = snapshot({
    achievementRecords: [achievementRecord({ employmentId: "missing-employment" })]
  });
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "corrupt");
  assert.ok(result.error.errors.some((error) =>
    error.modelField === "employmentId" && /does not exist/.test(error.message)
  ));
});

test("a throwing getItem returns unavailable without disabling writes", () => {
  const fake = createFakeStorage();
  fake.getError = new Error("storage unavailable");
  const adapter = createCareerStorage(fake);

  assert.equal(adapter.load().status, "unavailable");
  fake.getError = null;
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("saves the exact version-3 envelope with one setItem call", () => {
  const fake = createFakeStorage();
  const data = snapshot();
  const result = createCareerStorage(fake).save(data);

  assert.deepEqual(result, { status: "saved" });
  assert.equal(fake.calls.setItem.length, 1);
  assert.equal(fake.calls.setItem[0][0], storageKey);
  const saved = JSON.parse(fake.calls.setItem[0][1]);
  assert.deepEqual(Object.keys(saved).sort(), [
    "achievementMappings",
    "achievementRecords",
    "employmentRecords",
    "jobs",
    "legacyRequirements",
    "profile",
    "requirements",
    "version"
  ]);
  assert.equal(saved.version, 3);
  assert.deepEqual(saved, { version: 3, ...data });
});

test("invalid snapshots, duplicate IDs, and invalid links are not written", () => {
  const invalidCases = [
    snapshot({ profile: { id: "incomplete" } }),
    snapshot({
      employmentRecords: [employmentRecord(), employmentRecord()]
    }),
    snapshot({
      achievementRecords: [achievementRecord({ employmentId: "missing" })]
    })
  ];

  for (const data of invalidCases) {
    const fake = createFakeStorage();
    const result = createCareerStorage(fake).save(data);
    assert.equal(result.status, "invalid-snapshot");
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("rejects lossy model arrays and does not invoke metric getters", () => {
  const sparseSkills = new Array(1);
  const sparseData = snapshot({
    profile: profileRecord({ skills: sparseSkills })
  });
  const sparseResult = createCareerStorage(createFakeStorage()).save(sparseData);
  assert.equal(sparseResult.status, "invalid-snapshot");

  let getterCalls = 0;
  const metric = {
    name: "Revenue",
    unit: "USD",
    basis: "measured"
  };
  Object.defineProperty(metric, "value", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 10;
    }
  });
  const getterResult = createCareerStorage(createFakeStorage()).save(snapshot({
    achievementRecords: [achievementRecord({ metrics: [metric] })]
  }));
  assert.equal(getterResult.status, "invalid-snapshot");
  assert.equal(getterCalls, 0);
});

test("rejects custom-prototype evidence arrays without invoking inherited toJSON", () => {
  let toJSONCalls = 0;
  const customPrototype = Object.create(Array.prototype);
  customPrototype.toJSON = function toJSON() {
    toJSONCalls += 1;
    return ["transformed"];
  };
  const evidence = ["original"];
  Object.setPrototypeOf(evidence, customPrototype);
  const data = snapshot({
    achievementRecords: [achievementRecord({ evidence })]
  });
  const adapter = createCareerStorage(createFakeStorage());

  assert.equal(adapter.save(data).status, "json-fidelity-error");
  assert.equal(toJSONCalls, 0);
  assert.equal(evidence[0], "original");
  assert.equal(Object.getPrototypeOf(evidence), customPrototype);
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("rejects custom-prototype model arrays without mutating them", () => {
  const customPrototype = Object.create(Array.prototype);
  customPrototype.toJSON = () => ["transformed"];
  const skills = ["JavaScript"];
  Object.setPrototypeOf(skills, customPrototype);
  const data = snapshot({
    profile: profileRecord({ skills })
  });
  const adapter = createCareerStorage(createFakeStorage());

  assert.equal(adapter.save(data).status, "invalid-snapshot");
  assert.equal(skills[0], "JavaScript");
  assert.equal(Object.getPrototypeOf(skills), customPrototype);
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("rejects negative-zero metric values before serialization", () => {
  const data = snapshot({
    achievementRecords: [achievementRecord({
      metrics: [{
        name: "Revenue",
        value: -0,
        unit: "USD",
        basis: "measured"
      }]
    })]
  });
  const metric = data.achievementRecords[0].metrics[0];
  const adapter = createCareerStorage(createFakeStorage());

  const result = adapter.save(data);
  assert.equal(result.status, "invalid-snapshot");
  assert.ok(result.errors.some((error) =>
    error.recordType === "achievement"
      && error.recordId === "achievement-1"
      && error.path.endsWith("metrics[0].value")
      && error.modelField === "value"
  ));
  assert.ok(Object.is(metric.value, -0));
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("rejects custom-prototype metrics without invoking inherited toJSON", () => {
  let toJSONCalls = 0;
  const metricPrototype = Object.create(Object.prototype);
  metricPrototype.toJSON = function toJSON() {
    toJSONCalls += 1;
    return { transformed: true };
  };
  const metric = Object.assign(Object.create(metricPrototype), {
    name: "Revenue",
    value: 12,
    unit: "USD",
    basis: "measured"
  });
  const data = snapshot({
    achievementRecords: [achievementRecord({ metrics: [metric] })]
  });
  const adapter = createCareerStorage(createFakeStorage());

  assert.equal(adapter.save(data).status, "invalid-snapshot");
  assert.equal(toJSONCalls, 0);
  assert.equal(Object.getPrototypeOf(metric), metricPrototype);
  assert.deepEqual(Object.keys(metric), ["name", "value", "unit", "basis"]);
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("accepts ordinary and null-prototype metric objects", () => {
  const regularMetric = {
    name: "Users",
    value: 20,
    unit: "people",
    basis: "measured"
  };
  const nullPrototypeMetric = Object.assign(Object.create(null), {
    name: "Revenue",
    value: 12,
    unit: "USD",
    basis: "estimated"
  });

  for (const metric of [regularMetric, nullPrototypeMetric]) {
    const data = snapshot({
      achievementRecords: [achievementRecord({ metrics: [metric] })]
    });
    const fake = createFakeStorage();
    const adapter = createCareerStorage(fake);

    assert.equal(adapter.save(data).status, "saved");
    assert.equal(adapter.load().status, "loaded");
  }
});

test("handles a metric prototype reflection failure without disabling later saves", () => {
  const metric = new Proxy({
    name: "Revenue",
    value: 12,
    unit: "USD",
    basis: "measured"
  }, {
    getPrototypeOf() {
      throw new Error("prototype trap");
    }
  });
  const data = snapshot({
    achievementRecords: [achievementRecord({ metrics: [metric] })]
  });
  const adapter = createCareerStorage(createFakeStorage());
  const result = adapter.save(data);

  assert.equal(result.status, "invalid-snapshot");
  assert.ok(result.errors.some((error) =>
    error.recordType === "achievement"
      && error.recordId === "achievement-1"
      && /prototype could not be inspected/.test(error.message)
  ));
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("ordinary model and evidence arrays with valid metrics save and load", () => {
  const data = snapshot({
    achievementRecords: [achievementRecord({
      actions: ["planned"],
      metrics: [{
        name: "Revenue",
        value: 0,
        unit: "USD",
        basis: "measured"
      }],
      evidence: ["report", { page: 2 }]
    })]
  });
  const fake = createFakeStorage();
  const adapter = createCareerStorage(fake);

  assert.equal(adapter.save(data).status, "saved");
  const loaded = adapter.load();
  assert.equal(loaded.status, "loaded");
  assert.deepEqual(loaded.snapshot, data);
});

test("version-3 serialization round trip preserves all collections without assessments", () => {
  const data = snapshot({
    jobs: [jobRecord()],
    requirements: [requirementRecord()],
    legacyRequirements: [null, "legacy", { old: true }],
    achievementMappings: [{
      id: "mapping-1",
      requirementId: "requirement-1",
      achievementId: "achievement-1"
    }]
  });
  const fake = createFakeStorage();
  const adapter = createCareerStorage(fake);

  assert.deepEqual(adapter.save(data), { status: "saved" });
  const envelopeData = JSON.parse(fake.values.get(storageKey));
  assert.equal(envelopeData.version, 3);
  assert.deepEqual(Object.keys(envelopeData).sort(), [
    "achievementMappings",
    "achievementRecords",
    "employmentRecords",
    "jobs",
    "legacyRequirements",
    "profile",
    "requirements",
    "version"
  ]);
  assert.deepEqual(adapter.load(), { status: "loaded", snapshot: data });
  assert.equal(Object.hasOwn(envelopeData, "fitAssessment"), false);
});

test("save does not delete the previous stored value before writing", () => {
  const original = "prior stored value";
  const fake = createFakeStorage(original);
  const result = createCareerStorage(fake).save(snapshot());

  assert.equal(result.status, "saved");
  assert.equal(fake.calls.setItem.length, 1);
  assert.notEqual(fake.values.get(storageKey), original);
});

test("a setItem failure preserves existing data and later save can retry", () => {
  const original = "prior stored value";
  const fake = createFakeStorage(original);
  const adapter = createCareerStorage(fake);
  const data = snapshot();
  const originalProfile = data.profile;
  const originalEmploymentRecords = data.employmentRecords;
  const originalAchievementRecords = data.achievementRecords;
  fake.setError = new Error("quota exceeded");

  assert.equal(adapter.save(data).status, "write-failed");
  assert.equal(fake.values.get(storageKey), original);
  assert.equal(data.profile, originalProfile);
  assert.equal(data.employmentRecords, originalEmploymentRecords);
  assert.equal(data.achievementRecords, originalAchievementRecords);
  fake.setError = null;
  assert.equal(adapter.save(data).status, "saved");
  assert.equal(fake.calls.setItem.length, 2);
});

test("save after corrupt load is disabled without calling setItem", () => {
  const fake = createFakeStorage("invalid json");
  const adapter = createCareerStorage(fake);

  assert.equal(adapter.load().status, "corrupt");
  assert.deepEqual(adapter.save(snapshot()), { status: "writes-disabled" });
  assert.deepEqual(fake.calls.setItem, []);
  assert.equal(fake.values.get(storageKey), "invalid json");
});

test("JSON-safe nested evidence saves and survives loading", () => {
  const data = snapshot({
    achievementRecords: [achievementRecord({
      evidence: ["text", true, null, 3.5, [false], { nested: "value" }]
    })]
  });
  const fake = createFakeStorage();
  const adapter = createCareerStorage(fake);

  assert.equal(adapter.save(data).status, "saved");
  assert.deepEqual(adapter.load().snapshot, data);
});

test("rejects undefined, functions, symbols, and BigInt evidence", () => {
  const unsupported = [undefined, () => {}, Symbol("evidence"), 1n];
  for (const value of unsupported) {
    const fake = createFakeStorage();
    const data = snapshot({
      achievementRecords: [achievementRecord({ evidence: [{ nested: value }] })]
    });
    const originalEvidence = data.achievementRecords[0].evidence;
    const originalValue = originalEvidence[0].nested;
    const result = createCareerStorage(fake).save(data);

    assert.equal(result.status, "json-fidelity-error");
    assert.ok(result.errors.some((error) =>
      error.recordId === "achievement-1" && error.path.includes("evidence")
    ));
    assert.equal(data.achievementRecords[0].evidence, originalEvidence);
    assert.equal(originalEvidence[0].nested, originalValue);
    assert.deepEqual(fake.calls.setItem, []);
  }
});

test("rejects non-finite and negative-zero evidence numbers", () => {
  for (const value of [NaN, Infinity, -Infinity, -0]) {
    const result = createCareerStorage(createFakeStorage()).save(snapshot({
      achievementRecords: [achievementRecord({ evidence: [value] })]
    }));
    assert.equal(result.status, "json-fidelity-error");
  }
});

test("rejects cyclic evidence but allows repeated acyclic references", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(
    createCareerStorage(createFakeStorage()).save(snapshot({
      achievementRecords: [achievementRecord({ evidence: [cyclic] })]
    })).status,
    "json-fidelity-error"
  );

  const shared = { label: "shared" };
  const result = createCareerStorage(createFakeStorage()).save(snapshot({
    achievementRecords: [achievementRecord({ evidence: [shared, shared] })]
  }));
  assert.equal(result.status, "saved");
});

test("rejects sparse arrays, extra array properties, and non-plain objects", () => {
  const sparse = [];
  sparse[1] = "present";
  const extra = ["value"];
  extra.note = "unsupported";
  const cases = [
    sparse,
    extra,
    [new Date("2025-01-01T00:00:00.000Z")],
    [new Map()]
  ];

  for (const evidence of cases) {
    const result = createCareerStorage(createFakeStorage()).save(snapshot({
      achievementRecords: [achievementRecord({ evidence })]
    }));
    assert.equal(result.status, "json-fidelity-error");
  }
});

test("rejects symbol-keyed and non-enumerable evidence properties", () => {
  const symbolKeyed = { visible: true };
  symbolKeyed[Symbol("hidden")] = "value";
  const nonEnumerable = {};
  Object.defineProperty(nonEnumerable, "hidden", {
    value: "value",
    enumerable: false
  });

  for (const value of [symbolKeyed, nonEnumerable]) {
    const result = createCareerStorage(createFakeStorage()).save(snapshot({
      achievementRecords: [achievementRecord({ evidence: [value] })]
    }));
    assert.equal(result.status, "json-fidelity-error");
  }
});

test("rejects evidence getters and setters without invoking them", () => {
  let getterCalls = 0;
  const withGetter = {};
  Object.defineProperty(withGetter, "value", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "value";
    }
  });
  const withSetter = {};
  Object.defineProperty(withSetter, "value", {
    enumerable: true,
    set() {
      getterCalls += 1;
    }
  });

  for (const value of [withGetter, withSetter]) {
    const result = createCareerStorage(createFakeStorage()).save(snapshot({
      achievementRecords: [achievementRecord({ evidence: [value] })]
    }));
    assert.equal(result.status, "json-fidelity-error");
  }
  assert.equal(getterCalls, 0);
});

test("reflection failures in evidence are reported as fidelity errors", () => {
  const hostileProxy = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("reflection trap");
    }
  });
  const data = snapshot({
    achievementRecords: [achievementRecord({ evidence: [hostileProxy] })]
  });
  const adapter = createCareerStorage(createFakeStorage());

  assert.equal(adapter.save(data).status, "json-fidelity-error");
  assert.equal(adapter.save(snapshot()).status, "saved");
});

test("fidelity rejection does not mutate evidence or disable later writes", () => {
  const evidence = [{ safe: "before" }];
  const data = snapshot({
    achievementRecords: [achievementRecord({ evidence })]
  });
  Object.defineProperty(evidence[0], "hidden", {
    value: "cannot persist",
    enumerable: false,
    configurable: true
  });
  const adapter = createCareerStorage(createFakeStorage());

  assert.equal(adapter.save(data).status, "json-fidelity-error");
  assert.equal(evidence[0].safe, "before");
  assert.equal(evidence[0].hidden, "cannot persist");
  delete evidence[0].hidden;
  assert.equal(adapter.save(data).status, "saved");
});

test("factory rejects dependencies without the Storage-like methods", () => {
  assert.throws(() => createCareerStorage(null), TypeError);
  assert.throws(() => createCareerStorage({ getItem() {} }), TypeError);
});
