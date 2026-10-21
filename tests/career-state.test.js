import assert from "node:assert/strict";
import test from "node:test";
import { createCareerState } from "../src/js/career-state.js";

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

function addEmployment(state, id, input = employmentInput(), timestamp = createdAt) {
  return state.addEmploymentRecord(input, { id, createdAt: timestamp });
}

test("initializes empty profile and employment state", () => {
  const state = createCareerState();

  assert.equal(state.getProfile(), null);
  assert.deepEqual(state.getEmploymentRecords(), []);
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
  const updatedProfile = state.updateProfile(profileInput(), updatedAt);
  const updatedEmployment = state.updateEmploymentRecord(
    employment.id,
    employmentInput(),
    updatedAt
  );

  assert.deepEqual(
    [profile.id, profile.createdAt, employment.id, employment.createdAt],
    ["provided-profile-id", createdAt, "provided-employment-id", createdAt]
  );
  assert.deepEqual(
    [updatedProfile.updatedAt, updatedEmployment.updatedAt],
    [updatedAt, updatedAt]
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

    assert.equal(profile.id, "provided-profile-id");
    assert.equal(profile.createdAt, createdAt);
    assert.equal(employment.id, "provided-employment-id");
    assert.equal(employment.createdAt, createdAt);
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
