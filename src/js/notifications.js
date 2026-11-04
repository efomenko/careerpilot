const notificationLabels = {
  success: "Success",
  error: "Error"
};

export function createNotifications({ region, successDuration = 4000 } = {}) {
  if (
    !region
    || typeof region.setAttribute !== "function"
    || typeof region.replaceChildren !== "function"
    || !region.ownerDocument
    || typeof region.ownerDocument.createElement !== "function"
    || typeof region.querySelector !== "function"
  ) {
    throw new TypeError("A notification region element is required.");
  }
  if (!Number.isFinite(successDuration) || successDuration < 0) {
    throw new TypeError("successDuration must be a non-negative finite number.");
  }

  const messageElement = region.querySelector(".ordinary-notification__message");
  const dismissButton = region.querySelector(".ordinary-notification__dismiss");
  if (
    !messageElement
    || !dismissButton
    || messageElement.parentElement !== region
    || dismissButton.parentElement !== region
  ) {
    throw new TypeError(
      "The notification region must contain sibling message and dismiss elements."
    );
  }

  let current = null;
  let timer = null;

  function cancelTimer() {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
      timer = null;
    }
  }

  function clearCurrent() {
    cancelTimer();
    current = null;
    messageElement.textContent = "";
    region.hidden = true;
    region.removeAttribute("data-type");
    messageElement.removeAttribute("role");
    messageElement.removeAttribute("aria-live");
    messageElement.removeAttribute("aria-atomic");
  }

  function dismiss(notification = current) {
    if (notification && current === notification) {
      clearCurrent();
    }
  }

  function clearSuccess() {
    if (current?.type === "success") {
      clearCurrent();
    }
  }

  function show(type, message) {
    if (!Object.hasOwn(notificationLabels, type)) {
      throw new RangeError(`Unsupported notification type: ${type}`);
    }
    if (typeof message !== "string" || message.trim() === "") {
      throw new TypeError("Notification text must be a non-empty string.");
    }

    cancelTimer();
    const notification = { type };
    messageElement.setAttribute("role", type === "success" ? "status" : "alert");
    messageElement.setAttribute("aria-live", type === "success" ? "polite" : "assertive");
    messageElement.setAttribute("aria-atomic", "true");
    messageElement.textContent = `${notificationLabels[type]}: ${message}`;
    current = notification;
    region.setAttribute("data-type", type);
    region.hidden = false;

    if (type === "success") {
      timer = globalThis.setTimeout(() => {
        if (current === notification) {
          clearCurrent();
        }
      }, successDuration);
    }
  }

  dismissButton.addEventListener("click", () => dismiss());

  return {
    show,
    dismiss,
    clearSuccess,
    clear() {
      if (current) {
        clearCurrent();
      }
    }
  };
}
