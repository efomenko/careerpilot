import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationController } from "../src/js/navigation.js";

const views = {
  dashboard: {},
  profile: {},
  employment: {},
  achievements: {}
};

class FakeWindow {
  constructor(initialHash = "#dashboard") {
    this.listeners = new Map();
    this.location = new URL(`https://careerpilot.test/${initialHash}`);
    this.history = new FakeHistory(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ type, ...event });
    }
  }
}

class FakeHistory {
  constructor(window) {
    this.window = window;
    this.entries = [{ href: window.location.href, state: null }];
    this.index = 0;
  }

  get state() {
    return this.entries[this.index].state;
  }

  pushState(state, _title, url) {
    const href = new URL(url, this.window.location.href).href;
    this.entries.splice(this.index + 1);
    this.entries.push({ href, state });
    this.index += 1;
    this.window.location = new URL(href);
  }

  replaceState(state, _title, url) {
    const href = new URL(url, this.window.location.href).href;
    this.entries[this.index] = { href, state };
    this.window.location = new URL(href);
  }

  go(distance) {
    const nextIndex = this.index + distance;
    if (nextIndex < 0 || nextIndex >= this.entries.length) {
      return;
    }

    const previousHash = this.window.location.hash;
    this.index = nextIndex;
    const entry = this.entries[this.index];
    this.window.location = new URL(entry.href);
    this.window.dispatch("popstate", { state: entry.state });
    if (previousHash !== this.window.location.hash) {
      this.window.dispatch("hashchange");
    }
  }
}

function setup(initialHash = "#dashboard") {
  const window = new FakeWindow(initialHash);
  const rendered = [];
  let dialogOpen = false;
  let dirty = false;
  let confirming = false;
  let requestCloseCount = 0;
  let onDiscard;
  let onContinueEditing;

  const dialogManager = {
    isOpen: () => dialogOpen,
    requestClose() {
      requestCloseCount += 1;
      if (!dirty) {
        dialogOpen = false;
        return true;
      }
      confirming = true;
      return true;
    }
  };
  const controller = createNavigationController({
    window,
    dialogManager,
    views,
    navigateTo: (viewName, options = {}) => rendered.push({ viewName, options })
  });
  controller.start();

  return {
    window,
    rendered,
    controller,
    openDialog({ isDirty = false } = {}) {
      dialogOpen = true;
      dirty = isDirty;
      confirming = false;
      controller.dialogOpened();
    },
    continueEditing() {
      confirming = false;
      onContinueEditing?.();
    },
    confirmDiscard() {
      dialogOpen = false;
      confirming = false;
      onDiscard?.();
    },
    setDialogCallbacks({ discard, continueEditing }) {
      onDiscard = discard;
      onContinueEditing = continueEditing;
    },
    get dialogOpen() {
      return dialogOpen;
    },
    get confirming() {
      return confirming;
    },
    get requestCloseCount() {
      return requestCloseCount;
    }
  };
}

test("ordinary navigation and Back/Forward work without an open dialog", () => {
  const state = setup();

  state.controller.navigate("profile");
  state.controller.navigate("achievements");
  assert.deepEqual(
    state.rendered.map(({ viewName }) => viewName),
    ["profile", "achievements"]
  );

  state.window.history.go(-1);
  state.window.history.go(1);

  assert.deepEqual(
    state.rendered.slice(-2).map(({ viewName, options }) => [viewName, options.focusDestination]),
    [["profile", true], ["achievements", true]]
  );
});

test("Back closes a clean dialog and focuses the destination", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.openDialog();

  state.window.history.go(-1);

  assert.equal(state.dialogOpen, false);
  assert.deepEqual(state.rendered.at(-1), {
    viewName: "profile",
    options: { focusDestination: true }
  });
});

test("Forward closes a clean dialog and focuses the destination", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.window.history.go(-1);
  state.openDialog();

  state.window.history.go(1);

  assert.equal(state.dialogOpen, false);
  assert.deepEqual(state.rendered.at(-1), {
    viewName: "profile",
    options: { focusDestination: true }
  });
});

