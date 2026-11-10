import assert from "node:assert/strict";
import test from "node:test";
import { createSnapshotWriter } from "../src/js/snapshot-writer.js";

function fixture() {
  let snapshot = { values: [], import: { sessions: [], receipts: [] } };
  let snapshotRevision = 0;
  let careerRevision = 0;
  let tail = Promise.resolve();
  let writes = 0;
  const locks = {
    request(name, options, callback) {
      assert.equal(name, "careerpilot.snapshot");
      assert.deepEqual(options, { mode: "exclusive" });
      const next = tail.then(callback);
      tail = next.catch(() => {});
      return next;
    }
  };
  const storage = {
    load: () => ({ status: "loaded", snapshot: structuredClone(snapshot), snapshotRevision, careerRevision }),
    save(value, revisions) {
      writes += 1;
      snapshot = structuredClone(value);
      snapshotRevision = revisions.snapshotRevision;
      careerRevision = revisions.careerRevision;
      return { status: "saved" };
    }
  };
  const makeWriter = (options = {}) => createSnapshotWriter({
    storage,
    locks,
    secureContext: true,
    initialSnapshot: snapshot,
    initialSnapshotRevision: snapshotRevision,
    initialCareerRevision: careerRevision,
    copySnapshot: structuredClone,
    careerData: (value) => value.values,
    ...options
  });
  return { storage, makeWriter, getStored: () => structuredClone(snapshot), getWrites: () => writes };
}

test("writes a detached snapshot and publishes it only after saving", async () => {
  const f = fixture();
  const writer = f.makeWriter();
  const result = await writer.write(0, (snapshot) => {
    snapshot.values.push("first");
    return { snapshot, result: "done" };
  });
  assert.deepEqual(result, { status: "saved", snapshotRevision: 1, careerRevision: 1, result: "done" });
  assert.deepEqual(f.getStored().values, ["first"]);
  const exposed = writer.getSnapshot();
  exposed.values.push("external");
  assert.deepEqual(writer.getSnapshot().values, ["first"]);
});

test("competing writers reject the stale attempt under the same lock", async () => {
  const f = fixture();
  const first = f.makeWriter();
  const second = f.makeWriter();
  const prepare = (value) => (snapshot) => {
    snapshot.values.push(value);
    return { snapshot };
  };
  const results = await Promise.all([
    first.write(0, prepare("first")),
    second.write(0, prepare("second"))
  ]);
  assert.equal(results[0].status, "saved");
  assert.deepEqual(results[1], { status: "stale", snapshotRevision: 1 });
  assert.deepEqual(second.getSnapshot().values, []);
  assert.equal(f.getWrites(), 1);
});

test("unavailable locks and failed writes leave state unchanged", async () => {
  const f = fixture();
  const unavailable = f.makeWriter({ locks: null });
  assert.deepEqual(await unavailable.write(0, () => assert.fail()), {
    status: "coordination-unavailable"
  });
  const insecure = f.makeWriter({ secureContext: false });
  assert.equal((await insecure.write(0, () => assert.fail())).status, "coordination-unavailable");
  const failed = f.makeWriter({
    storage: {
      load: f.storage.load,
      save: () => ({ status: "write-failed" })
    }
  });
  assert.deepEqual(await failed.write(0, (snapshot) => {
    snapshot.values.push("not saved");
    return { snapshot };
  }), { status: "save-failed", cause: "write-failed" });
  assert.deepEqual(failed.getSnapshot().values, []);
  assert.deepEqual(f.getStored().values, []);
  assert.deepEqual(failed.getRevisions(), { snapshotRevision: 0, careerRevision: 0 });
});

test("a preparation exception cannot publish or persist a snapshot", async () => {
  const f = fixture();
  const writer = f.makeWriter();
  await assert.rejects(writer.write(0, (snapshot) => {
    snapshot.values.push("not saved");
    throw new Error("invalid");
  }), /invalid/);
  assert.deepEqual(writer.getSnapshot().values, []);
  assert.deepEqual(f.getStored().values, []);
  assert.equal(f.getWrites(), 0);
});

test("session and receipt changes preserve the career revision bound by approvals", async () => {
  const f = fixture();
  const writer = f.makeWriter();
  const approve = await writer.write(0, (snapshot) => {
    snapshot.import.receipts.push({ careerRevision: 0 });
    return { snapshot };
  });
  assert.deepEqual([approve.snapshotRevision, approve.careerRevision], [1, 0]);
  const session = await writer.write(1, (snapshot) => {
    snapshot.import.sessions.push({ id: "session" });
    return { snapshot };
  });
  assert.deepEqual([session.snapshotRevision, session.careerRevision], [2, 0]);
  assert.equal(writer.getSnapshot().import.receipts[0].careerRevision, session.careerRevision);
  const career = await writer.write(2, (snapshot) => {
    snapshot.values.push("career record");
    return { snapshot };
  });
  assert.deepEqual([career.snapshotRevision, career.careerRevision], [3, 1]);
  assert.notEqual(writer.getSnapshot().import.receipts[0].careerRevision, career.careerRevision);
});

test("no-op does not write or advance revisions; forced migration advances only snapshot revision", async () => {
  const f = fixture();
  const writer = f.makeWriter();
  assert.deepEqual(await writer.write(0, (snapshot) => ({ snapshot })), {
    status: "unchanged", result: undefined
  });
  assert.equal(f.getWrites(), 0);
  const migration = await writer.write(0, (snapshot) => ({ snapshot, forceWrite: true }));
  assert.deepEqual([migration.snapshotRevision, migration.careerRevision], [1, 0]);
  assert.equal(f.getWrites(), 1);
});

test("lock acquisition failure does not read, write, or invoke the operation", async () => {
  const f = fixture();
  const writer = f.makeWriter({
    locks: { request: () => Promise.reject(new Error("lock failed")) },
    storage: {
      load: () => assert.fail("must not read without a lock"),
      save: () => assert.fail("must not write without a lock")
    }
  });
  assert.deepEqual(await writer.write(0, () => assert.fail("must not prepare")), {
    status: "coordination-failed"
  });
  assert.deepEqual(writer.getRevisions(), { snapshotRevision: 0, careerRevision: 0 });
});

test("revision exhaustion fails before saving or publishing", async () => {
  const f = fixture();
  const snapshot = f.getStored();
  const writer = f.makeWriter({
    initialSnapshotRevision: Number.MAX_SAFE_INTEGER,
    initialCareerRevision: 0,
    storage: {
      load: () => ({
        status: "loaded",
        snapshot,
        snapshotRevision: Number.MAX_SAFE_INTEGER,
        careerRevision: 0
      }),
      save: () => assert.fail("must not save on overflow")
    }
  });
  const result = await writer.write(Number.MAX_SAFE_INTEGER, (value) => {
    value.values.push("changed");
    return { snapshot: value };
  });
  assert.equal(result.status, "revision-exhausted");
  assert.deepEqual(writer.getSnapshot(), snapshot);
  assert.deepEqual(writer.getRevisions(), {
    snapshotRevision: Number.MAX_SAFE_INTEGER,
    careerRevision: 0
  });
});
