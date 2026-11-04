import assert from "node:assert/strict";
import test from "node:test";
import { createNotifications } from "../src/js/notifications.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.operations = [];
    this._textContent = "";
    this.className = "";
  }

  setAttribute(name, value) {
    this.operations.push(["attribute", name, value]);
    this.attributes.set(name, value);
  }

  set textContent(value) {
    this.operations.push(["text", value]);
    this._textContent = value;
  }

  get textContent() {
    return this._textContent;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  replaceChildren(...children) {
    this.children = children;
    children.forEach((child) => {
      child.parentElement = this;
    });
  }

  append(...children) {
    this.children.push(...children);
    children.forEach((child) => {
      child.parentElement = this;
    });
  }

  querySelector(selector) {
    return this.children.find((child) => `.${child.className}` === selector) ?? null;
  }

  click() {
    for (const listener of this.listeners.get("click") ?? []) {
      listener({ target: this });
    }
  }
}

function createFakeRegion() {
  const region = new FakeElement("div");
  const message = new FakeElement("span");
  message.className = "ordinary-notification__message";
  const dismissButton = new FakeElement("button");
  dismissButton.className = "ordinary-notification__dismiss";
  dismissButton.textContent = "Dismiss";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  region.append(message, dismissButton);
  region.ownerDocument = {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
  return region;
}

function getMessage(region) {
  return region.querySelector(".ordinary-notification__message");
}

function getDismissButton(region) {
  return region.querySelector(".ordinary-notification__dismiss");
}

function assertSemanticsSetBeforeText(message, type, text) {
  const expectedRole = type === "success" ? "status" : "alert";
  const expectedLive = type === "success" ? "polite" : "assertive";
  assert.deepEqual(message.operations, [
    ["attribute", "role", expectedRole],
    ["attribute", "aria-live", expectedLive],
    ["attribute", "aria-atomic", "true"],
    ["text", text]
  ]);
  message.operations.length = 0;
}

function withFakeTimers(callback) {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let nextId = 0;
  const timers = new Map();
  globalThis.setTimeout = (handler, delay) => {
    const id = ++nextId;
    timers.set(id, { handler, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);

  try {
    callback(timers);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
}

test("shows success in a persistent polite live region beside a dismiss button", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const message = getMessage(region);
    const dismissButton = getDismissButton(region);
    const notifications = createNotifications({ region });

    notifications.show("success", "Profile updated.");

    assertSemanticsSetBeforeText(message, "success", "Success: Profile updated.");
    assert.equal(region.hidden, false);
    assert.equal(region.getAttribute("role"), null);
    assert.equal(message.getAttribute("role"), "status");
    assert.equal(message.getAttribute("aria-live"), "polite");
    assert.equal(message.getAttribute("aria-atomic"), "true");
    assert.equal(message.textContent, "Success: Profile updated.");
    assert.equal(message.parentElement, region);
    assert.equal(dismissButton.parentElement, region);
    assert.notEqual(message, dismissButton);
    assert.equal(region.children.length, 2);
    assert.equal(dismissButton.textContent, "Dismiss");
    assert.equal([...timers.values()][0].delay, 4000);
  });
});

test("success semantics are set before success message content", () => {
  const region = createFakeRegion();
  const message = getMessage(region);
  const notifications = createNotifications({ region });
  message.operations.length = 0;

  notifications.show("success", "Done.");

  assertSemanticsSetBeforeText(message, "success", "Success: Done.");
});

test("error semantics are set before error message content", () => {
  const region = createFakeRegion();
  const message = getMessage(region);
  const notifications = createNotifications({ region });
  message.operations.length = 0;

  notifications.show("error", "Needs attention.");

  assertSemanticsSetBeforeText(message, "error", "Error: Needs attention.");
});

test("success-to-error replacement sets new semantics before replacing text", () => {
  const region = createFakeRegion();
  const message = getMessage(region);
  const notifications = createNotifications({ region });
  notifications.show("success", "First.");
  message.operations.length = 0;

  notifications.show("error", "Second.");

  assertSemanticsSetBeforeText(message, "error", "Error: Second.");
});

test("error-to-success replacement sets new semantics before replacing text", () => {
  const region = createFakeRegion();
  const message = getMessage(region);
  const notifications = createNotifications({ region });
  notifications.show("error", "First.");
  message.operations.length = 0;

  notifications.show("success", "Second.");

  assertSemanticsSetBeforeText(message, "success", "Success: Second.");
});

test("message element persists across notifications and only contains the message", () => {
  const region = createFakeRegion();
  const message = getMessage(region);
  const notifications = createNotifications({ region });

  notifications.show("success", "First.");
  notifications.show("error", "Second.");

  assert.equal(getMessage(region), message);
  assert.equal(message.textContent, "Error: Second.");
  assert.equal(message.children.length, 0);
  assert.equal(message.getAttribute("role"), "alert");
  assert.equal(message.getAttribute("aria-live"), "assertive");
  assert.equal(message.getAttribute("aria-atomic"), "true");
  assert.equal(getDismissButton(region).parentElement, region);
});

test("success expiry clears the current notification", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("success", "Done.");
    const timer = [...timers.values()][0];

    timer.handler();

    assert.equal(region.hidden, true);
    assert.equal(region.children.length, 2);
    assert.equal(getMessage(region).textContent, "");
    assert.equal(getMessage(region).getAttribute("role"), null);
  });
});

