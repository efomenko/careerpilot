import assert from "node:assert/strict";
import test from "node:test";
import { createAchievementMappingRecord } from "../src/js/achievement-mapping-model.js";
import { createCareerState } from "../src/js/career-state.js";
import { createJobRecord } from "../src/js/job-model.js";
import { createRequirementRecord } from "../src/js/requirement-model.js";

const createdAt = "2025-04-20T14:30:00.000Z";
const updatedAt = "2025-05-01T09:15:00.000Z";

function profileInput(overrides = {}) {
  return {
    fullName: "Career profile name",
    headline: "",
    summary: "",
    skills: [],
    ...overrides
  };
}

function employmentInput(overrides = {}) {
  return {
    employer: "Employer",
    roleTitle: "Role",
    startDate: "2020-01-01",
    endDate: null,
    isCurrent: true,
    responsibilities: [],
    ...overrides
  };
}

function achievementInput(overrides = {}) {
  return {
    title: "Achievement",
    context: "",
    contribution: "Contribution",
    actions: [],
    outcome: "",
    potentialImpact: "",
    metrics: [],
    evidence: [],
    employmentId: null,
    ...overrides
  };
}

function addEmployment(state, id, input = employmentInput(), timestamp = createdAt) {
  return state.addEmploymentRecord(input, { id, createdAt: timestamp });
}

function addAchievement(state, id, input = achievementInput(), timestamp = createdAt) {
  return state.addAchievementRecord(input, { id, createdAt: timestamp });
}

function completeProfile(overrides = {}) {
  return {
    id: "profile-1",
    ...profileInput(),
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function completeEmployment(id, overrides = {}) {
  return {
    id,
    ...employmentInput(),
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function completeAchievement(id, overrides = {}) {
  return {
    id,
    ...achievementInput(),
    verificationStatus: "unverified",
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function completeJob(id, overrides = {}) {
  return {
    id,
    company: "Example Company",
    roleTitle: "Engineer",
    description: "",
    sourceUrl: "",
    notes: "",
    status: "active",
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function completeRequirement(id, jobId, overrides = {}) {
  return {
    id,
    jobId,
    description: "At least five years of experience building web applications",
    category: "experience",
    importance: "mandatory",
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function completeAchievementMapping(id, requirementId, achievementId, overrides = {}) {
  return {
    id,
    requirementId,
    achievementId,
    createdAt,
    updatedAt: createdAt,
    ...overrides
  };
}

function emptySnapshot(overrides = {}) {
  return {
    profile: null,
    employmentRecords: [],
    achievementRecords: [],
    jobs: [],
    requirements: [],
    legacyRequirements: [],
    achievementMappings: [],
    ...overrides
  };
}

function completeSnapshot(overrides = {}) {
  return {
    profile: completeProfile(),
    employmentRecords: [completeEmployment("employment-1")],
    achievementRecords: [completeAchievement("achievement-1", {
      employmentId: "employment-1"
    })],
    jobs: [],
    requirements: [],
    legacyRequirements: [],
    achievementMappings: [],
    ...overrides
  };
}

test("initializes empty profile and record collections", () => {
  const state = createCareerState();

  assert.equal(state.getProfile(), null);
  assert.deepEqual(state.getEmploymentRecords(), []);
  assert.deepEqual(state.getAchievementRecords(), []);
  assert.deepEqual(state.getJobs(), []);
  assert.deepEqual(state.getSnapshot(), emptySnapshot());
});

test("restores a complete validated snapshot without mutation notification", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  const snapshot = completeSnapshot({
    achievementRecords: [
      completeAchievement("verified-achievement", {
        employmentId: "employment-1",
        verificationStatus: "verified"
      }),
      completeAchievement("needs-confirmation", {
        verificationStatus: "needs_confirmation",
        employmentId: null
      })
    ]
  });

  state.restoreSnapshot(snapshot);

  assert.deepEqual(state.getSnapshot(), snapshot);
  assert.equal(notifications, 0);
  assert.throws(() => state.restoreSnapshot(snapshot), /fresh state/);
});

test("restores null profile and empty record collections", () => {
  const state = createCareerState();

  state.restoreSnapshot({
    profile: null,
    employmentRecords: [],
    achievementRecords: []
  });

  assert.deepEqual(state.getSnapshot(), emptySnapshot());
});

test("allows IDs to repeat across different record collections", () => {
  const state = createCareerState();
  state.restoreSnapshot({
    profile: completeProfile({ id: "shared-id" }),
    employmentRecords: [completeEmployment("shared-id")],
    achievementRecords: [completeAchievement("shared-id")]
  });

  assert.equal(state.getSnapshot().profile.id, "shared-id");
  assert.equal(state.getSnapshot().employmentRecords[0].id, "shared-id");
  assert.equal(state.getSnapshot().achievementRecords[0].id, "shared-id");
});

test("rejects invalid snapshots atomically with record validation context", () => {
  const invalidSnapshots = [
    completeSnapshot({ profile: completeProfile({ fullName: "" }) }),
    completeSnapshot({
      employmentRecords: [
        completeEmployment("duplicate"),
        completeEmployment("duplicate")
      ]
    }),
    completeSnapshot({
      achievementRecords: [
        completeAchievement("duplicate"),
        completeAchievement("duplicate")
      ]
    }),
    completeSnapshot({
      achievementRecords: [
        completeAchievement("bad-link", { employmentId: "missing" })
      ]
    }),
    { profile: null, employmentRecords: [] },
    {
      profile: null,
      employmentRecords: [],
      achievementRecords: [],
      unexpected: true
    }
  ];

  for (const invalidSnapshot of invalidSnapshots) {
    const state = createCareerState();
    assert.throws(
      () => state.restoreSnapshot(invalidSnapshot),
      (error) => error instanceof TypeError
    );
    assert.deepEqual(state.getSnapshot(), emptySnapshot());
  }
});

test("snapshot copies isolate every collection and nested supported value", () => {
  const state = createCareerState();
  state.createProfile(profileInput({ skills: ["Research"] }), {
    id: "profile-1",
    createdAt
  });
  addEmployment(state, "employment-1", employmentInput({
    responsibilities: ["Plan"]
  }));
  addAchievement(state, "achievement-1", achievementInput({
    actions: ["Build"],
    metrics: [{ name: "Users", value: 5, unit: "people", basis: "measured" }],
    evidence: [{ nested: ["source", { note: "original" }] }]
  }));

  const snapshot = state.getSnapshot();
  snapshot.profile.skills[0] = "changed";
  snapshot.employmentRecords[0].responsibilities[0] = "changed";
  snapshot.achievementRecords[0].actions[0] = "changed";
  snapshot.achievementRecords[0].metrics[0].value = 100;
  snapshot.achievementRecords[0].evidence[0].nested[1].note = "changed";
  snapshot.employmentRecords.push(completeEmployment("injected"));

  assert.equal(state.getProfile().skills[0], "Research");
  assert.deepEqual(state.getEmploymentRecords()[0].responsibilities, ["Plan"]);
  const achievement = state.getAchievementRecords()[0];
  assert.deepEqual(achievement.actions, ["Build"]);
  assert.equal(achievement.metrics[0].value, 5);
  assert.equal(achievement.evidence[0].nested[1].note, "original");
  assert.equal(state.getEmploymentRecords().length, 1);
});

test("snapshot copying preserves evidence cycles and shared references", () => {
  const shared = { label: "shared" };
  const cycle = { label: "cycle" };
  cycle.self = cycle;
  const state = createCareerState();
  addAchievement(state, "achievement-1", achievementInput({
    evidence: [shared, shared, cycle]
  }));

  const snapshot = state.getSnapshot();
  const evidence = snapshot.achievementRecords[0].evidence;
  assert.equal(evidence[0], evidence[1]);
  assert.equal(evidence[2].self, evidence[2]);
  assert.notEqual(evidence[0], shared);
  assert.notEqual(evidence[2], cycle);
});

test("snapshot copying preserves non-writable and non-configurable descriptors", () => {
  const array = ["fixed"];
  Object.defineProperty(array, "0", {
    value: "fixed",
    enumerable: true,
    writable: false,
    configurable: false
  });
  Object.defineProperty(array, "length", { writable: false });

  const object = {};
  Object.defineProperty(object, "fixed", {
    value: { nested: true },
    enumerable: true,
    writable: false,
    configurable: false
  });

  const state = createCareerState();
  state.restoreSnapshot({
    profile: null,
    employmentRecords: [],
    achievementRecords: [completeAchievement("achievement-descriptors", {
      evidence: [{ array, object }]
    })]
  });
  const result = state.getSnapshot().achievementRecords[0].evidence[0];
  const copiedArrayDescriptor = Object.getOwnPropertyDescriptor(result.array, "0");
  const copiedLengthDescriptor = Object.getOwnPropertyDescriptor(result.array, "length");
  const copiedObjectDescriptor = Object.getOwnPropertyDescriptor(result.object, "fixed");

  assert.deepEqual(
    {
      value: copiedArrayDescriptor.value,
      enumerable: copiedArrayDescriptor.enumerable,
      writable: copiedArrayDescriptor.writable,
      configurable: copiedArrayDescriptor.configurable
    },
    {
      value: "fixed",
      enumerable: true,
      writable: false,
      configurable: false
    }
  );
  assert.equal(copiedLengthDescriptor.writable, false);
  assert.equal(copiedObjectDescriptor.enumerable, true);
  assert.equal(copiedObjectDescriptor.writable, false);
  assert.equal(copiedObjectDescriptor.configurable, false);
  assert.notEqual(copiedObjectDescriptor.value, object.fixed);
  assert.throws(() => { result.array[0] = "changed"; }, TypeError);
  assert.throws(() => { result.object.fixed = {}; }, TypeError);
});

test("array element descriptor reflection failures are contextual TypeErrors", () => {
  const evidenceArray = new Proxy(["value"], {
    getOwnPropertyDescriptor(target, key) {
      if (key === "0") {
        throw new Error("descriptor trap");
      }
      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });
  const state = createCareerState();

  assert.throws(
    () => state.restoreSnapshot({
      profile: null,
      employmentRecords: [],
      achievementRecords: [completeAchievement("achievement-proxy", {
        evidence: [evidenceArray]
      })]
    }),
    (error) => error instanceof TypeError
      && /snapshot\.achievementRecords\[0\]\.evidence\[0\]\[0\]/.test(error.message)
      && /inspected safely/.test(error.message)
  );
  assert.deepEqual(state.getSnapshot(), emptySnapshot());
});

test("proxy reflection failures do not partially hydrate state", () => {
  const employmentRecords = new Proxy([completeEmployment("employment-1")], {
    ownKeys() {
      throw new Error("ownKeys trap");
    }
  });
  const state = createCareerState();

  assert.throws(
    () => state.restoreSnapshot({
      profile: completeProfile(),
      employmentRecords,
      achievementRecords: []
    }),
    (error) => error instanceof TypeError
      && /snapshot\.employmentRecords could not be inspected safely/.test(error.message)
  );
  assert.deepEqual(state.getSnapshot(), emptySnapshot());

  state.restoreSnapshot({
    profile: null,
    employmentRecords: [],
    achievementRecords: []
  });
});

test("hydration and snapshots preserve shared evidence references across records", () => {
  const shared = { source: "common" };
  const snapshot = {
    profile: null,
    employmentRecords: [],
    achievementRecords: [
      completeAchievement("achievement-1", { evidence: [shared] }),
      completeAchievement("achievement-2", { evidence: [shared] })
    ]
  };
  const state = createCareerState();
  state.restoreSnapshot(snapshot);

  const restored = state.getSnapshot();
  const firstEvidence = restored.achievementRecords[0].evidence[0];
  const secondEvidence = restored.achievementRecords[1].evidence[0];
  assert.equal(firstEvidence, secondEvidence);
  assert.notEqual(firstEvidence, shared);
});

test("hydration detaches input evidence and rejects unsupported evidence values", () => {
  const nested = { detail: "original" };
  const input = completeSnapshot({
    achievementRecords: [completeAchievement("achievement-1", {
      evidence: [nested]
    })]
  });
  const state = createCareerState();
  state.restoreSnapshot(input);
  nested.detail = "changed";
  input.achievementRecords[0].evidence.push("injected");
  assert.deepEqual(state.getSnapshot().achievementRecords[0].evidence, [
    { detail: "original" }
  ]);

  const invalidInputs = [
    { ...completeSnapshot(), achievementRecords: [completeAchievement("fn", {
      evidence: [() => {}]
    })] },
    { ...completeSnapshot(), achievementRecords: [completeAchievement("date", {
      evidence: [new Date()]
    })] },
    { ...completeSnapshot(), achievementRecords: [completeAchievement("getter", {
      evidence: [Object.defineProperty({}, "value", {
        enumerable: true,
        get() {
          throw new Error("getter must not run");
        }
      })]
    })] }
  ];

  for (const invalidSnapshot of invalidInputs) {
    const freshState = createCareerState();
    assert.throws(() => freshState.restoreSnapshot(invalidSnapshot), TypeError);
    assert.deepEqual(freshState.getSnapshot(), emptySnapshot());
  }
});

test("creates Jobs with validation, safe copies, and duplicate ID protection", () => {
  const state = createCareerState();
  const job = completeJob("job-1");
  const returned = state.createJob(job);

  assert.deepEqual(returned, job);
  assert.notEqual(returned, job);
  returned.company = "Changed copy";
  job.roleTitle = "Changed input";
  assert.deepEqual(state.getJobs(), [completeJob("job-1")]);

  assert.throws(
    () => state.createJob(completeJob("job-1")),
    (error) => error.code === "DUPLICATE_ID"
  );
  assert.throws(
    () => state.createJob(completeJob("invalid", { company: " " })),
    (error) => error.code === "VALIDATION_ERROR"
      && error.errors.some(({ field }) => field === "company")
  );
  assert.deepEqual(state.getJobs(), [completeJob("job-1")]);
});

test("partially updates Jobs while preserving immutable and omitted fields", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));

  const updated = state.updateJob("job-1", {
    company: "Updated Company",
    updatedAt
  });
  assert.deepEqual(updated, completeJob("job-1", {
    company: "Updated Company",
    updatedAt
  }));
  assert.equal(state.getJobs()[0].roleTitle, "Engineer");
  assert.equal(state.getJobs()[0].createdAt, createdAt);
});

test("rejects immutable, unknown, and invalid Job updates atomically", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  const unchanged = state.getJobs();
  const invalidUpdates = [
    [{ id: "other", updatedAt }, "IMMUTABLE_FIELD"],
    [{ createdAt: updatedAt, updatedAt }, "IMMUTABLE_FIELD"],
    [{ unexpected: true, updatedAt }, "VALIDATION_ERROR"],
    [{ company: " ", updatedAt }, "VALIDATION_ERROR"],
    [{ status: "archived", updatedAt }, "INVALID_OPERATION"]
  ];

  for (const [updates, code] of invalidUpdates) {
    assert.throws(
      () => state.updateJob("job-1", updates),
      (error) => error.code === code
    );
    assert.deepEqual(state.getJobs(), unchanged);
  }
});

test("no-op Job updates do not change timestamps or notify", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  state.createJob(completeJob("job-1"));
  notifications = 0;

  const result = state.updateJob("job-1", {
    company: "Example Company",
    updatedAt
  });

  assert.deepEqual(result, completeJob("job-1"));
  assert.equal(notifications, 0);
  assert.deepEqual(state.getJobs(), [completeJob("job-1")]);
});

test("archives and reactivates Jobs idempotently", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  state.createJob(completeJob("job-1"));
  notifications = 0;

  assert.deepEqual(state.archiveJob("job-1", updatedAt), completeJob("job-1", {
    status: "archived",
    updatedAt
  }));
  assert.equal(notifications, 1);
  assert.deepEqual(state.archiveJob("job-1", createdAt), completeJob("job-1", {
    status: "archived",
    updatedAt
  }));
  assert.equal(notifications, 1);

  assert.deepEqual(state.reactivateJob("job-1", createdAt), completeJob("job-1", {
    status: "active",
    updatedAt: createdAt
  }));
  assert.equal(notifications, 2);
  assert.deepEqual(state.reactivateJob("job-1", updatedAt), completeJob("job-1", {
    status: "active",
    updatedAt: createdAt
  }));
  assert.equal(notifications, 2);
  assert.throws(
    () => state.archiveJob("missing", updatedAt),
    (error) => error.code === "NOT_FOUND"
  );
});

test("deletes a Job and cascades only its Requirements and their mappings", () => {
  const snapshot = completeSnapshot({
    achievementRecords: [
      completeAchievement("achievement-1", {
        verificationStatus: "verified"
      })
    ],
    jobs: [
      completeJob("job-1"),
      completeJob("job-2", { company: "Other Company" })
    ],
    requirements: [
      { id: "requirement-1", jobId: "job-1" },
      { id: "requirement-2", jobId: "job-1" },
      { id: "requirement-3", jobId: "job-2" }
    ],
    achievementMappings: [
      { id: "mapping-1", requirementId: "requirement-1", achievementId: "achievement-1" },
      { id: "mapping-2", requirementId: "requirement-2", achievementId: "achievement-1" },
      { id: "mapping-3", requirementId: "requirement-3", achievementId: "achievement-1" },
      { id: "mapping-unrelated", requirementId: "missing", achievementId: "achievement-1" },
      { id: "mapping-historical" }
    ]
  });
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.restoreSnapshot(snapshot);

  assert.deepEqual(state.deleteJob("job-1"), {
    jobId: "job-1",
    deletedRequirements: 2,
    deletedAchievementMappings: 2
  });
  assert.deepEqual(state.getJobs(), [snapshot.jobs[1]]);
  assert.deepEqual(state.getSnapshot().requirements, [snapshot.requirements[2]]);
  assert.deepEqual(
    state.getSnapshot().achievementMappings,
    [snapshot.achievementMappings[2], snapshot.achievementMappings[3], snapshot.achievementMappings[4]]
  );
  assert.deepEqual(state.getAchievementRecords(), snapshot.achievementRecords);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], state.getSnapshot());
});

test("deletes Jobs without Requirements and rejects missing Job deletion atomically", () => {
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1")],
    achievementMappings: [{ id: "orphan-mapping", requirementId: "missing" }]
  }));
  let notifications = 0;
  const observedState = createCareerState({
    onMutation: () => { notifications += 1; }
  });
  observedState.restoreSnapshot(state.getSnapshot());

  assert.deepEqual(observedState.deleteJob("job-1"), {
    jobId: "job-1",
    deletedRequirements: 0,
    deletedAchievementMappings: 0
  });
  assert.equal(notifications, 1);
  const afterDelete = observedState.getSnapshot();
  assert.throws(
    () => observedState.deleteJob("job-1"),
    (error) => error.code === "NOT_FOUND"
  );
  assert.equal(notifications, 1);
  assert.deepEqual(observedState.getSnapshot(), afterDelete);
});

