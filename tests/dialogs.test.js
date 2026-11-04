import assert from "node:assert/strict";
import test from "node:test";
import { createDialogManager } from "../src/js/dialogs.js";

class FakeElement {
  constructor(document, {
    tagName = "div",
    tabIndex = -1,
    type = "",
    name = "",
    checked = false,
    form = null,
    treeRoot = null
  } = {}) {
    this.ownerDocument = document;
    this.isConnected = true;
    this.listeners = new Map();
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.hidden = false;
    this.inert = false;
    this.disabled = false;
    this.tabIndex = tabIndex;
    this.tagName = tagName.toUpperCase();
    this.type = type;
    this.name = name;
    this.checked = checked;
    this.form = form;
    this.treeRoot = treeRoot;
    this.focusCount = 0;
  }

  get nextSibling() {
    if (!this.parentNode) {
      return null;
    }
    const siblings = this.parentNode.children;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parentNode = null;
      this.parentElement = null;
    }
  }

  append(...elements) {
    elements.forEach((element) => {
      element.remove();
      element.parentNode = this;
      element.parentElement = this;
      this.children.push(element);
    });
  }

  insertBefore(element, reference) {
    element.remove();
    const index = reference ? this.children.indexOf(reference) : -1;
    element.parentNode = this;
    element.parentElement = this;
    if (index === -1) {
      this.children.push(element);
    } else {
      this.children.splice(index, 0, element);
    }
  }

  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }

  click() {
    for (const listener of this.listeners.get("click") ?? []) {
      listener({ target: this });
    }
  }

  contains(element) {
    return this.children.some((child) =>
      child === element || child.contains(element)
    );
  }

  getRootNode() {
    if (this.treeRoot) {
      return this.treeRoot;
    }

    let root = this;
    while (root.parentNode) {
      root = root.parentNode;
    }
    return root;
  }

  matches(selector) {
    return selector === ":disabled" && this.disabled;
  }

  querySelectorAll() {
    const descendants = [];
    const collect = (parent) => {
      parent.children.forEach((child) => {
        descendants.push(child);
        collect(child);
      });
    };
    collect(this);
    return descendants.filter((element) => element.tabIndex >= 0);
  }
}

class FakeDialog extends FakeElement {
  constructor(document) {
    super(document);
    this.open = false;
    this.showModalCount = 0;
    this.closeCount = 0;
  }

  showModal() {
    if (this.open) {
      throw new Error("Dialog is already open.");
    }
    this.open = true;
    this.showModalCount += 1;
  }

  close() {
    this.open = false;
    this.closeCount += 1;
  }

  cancel() {
    let prevented = false;
    for (const listener of this.listeners.get("cancel") ?? []) {
      listener({
        preventDefault() {
          prevented = true;
        }
      });
    }
    return prevented;
  }
}

function setup() {
  const document = {
    activeElement: null,
    listeners: new Map(),
    defaultView: {
      getComputedStyle(element) {
        return element.computedStyle ?? {
          display: "block",
          visibility: "visible"
        };
      }
    },
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    },
    dispatchKeydown({ key = "Tab", shiftKey = false } = {}) {
      let prevented = false;
      for (const listener of this.listeners.get("keydown") ?? []) {
        listener({
          key,
          shiftKey,
          preventDefault() {
            prevented = true;
          }
        });
      }
      return prevented;
    }
  };
  const host = new FakeElement(document);
  const activeDialog = new FakeDialog(document);
  const featureContent = new FakeElement(document);
  const initialFocus = new FakeElement(document, { tagName: "input", tabIndex: 0 });
  const secondFeatureControl = new FakeElement(document, { tagName: "button", tabIndex: 0 });
  const lastFeatureControl = new FakeElement(document, { tagName: "button", tabIndex: 0 });
  const discardDialog = new FakeElement(document);
  discardDialog.hidden = true;
  const continueEditingButton = new FakeElement(document, { tagName: "button", tabIndex: 0 });
  const discardChangesButton = new FakeElement(document, { tagName: "button", tabIndex: 0 });
  const invoker = new FakeElement(document);
  const fallbackFocus = new FakeElement(document);

  featureContent.append(initialFocus, secondFeatureControl, lastFeatureControl);
  activeDialog.append(featureContent);
  discardDialog.append(continueEditingButton, discardChangesButton);
  host.append(discardDialog);

  const manager = createDialogManager({
    discardDialog,
    continueEditingButton,
    discardChangesButton,
    fallbackFocus
  });

  return {
    manager,
    document,
    host,
    activeDialog,
    featureContent,
    initialFocus,
    secondFeatureControl,
    lastFeatureControl,
    discardDialog,
    continueEditingButton,
    discardChangesButton,
    invoker,
    fallbackFocus
  };
}

