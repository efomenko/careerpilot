import assert from "node:assert/strict";
import test from "node:test";
import { createCareerPersistence, createPersistenceNotifications } from "../src/js/career-persistence.js";
import { createUiMutationRunner } from "../src/js/ui-mutation.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fakeDocument() {
  const document = new EventTarget();
  const attributes = new Map();
  document.body = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name)
  };
  return document;
}

async function until(predicate) {
  for (let i = 0; i < 100; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Timed out waiting for the UI operation.");
}

function fixture({ delay, secureContext = true, locks } = {}) {
  let raw = null;
  let fail = false;
  const storage = {
    getItem: () => raw,
    setItem(key, value) {
      if (fail) throw new Error("storage failure");
      raw = value;
    }
  };
  const coordinator = locks ?? {
    async request(name, options, callback) {
      if (delay) await delay.promise;
      return callback();
    }
  };
  const persistence = createCareerPersistence(storage, { locks: coordinator, secureContext });
  const document = fakeDocument();
  const messages = [];
  const unexpected = [];
  const notifications = createPersistenceNotifications({
    show: (type, message) => messages.push({ type, message })
  }, persistence);
  const mutationHandler = createUiMutationRunner({
    document,
    onUnexpectedError: (error) => unexpected.push(error)
  });
  const ui = { dialogOpen: true, input: "Edited name", rendered: null, submits: 0 };
  const submit = mutationHandler(async () => {
    ui.submits += 1;
    try {
      const operation = persistence.state.createProfile({
        fullName: ui.input, headline: "", summary: "", skills: []
      }, { id: "profile", createdAt: "2025-01-01T00:00:00.000Z" });
      const profile = await operation;
      ui.dialogOpen = false;
      ui.rendered = profile.fullName;
      await notifications.show("success", "Profile created.", operation);
    } catch (error) {
      await notifications.show("error", error.message);
    }
  });
  return {
    document, persistence, storage, coordinator, messages, unexpected, ui, submit,
    failWrites: () => { fail = true; },
    raw: () => raw
  };
}

function submit(handler) {
  const event = new Event("submit", { cancelable: true });
  handler(event);
  assert.equal(event.defaultPrevented, true);
}

test("pending save blocks duplicate submission and interaction until persisted success", async () => {
  const delay = deferred();
  const f = fixture({ delay });
  submit(f.submit);
  submit(f.submit);
  assert.equal(f.ui.submits, 1);
  assert.equal(f.document.body.getAttribute("aria-busy"), "true");
  assert.equal(f.ui.dialogOpen, true);
  assert.equal(f.ui.rendered, null);
  assert.deepEqual(f.messages, []);
  const click = new Event("click", { cancelable: true });
  f.document.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
  const cancel = new Event("cancel", { cancelable: true });
  f.document.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  delay.resolve();
  await until(() => f.document.body.getAttribute("aria-busy") === null);
  assert.equal(f.ui.dialogOpen, false);
  assert.equal(f.ui.rendered, "Edited name");
  assert.deepEqual(f.messages, [{ type: "success", message: "Profile created." }]);
  assert.equal(JSON.parse(f.raw()).profile.fullName, "Edited name");
  assert.deepEqual(f.unexpected, []);
  const nextClick = new Event("click", { cancelable: true });
  f.document.dispatchEvent(nextClick);
  assert.equal(nextClick.defaultPrevented, false);
});

for (const failure of ["write-failed", "stale", "coordination-unavailable", "coordination-failed"]) {
  test(`${failure} preserves dialog and input and reports an error`, async () => {
    const f = failure === "coordination-unavailable"
      ? fixture({ secureContext: false })
      : failure === "coordination-failed"
        ? fixture({ locks: { request: async () => { throw new Error("lock failed"); } } })
        : fixture();
    if (failure === "write-failed") f.failWrites();
    if (failure === "stale") {
      const other = createCareerPersistence(f.storage, {
        locks: f.coordinator, secureContext: true
      });
      await other.state.createJob({
        id: "job", company: "Company", roleTitle: "Role", description: "", sourceUrl: "",
        notes: "", status: "active", createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z"
      });
    }
    const before = f.raw();
    submit(f.submit);
    await until(() => f.document.body.getAttribute("aria-busy") === null);
    assert.equal(f.ui.dialogOpen, true);
    assert.equal(f.ui.input, "Edited name");
    assert.equal(f.ui.rendered, null);
    assert.equal(f.raw(), before);
    assert.equal(f.persistence.state.getProfile(), null);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].type, "error");
    assert.match(f.messages[0].message, new RegExp(failure === "write-failed" ? "save-failed" : failure));
    assert.deepEqual(f.unexpected, []);
  });
}

test("unexpected rejected handler is reported, unlocks the UI, and permits retry", async () => {
  const f = fixture();
  const handler = createUiMutationRunner({
    document: f.document,
    onUnexpectedError: (error) => f.unexpected.push(error)
  })(async () => { throw new Error("unexpected"); });
  submit(handler);
  await until(() => f.document.body.getAttribute("aria-busy") === null);
  assert.match(f.unexpected[0].message, /unexpected/);
  submit(f.submit);
  await until(() => f.document.body.getAttribute("aria-busy") === null);
  assert.equal(f.ui.dialogOpen, false);
  assert.equal(f.messages[0].type, "success");
});