test("deleting a Job with Requirements but no mappings preserves other records", () => {
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [
      completeJob("job-1"),
      completeJob("job-2", { company: "Other Company" })
    ],
    requirements: [
      { id: "requirement-1", jobId: "job-1" },
      { id: "requirement-2", jobId: "job-2" }
    ]
  }));

  assert.deepEqual(state.deleteJob("job-1"), {
    jobId: "job-1",
    deletedRequirements: 1,
    deletedAchievementMappings: 0
  });
  assert.deepEqual(state.getJobs(), [completeJob("job-2", {
    company: "Other Company"
  })]);
  assert.deepEqual(state.getSnapshot().requirements, [
    { id: "requirement-2", jobId: "job-2" }
  ]);
  assert.deepEqual(state.getSnapshot().achievementMappings, []);
});

test("Job and future relationship snapshots are detached from internal state", () => {
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1")],
    requirements: [{ id: "requirement-1", jobId: "job-1" }],
    achievementMappings: [{
      id: "mapping-1",
      requirementId: "requirement-1",
      achievementId: "achievement-1"
    }]
  }));

  const snapshot = state.getSnapshot();
  snapshot.jobs[0].company = "Changed";
  snapshot.requirements[0].jobId = "changed";
  snapshot.achievementMappings[0].requirementId = "changed";
  assert.deepEqual(state.getSnapshot().jobs, [completeJob("job-1")]);
  assert.deepEqual(state.getSnapshot().requirements, [
    { id: "requirement-1", jobId: "job-1" }
  ]);
  assert.deepEqual(state.getSnapshot().achievementMappings, [{
    id: "mapping-1",
    requirementId: "requirement-1",
    achievementId: "achievement-1"
  }]);
});

test("creates Achievement Mappings for existing endpoints and returns detached copies", () => {
  const state = createCareerState();
  const snapshot = completeSnapshot({
    jobs: [completeJob("job-1")],
    requirements: [completeRequirement("requirement-1", "job-1")],
    achievementRecords: [completeAchievement("achievement-1", {
      verificationStatus: "verified"
    })]
  });
  state.restoreSnapshot(snapshot);

  const mapping = completeAchievementMapping(
    "mapping-1",
    "requirement-1",
    "achievement-1"
  );
  const created = state.createAchievementMapping(mapping);

  assert.deepEqual(created, mapping);
  assert.notEqual(created, mapping);
  created.requirementId = "changed";
  mapping.achievementId = "changed";
  assert.deepEqual(state.getSnapshot().achievementMappings, [
    completeAchievementMapping("mapping-1", "requirement-1", "achievement-1")
  ]);
  assert.deepEqual(state.getRequirements("job-1"), snapshot.requirements);
  assert.deepEqual(state.getAchievementRecords(), snapshot.achievementRecords);
});

