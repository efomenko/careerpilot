function validResult() {
  return { valid: true, message: "" };
}

function invalidResult(message) {
  return { valid: false, message };
}

export function validateRequired(value, fieldLabel) {
  if (typeof fieldLabel !== "string" || fieldLabel.trim() === "") {
    throw new TypeError("A field label is required.");
  }

  if (value === null || value === undefined) {
    return invalidResult(`Please enter ${fieldLabel}.`);
  }

  if (typeof value === "string" && value.trim() === "") {
    return invalidResult(`Please enter ${fieldLabel}.`);
  }

  return validResult();
}

export function validateFormat(value, rule) {
  if (
    !rule
    || !(rule.pattern instanceof RegExp)
    || typeof rule.message !== "string"
    || rule.message.trim() === ""
  ) {
    throw new TypeError("A format rule needs a regular expression and a message.");
  }

  if (
    value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "")
  ) {
    return validResult();
  }

  if (typeof value !== "string") {
    return invalidResult(rule.message);
  }

  const previousLastIndex = rule.pattern.lastIndex;
  rule.pattern.lastIndex = 0;

  let matches;
  try {
    matches = rule.pattern.test(value);
  } finally {
    rule.pattern.lastIndex = previousLastIndex;
  }

  return matches ? validResult() : invalidResult(rule.message);
}