test("replacing a notification cancels its timer and shows only the latest", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("success", "First.");
    const [oldTimerId] = timers.keys();

    notifications.show("error", "Second.");

    assert.equal(timers.has(oldTimerId), false);
    assert.equal(getMessage(region).getAttribute("role"), "alert");
    assert.equal(getMessage(region).getAttribute("aria-live"), "assertive");
    assert.equal(region.children.length, 2);
    assert.equal(getMessage(region).textContent, "Error: Second.");
  });
});

test("replacing a success cancels its expiry timer", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("success", "First.");
    const [oldTimerId] = timers.keys();

    notifications.show("success", "Second.");

    assert.equal(timers.has(oldTimerId), false);
    assert.equal(timers.size, 1);
    assert.equal(getMessage(region).textContent, "Success: Second.");
  });
});

test("errors persist across success-only navigation clearing", () => {
  withFakeTimers(() => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("error", "Please correct the form.");

    notifications.clearSuccess();

    assert.equal(region.hidden, false);
    assert.equal(getMessage(region).textContent, "Error: Please correct the form.");
    assert.equal(getDismissButton(region).textContent, "Dismiss");
  });
});

test("success-only navigation clearing removes success and its timer", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("success", "Done.");
    const [timerId] = timers.keys();

    notifications.clearSuccess();

    assert.equal(timers.has(timerId), false);
    assert.equal(region.hidden, true);
  });
});

test("dismiss and explicit clear remove the notification and timer", () => {
  withFakeTimers((timers) => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("success", "Done.");
    const [timerId] = timers.keys();

    region.children[1].click();

    assert.equal(timers.has(timerId), false);
    assert.equal(region.hidden, true);
    assert.equal(getMessage(region).textContent, "");

    notifications.show("error", "Still needs attention.");
    notifications.clear();

    assert.equal(region.hidden, true);
    assert.equal(region.children.length, 2);
    assert.equal(getMessage(region).textContent, "");
  });
});

test("persistent dismiss button dismisses the currently displayed replacement", () => {
  withFakeTimers(() => {
    const region = createFakeRegion();
    const notifications = createNotifications({ region });
    notifications.show("error", "First error.");
    const dismissButton = getDismissButton(region);

    notifications.show("error", "Second error.");
    dismissButton.click();

    assert.equal(region.hidden, true);
    assert.equal(getMessage(region).textContent, "");
  });
});

test("rejects unsupported types and invalid notification content", () => {
  const notifications = createNotifications({ region: createFakeRegion() });

  assert.throws(() => notifications.show("warning", "Wait."), RangeError);
  assert.throws(() => notifications.show("error", " "), TypeError);
});