test("rejects missing references, duplicate mapping IDs, and duplicate pairs atomically", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1"), completeJob("job-2")],
    requirements: [
      completeRequirement("requirement-1", "job-1"),
      completeRequirement("requirement-2", "job-2")
    ],
    achievementRecords: [
      completeAchievement("achievement-1"),
      completeAchievement("achievement-2")
    ]
  }));
  state.createAchievementMapping(
    completeAchievementMapping("mapping-1", "requirement-1", "achievement-1")
  );
  notifications.length = 0;
  const before = state.getSnapshot();

  const failures = [
    [
      completeAchievementMapping("missing-requirement", "missing", "achievement-1"),
      "NOT_FOUND",
      /Requirement "missing" does not exist/
    ],
    [
      completeAchievementMapping("missing-achievement", "requirement-1", "missing"),
      "NOT_FOUND",
      /Achievement "missing" does not exist/
    ],
    [
      completeAchievementMapping("mapping-1", "requirement-2", "achievement-2"),
      "DUPLICATE_ID",
      /Achievement Mapping with ID "mapping-1" already exists/
    ],
    [
      completeAchievementMapping("mapping-2", "requirement-1", "achievement-1"),
      "DUPLICATE_PAIR",
      /already mapped to Achievement/
    ],
    [
      completeAchievementMapping("invalid", "requirement-1", "achievement-2", {
        updatedAt: "invalid"
      }),
      "VALIDATION_ERROR",
      /Achievement Mapping record is invalid/
    ]
  ];

  for (const [mapping, code, message] of failures) {
    assert.throws(
      () => state.createAchievementMapping(mapping),
      (error) => error.code === code && message.test(error.message)
    );
    assert.deepEqual(state.getSnapshot(), before);
    assert.equal(notifications.length, 0);
  }
});

test("lists mappings by either endpoint in insertion order with detached copies", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1"), completeJob("job-2")],
    requirements: [
      completeRequirement("requirement-1", "job-1"),
      completeRequirement("requirement-2", "job-2")
    ],
    achievementRecords: [
      completeAchievement("achievement-1"),
      completeAchievement("achievement-2")
    ]
  }));
  const mappings = [
    completeAchievementMapping("mapping-1", "requirement-1", "achievement-1"),
    completeAchievementMapping("mapping-2", "requirement-1", "achievement-2"),
    completeAchievementMapping("mapping-3", "requirement-2", "achievement-1")
  ];
  mappings.forEach((mapping, index) => {
    state.createAchievementMapping(mapping);
    assert.equal(notifications.length, index + 1);
    assert.deepEqual(
      notifications[index].achievementMappings,
      mappings.slice(0, index + 1)
    );
  });
  notifications.length = 0;

  const forRequirement = state.getAchievementMappingsForRequirement("requirement-1");
  const forAchievement = state.getAchievementMappingsForAchievement("achievement-1");
  assert.deepEqual(forRequirement, mappings.slice(0, 2));
  assert.deepEqual(forAchievement, [mappings[0], mappings[2]]);
  forRequirement[0].achievementId = "changed";
  forAchievement[0].requirementId = "changed";
  assert.deepEqual(state.getAchievementMappingsForRequirement("requirement-1"), mappings.slice(0, 2));
  assert.deepEqual(state.getAchievementMappingsForAchievement("achievement-1"), [
    mappings[0],
    mappings[2]
  ]);
  assert.equal(notifications.length, 0);
  assert.deepEqual(notifications, []);
});

test("calculates not_assessed for an existing Job with no Requirements", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));

  assert.deepEqual(state.calculateJobFitAssessment("job-1"), {
    jobId: "job-1",
    status: "not_assessed",
    score: null,
    supportedRequirementCount: 0,
    totalRequirementCount: 0,
    supportedMandatoryCount: 0,
    totalMandatoryCount: 0,
    requirementResults: []
  });
  assert.equal("fitAssessments" in state.getSnapshot(), false);
});

test("calculates a Job assessment from current public state reads", () => {
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1"), completeJob("job-2")],
    requirements: [
      completeRequirement("mandatory-supported", "job-1"),
      completeRequirement("preferred-unverified", "job-1", {
        importance: "preferred"
      }),
      completeRequirement("mandatory-unsupported", "job-1", {
        createdAt: updatedAt,
        updatedAt
      }),
      completeRequirement("other-job-requirement", "job-2")
    ],
    achievementRecords: [
      completeAchievement("verified-1", { verificationStatus: "verified" }),
      completeAchievement("verified-2", { verificationStatus: "verified" }),
      completeAchievement("unverified", { verificationStatus: "unverified" }),
      completeAchievement("needs-confirmation", {
        verificationStatus: "needs_confirmation"
      })
    ],
    achievementMappings: [
      completeAchievementMapping("mapping-1", "mandatory-supported", "verified-1"),
      completeAchievementMapping("mapping-2", "mandatory-supported", "verified-2"),
      completeAchievementMapping("mapping-3", "mandatory-supported", "unverified"),
      completeAchievementMapping(
        "mapping-4",
        "preferred-unverified",
        "needs-confirmation"
      ),
      completeAchievementMapping("mapping-5", "other-job-requirement", "verified-1")
    ]
  }));

  const calls = [];
  const getJobs = state.getJobs.bind(state);
  const getRequirements = state.getRequirements.bind(state);
  const getAchievementMappingsForRequirement =
    state.getAchievementMappingsForRequirement.bind(state);
  const getAchievementRecords = state.getAchievementRecords.bind(state);
  state.getJobs = (...args) => {
    calls.push(["getJobs", ...args]);
    return getJobs(...args);
  };
  state.getRequirements = (...args) => {
    calls.push(["getRequirements", ...args]);
    return getRequirements(...args);
  };
  state.getAchievementMappingsForRequirement = (...args) => {
    calls.push(["getAchievementMappingsForRequirement", ...args]);
    return getAchievementMappingsForRequirement(...args);
  };
  state.getAchievementRecords = (...args) => {
    calls.push(["getAchievementRecords", ...args]);
    return getAchievementRecords(...args);
  };

  const assessment = state.calculateJobFitAssessment("job-1");

  assert.equal(assessment.score, 40);
  assert.equal(assessment.supportedRequirementCount, 1);
  assert.equal(assessment.totalRequirementCount, 3);
  assert.equal(assessment.supportedMandatoryCount, 1);
  assert.equal(assessment.totalMandatoryCount, 2);
  assert.deepEqual(
    assessment.requirementResults.map(({ requirementId }) => requirementId),
    ["mandatory-unsupported", "preferred-unverified", "mandatory-supported"]
  );
  assert.deepEqual(
    assessment.requirementResults[2].verifiedAchievementIds,
    ["verified-1", "verified-2"]
  );
  assert.deepEqual(
    assessment.requirementResults[2].unverifiedAchievementIds,
    ["unverified"]
  );
  assert.deepEqual(
    assessment.requirementResults[1].unverifiedAchievementIds,
    ["needs-confirmation"]
  );
  assert.deepEqual(calls, [
    ["getJobs"],
    ["getRequirements", "job-1"],
    ["getAchievementMappingsForRequirement", "mandatory-supported"],
    ["getAchievementMappingsForRequirement", "preferred-unverified"],
    ["getAchievementMappingsForRequirement", "mandatory-unsupported"],
    ["getAchievementRecords"]
  ]);
});

test("rejects unknown, invalid, and blank Job IDs with the established NOT_FOUND error", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));

  for (const jobId of ["missing", "", " \t ", null, 1]) {
    assert.throws(
      () => state.calculateJobFitAssessment(jobId),
      (error) => error.code === "NOT_FOUND"
        && error.message === `Job "${jobId}" does not exist.`
    );
  }
});

test("recalculates current assessment after mapping, verification, content, and importance changes", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.createJob(completeJob("job-1"));
  state.createRequirement(completeRequirement("requirement-1", "job-1"));
  state.createRequirement(completeRequirement("requirement-2", "job-1", {
    createdAt: updatedAt,
    updatedAt
  }));
  addAchievement(state, "achievement-1");
  notifications.length = 0;

  const calculate = () => state.calculateJobFitAssessment("job-1");
  assert.equal(calculate().score, 0);

  state.createAchievementMapping(completeAchievementMapping(
    "mapping-1",
    "requirement-1",
    "achievement-1"
  ));
  assert.equal(calculate().score, 0);

  state.updateAchievementVerificationStatus(
    "achievement-1",
    "verified",
    updatedAt
  );
  assert.equal(calculate().score, 50);

  state.updateAchievementRecord(
    "achievement-1",
    achievementInput({ title: "Updated achievement" }),
    "2025-06-01T00:00:00.000Z"
  );
  assert.equal(state.getAchievementRecords()[0].verificationStatus, "unverified");
  assert.equal(calculate().score, 0);

  state.updateRequirement("requirement-1", {
    importance: "preferred",
    updatedAt: "2025-06-02T00:00:00.000Z"
  });
  assert.equal(calculate().score, 0);

  state.updateAchievementVerificationStatus(
    "achievement-1",
    "verified",
    "2025-06-03T00:00:00.000Z"
  );
  assert.equal(calculate().score, (1 / 3) * 100);

  state.deleteAchievementMapping("mapping-1");
  assert.equal(calculate().score, 0);
  assert.equal("fitAssessments" in state.getSnapshot(), false);
  assert.equal(notifications.length, 6);
});

test("integrates Job matching lifecycle with verification-aware Fit Assessment", () => {
  const state = createCareerState();
  state.createJob(createJobRecord({
    company: "Example Company",
    roleTitle: "Engineer"
  }, {
    id: "job-1",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Mandatory requirement",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-mandatory",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Preferred requirement",
    category: "skill",
    importance: "preferred"
  }, {
    id: "requirement-preferred",
    createdAt
  }));
  addAchievement(state, "achievement-mandatory", achievementInput({
    title: "Verified achievement"
  }));
  addAchievement(state, "achievement-preferred", achievementInput({
    title: "Unverified achievement"
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-mandatory",
    achievementId: "achievement-mandatory"
  }, {
    id: "mapping-mandatory",
    createdAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-preferred",
    achievementId: "achievement-preferred"
  }, {
    id: "mapping-preferred",
    createdAt
  }));
  state.updateAchievementVerificationStatus(
    "achievement-mandatory",
    "verified",
    updatedAt
  );

  const partialAssessment = state.calculateJobFitAssessment("job-1");
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
  assert.equal(mandatoryResult.status, "supported");
  assert.deepEqual(mandatoryResult.verifiedAchievementIds, ["achievement-mandatory"]);
  assert.deepEqual(mandatoryResult.unverifiedAchievementIds, []);
  assert.equal(preferredResult.status, "unsupported");
  assert.deepEqual(preferredResult.verifiedAchievementIds, []);
  assert.deepEqual(preferredResult.unverifiedAchievementIds, ["achievement-preferred"]);

  state.updateAchievementVerificationStatus(
    "achievement-preferred",
    "verified",
    "2025-05-02T09:15:00.000Z"
  );

  const completeAssessment = state.calculateJobFitAssessment("job-1");

  assert.equal(completeAssessment.status, "assessed");
  assert.equal(completeAssessment.score, 100);
  assert.equal(completeAssessment.supportedRequirementCount, 2);
  assert.equal(completeAssessment.totalRequirementCount, 2);
  assert.equal(completeAssessment.supportedMandatoryCount, 1);
  assert.equal(completeAssessment.totalMandatoryCount, 1);
  assert.deepEqual(
    completeAssessment.requirementResults
      .find(({ requirementId }) => requirementId === "requirement-mandatory")
      .verifiedAchievementIds,
    ["achievement-mandatory"]
  );
  assert.deepEqual(
    completeAssessment.requirementResults
      .find(({ requirementId }) => requirementId === "requirement-preferred")
      .verifiedAchievementIds,
    ["achievement-preferred"]
  );
  assert.deepEqual(
    completeAssessment.requirementResults
      .flatMap(({ unverifiedAchievementIds }) => unverifiedAchievementIds),
    []
  );
});