function openDialog(state, options = {}) {
  state.manager.open(state.activeDialog, {
    invoker: state.invoker,
    initialFocus: state.initialFocus,
    isDirty: () => false,
    ...options
  });
}

function replaceFeatureControls(state, controls) {
  [...state.featureContent.children].forEach((child) => child.remove());
  state.featureContent.append(...controls);
}

function radio(state, options = {}) {
  return new FakeElement(state.document, {
    tagName: "input",
    type: "radio",
    tabIndex: 0,
    ...options
  });
}

test("opens one native dialog and initializes focus", () => {
  const state = setup();
  openDialog(state);

  assert.equal(state.activeDialog.showModalCount, 1);
  assert.equal(state.activeDialog.open, true);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(state.document.activeElement, state.initialFocus);
  assert.equal(state.manager.isOpen(), true);
  assert.throws(() => openDialog(state), /already active/);
});

test("clean Escape and Cancel close immediately and restore focus", () => {
  const state = setup();
  openDialog(state);

  assert.equal(state.activeDialog.cancel(), true);
  assert.equal(state.activeDialog.open, false);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(state.discardDialog.hidden, true);
  assert.equal(state.document.activeElement, state.invoker);
  assert.equal(state.manager.isOpen(), false);
});

test("dirty Escape displays confirmation inside the same modal", () => {
  const state = setup();
  openDialog(state, { isDirty: () => true });

  assert.equal(state.activeDialog.cancel(), true);
  assert.equal(state.activeDialog.showModalCount, 1);
  assert.equal(state.activeDialog.open, true);
  assert.equal(state.discardDialog.parentNode, state.activeDialog);
  assert.equal(state.discardDialog.hidden, false);
  assert.equal(state.featureContent.hidden, true);
  assert.equal(state.document.activeElement, state.continueEditingButton);
});

test("dirty Cancel uses the same internal confirmation state", () => {
  const state = setup();
  openDialog(state, { isDirty: () => true });

  assert.equal(state.manager.requestClose(), true);
  assert.equal(state.activeDialog.showModalCount, 1);
  assert.equal(state.activeDialog.open, true);
  assert.equal(state.discardDialog.parentNode, state.activeDialog);
  assert.equal(state.document.activeElement, state.continueEditingButton);
});

test("Continue editing restores feature content and previously focused control", () => {
  const state = setup();
  let continueCount = 0;
  openDialog(state, {
    isDirty: () => true,
    onContinueEditing() {
      continueCount += 1;
    }
  });
  state.secondFeatureControl.focus();
  state.manager.requestClose();

  state.continueEditingButton.click();

  assert.equal(state.activeDialog.open, true);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(state.discardDialog.hidden, true);
  assert.equal(state.featureContent.hidden, false);
  assert.equal(state.document.activeElement, state.secondFeatureControl);
  assert.equal(state.manager.isOpen(), true);
  assert.equal(continueCount, 1);
});

test("Escape from confirmation returns to feature state without discarding", () => {
  const state = setup();
  let continueCount = 0;
  openDialog(state, {
    isDirty: () => true,
    onContinueEditing() {
      continueCount += 1;
    }
  });
  state.secondFeatureControl.focus();
  state.manager.requestClose();

  assert.equal(state.activeDialog.cancel(), true);

  assert.equal(state.activeDialog.open, true);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(state.featureContent.hidden, false);
  assert.equal(state.document.activeElement, state.secondFeatureControl);
  assert.equal(continueCount, 1);
});

test("discard closes the single modal and invokes onDiscard exactly once", () => {
  const state = setup();
  let discardCount = 0;
  openDialog(state, {
    isDirty: () => true,
    onDiscard() {
      discardCount += 1;
    }
  });
  state.manager.requestClose();

  state.discardChangesButton.click();
  state.discardChangesButton.click();

  assert.equal(state.activeDialog.open, false);
  assert.equal(state.activeDialog.closeCount, 1);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(state.featureContent.hidden, false);
  assert.equal(discardCount, 1);
  assert.equal(state.document.activeElement, state.invoker);
  assert.equal(state.manager.isOpen(), false);
});

