const feedbackLabels = {
  success: "Success",
  warning: "Warning",
  error: "Error"
};

const feedbackTypes = Object.keys(feedbackLabels);

export function showFeedback(region, type, message) {
  if (!region || typeof region.setAttribute !== "function") {
    throw new TypeError("A feedback region element is required.");
  }

  if (!Object.hasOwn(feedbackLabels, type)) {
    throw new RangeError(`Unsupported feedback type: ${type}`);
  }

  if (typeof message !== "string" || message.trim() === "") {
    throw new TypeError("Feedback text must be a non-empty string.");
  }

  region.classList.remove(...feedbackTypes.map((item) => `demo-feedback--${item}`));
  region.classList.add("demo-feedback", `demo-feedback--${type}`);
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "true");
  region.textContent = `${feedbackLabels[type]}: ${message}`;
  region.hidden = false;
}

export function clearFeedback(region) {
  if (!region || typeof region.setAttribute !== "function") {
    throw new TypeError("A feedback region element is required.");
  }

  region.textContent = "";
  region.hidden = true;
  region.classList.remove(...feedbackTypes.map((item) => `demo-feedback--${item}`));
}

export function showFieldError(input, errorElement, message) {
  if (
    !input
    || typeof input.getAttribute !== "function"
    || !errorElement
    || typeof errorElement.setAttribute !== "function"
    || typeof errorElement.id !== "string"
    || errorElement.id.trim() === ""
  ) {
    throw new TypeError("A field and an error element with an ID are required.");
  }

  if (typeof message !== "string" || message.trim() === "") {
    throw new TypeError("Field error text must be a non-empty string.");
  }

  const describedBy = new Set(
    (input.getAttribute("aria-describedby") || "")
      .split(/\s+/)
      .filter(Boolean)
  );
  describedBy.add(errorElement.id);

  input.setAttribute("aria-describedby", [...describedBy].join(" "));
  input.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
  errorElement.hidden = false;
}

export function clearFieldError(input, errorElement) {
  if (
    !input
    || typeof input.getAttribute !== "function"
    || !errorElement
    || typeof errorElement.setAttribute !== "function"
    || typeof errorElement.id !== "string"
    || errorElement.id.trim() === ""
  ) {
    throw new TypeError("A field and an error element with an ID are required.");
  }

  const describedBy = (input.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter((id) => id && id !== errorElement.id);

  if (describedBy.length > 0) {
    input.setAttribute("aria-describedby", describedBy.join(" "));
  } else {
    input.removeAttribute("aria-describedby");
  }

  input.removeAttribute("aria-invalid");
  errorElement.textContent = "";
  errorElement.hidden = true;
}