test("recalculates assessment after Achievement deletion removes mapped evidence", () => {
  const state = createCareerState();
  state.createJob(createJobRecord({
    company: "Example Company",
    roleTitle: "Engineer"
  }, {
    id: "job-1",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Retained mandatory requirement",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-keep",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Requirement losing its evidence",
    category: "skill",
    importance: "preferred"
  }, {
    id: "requirement-delete-evidence",
    createdAt: updatedAt
  }));
  addAchievement(state, "achievement-keep");
  addAchievement(state, "achievement-delete");
  state.updateAchievementVerificationStatus("achievement-keep", "verified", updatedAt);
  state.updateAchievementVerificationStatus("achievement-delete", "verified", updatedAt);
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-keep",
    achievementId: "achievement-keep"
  }, {
    id: "mapping-keep",
    createdAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-delete-evidence",
    achievementId: "achievement-delete"
  }, {
    id: "mapping-delete",
    createdAt
  }));

  assert.equal(state.calculateJobFitAssessment("job-1").score, 100);

  state.deleteAchievementRecord("achievement-delete");

  assert.deepEqual(
    state.getAchievementRecords().map(({ id }) => id),
    ["achievement-keep"]
  );
  assert.deepEqual(
    state.getRequirements("job-1").map(({ id }) => id),
    ["requirement-keep", "requirement-delete-evidence"]
  );
  assert.deepEqual(
    state.getSnapshot().achievementMappings.map(({ id }) => id),
    ["mapping-keep"]
  );

  const assessment = state.calculateJobFitAssessment("job-1");
  const retainedResult = assessment.requirementResults.find(
    ({ requirementId }) => requirementId === "requirement-keep"
  );
  const evidenceRemovedResult = assessment.requirementResults.find(
    ({ requirementId }) => requirementId === "requirement-delete-evidence"
  );

  assert.equal(assessment.score, (2 / 3) * 100);
  assert.equal(assessment.supportedRequirementCount, 1);
  assert.equal(assessment.totalRequirementCount, 2);
  assert.equal(assessment.supportedMandatoryCount, 1);
  assert.equal(assessment.totalMandatoryCount, 1);
  assert.equal(retainedResult.status, "supported");
  assert.deepEqual(retainedResult.verifiedAchievementIds, ["achievement-keep"]);
  assert.equal(evidenceRemovedResult.status, "unsupported");
  assert.deepEqual(evidenceRemovedResult.verifiedAchievementIds, []);
  assert.deepEqual(evidenceRemovedResult.unverifiedAchievementIds, []);
});

test("recalculates assessment after Requirement deletion removes its mappings", () => {
  const state = createCareerState();
  state.createJob(createJobRecord({
    company: "Example Company",
    roleTitle: "Engineer"
  }, {
    id: "job-1",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Deleted mandatory requirement",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-delete",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Remaining mandatory requirement",
    category: "skill",
    importance: "mandatory"
  }, {
    id: "requirement-unsupported",
    createdAt: updatedAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-1",
    description: "Remaining preferred requirement",
    category: "education",
    importance: "preferred"
  }, {
    id: "requirement-supported",
    createdAt: "2025-05-02T09:15:00.000Z"
  }));
  addAchievement(state, "achievement-delete");
  addAchievement(state, "achievement-unsupported");
  addAchievement(state, "achievement-supported");
  state.updateAchievementVerificationStatus("achievement-delete", "verified", updatedAt);
  state.updateAchievementVerificationStatus(
    "achievement-supported",
    "verified",
    updatedAt
  );
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-delete",
    achievementId: "achievement-delete"
  }, {
    id: "mapping-delete",
    createdAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-unsupported",
    achievementId: "achievement-unsupported"
  }, {
    id: "mapping-unsupported",
    createdAt: updatedAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-supported",
    achievementId: "achievement-supported"
  }, {
    id: "mapping-supported",
    createdAt: "2025-05-02T09:15:00.000Z"
  }));

  assert.equal(state.calculateJobFitAssessment("job-1").score, 60);

  state.deleteRequirement("requirement-delete");

  assert.deepEqual(
    state.getRequirements("job-1").map(({ id }) => id),
    ["requirement-unsupported", "requirement-supported"]
  );
  assert.deepEqual(
    state.getSnapshot().achievementMappings.map(({ id }) => id),
    ["mapping-unsupported", "mapping-supported"]
  );
  assert.deepEqual(
    state.getAchievementRecords().map(({ id }) => id),
    ["achievement-delete", "achievement-unsupported", "achievement-supported"]
  );

  const assessment = state.calculateJobFitAssessment("job-1");

  assert.equal(assessment.score, (1 / 3) * 100);
  assert.equal(assessment.supportedRequirementCount, 1);
  assert.equal(assessment.totalRequirementCount, 2);
  assert.equal(assessment.supportedMandatoryCount, 0);
  assert.equal(assessment.totalMandatoryCount, 1);
  assert.deepEqual(
    assessment.requirementResults.map(({ requirementId }) => requirementId),
    ["requirement-unsupported", "requirement-supported"]
  );
  assert.deepEqual(
    assessment.requirementResults
      .flatMap(({ verifiedAchievementIds }) => verifiedAchievementIds),
    ["achievement-supported"]
  );
});

test("recalculates the surviving Job assessment after Job cascade deletion", () => {
  const state = createCareerState();
  state.createJob(createJobRecord({
    company: "Deleted Company",
    roleTitle: "Deleted Role"
  }, {
    id: "job-delete",
    createdAt
  }));
  state.createJob(createJobRecord({
    company: "Retained Company",
    roleTitle: "Retained Role"
  }, {
    id: "job-keep",
    createdAt: updatedAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-delete",
    description: "Deleted Job requirement one",
    category: "experience",
    importance: "mandatory"
  }, {
    id: "requirement-delete-1",
    createdAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-delete",
    description: "Deleted Job requirement two",
    category: "skill",
    importance: "preferred"
  }, {
    id: "requirement-delete-2",
    createdAt: updatedAt
  }));
  state.createRequirement(createRequirementRecord({
    jobId: "job-keep",
    description: "Retained Job requirement",
    category: "education",
    importance: "mandatory"
  }, {
    id: "requirement-keep",
    createdAt: "2025-05-02T09:15:00.000Z"
  }));
  addAchievement(state, "achievement-delete-1");
  addAchievement(state, "achievement-delete-2");
  addAchievement(state, "achievement-keep");
  state.updateAchievementVerificationStatus("achievement-delete-1", "verified", updatedAt);
  state.updateAchievementVerificationStatus("achievement-delete-2", "verified", updatedAt);
  state.updateAchievementVerificationStatus("achievement-keep", "verified", updatedAt);
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-delete-1",
    achievementId: "achievement-delete-1"
  }, {
    id: "mapping-delete-1",
    createdAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-delete-2",
    achievementId: "achievement-delete-2"
  }, {
    id: "mapping-delete-2",
    createdAt: updatedAt
  }));
  state.createAchievementMapping(createAchievementMappingRecord({
    requirementId: "requirement-keep",
    achievementId: "achievement-keep"
  }, {
    id: "mapping-keep",
    createdAt: "2025-05-02T09:15:00.000Z"
  }));

  assert.deepEqual(state.deleteJob("job-delete"), {
    jobId: "job-delete",
    deletedRequirements: 2,
    deletedAchievementMappings: 2
  });

  assert.deepEqual(state.getJobs().map(({ id }) => id), ["job-keep"]);
  assert.deepEqual(
    state.getRequirements("job-keep").map(({ id }) => id),
    ["requirement-keep"]
  );
  assert.deepEqual(
    state.getSnapshot().requirements.map(({ id }) => id),
    ["requirement-keep"]
  );
  assert.deepEqual(
    state.getSnapshot().achievementMappings.map(({ id }) => id),
    ["mapping-keep"]
  );
  assert.deepEqual(
    state.getAchievementRecords().map(({ id }) => id),
    ["achievement-delete-1", "achievement-delete-2", "achievement-keep"]
  );

  const assessment = state.calculateJobFitAssessment("job-keep");

  assert.equal(assessment.status, "assessed");
  assert.equal(assessment.score, 100);
  assert.equal(assessment.supportedRequirementCount, 1);
  assert.equal(assessment.totalRequirementCount, 1);
  assert.equal(assessment.supportedMandatoryCount, 1);
  assert.equal(assessment.totalMandatoryCount, 1);
  assert.deepEqual(
    assessment.requirementResults[0].verifiedAchievementIds,
    ["achievement-keep"]
  );
  assert.throws(
    () => state.calculateJobFitAssessment("job-delete"),
    (error) => error.code === "NOT_FOUND"
      && error.message === 'Job "job-delete" does not exist.'
  );
});

test("failed mutations leave calculated assessment unchanged", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  state.createRequirement(completeRequirement("requirement-1", "job-1"));
  addAchievement(state, "achievement-1");
  state.updateAchievementVerificationStatus("achievement-1", "verified", updatedAt);
  state.createAchievementMapping(completeAchievementMapping(
    "mapping-1",
    "requirement-1",
    "achievement-1"
  ));
  const before = state.calculateJobFitAssessment("job-1");

  assert.throws(
    () => state.updateRequirement("requirement-1", {
      importance: "optional",
      updatedAt
    }),
    (error) => error.code === "VALIDATION_ERROR"
  );
  assert.throws(
    () => state.createAchievementMapping(completeAchievementMapping(
      "duplicate-mapping",
      "requirement-1",
      "achievement-1"
    )),
    (error) => error.code === "DUPLICATE_PAIR"
  );
  assert.deepEqual(state.calculateJobFitAssessment("job-1"), before);
});

test("assessment reads and returned results do not mutate source state", () => {
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1")],
    requirements: [completeRequirement("requirement-1", "job-1")],
    achievementRecords: [
      completeAchievement("achievement-1", { verificationStatus: "verified" })
    ],
    achievementMappings: [
      completeAchievementMapping("mapping-1", "requirement-1", "achievement-1")
    ]
  }));
  const snapshotBeforeCalculation = state.getSnapshot();

  const assessment = state.calculateJobFitAssessment("job-1");
  assessment.requirementResults[0].verifiedAchievementIds.push("injected");
  assessment.requirementResults.push({
    requirementId: "injected",
    status: "supported",
    importance: "mandatory",
    category: "skill",
    verifiedAchievementIds: [],
    unverifiedAchievementIds: []
  });

  assert.deepEqual(state.getSnapshot(), snapshotBeforeCalculation);
  assert.equal("fitAssessments" in state.getSnapshot(), false);
  assert.equal(
    state.calculateJobFitAssessment("job-1").requirementResults.length,
    1
  );
});

test("deletes mappings once without modifying endpoints and rejects missing IDs", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  const snapshot = completeSnapshot({
    jobs: [completeJob("job-1")],
    requirements: [completeRequirement("requirement-1", "job-1")],
    achievementRecords: [completeAchievement("achievement-1", {
      verificationStatus: "verified"
    })],
    achievementMappings: [
      completeAchievementMapping("mapping-1", "requirement-1", "achievement-1")
    ]
  });
  state.restoreSnapshot(snapshot);

  state.deleteAchievementMapping("mapping-1");
  assert.deepEqual(state.getSnapshot().achievementMappings, []);
  assert.deepEqual(state.getRequirements("job-1"), snapshot.requirements);
  assert.deepEqual(state.getAchievementRecords(), snapshot.achievementRecords);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], state.getSnapshot());

  const afterDelete = state.getSnapshot();
  assert.throws(
    () => state.deleteAchievementMapping("missing"),
    (error) => error.code === "NOT_FOUND"
      && /Achievement Mapping "missing" does not exist/.test(error.message)
  );
  assert.deepEqual(state.getSnapshot(), afterDelete);
  assert.equal(notifications.length, 1);
});