test("successful mutation closes without confirmation or discard callback", () => {
  const state = setup();
  let discardCount = 0;
  openDialog(state, {
    isDirty: () => true,
    onDiscard() {
      discardCount += 1;
    }
  });

  assert.equal(state.manager.closeAfterMutation(), true);
  assert.equal(state.activeDialog.open, false);
  assert.equal(state.activeDialog.closeCount, 1);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(discardCount, 0);
  assert.equal(state.document.activeElement, state.invoker);
});

test("successful mutation while confirming closes without invoking discard", () => {
  const state = setup();
  let discardCount = 0;
  openDialog(state, {
    isDirty: () => true,
    onDiscard() {
      discardCount += 1;
    }
  });
  state.manager.requestClose();

  state.manager.closeAfterMutation();

  assert.equal(state.activeDialog.open, false);
  assert.equal(state.discardDialog.parentNode, state.host);
  assert.equal(discardCount, 0);
  assert.equal(state.document.activeElement, state.invoker);
});

test("focus falls back when the invoking element no longer exists", () => {
  const state = setup();
  openDialog(state);
  state.invoker.isConnected = false;

  state.manager.closeAfterMutation();

  assert.equal(state.document.activeElement, state.fallbackFocus);
});

test("Tab wraps from the last focusable feature control to the first", () => {
  const state = setup();
  openDialog(state);
  state.lastFeatureControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, state.initialFocus);
});

test("Shift+Tab wraps from the first feature control to the last", () => {
  const state = setup();
  openDialog(state);
  state.initialFocus.focus();

  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, state.lastFeatureControl);
});

test("normal Tab navigation between intermediate controls is not intercepted", () => {
  const state = setup();
  openDialog(state);
  state.secondFeatureControl.focus();

  assert.equal(state.document.dispatchKeydown(), false);
  assert.equal(state.document.activeElement, state.secondFeatureControl);
});

test("Tab from outside the focusable sequence moves to the first control", () => {
  const state = setup();
  const outsideControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  openDialog(state);
  outsideControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, state.initialFocus);
});

test("Shift+Tab from outside the focusable sequence moves to the last control", () => {
  const state = setup();
  const outsideControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  openDialog(state);
  outsideControl.focus();

  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, state.lastFeatureControl);
});

test("focus candidates follow DOM order without positive tabindex sorting", () => {
  const state = setup();
  const firstControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  const unusualTabIndexControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 4
  });
  const lastControl = new FakeElement(state.document, { tagName: "input", tabIndex: 0 });
  replaceFeatureControls(state, [firstControl, unusualTabIndexControl, lastControl]);
  openDialog(state);

  firstControl.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, lastControl);
});

test("native default-tabindex controls follow DOM order", () => {
  const state = setup();
  const first = new FakeElement(state.document, { tagName: "input", tabIndex: 0 });
  const second = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  const third = new FakeElement(state.document, { tagName: "textarea", tabIndex: 0 });
  replaceFeatureControls(state, [first, second, third]);
  openDialog(state);

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, first);
  third.focus();
  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, first);
});

test("checked eligible radio is the group's single Tab stop", () => {
  const state = setup();
  const uncheckedRadio = radio(state, { name: "choice" });
  const checkedRadio = radio(state, { name: "choice", checked: true });
  const ordinaryControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  replaceFeatureControls(state, [uncheckedRadio, checkedRadio, ordinaryControl]);
  openDialog(state);
  ordinaryControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, checkedRadio);
  uncheckedRadio.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, ordinaryControl);
});

test("unchecked radio group uses its first eligible radio", () => {
  const state = setup();
  const firstRadio = radio(state, { name: "choice" });
  const secondRadio = radio(state, { name: "choice" });
  const ordinaryControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  replaceFeatureControls(state, [firstRadio, secondRadio, ordinaryControl]);
  openDialog(state);
  ordinaryControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, firstRadio);
  secondRadio.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, ordinaryControl);
});

test("checked disabled radio is skipped in favor of an eligible group member", () => {
  const state = setup();
  const disabledChecked = radio(state, { name: "choice", checked: true });
  const enabledRadio = radio(state, { name: "choice" });
  const ordinaryControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  disabledChecked.disabled = true;
  replaceFeatureControls(state, [disabledChecked, enabledRadio, ordinaryControl]);
  openDialog(state);
  ordinaryControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, enabledRadio);
});