test("dirty Back waits for explicit discard and Continue editing restores the origin", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.setDialogCallbacks({
    continueEditing: () => state.controller.continueEditing(),
    discard: () => state.controller.discardAndNavigate()
  });
  state.openDialog({ isDirty: true });
  const renderedBeforeBack = state.rendered.length;

  state.window.history.go(-1);

  assert.equal(state.confirming, true);
  assert.equal(state.dialogOpen, true);
  assert.equal(state.rendered.length, renderedBeforeBack);
  assert.equal(state.window.location.hash, "#profile");

  state.continueEditing();

  assert.equal(state.dialogOpen, true);
  assert.equal(state.window.location.hash, "#employment");
  assert.equal(state.window.history.index, 2);
  assert.equal(state.rendered.length, renderedBeforeBack);
});

test("confirmed dirty Back navigates once and requests destination focus", async () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.setDialogCallbacks({
    continueEditing: () => state.controller.continueEditing(),
    discard: () => state.controller.discardAndNavigate()
  });
  state.openDialog({ isDirty: true });
  const renderedBeforeBack = state.rendered.length;
  state.window.history.go(-1);

  state.confirmDiscard();
  await Promise.resolve();

  assert.deepEqual(state.rendered.at(-1), {
    viewName: "profile",
    options: { focusDestination: true }
  });
  assert.deepEqual(
    state.rendered.slice(renderedBeforeBack).map(({ viewName }) => viewName),
    ["profile"]
  );
});

test("repeated navigation updates the pending destination without repeating confirmation", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.controller.navigate("achievements");
  state.setDialogCallbacks({
    continueEditing: () => state.controller.continueEditing(),
    discard: () => state.controller.discardAndNavigate()
  });
  state.openDialog({ isDirty: true });

  state.window.history.go(-1);
  state.window.history.go(-1);

  assert.equal(state.confirming, true);
  assert.equal(state.requestCloseCount, 1);
  assert.equal(state.window.location.hash, "#profile");

  state.continueEditing();

  assert.equal(state.window.location.hash, "#achievements");
  assert.equal(state.window.history.index, 3);
  assert.equal(state.rendered.at(-1).viewName, "achievements");
});

test("repeated Back and Forward keeps the latest destination pending", async () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.setDialogCallbacks({
    continueEditing: () => state.controller.continueEditing(),
    discard: () => state.controller.discardAndNavigate()
  });
  state.openDialog({ isDirty: true });

  state.window.history.go(-1);
  state.window.history.go(1);
  assert.equal(state.requestCloseCount, 1);
  assert.equal(state.confirming, true);

  state.confirmDiscard();
  await Promise.resolve();

  assert.deepEqual(state.rendered.at(-1), {
    viewName: "employment",
    options: { focusDestination: true }
  });
  assert.equal(state.window.history.index, 2);
});

test("dirty Forward can be cancelled by returning to the original history entry", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.controller.navigate("employment");
  state.window.history.go(-1);
  state.setDialogCallbacks({
    continueEditing: () => state.controller.continueEditing(),
    discard: () => state.controller.discardAndNavigate()
  });
  state.openDialog({ isDirty: true });
  const renderedBeforeForward = state.rendered.length;

  state.window.history.go(1);

  assert.equal(state.confirming, true);
  assert.equal(state.window.location.hash, "#employment");
  state.continueEditing();

  assert.equal(state.window.location.hash, "#profile");
  assert.equal(state.window.history.index, 1);
  assert.equal(state.rendered.length, renderedBeforeForward);
});

test("unknown hashes fall back to Dashboard during history navigation", () => {
  const state = setup();
  state.controller.navigate("profile");
  state.window.history.pushState({ external: true }, "", "#unknown");
  state.window.history.go(-1);
  state.window.history.go(1);

  assert.equal(state.rendered.at(-1).viewName, "dashboard");
});