test("creates Requirements with validation, safe copies, and duplicate ID protection", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  const requirement = completeRequirement("requirement-1", "job-1");
  const returned = state.createRequirement(requirement);

  assert.deepEqual(returned, requirement);
  assert.notEqual(returned, requirement);
  returned.description = "Changed returned copy";
  requirement.description = "Changed input";
  assert.deepEqual(
    state.getRequirements("job-1"),
    [completeRequirement("requirement-1", "job-1")]
  );

  assert.throws(
    () => state.createRequirement(completeRequirement("requirement-1", "job-1")),
    (error) => error.code === "DUPLICATE_ID"
  );
  assert.throws(
    () => state.createRequirement(completeRequirement("invalid", "job-1", {
      importance: "optional"
    })),
    (error) => error.code === "VALIDATION_ERROR"
      && error.errors.some(({ field }) => field === "importance")
  );
  assert.deepEqual(
    state.getRequirements("job-1"),
    [completeRequirement("requirement-1", "job-1")]
  );
});

test("rejects Requirement creation for a missing Job without mutation", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });

  assert.throws(
    () => state.createRequirement(completeRequirement("requirement-1", "missing")),
    (error) => error.code === "NOT_FOUND"
  );
  assert.deepEqual(state.getSnapshot(), emptySnapshot());
  assert.equal(notifications, 0);
});

test("retrieves Requirements by Job in insertion order with isolated copies", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  state.createJob(completeJob("job-2"));
  const first = completeRequirement("requirement-1", "job-1");
  const otherJob = completeRequirement("requirement-2", "job-2");
  const third = completeRequirement("requirement-3", "job-1", {
    description: "A distinct requirement"
  });
  state.createRequirement(first);
  state.createRequirement(otherJob);
  state.createRequirement(third);

  const retrieved = state.getRequirements("job-1");
  assert.deepEqual(retrieved, [first, third]);
  retrieved[0].description = "Mutated";
  retrieved.push(completeRequirement("injected", "job-1"));
  assert.deepEqual(state.getRequirements("job-1"), [first, third]);
  assert.deepEqual(state.getRequirements("missing"), []);
});

test("partially updates Requirements while preserving immutable and omitted fields", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  state.createRequirement(completeRequirement("requirement-1", "job-1"));

  const updated = state.updateRequirement("requirement-1", {
    description: "Updated requirement",
    updatedAt
  });
  assert.deepEqual(updated, completeRequirement("requirement-1", "job-1", {
    description: "Updated requirement",
    updatedAt
  }));
  assert.equal(updated.id, "requirement-1");
  assert.equal(updated.jobId, "job-1");
  assert.equal(updated.createdAt, createdAt);
  assert.deepEqual(state.getRequirements("job-1"), [updated]);
  updated.description = "Changed returned copy";
  assert.equal(state.getRequirements("job-1")[0].description, "Updated requirement");
});

test("rejects immutable, unknown, and invalid Requirement updates atomically", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1"));
  const requirement = completeRequirement("requirement-1", "job-1");
  state.createRequirement(requirement);
  const before = state.getSnapshot();
  let notifications = 0;
  const observedState = createCareerState({
    onMutation: () => { notifications += 1; }
  });
  observedState.restoreSnapshot(before);

  const invalidUpdates = [
    [{ id: "other", updatedAt }, "IMMUTABLE_FIELD"],
    [{ jobId: "other", updatedAt }, "IMMUTABLE_FIELD"],
    [{ createdAt: updatedAt, updatedAt }, "IMMUTABLE_FIELD"],
    [{ unexpected: true, updatedAt }, "VALIDATION_ERROR"],
    [{ description: " ", updatedAt }, "VALIDATION_ERROR"],
    [{ importance: "optional", updatedAt }, "VALIDATION_ERROR"],
    [{ description: "Changed", updatedAt: "invalid" }, "VALIDATION_ERROR"],
    [{
      description: "Changed",
      updatedAt: "2025-04-20T14:29:59.999Z"
    }, "VALIDATION_ERROR"],
    [null, "VALIDATION_ERROR"]
  ];

  for (const [updates, code] of invalidUpdates) {
    assert.throws(
      () => observedState.updateRequirement("requirement-1", updates),
      (error) => error.code === code
    );
    assert.deepEqual(observedState.getSnapshot(), before);
    assert.equal(notifications, 0);
  }
});

test("Requirement no-op updates preserve timestamp and do not notify", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  state.createJob(completeJob("job-1"));
  state.createRequirement(completeRequirement("requirement-1", "job-1"));
  notifications = 0;

  const result = state.updateRequirement("requirement-1", {
    description: "At least five years of experience building web applications",
    updatedAt
  });

  assert.deepEqual(result, completeRequirement("requirement-1", "job-1"));
  assert.equal(notifications, 0);
  assert.deepEqual(
    state.getRequirements("job-1"),
    [completeRequirement("requirement-1", "job-1")]
  );
});

test("legacy Requirements survive snapshots and mutations without entering CRUD results", () => {
  const legacyRequirements = [
    null,
    "legacy requirement",
    7,
    ["legacy", { detail: "preserved" }],
    { id: "incomplete", jobId: "job-1" }
  ];
  const state = createCareerState();
  state.restoreSnapshot(completeSnapshot({
    jobs: [completeJob("job-1")],
    legacyRequirements
  }));

  assert.deepEqual(state.getSnapshot().legacyRequirements, legacyRequirements);
  assert.deepEqual(state.getRequirements("job-1"), []);

  const returnedSnapshot = state.getSnapshot();
  returnedSnapshot.legacyRequirements[3][1].detail = "mutated copy";
  returnedSnapshot.legacyRequirements.push("injected");
  assert.deepEqual(state.getSnapshot().legacyRequirements, legacyRequirements);

  state.createRequirement(completeRequirement("requirement-1", "job-1"));
  assert.deepEqual(
    state.getRequirements("job-1"),
    [completeRequirement("requirement-1", "job-1")]
  );
  assert.deepEqual(state.getSnapshot().legacyRequirements, legacyRequirements);

  state.updateJob("job-1", {
    notes: "Unrelated mutation",
    updatedAt
  });
  assert.deepEqual(state.getSnapshot().legacyRequirements, legacyRequirements);
});

test("rejects Requirement updates and deletion for missing IDs", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  state.createJob(completeJob("job-1"));
  notifications = 0;
  const before = state.getSnapshot();

  assert.throws(
    () => state.updateRequirement("missing", { description: "Updated", updatedAt }),
    (error) => error.code === "NOT_FOUND"
  );
  assert.throws(
    () => state.deleteRequirement("missing"),
    (error) => error.code === "NOT_FOUND"
  );
  assert.deepEqual(state.getSnapshot(), before);
  assert.equal(notifications, 0);
});

test("archived Jobs retain editable and deletable Requirements", () => {
  const state = createCareerState();
  state.createJob(completeJob("job-1", { status: "archived" }));
  state.createRequirement(completeRequirement("requirement-1", "job-1"));

  const updated = state.updateRequirement("requirement-1", {
    importance: "preferred",
    updatedAt
  });
  assert.equal(updated.importance, "preferred");
  assert.equal(state.deleteRequirement("requirement-1"), undefined);
  assert.deepEqual(state.getRequirements("job-1"), []);
});

test("deletes Requirements and their mappings while preserving other records", () => {
  const testCases = [
    { mappingCount: 0 },
    { mappingCount: 1 },
    { mappingCount: 2 }
  ];

  for (const { mappingCount } of testCases) {
    const targetRequirement = completeRequirement("requirement-1", "job-1");
    const otherRequirement = completeRequirement("requirement-2", "job-1", {
      description: "Keep this requirement"
    });
    const targetMappings = Array.from({ length: mappingCount }, (_, index) => ({
      id: `mapping-${index + 1}`,
      requirementId: targetRequirement.id,
      achievementId: "achievement-1"
    }));
    const otherMappings = [
      {
        id: "mapping-other-requirement",
        requirementId: otherRequirement.id,
        achievementId: "achievement-1"
      },
      {
        id: "mapping-unrelated",
        requirementId: "missing",
        achievementId: "achievement-1"
      },
      {
        id: "mapping-historical"
      }
    ];
    const initialSnapshot = completeSnapshot({
      achievementRecords: [completeAchievement("achievement-1", {
        verificationStatus: "verified"
      })],
      jobs: [completeJob("job-1")],
      requirements: [targetRequirement, otherRequirement],
      achievementMappings: [...targetMappings, ...otherMappings]
    });
    const notifications = [];
    const state = createCareerState({
      onMutation(getSnapshot) {
        notifications.push(getSnapshot());
      }
    });
    state.restoreSnapshot(initialSnapshot);

    assert.equal(state.deleteRequirement(targetRequirement.id), undefined);
    assert.deepEqual(state.getRequirements("job-1"), [otherRequirement]);
    assert.deepEqual(state.getSnapshot().achievementMappings, otherMappings);
    assert.deepEqual(state.getAchievementRecords(), initialSnapshot.achievementRecords);
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications[0], state.getSnapshot());
  }
});

test("deleting an Achievement cascades its mappings atomically and preserves other records", () => {
  const snapshot = completeSnapshot({
    jobs: [completeJob("job-1"), completeJob("job-2")],
    requirements: [
      completeRequirement("requirement-1", "job-1"),
      completeRequirement("requirement-2", "job-2")
    ],
    achievementRecords: [
      completeAchievement("achievement-delete", {
        verificationStatus: "verified"
      }),
      completeAchievement("achievement-keep-verified", {
        verificationStatus: "verified"
      }),
      completeAchievement("achievement-keep-unverified")
    ],
    achievementMappings: [
      completeAchievementMapping("mapping-delete-1", "requirement-1", "achievement-delete"),
      completeAchievementMapping("mapping-keep", "requirement-1", "achievement-keep-verified"),
      completeAchievementMapping("mapping-delete-2", "requirement-2", "achievement-delete"),
      completeAchievementMapping("mapping-orphan-requirement", "missing", "achievement-delete"),
      completeAchievementMapping("mapping-orphan-achievement", "requirement-2", "missing"),
      { id: "mapping-historical" }
    ]
  });
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.restoreSnapshot(snapshot);

  state.deleteAchievementRecord("achievement-delete");

  assert.deepEqual(state.getSnapshot().achievementMappings, [
    snapshot.achievementMappings[1],
    snapshot.achievementMappings[4],
    snapshot.achievementMappings[5]
  ]);
  assert.deepEqual(state.getAchievementRecords(), [
    snapshot.achievementRecords[1],
    snapshot.achievementRecords[2]
  ]);
  assert.deepEqual(state.getSnapshot().requirements, snapshot.requirements);
  assert.deepEqual(state.getJobs(), snapshot.jobs);
  assert.deepEqual(state.getSnapshot(), notifications[0]);
  assert.equal(notifications.length, 1);
  assert.equal(state.getAchievementRecords()[0].verificationStatus, "verified");
  assert.equal(state.getAchievementRecords()[1].verificationStatus, "unverified");

  const afterDelete = state.getSnapshot();
  assert.throws(
    () => state.deleteAchievementRecord("missing"),
    /Achievement record "missing" does not exist/
  );
  assert.deepEqual(state.getSnapshot(), afterDelete);
  assert.equal(notifications.length, 1);
});

