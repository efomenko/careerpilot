function assertDialog(dialog, label) {
  if (
    !dialog
    || typeof dialog.showModal !== "function"
    || typeof dialog.close !== "function"
    || typeof dialog.addEventListener !== "function"
    || typeof dialog.focus !== "function"
    || !dialog.ownerDocument
    || typeof dialog.ownerDocument.addEventListener !== "function"
    || typeof dialog.ownerDocument.removeEventListener !== "function"
    || typeof dialog.querySelectorAll !== "function"
  ) {
    throw new TypeError(`${label} must be a native dialog element.`);
  }
}

function assertFocusable(element, label) {
  if (!element || typeof element.focus !== "function") {
    throw new TypeError(`${label} must be a focusable element.`);
  }
}

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "iframe",
  "object",
  "embed",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]"
].join(",");

export function createDialogManager({
  discardDialog,
  continueEditingButton,
  discardChangesButton,
  fallbackFocus
} = {}) {
  if (
    !discardDialog
    || typeof discardDialog.focus !== "function"
    || typeof discardDialog.addEventListener !== "function"
    || !discardDialog.parentNode
  ) {
    throw new TypeError("discardDialog must be a confirmation panel in the document.");
  }
  assertFocusable(continueEditingButton, "continueEditingButton");
  assertFocusable(discardChangesButton, "discardChangesButton");
  assertFocusable(fallbackFocus, "fallbackFocus");

  const discardDialogParent = discardDialog.parentNode;
  const discardDialogNextSibling = discardDialog.nextSibling;
  let active = null;
  let confirmationReturnFocus = null;
  let hiddenFeatureChildren = null;

  function focusAfterClose(invoker) {
    const target = invoker?.isConnected !== false ? invoker : fallbackFocus;
    target.focus();
  }

  function isAvailableForSequentialFocus(element, dialog) {
    if (
      element.isConnected === false
      || element.disabled
      || element.tabIndex < 0
      || element.matches?.(":disabled")
    ) {
      return false;
    }

    const view = element.ownerDocument?.defaultView;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hidden || ancestor.inert) {
        return false;
      }
      if (typeof view?.getComputedStyle === "function") {
        const style = view.getComputedStyle(ancestor);
        if (
          style.display === "none"
          || style.visibility === "hidden"
          || style.visibility === "collapse"
        ) {
          return false;
        }
      }
      if (ancestor === dialog) {
        break;
      }
    }

    return true;
  }

  function getFocusableElements(dialog) {
    const candidates = [...dialog.querySelectorAll(focusableSelector)]
      .filter((element) => isAvailableForSequentialFocus(element, dialog));
    const radioGroups = [];
    const orderedCandidates = [];

    candidates.forEach((element) => {
      if (element.tagName !== "INPUT" || element.type !== "radio" || !element.name) {
        orderedCandidates.push({ element });
        return;
      }

      const root = element.getRootNode();
      const form = element.form;
      let group = radioGroups.find((candidate) =>
        candidate.root === root
        && candidate.form === form
        && candidate.name === element.name
      );

      if (!group) {
        group = {
          root,
          form,
          name: element.name,
          radios: [],
          entry: { element: null }
        };
        radioGroups.push(group);
        orderedCandidates.push(group.entry);
      }
      group.radios.push(element);
    });

    radioGroups.forEach((group) => {
      group.entry.element = group.radios.find((element) => element.checked)
        ?? group.radios[0];
    });

    return orderedCandidates.map(({ element }) => element);
  }

  function handleTab(event) {
    if (!active || event.key !== "Tab" || !active.dialog.open) {
      return;
    }

    const focusableElements = getFocusableElements(active.dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      active.dialog.focus();
      return;
    }

    const currentIndex = focusableElements.indexOf(active.dialog.ownerDocument.activeElement);
    if (currentIndex === -1) {
      event.preventDefault();
      (event.shiftKey ? focusableElements.at(-1) : focusableElements[0]).focus();
      return;
    }

    if (event.shiftKey && currentIndex === 0) {
      event.preventDefault();
      focusableElements.at(-1).focus();
    } else if (!event.shiftKey && currentIndex === focusableElements.length - 1) {
      event.preventDefault();
      focusableElements[0].focus();
    }
  }

  function restoreConfirmationPanel() {
    if (discardDialog.parentNode !== discardDialogParent) {
      const nextSibling = discardDialogNextSibling?.parentNode === discardDialogParent
        ? discardDialogNextSibling
        : null;
      discardDialogParent.insertBefore(discardDialog, nextSibling);
    }
    discardDialog.hidden = true;
  }

  function restoreFeatureState(current = active) {
    if (!current?.confirming) {
      return;
    }

    restoreConfirmationPanel();
    hiddenFeatureChildren.forEach(({ element, wasHidden }) => {
      element.hidden = wasHidden;
    });
    hiddenFeatureChildren = null;
    current.confirming = false;
  }

  function closeActiveDialog({ discard = false } = {}) {
    if (!active) {
      return false;
    }

    const current = active;
    if (current.confirming) {
      restoreFeatureState(current);
    }
    active = null;
    confirmationReturnFocus = null;
    current.dialog.removeEventListener("cancel", current.handleCancel);
    current.dialog.ownerDocument.removeEventListener("keydown", handleTab, true);

    if (current.dialog.open) {
      current.dialog.close();
    }

    try {
      if (discard) {
        current.onDiscard?.();
      }
    } finally {
      focusAfterClose(current.invoker);
    }
    return true;
  }

  function returnFocusToFeatureState() {
    if (!active) {
      return;
    }

    const target = confirmationReturnFocus;
    confirmationReturnFocus = null;
    if (target?.isConnected !== false && active.dialog.contains(target)) {
      target.focus();
    } else if (active.initialFocus?.isConnected !== false) {
      active.initialFocus.focus();
    } else {
      active.dialog.focus();
    }
  }

  function showDiscardState() {
    if (!active || active.confirming) {
      return;
    }

    confirmationReturnFocus = active.dialog.ownerDocument.activeElement;
    hiddenFeatureChildren = [...active.dialog.children].map((element) => ({
      element,
      wasHidden: element.hidden
    }));
    hiddenFeatureChildren.forEach(({ element }) => {
      element.hidden = true;
    });
    active.dialog.append(discardDialog);
    discardDialog.hidden = false;
    active.confirming = true;
    continueEditingButton.focus();
  }

  function returnToFeatureState() {
    if (!active?.confirming) {
      return;
    }

    restoreFeatureState();
    returnFocusToFeatureState();
  }

  function continueEditing() {
    const current = active;
    returnToFeatureState();
    current?.onContinueEditing?.();
  }

  function requestClose() {
    if (!active) {
      return false;
    }

    if (active.confirming) {
      continueEditing();
      return true;
    }

    if (!active.isDirty()) {
      return closeActiveDialog();
    }

    showDiscardState();
    return true;
  }

  function handleCancel(event) {
    event.preventDefault();
    requestClose();
  }

  function handleContinueEditing() {
    continueEditing();
  }

  function handleDiscardChanges() {
    if (active?.confirming) {
      closeActiveDialog({ discard: true });
    }
  }

  continueEditingButton.addEventListener("click", handleContinueEditing);
  discardChangesButton.addEventListener("click", handleDiscardChanges);

  return {
    open(dialog, {
      invoker,
      initialFocus,
      isDirty,
      onDiscard,
      onContinueEditing
    } = {}) {
      assertDialog(dialog, "dialog");
      assertFocusable(invoker, "invoker");
      assertFocusable(initialFocus, "initialFocus");
      if (typeof isDirty !== "function") {
        throw new TypeError("isDirty must be a function.");
      }
      if (onDiscard !== undefined && typeof onDiscard !== "function") {
        throw new TypeError("onDiscard must be a function.");
      }
      if (
        onContinueEditing !== undefined
        && typeof onContinueEditing !== "function"
      ) {
        throw new TypeError("onContinueEditing must be a function.");
      }
      if (active) {
        throw new Error("A dialog is already active.");
      }
      if (discardDialog.parentNode === dialog) {
        throw new Error("The discard confirmation panel cannot be the active dialog.");
      }

      const current = {
        dialog,
        invoker,
        initialFocus,
        isDirty,
        onDiscard,
        onContinueEditing,
        confirming: false,
        handleCancel
      };
      active = current;

      try {
        dialog.addEventListener("cancel", handleCancel);
        dialog.ownerDocument.addEventListener("keydown", handleTab, true);
        dialog.showModal();
        initialFocus.focus();
      } catch (error) {
        dialog.ownerDocument.removeEventListener("keydown", handleTab, true);
        dialog.removeEventListener("cancel", handleCancel);
        active = null;
        throw error;
      }
    },

    requestClose,

    closeAfterMutation() {
      return closeActiveDialog();
    },

    isOpen() {
      return Boolean(active?.dialog.open);
    }
  };
}