test("disabled radio in an unchecked group is not retained", () => {
  const state = setup();
  const disabledRadio = radio(state, { name: "choice" });
  const enabledRadio = radio(state, { name: "choice" });
  const ordinaryControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  disabledRadio.disabled = true;
  replaceFeatureControls(state, [disabledRadio, enabledRadio, ordinaryControl]);
  openDialog(state);
  ordinaryControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, enabledRadio);
});

test("radio groups with different form owners remain independent", () => {
  const state = setup();
  const firstForm = {};
  const secondForm = {};
  const firstGroup = radio(state, { name: "choice", form: firstForm });
  const secondGroup = radio(state, { name: "choice", form: secondForm, checked: true });
  replaceFeatureControls(state, [firstGroup, secondGroup]);
  openDialog(state);

  secondGroup.focus();
  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, firstGroup);
  firstGroup.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, secondGroup);
});

test("radio groups in different trees remain independent", () => {
  const state = setup();
  const firstGroup = radio(state, {
    name: "choice",
    form: null,
    treeRoot: {}
  });
  const secondGroup = radio(state, {
    name: "choice",
    form: null,
    treeRoot: {}
  });
  replaceFeatureControls(state, [firstGroup, secondGroup]);
  openDialog(state);

  secondGroup.focus();
  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, firstGroup);
  firstGroup.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, secondGroup);
});

test("multiple named radio groups remain independent and wrap with ordinary controls", () => {
  const state = setup();
  const firstGroupRadio = radio(state, { name: "first" });
  const firstGroupSibling = radio(state, { name: "first" });
  const secondGroupRadio = radio(state, { name: "second" });
  const secondGroupSibling = radio(state, { name: "second" });
  const ordinaryControl = new FakeElement(state.document, { tagName: "button", tabIndex: 0 });
  replaceFeatureControls(state, [
    firstGroupRadio,
    firstGroupSibling,
    ordinaryControl,
    secondGroupRadio,
    secondGroupSibling
  ]);
  openDialog(state);

  secondGroupRadio.focus();
  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, firstGroupRadio);
  secondGroupSibling.focus();
  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, secondGroupRadio);
  ordinaryControl.focus();
  assert.equal(state.document.dispatchKeydown(), false);
  assert.equal(state.document.activeElement, ordinaryControl);
});

test("hidden and disabled controls are excluded from the focus sequence", () => {
  const state = setup();
  const hiddenAncestor = new FakeElement(state.document);
  const hiddenControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  const cssHiddenControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  const disabledControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  hiddenAncestor.hidden = true;
  hiddenAncestor.append(hiddenControl);
  cssHiddenControl.computedStyle = {
    display: "block",
    visibility: "visible"
  };
  const cssHiddenAncestor = new FakeElement(state.document);
  cssHiddenAncestor.computedStyle = {
    display: "none",
    visibility: "visible"
  };
  cssHiddenAncestor.append(cssHiddenControl);
  disabledControl.disabled = true;
  state.featureContent.append(hiddenAncestor, cssHiddenAncestor, disabledControl);
  openDialog(state);
  state.initialFocus.focus();

  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, state.lastFeatureControl);
});

test("focus sequence is recalculated when switching to discard confirmation", () => {
  const state = setup();
  openDialog(state, { isDirty: () => true });
  state.manager.requestClose();

  assert.equal(state.document.activeElement, state.continueEditingButton);
  assert.equal(state.document.dispatchKeydown(), false);
  state.discardChangesButton.focus();
  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, state.continueEditingButton);

  assert.equal(state.document.dispatchKeydown({ shiftKey: true }), true);
  assert.equal(state.document.activeElement, state.discardChangesButton);
});

test("Tab from outside the confirmation sequence moves to its first control", () => {
  const state = setup();
  const outsideControl = new FakeElement(state.document, {
    tagName: "button",
    tabIndex: 0
  });
  openDialog(state, { isDirty: () => true });
  state.manager.requestClose();
  outsideControl.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, state.continueEditingButton);
});

test("focus is held on the dialog when the active state has no focusable controls", () => {
  const state = setup();
  const noControlsDialog = new FakeDialog(state.document);
  openDialog(state, {
    isDirty: () => true
  });
  state.manager.closeAfterMutation();
  state.manager.open(noControlsDialog, {
    invoker: state.invoker,
    initialFocus: noControlsDialog,
    isDirty: () => false
  });
  noControlsDialog.querySelectorAll = () => [];
  noControlsDialog.focus();

  assert.equal(state.document.dispatchKeydown(), true);
  assert.equal(state.document.activeElement, noControlsDialog);
});