test("Achievement deletion preserves Jobs and Requirements with zero or one mapping", () => {
  for (const mappingCount of [0, 1]) {
    const targetAchievementId = "achievement-delete";
    const targetMapping = completeAchievementMapping(
      "mapping-delete",
      "requirement-1",
      targetAchievementId
    );
    const unrelatedMapping = completeAchievementMapping(
      "mapping-keep",
      "requirement-1",
      "achievement-keep"
    );
    const snapshot = completeSnapshot({
      jobs: [completeJob("job-1")],
      requirements: [completeRequirement("requirement-1", "job-1")],
      achievementRecords: [
        completeAchievement(targetAchievementId),
        completeAchievement("achievement-keep")
      ],
      achievementMappings: [
        ...(mappingCount === 1 ? [targetMapping] : []),
        unrelatedMapping
      ]
    });
    const state = createCareerState();
    state.restoreSnapshot(snapshot);

    assert.equal(
      state.getAchievementMappingsForAchievement(targetAchievementId).length,
      mappingCount
    );
    const beforeDeletion = state.getSnapshot();
    state.deleteAchievementRecord(targetAchievementId);

    assert.deepEqual(state.getJobs(), snapshot.jobs);
    assert.deepEqual(state.getSnapshot().requirements, snapshot.requirements);
    assert.deepEqual(state.getAchievementRecords(), [snapshot.achievementRecords[1]]);
    assert.deepEqual(state.getSnapshot().achievementMappings, [unrelatedMapping]);
    assert.notDeepEqual(state.getSnapshot(), beforeDeletion);
  }
});

test("notifies once for each successful Requirement mutation with complete snapshots", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  state.createJob(completeJob("job-1"));
  notifications.length = 0;

  state.createRequirement(completeRequirement("requirement-1", "job-1"));
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], state.getSnapshot());

  state.updateRequirement("requirement-1", {
    importance: "preferred",
    updatedAt
  });
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications[1], state.getSnapshot());

  state.deleteRequirement("requirement-1");
  assert.equal(notifications.length, 3);
  assert.deepEqual(notifications[2], state.getSnapshot());
});

test("notifies once after every successful mutation with the complete snapshot", () => {
  const notifications = [];
  const state = createCareerState({
    onMutation(getSnapshot) {
      notifications.push(getSnapshot());
    }
  });
  const assertNotification = (expectedCount) => {
    assert.equal(notifications.length, expectedCount);
    assert.deepEqual(notifications.at(-1), state.getSnapshot());
  };

  state.createProfile(profileInput(), { id: "profile-1", createdAt });
  assertNotification(1);
  state.updateProfile(profileInput({ fullName: "Updated" }), updatedAt);
  assertNotification(2);
  addEmployment(state, "employment-1");
  assertNotification(3);
  state.updateEmploymentRecord(
    "employment-1",
    employmentInput({ employer: "Updated employer" }),
    updatedAt
  );
  assertNotification(4);
  addAchievement(state, "achievement-1", achievementInput({
    employmentId: "employment-1"
  }));
  assertNotification(5);
  state.updateAchievementRecord("achievement-1", achievementInput({
    title: "Updated achievement",
    employmentId: "employment-1"
  }), updatedAt);
  assertNotification(6);
  state.updateAchievementVerificationStatus("achievement-1", "verified", updatedAt);
  assertNotification(7);
  state.deleteEmploymentRecord("employment-1");
  assertNotification(8);
  assert.equal(notifications[7].achievementRecords[0].employmentId, null);
  assert.equal(notifications[7].achievementRecords[0].verificationStatus, "unverified");
  state.deleteAchievementRecord("achievement-1");
  assertNotification(9);
  assert.deepEqual(notifications[8].achievementRecords, []);
});

test("failed mutations do not notify", () => {
  let notifications = 0;
  const state = createCareerState({ onMutation: () => { notifications += 1; } });
  state.createProfile(profileInput(), { id: "profile-1", createdAt });
  addEmployment(state, "employment-1");
  addAchievement(state, "achievement-1", achievementInput({
    employmentId: "employment-1"
  }));
  notifications = 0;

  const failures = [
    () => state.createProfile(profileInput(), { id: "profile-2", createdAt }),
    () => state.updateProfile(profileInput({ fullName: "" }), updatedAt),
    () => addEmployment(state, "employment-1"),
    () => state.updateEmploymentRecord("missing", employmentInput(), updatedAt),
    () => state.deleteEmploymentRecord("missing"),
    () => addAchievement(state, "achievement-2", achievementInput({
      employmentId: "missing"
    })),
    () => state.updateAchievementRecord("achievement-1", achievementInput({
      employmentId: "missing"
    }), updatedAt),
    () => state.updateAchievementVerificationStatus("achievement-1", "pending", updatedAt),
    () => state.deleteAchievementRecord("missing")
  ];

  for (const fail of failures) {
    assert.throws(fail);
  }
  assert.equal(notifications, 0);
});

test("mutation callback exceptions are reported without changing committed results", () => {
  const notificationError = new Error("notification failed");
  const reportedErrors = [];
  const state = createCareerState({
    onMutation() {
      throw notificationError;
    },
    onMutationError(error) {
      reportedErrors.push(error);
    }
  });

  const result = state.createProfile(profileInput(), { id: "profile-1", createdAt });
  assert.deepEqual(result, completeProfile());
  assert.deepEqual(state.getProfile(), result);
  assert.deepEqual(reportedErrors, [notificationError]);
});

test("mutation error-handler exceptions use console.error and do not escape", () => {
  const reported = [];
  const originalConsoleError = console.error;
  console.error = (...args) => reported.push(args);

  try {
    const state = createCareerState({
      onMutation() {
        throw new Error("notification failed");
      },
      onMutationError() {
        throw new Error("error handler failed");
      }
    });
    const result = state.addEmploymentRecord(employmentInput(), {
      id: "employment-1",
      createdAt
    });

    assert.equal(result.id, "employment-1");
    assert.equal(state.getEmploymentRecords().length, 1);
    assert.equal(reported.length, 1);
    assert.match(reported[0][0], /error handler failed/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("creates only one profile", () => {
  const state = createCareerState();
  const profile = state.createProfile(profileInput(), {
    id: "profile-1",
    createdAt
  });

  assert.equal(profile.id, "profile-1");
  assert.equal(profile.createdAt, createdAt);
  assert.equal(profile.updatedAt, createdAt);
  assert.throws(
    () => state.createProfile(profileInput(), { id: "profile-2", createdAt }),
    /already exists/
  );
  assert.equal(state.getProfile().id, "profile-1");
});

test("updates the profile while preserving its identity and creation time", () => {
  const state = createCareerState();
  state.createProfile(profileInput(), { id: "profile-1", createdAt });

  const updated = state.updateProfile(
    profileInput({ fullName: "Updated name", skills: ["Planning"] }),
    updatedAt
  );

  assert.equal(updated.id, "profile-1");
  assert.equal(updated.createdAt, createdAt);
  assert.equal(updated.updatedAt, updatedAt);
  assert.equal(updated.fullName, "Updated name");
  assert.deepEqual(updated.skills, ["Planning"]);
  assert.deepEqual(state.getProfile(), updated);
});

test("adds multiple employment records", () => {
  const state = createCareerState();
  const first = addEmployment(state, "employment-1");
  const second = addEmployment(state, "employment-2", employmentInput({
    employer: "Another employer",
    isCurrent: false,
    endDate: "2024-12-31"
  }));

  assert.equal(first.id, "employment-1");
  assert.equal(second.id, "employment-2");
  assert.deepEqual(
    state.getEmploymentRecords().map(({ id }) => id),
    ["employment-1", "employment-2"]
  );
});

test("updates one employment record without changing others", () => {
  const state = createCareerState();
  const first = addEmployment(state, "employment-1");
  const second = addEmployment(state, "employment-2", employmentInput({
    employer: "Another employer"
  }));

  const updated = state.updateEmploymentRecord(
    first.id,
    employmentInput({ roleTitle: "Updated role", responsibilities: ["Lead a team"] }),
    updatedAt
  );

  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, createdAt);
  assert.equal(updated.updatedAt, updatedAt);
  assert.equal(updated.roleTitle, "Updated role");
  assert.deepEqual(updated.responsibilities, ["Lead a team"]);
  assert.deepEqual(state.getEmploymentRecords()[1], second);
});

test("deletes one employment record without affecting the others", () => {
  const state = createCareerState();
  addEmployment(state, "employment-1");
  const retained = addEmployment(state, "employment-2", employmentInput({
    employer: "Another employer"
  }));

  state.deleteEmploymentRecord("employment-1");

  assert.deepEqual(state.getEmploymentRecords(), [retained]);
});

test("adds, retrieves, updates, and deletes achievement records", () => {
  const state = createCareerState();
  const first = addAchievement(state, "achievement-1");
  const second = addAchievement(state, "achievement-2", achievementInput({
    title: "Second achievement"
  }));

  assert.equal(first.id, "achievement-1");
  assert.equal(first.createdAt, createdAt);
  assert.equal(first.updatedAt, createdAt);
  assert.deepEqual(state.getAchievementRecords(), [first, second]);

  const updated = state.updateAchievementRecord(
    first.id,
    achievementInput({
      title: "Updated achievement",
      outcome: "Actual result",
      potentialImpact: "Possible benefit"
    }),
    updatedAt
  );

  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.updatedAt, updatedAt);
  assert.equal(updated.title, "Updated achievement");
  assert.deepEqual(state.getAchievementRecords(), [updated, second]);

  state.deleteAchievementRecord(first.id);
  assert.deepEqual(state.getAchievementRecords(), [second]);
});

test("achievement content saves preserve or reset verification based on normalized changes", () => {
  const state = createCareerState();
  const created = addAchievement(state, "achievement-1");
  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);

  const unchanged = state.updateAchievementRecord(
    created.id,
    achievementInput({
      context: "",
      actions: [],
      outcome: "",
      potentialImpact: "",
      metrics: [],
      evidence: [],
      employmentId: null
    }),
    "2025-05-02T09:15:00.000Z"
  );
  assert.equal(unchanged.verificationStatus, "verified");
  assert.equal(unchanged.updatedAt, "2025-05-02T09:15:00.000Z");
  assert.equal(unchanged.id, created.id);
  assert.equal(unchanged.createdAt, createdAt);

  const changed = state.updateAchievementRecord(
    created.id,
    achievementInput({ title: "Changed title" }),
    "2025-05-03T09:15:00.000Z"
  );
  assert.equal(changed.verificationStatus, "unverified");
  assert.equal(changed.updatedAt, "2025-05-03T09:15:00.000Z");

  state.updateAchievementVerificationStatus(created.id, "needs_confirmation", updatedAt);
  const needsConfirmation = state.updateAchievementRecord(
    created.id,
    achievementInput({ contribution: "Changed contribution" }),
    updatedAt
  );
  assert.equal(needsConfirmation.verificationStatus, "needs_confirmation");

  const alreadyUnverified = state.updateAchievementRecord(
    created.id,
    achievementInput({ contribution: "Changed again" }),
    updatedAt
  );
  assert.equal(alreadyUnverified.verificationStatus, "needs_confirmation");

  state.updateAchievementVerificationStatus(created.id, "unverified", updatedAt);
  const stillUnverified = state.updateAchievementRecord(
    created.id,
    achievementInput({ contribution: "Changed while unverified" }),
    updatedAt
  );
  assert.equal(stillUnverified.verificationStatus, "unverified");
});

test("achievement content comparison handles nested objects, arrays, sparse slots, and cycles", () => {
  const state = createCareerState();
  const evidence = [{ detail: "same", nested: { value: 1 } }, ["first", "second"]];
  const metrics = [
    { name: "Metric", value: 1, unit: "items", basis: "measured" },
    { name: "Second metric", value: 2, unit: "items", basis: "estimated" }
  ];
  const created = addAchievement(state, "achievement-1", achievementInput({
    metrics,
    evidence
  }));
  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);

  const reorderedKeys = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [
        { basis: "measured", unit: "items", value: 1, name: "Metric" },
        { basis: "estimated", unit: "items", value: 2, name: "Second metric" }
      ],
      evidence: [{ nested: { value: 1 }, detail: "same" }, ["first", "second"]]
    }),
    updatedAt
  );
  assert.equal(reorderedKeys.verificationStatus, "verified");

  const changedArrayOrder = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics,
      evidence: [{ detail: "same", nested: { value: 1 } }, ["second", "first"]]
    }),
    updatedAt
  );
  assert.equal(changedArrayOrder.verificationStatus, "unverified");

  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);
  const changedMetricOrder = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [...metrics].reverse(),
      evidence: [{ detail: "same", nested: { value: 1 } }, ["second", "first"]]
    }),
    updatedAt
  );
  assert.equal(changedMetricOrder.verificationStatus, "unverified");

  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);
  const sparseNestedArray = [];
  sparseNestedArray.length = 1;
  const sparse = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [...metrics].reverse(),
      evidence: [{ detail: "same", nested: { value: 1 } }, sparseNestedArray]
    }),
    updatedAt
  );
  assert.equal(sparse.verificationStatus, "unverified");

  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);
  const explicitUndefined = [undefined];
  const explicitSlot = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [...metrics].reverse(),
      evidence: [{ detail: "same", nested: { value: 1 } }, explicitUndefined]
    }),
    updatedAt
  );
  assert.equal(explicitSlot.verificationStatus, "unverified");

  const cycleA = { label: "cycle" };
  cycleA.self = cycleA;
  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);
  const cyclic = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [...metrics].reverse(),
      evidence: [{ detail: "same", nested: { value: 1 } }, sparseNestedArray, cycleA]
    }),
    updatedAt
  );
  assert.equal(cyclic.verificationStatus, "unverified");

  state.updateAchievementVerificationStatus(created.id, "verified", updatedAt);
  const cycleB = { label: "cycle" };
  cycleB.self = cycleB;
  const equivalentCycle = state.updateAchievementRecord(
    created.id,
    achievementInput({
      metrics: [...metrics].reverse(),
      evidence: [{ detail: "same", nested: { value: 1 } }, sparseNestedArray, cycleB]
    }),
    updatedAt
  );
  assert.equal(equivalentCycle.verificationStatus, "verified");
});

