import {
  validateFormat,
  validateRequired
} from "./validation.js";
import {
  clearFeedback,
  clearFieldError,
  showFeedback,
  showFieldError
} from "./feedback.js";

const form = document.querySelector("#validation-demo-form");
const feedbackRegion = document.querySelector("#demo-feedback");
const requiredInput = document.querySelector("#required-demo-value");
const requiredError = document.querySelector("#required-demo-error");
const codeInput = document.querySelector("#format-demo-value");
const codeError = document.querySelector("#format-demo-error");
const warningButton = document.querySelector("#show-warning");

const codeFormatRule = {
  pattern: /^[A-Z]{2}-\d{3}$/,
  message: "Use two uppercase letters, a hyphen, and three digits (for example, AB-123)."
};

form.addEventListener("input", () => {
  if (
    feedbackRegion.classList.contains("demo-feedback--success")
    || feedbackRegion.classList.contains("demo-feedback--error")
  ) {
    clearFeedback(feedbackRegion);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearFeedback(feedbackRegion);
  clearFieldError(requiredInput, requiredError);
  clearFieldError(codeInput, codeError);

  const requiredResult = validateRequired(
    requiredInput.value,
    "the required demo value"
  );
  const codeResult = validateFormat(codeInput.value, codeFormatRule);

  if (!requiredResult.valid) {
    showFieldError(requiredInput, requiredError, requiredResult.message);
  }

  if (!codeResult.valid) {
    showFieldError(codeInput, codeError, codeResult.message);
  }

  if (!requiredResult.valid || !codeResult.valid) {
    showFeedback(
      feedbackRegion,
      "error",
      "Correct the highlighted demo fields and submit again."
    );
    const firstInvalidInput = !requiredResult.valid ? requiredInput : codeInput;
    firstInvalidInput.focus();
    return;
  }

  showFeedback(
    feedbackRegion,
    "success",
    "The demo values passed the checks."
  );
});

warningButton.addEventListener("click", () => {
  showFeedback(
    feedbackRegion,
    "warning",
    "This warning is an example; no data has been saved."
  );
});
