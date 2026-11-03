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

function snapshot(overrides = {}) {
  return {
    profile: profileRecord(),
    employmentRecords: [employmentRecord()],
    achievementRecords: [achievementRecord()],
    ...overrides
  };
}

function envelope(value = snapshot(), overrides = {}) {
  return {
    version: 1,
    profile: value.profile,
    employmentRecords: value.employmentRecords,
    achievementRecords: value.achievementRecords,
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

function stored(value, overrides = {}) {
  return JSON.stringify(envelope(value, overrides));
}

test("missing storage returns an empty snapshot", () => {
  const fake = createFakeStorage();
  const result = createCareerStorage(fake).load();

  assert.deepEqual(result, {
    status: "missing",
    snapshot: {
      profile: null,
      employmentRecords: [],
      achievementRecords: []
    }
  });
  assert.deepEqual(fake.calls.getItem, [storageKey]);
});

test("loads a valid version-1 envelope without its version property", () => {
  const data = snapshot();
  const result = createCareerStorage(createFakeStorage(stored(data))).load();

  assert.equal(result.status, "loaded");
  assert.deepEqual(result.snapshot, data);
  assert.deepEqual(Object.keys(result.snapshot), [
    "profile",
    "employmentRecords",
    "achievementRecords"
  ]);
});

test("loads null profile, empty arrays, and unlinked achievements", () => {
  const data = {
    profile: null,
    employmentRecords: [],
    achievementRecords: [achievementRecord()]
  };
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
    JSON.stringify({ version: 1, profile: null, employmentRecords: [] }),
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
  const fake = createFakeStorage(JSON.stringify(envelope(snapshot(), { version: 2 })));
  const adapter = createCareerStorage(fake);
  const result = adapter.load();

  assert.deepEqual(result, {
    status: "unsupported-version",
    version: 2,
    writesDisabled: true
  });
  assert.deepEqual(adapter.save(snapshot()), { status: "writes-disabled" });
  assert.deepEqual(fake.calls.setItem, []);
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

test("saves the exact version-1 envelope with one setItem call", () => {
  const fake = createFakeStorage();
  const data = snapshot();
  const result = createCareerStorage(fake).save(data);

  assert.deepEqual(result, { status: "saved" });
  assert.equal(fake.calls.setItem.length, 1);
  assert.equal(fake.calls.setItem[0][0], storageKey);
  const saved = JSON.parse(fake.calls.setItem[0][1]);
  assert.deepEqual(Object.keys(saved).sort(), [
    "achievementRecords",
    "employmentRecords",
    "profile",
    "version"
  ]);
  assert.equal(saved.version, 1);
  assert.deepEqual(saved, { version: 1, ...data });
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