test("achievement content comparison uses Object.is for primitive evidence values", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1", achievementInput({
    evidence: [0]
  }));
  state.updateAchievementVerificationStatus(existing.id, "verified", updatedAt);

  const updated = state.updateAchievementRecord(
    existing.id,
    achievementInput({ evidence: [-0] }),
    updatedAt
  );
  assert.equal(updated.verificationStatus, "unverified");
});

test("ordinary achievement content input cannot set verification status", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1");

  assert.throws(
    () => state.updateAchievementRecord(
      existing.id,
      achievementInput({ verificationStatus: "verified" }),
      updatedAt
    ),
    /cannot change verificationStatus/
  );
  assert.deepEqual(state.getAchievementRecords(), [existing]);
});

test("updates achievement verification status separately and preserves content", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1", achievementInput({
    evidence: [{ nested: ["preserved"] }]
  }));

  for (const status of ["verified", "needs_confirmation", "unverified"]) {
    const updated = state.updateAchievementVerificationStatus(
      existing.id,
      status,
      updatedAt
    );
    assert.equal(updated.verificationStatus, status);
    assert.equal(updated.id, existing.id);
    assert.equal(updated.createdAt, existing.createdAt);
    assert.equal(updated.updatedAt, updatedAt);
    assert.deepEqual(
      { ...updated, verificationStatus: existing.verificationStatus, updatedAt: existing.updatedAt },
      existing
    );
    assert.deepEqual(state.getAchievementRecords(), [updated]);
  }
});

test("invalid verification status updates leave state unchanged", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1");

  for (const status of ["pending", "", null, 1, false]) {
    assert.throws(
      () => state.updateAchievementVerificationStatus(existing.id, status, updatedAt),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === "verificationStatus")
    );
    assert.deepEqual(state.getAchievementRecords(), [existing]);
  }

  for (const invalidUpdatedAt of ["not-a-timestamp", "2025-04-20T14:29:59.999Z"]) {
    assert.throws(
      () => state.updateAchievementVerificationStatus(
        existing.id,
        "verified",
        invalidUpdatedAt
      ),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === "updatedAt")
    );
    assert.deepEqual(state.getAchievementRecords(), [existing]);
  }

  assert.throws(
    () => state.updateAchievementVerificationStatus("missing", "verified", updatedAt),
    /does not exist/
  );
  assert.deepEqual(state.getAchievementRecords(), [existing]);
});

test("verification status update returns safe copies of nested record data", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1", achievementInput({
    evidence: [{ nested: [{ value: "original" }] }]
  }));

  const updated = state.updateAchievementVerificationStatus(
    existing.id,
    "verified",
    updatedAt
  );
  updated.evidence[0].nested[0].value = "mutated";
  updated.verificationStatus = "unverified";

  assert.deepEqual(state.getAchievementRecords(), [{
    ...existing,
    verificationStatus: "verified",
    updatedAt
  }]);
});

test("achievement updates apply constructor defaults and preserve identity timestamps", () => {
  const state = createCareerState();
  const employment = addEmployment(state, "employment-1");
  const existing = addAchievement(state, "achievement-1", achievementInput({
    context: "Old context",
    actions: ["Old action"],
    outcome: "Old outcome",
    potentialImpact: "Old impact",
    metrics: [{
      name: "Old metric",
      value: 1,
      unit: "items",
      basis: "measured"
    }],
    evidence: [{ reference: "old evidence" }],
    employmentId: employment.id
  }));

  const updated = state.updateAchievementRecord("achievement-1", {
    title: "Updated achievement",
    contribution: "Updated contribution"
  }, updatedAt);

  assert.equal(updated.id, existing.id);
  assert.equal(updated.createdAt, existing.createdAt);
  assert.equal(updated.updatedAt, updatedAt);
  assert.equal(updated.context, "");
  assert.equal(updated.outcome, "");
  assert.equal(updated.potentialImpact, "");
  assert.deepEqual(updated.actions, []);
  assert.deepEqual(updated.metrics, []);
  assert.deepEqual(updated.evidence, []);
  assert.equal(updated.employmentId, null);
  assert.deepEqual(state.getAchievementRecords(), [updated]);
});

test("rejects duplicate achievement IDs and unknown achievement IDs", () => {
  const state = createCareerState();
  addAchievement(state, "achievement-1");

  assert.throws(
    () => addAchievement(state, "achievement-1"),
    /already exists/
  );
  assert.throws(
    () => state.updateAchievementRecord(
      "missing",
      achievementInput(),
      updatedAt
    ),
    /does not exist/
  );
  assert.throws(
    () => state.deleteAchievementRecord("missing"),
    /does not exist/
  );
  assert.equal(state.getAchievementRecords().length, 1);
});

test("achievement updates reject reserved identity and timestamp fields", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1");

  for (const field of ["id", "createdAt", "updatedAt"]) {
    assert.throws(
      () => state.updateAchievementRecord(
        existing.id,
        achievementInput({ [field]: "replacement" }),
        updatedAt
      ),
      new RegExp(`cannot change ${field}`)
    );
    assert.deepEqual(state.getAchievementRecords(), [existing]);
  }
});

test("validates employment links on achievement creation and update", () => {
  const state = createCareerState();
  const employment = addEmployment(state, "employment-1");
  const linked = addAchievement(state, "achievement-1", achievementInput({
    employmentId: employment.id
  }));
  const independent = addAchievement(state, "achievement-2");

  assert.throws(
    () => addAchievement(state, "achievement-3", achievementInput({
      employmentId: "missing-employment"
    })),
    /does not exist/
  );
  assert.throws(
    () => state.updateAchievementRecord(
      linked.id,
      achievementInput({ employmentId: "missing-employment" }),
      updatedAt
    ),
    /does not exist/
  );

  assert.deepEqual(state.getAchievementRecords(), [linked, independent]);
});

test("employment deletion unlinks achievements without changing other content", () => {
  const state = createCareerState();
  addEmployment(state, "employment-1");
  const retainedEmployment = addEmployment(state, "employment-2");
  const linked = addAchievement(state, "achievement-1", achievementInput({
    context: "Context",
    actions: ["Action"],
    outcome: "Outcome",
    potentialImpact: "Potential impact",
    metrics: [{
      name: "Metric",
      value: -3,
      unit: "items",
      period: "Year",
      basis: "estimated"
    }],
    evidence: [{ nested: ["evidence", { detail: "value" }] }],
    employmentId: "employment-1"
  }));
  const independent = addAchievement(state, "achievement-2");
  const before = state.getAchievementRecords();

  state.deleteEmploymentRecord("employment-1");

  const after = state.getAchievementRecords();
  const { employmentId: oldEmploymentId, ...beforeContent } = before[0];
  const { employmentId: newEmploymentId, ...afterContent } = after[0];
  assert.equal(oldEmploymentId, "employment-1");
  assert.equal(newEmploymentId, null);
  assert.deepEqual(afterContent, beforeContent);
  assert.deepEqual(after[1], independent);
  assert.deepEqual(state.getEmploymentRecords(), [retainedEmployment]);
  assert.equal(linked.employmentId, "employment-1");
});

test("employment deletion resets only linked verified achievements and preserves timestamps", () => {
  const state = createCareerState();
  addEmployment(state, "employment-1");
  const statuses = ["verified", "needs_confirmation", "unverified"];
  const before = statuses.map((status, index) => {
    const record = addAchievement(state, `achievement-${index}`, achievementInput({
      title: `Achievement ${index}`,
      evidence: [{ nested: ["value", { index }] }],
      employmentId: "employment-1"
    }));
    return state.updateAchievementVerificationStatus(record.id, status, updatedAt);
  });
  const unlinked = addAchievement(state, "achievement-independent");

  state.deleteEmploymentRecord("employment-1");

  const after = state.getAchievementRecords();
  for (let index = 0; index < statuses.length; index += 1) {
    assert.equal(after[index].employmentId, null);
    assert.equal(
      after[index].verificationStatus,
      statuses[index] === "verified" ? "unverified" : statuses[index]
    );
    assert.equal(after[index].createdAt, before[index].createdAt);
    assert.equal(after[index].updatedAt, before[index].updatedAt);
    const { employmentId: _employmentId, verificationStatus: _status, ...content } = after[index];
    const {
      employmentId: _beforeEmploymentId,
      verificationStatus: _beforeStatus,
      ...beforeContent
    } = before[index];
    assert.deepEqual(content, beforeContent);
  }
  assert.deepEqual(after[statuses.length], unlinked);
  assert.deepEqual(state.getEmploymentRecords(), []);
});

test("invalid achievement input and timestamps leave state unchanged", () => {
  const state = createCareerState();
  const existing = addAchievement(state, "achievement-1");

  for (const invalidInput of [
    { title: " ", contribution: "Changed" },
    { title: "Changed", contribution: "" }
  ]) {
    assert.throws(
      () => state.updateAchievementRecord(existing.id, invalidInput, updatedAt),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === (invalidInput.title === " " ? "title" : "contribution"))
    );
    assert.deepEqual(state.getAchievementRecords(), [existing]);
  }

  for (const invalidUpdatedAt of ["not-a-timestamp", "2025-04-20T14:29:59.999Z"]) {
    assert.throws(
      () => state.updateAchievementRecord(
        existing.id,
        achievementInput({ title: "Changed" }),
        invalidUpdatedAt
      ),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === "updatedAt")
    );
    assert.deepEqual(state.getAchievementRecords(), [existing]);
  }
});

test("returned achievement data cannot mutate nested internal state", () => {
  const state = createCareerState();
  const input = achievementInput({
    actions: ["Action"],
    metrics: [{
      name: "Metric",
      value: 1,
      unit: "items",
      basis: "measured"
    }],
    evidence: [{
      sources: ["report", { details: [{ note: "original" }] }]
    }]
  });
  const created = addAchievement(state, "achievement-1", input);

  created.title = "Changed return value";
  created.actions.push("Changed action");
  created.metrics[0].name = "Changed metric";
  created.evidence[0].sources[1].details[0].note = "Changed evidence";

  const records = state.getAchievementRecords();
  records.push({});
  records[0].actions[0] = "Changed getter";
  records[0].metrics[0].value = 99;
  records[0].evidence[0].sources[1].details.push({ note: "Injected" });

  const returnedAfterUpdate = state.updateAchievementRecord(
    "achievement-1",
    achievementInput({
      actions: ["Updated action"],
      metrics: [{
        name: "Updated metric",
        value: 2,
        unit: "items",
        basis: "measured"
      }],
      evidence: [{
        sources: ["updated", { details: [{ note: "updated evidence" }] }]
      }]
    }),
    updatedAt
  );
  returnedAfterUpdate.metrics[0].name = "Mutated updated result";
  returnedAfterUpdate.evidence[0].sources[1].details[0].note = "Mutated updated result";

  assert.deepEqual(state.getAchievementRecords(), [{
    id: "achievement-1",
    ...achievementInput({
      actions: ["Updated action"],
      metrics: [{
        name: "Updated metric",
        value: 2,
        unit: "items",
        basis: "measured"
      }],
      evidence: [{
        sources: ["updated", { details: [{ note: "updated evidence" }] }]
      }]
    }),
    verificationStatus: "unverified",
    createdAt,
    updatedAt
  }]);
});

test("rejects invalid profile data without changing existing state", () => {
  const state = createCareerState();
  const profile = state.createProfile(profileInput(), { id: "profile-1", createdAt });

  assert.throws(
    () => state.updateProfile(profileInput({ fullName: " " }), updatedAt),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "fullName")
  );
  assert.deepEqual(state.getProfile(), profile);

  const emptyState = createCareerState();
  assert.throws(
    () => emptyState.createProfile(profileInput({ fullName: "" }), {
      id: "profile-2",
      createdAt
    }),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "fullName")
  );
  assert.equal(emptyState.getProfile(), null);
});

test("rejects invalid employment data without changing existing state", () => {
  const state = createCareerState();
  const existing = addEmployment(state, "employment-1");

  assert.throws(
    () => state.addEmploymentRecord(employmentInput({ startDate: "2025-02-30" }), {
      id: "employment-2",
      createdAt
    }),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "startDate")
  );
  assert.throws(
    () => state.updateEmploymentRecord(
      existing.id,
      employmentInput({ endDate: "2019-01-01", isCurrent: false }),
      updatedAt
    ),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "endDate")
  );
  assert.deepEqual(state.getEmploymentRecords(), [existing]);
});

test("rejects impossible employment end dates on create and update", () => {
  const state = createCareerState();
  const existing = addEmployment(state, "employment-1");

  assert.throws(
    () => state.addEmploymentRecord(employmentInput({
      isCurrent: false,
      endDate: "2025-02-30"
    }), {
      id: "employment-2",
      createdAt
    }),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "endDate")
  );
  assert.deepEqual(state.getEmploymentRecords(), [existing]);

  assert.throws(
    () => state.updateEmploymentRecord(
      existing.id,
      employmentInput({ isCurrent: false, endDate: "2025-02-30" }),
      updatedAt
    ),
    (error) => error instanceof TypeError
      && error.errors.some(({ field }) => field === "endDate")
  );
  assert.deepEqual(state.getEmploymentRecords(), [existing]);
});

test("rejects invalid profile update timestamps without changing the profile", () => {
  const state = createCareerState();
  const existing = state.createProfile(
    profileInput({ fullName: "Existing profile", skills: ["Research"] }),
    { id: "profile-1", createdAt }
  );
  const changedInput = profileInput({ fullName: "Changed profile", skills: ["Planning"] });

  for (const invalidUpdatedAt of ["not-a-timestamp", "2025-04-20T14:29:59.999Z"]) {
    assert.throws(
      () => state.updateProfile(changedInput, invalidUpdatedAt),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === "updatedAt")
    );
    assert.deepEqual(state.getProfile(), existing);
  }
});

test("rejects invalid employment update timestamps without changing the record", () => {
  const state = createCareerState();
  const existing = addEmployment(state, "employment-1", employmentInput({
    employer: "Existing employer",
    responsibilities: ["Coordinate"]
  }));
  const changedInput = employmentInput({
    employer: "Changed employer",
    responsibilities: ["Lead a team"]
  });

  for (const invalidUpdatedAt of ["not-a-timestamp", "2025-04-20T14:29:59.999Z"]) {
    assert.throws(
      () => state.updateEmploymentRecord(existing.id, changedInput, invalidUpdatedAt),
      (error) => error instanceof TypeError
        && error.errors.some(({ field }) => field === "updatedAt")
    );
    assert.deepEqual(state.getEmploymentRecords(), [existing]);
  }
});

test("rejects updates and deletes for unknown IDs", () => {
  const state = createCareerState();

  assert.throws(
    () => state.updateProfile(profileInput(), updatedAt),
    /does not exist/
  );
  assert.throws(
    () => state.updateEmploymentRecord("missing", employmentInput(), updatedAt),
    /does not exist/
  );
  assert.throws(() => state.deleteEmploymentRecord("missing"), /does not exist/);
  assert.deepEqual(state.getEmploymentRecords(), []);
});

test("returned records and arrays cannot mutate internal state", () => {
  const state = createCareerState();
  state.createProfile(profileInput({ skills: ["Research"] }), {
    id: "profile-1",
    createdAt
  });
  addEmployment(state, "employment-1", employmentInput({
    responsibilities: ["Coordinate"]
  }));

  const profile = state.getProfile();
  profile.fullName = "Mutated";
  profile.skills.push("Mutated");

  const records = state.getEmploymentRecords();
  records[0].employer = "Mutated";
  records[0].responsibilities.push("Mutated");
  records.push({ id: "injected" });

  const created = state.getEmploymentRecords()[0];
  created.employer = "Mutated again";
  created.responsibilities[0] = "Mutated again";

  assert.equal(state.getProfile().fullName, "Career profile name");
  assert.deepEqual(state.getProfile().skills, ["Research"]);
  assert.equal(state.getEmploymentRecords().length, 1);
  assert.equal(state.getEmploymentRecords()[0].employer, "Employer");
  assert.deepEqual(state.getEmploymentRecords()[0].responsibilities, ["Coordinate"]);
});

test("uses IDs and timestamps supplied by the caller", () => {
  const state = createCareerState();
  const profile = state.createProfile(profileInput(), {
    id: "provided-profile-id",
    createdAt
  });
  const employment = addEmployment(state, "provided-employment-id", employmentInput(), createdAt);
  const achievement = addAchievement(
    state,
    "provided-achievement-id",
    achievementInput(),
    createdAt
  );
  const updatedProfile = state.updateProfile(profileInput(), updatedAt);
  const updatedEmployment = state.updateEmploymentRecord(
    employment.id,
    employmentInput(),
    updatedAt
  );
  const updatedAchievement = state.updateAchievementRecord(
    achievement.id,
    achievementInput(),
    updatedAt
  );

  assert.deepEqual(
    [
      profile.id,
      profile.createdAt,
      employment.id,
      employment.createdAt,
      achievement.id,
      achievement.createdAt
    ],
    [
      "provided-profile-id",
      createdAt,
      "provided-employment-id",
      createdAt,
      "provided-achievement-id",
      createdAt
    ]
  );
  assert.deepEqual(
    [
      updatedProfile.updatedAt,
      updatedEmployment.updatedAt,
      updatedAchievement.updatedAt
    ],
    [updatedAt, updatedAt, updatedAt]
  );
});

test("does not read the clock or generate IDs", () => {
  const OriginalDate = globalThis.Date;
  const originalRandom = Math.random;

  globalThis.Date = class extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) {
        throw new Error("The state module must not read the clock.");
      }

      super(...args);
    }

    static now() {
      throw new Error("The state module must not read the clock.");
    }
  };
  Math.random = () => {
    throw new Error("The state module must not generate IDs.");
  };

  try {
    const state = createCareerState();
    const profile = state.createProfile(profileInput(), {
      id: "provided-profile-id",
      createdAt
    });
    const employment = addEmployment(state, "provided-employment-id");
    const achievement = addAchievement(
      state,
      "provided-achievement-id",
      achievementInput(),
      createdAt
    );
    const updatedAchievement = state.updateAchievementRecord(
      achievement.id,
      achievementInput(),
      updatedAt
    );

    assert.equal(profile.id, "provided-profile-id");
    assert.equal(profile.createdAt, createdAt);
    assert.equal(employment.id, "provided-employment-id");
    assert.equal(employment.createdAt, createdAt);
    assert.equal(achievement.id, "provided-achievement-id");
    assert.equal(achievement.createdAt, createdAt);
    assert.equal(updatedAchievement.updatedAt, updatedAt);
  } finally {
    globalThis.Date = OriginalDate;
    Math.random = originalRandom;
  }
});

test("rejects duplicate employment IDs", () => {
  const state = createCareerState();
  addEmployment(state, "employment-1");

  assert.throws(
    () => addEmployment(state, "employment-1"),
    /already exists/
  );
  assert.equal(state.getEmploymentRecords().length, 1);
});
