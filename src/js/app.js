
import { createCareerState } from "./career-state.js";
import { clearFeedback, clearFieldError, showFeedback, showFieldError } from "./feedback.js";
import { validateRequired } from "./validation.js";

const careerState = createCareerState();
const appStatus = document.querySelector("#app-status");
const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const currentSection = document.querySelector("#current-section");
const pageTitle = document.querySelector("#page-title");
const navigationLinks = document.querySelectorAll("[data-view]");
const pageViews = document.querySelectorAll("[data-page-view]");
const profileForm = document.querySelector("#profile-form");
const profileFeedback = document.querySelector("#profile-feedback");
const profileControls = {
  fullName: document.querySelector("#profile-full-name"),
  headline: document.querySelector("#profile-headline"),
  summary: document.querySelector("#profile-summary"),
  skills: document.querySelector("#profile-skills")
};
const profileFieldErrors = {
  fullName: document.querySelector("#profile-full-name-error"),
  headline: document.querySelector("#profile-headline-error"),
  summary: document.querySelector("#profile-summary-error"),
  skills: document.querySelector("#profile-skills-error")
};
const profileFields = Object.keys(profileControls);
const employmentForm = document.querySelector("#employment-form");
const employmentList = document.querySelector("#employment-list");
const employmentEmpty = document.querySelector("#employment-empty");
const employmentFeedback = document.querySelector("#employment-feedback");
const employmentFormTitle = document.querySelector("#employment-form-title");
const employmentSubmit = document.querySelector("#employment-submit");
const employmentCancel = document.querySelector("#employment-cancel");
const employmentControls = {
  employer: document.querySelector("#employment-employer"),
  roleTitle: document.querySelector("#employment-role-title"),
  startDate: document.querySelector("#employment-start-date"),
  endDate: document.querySelector("#employment-end-date"),
  isCurrent: document.querySelector("#employment-is-current"),
  responsibilities: document.querySelector("#employment-responsibilities")
};
const employmentFieldErrors = {
  employer: document.querySelector("#employment-employer-error"),
  roleTitle: document.querySelector("#employment-role-title-error"),
  startDate: document.querySelector("#employment-start-date-error"),
  endDate: document.querySelector("#employment-end-date-error"),
  isCurrent: document.querySelector("#employment-is-current-error"),
  responsibilities: document.querySelector("#employment-responsibilities-error")
};
const employmentFields = Object.keys(employmentControls);
let editingEmploymentId = null;
const achievementForm = document.querySelector("#achievement-form");
const achievementList = document.querySelector("#achievement-list");
const achievementEmpty = document.querySelector("#achievement-empty");
const achievementFeedback = document.querySelector("#achievement-feedback");
const achievementFormTitle = document.querySelector("#achievement-form-title");
const achievementSubmit = document.querySelector("#achievement-submit");
const achievementCancel = document.querySelector("#achievement-cancel");
const achievementActions = document.querySelector("#achievement-actions");
const achievementMetrics = document.querySelector("#achievement-metrics");
const achievementEvidence = document.querySelector("#achievement-evidence");
const achievementEmployment = document.querySelector("#achievement-employment");
const achievementControls = {
  title: document.querySelector("#achievement-title"),
  context: document.querySelector("#achievement-context"),
  contribution: document.querySelector("#achievement-contribution"),
  outcome: document.querySelector("#achievement-outcome"),
  potentialImpact: document.querySelector("#achievement-potential-impact"),
  employmentId: achievementEmployment
};
const achievementVerificationStatuses = [
  { value: "unverified", label: "Unverified" },
  { value: "needs_confirmation", label: "Needs confirmation" },
  { value: "verified", label: "Verified" }
];
let editingAchievementId = null;
let achievementEntryNumber = 0;
let achievementErrorTargets = {};

// Each view supplies the label and status shown when its hash is selected.
const views = {
  dashboard: {
    label: "Dashboard",
    title: "Good to have you here.",
    status: "Your CareerPilot workspace is ready."
  },
  profile: {
    label: "Career Profile",
    title: "Your career story starts here.",
    status: "Your Career Profile is ready to edit."
  },
  achievements: {
    label: "Achievements",
    title: "Make your achievements count.",
    status: "Your achievements and supporting evidence are ready to manage."
  },
  jobs: {
    label: "Job Opportunities",
    title: "Explore your next opportunity.",
    status: "Job management is planned for a future development task."
  },
  drafts: {
    label: "Application Drafts",
    title: "Prepare your next application.",
    status: "Application drafting is planned for a future development task."
  },
  applications: {
    label: "Application Tracker",
    title: "Keep your job search organized.",
    status: "Application tracking is planned for a future development task."
  }
};

function clearProfileFieldErrors() {
  profileFields.forEach((field) => {
    clearFieldError(profileControls[field], profileFieldErrors[field]);
  });
}

function populateProfileForm(profile) {
  profileControls.fullName.value = profile?.fullName ?? "";
  profileControls.headline.value = profile?.headline ?? "";
  profileControls.summary.value = profile?.summary ?? "";
  profileControls.skills.value = profile?.skills.join("\n") ?? "";
}

function readProfileForm() {
  return {
    fullName: profileControls.fullName.value,
    headline: profileControls.headline.value,
    summary: profileControls.summary.value,
    skills: profileControls.skills.value
      .split(/\r?\n/)
      .map((skill) => skill.trim())
      .filter(Boolean)
  };
}

function showProfileValidationErrors(errors) {
  const messagesByField = new Map();

  errors.forEach(({ field, message }) => {
    const controlField = field.startsWith("skills[") ? "skills" : field;

    if (!Object.hasOwn(profileControls, controlField)) {
      return;
    }

    const messages = messagesByField.get(controlField) || [];
    messages.push(message);
    messagesByField.set(controlField, messages);
  });

  messagesByField.forEach((messages, field) => {
    showFieldError(
      profileControls[field],
      profileFieldErrors[field],
      [...new Set(messages)].join(" ")
    );
  });

  const firstInvalidField = profileFields.find((field) => messagesByField.has(field));

  if (firstInvalidField) {
    profileControls[firstInvalidField].focus();
  }
}

function createRecordId() {
  let randomUUID;

  try {
    randomUUID = globalThis.crypto && globalThis.crypto.randomUUID;
  } catch {
    throw new Error("A secure record ID could not be created. The record was not saved.");
  }

  if (typeof randomUUID !== "function") {
    throw new Error("This browser cannot create a secure record ID. The record was not saved.");
  }

  try {
    return randomUUID.call(globalThis.crypto);
  } catch {
    throw new Error("A secure record ID could not be created. The record was not saved.");
  }
}

function saveProfile(event) {
  event.preventDefault();
  clearProfileFieldErrors();
  clearFeedback(profileFeedback);

  const input = readProfileForm();
  const requiredName = validateRequired(input.fullName, "your full name");

  if (!requiredName.valid) {
    showFieldError(
      profileControls.fullName,
      profileFieldErrors.fullName,
      requiredName.message
    );
    showFeedback(profileFeedback, "error", requiredName.message);
    profileControls.fullName.focus();
    return;
  }

  const existingProfile = careerState.getProfile();

  try {
    const profile = existingProfile
      ? careerState.updateProfile(input, new Date().toISOString())
      : careerState.createProfile(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });

    populateProfileForm(profile);
    showFeedback(
      profileFeedback,
      "success",
      "Profile saved for this session. It will be lost when you reload the page."
    );
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showProfileValidationErrors(error.errors);
    }

    const message = error.message || "The profile could not be saved.";
    showFeedback(profileFeedback, "error", message);
  }
}

function clearEmploymentFieldErrors() {
  employmentFields.forEach((field) => {
    clearFieldError(employmentControls[field], employmentFieldErrors[field]);
  });
}

function resetEmploymentForm() {
  employmentForm.reset();
  editingEmploymentId = null;
  employmentFormTitle.textContent = "Add employment";
  employmentSubmit.textContent = "Add employment";
  employmentCancel.hidden = true;
  employmentControls.endDate.disabled = false;
  clearEmploymentFieldErrors();
}

function renderEmploymentRecords() {
  const records = careerState.getEmploymentRecords();
  employmentList.replaceChildren();
  employmentEmpty.hidden = records.length > 0;

  records.forEach((record) => {
    const article = document.createElement("article");
    article.className = "employment-record";
    article.setAttribute("role", "listitem");

    const heading = document.createElement("h3");
    heading.className = "employment-record-title";
    heading.textContent = record.roleTitle;

    const employer = document.createElement("p");
    employer.className = "employment-record-employer";
    employer.textContent = record.employer;

    const dates = document.createElement("p");
    dates.className = "employment-record-dates";
    const endDate = record.isCurrent
      ? "Present"
      : record.endDate || "End date unknown";
    dates.textContent = `${record.startDate} – ${endDate}`;

    article.append(heading, employer, dates);

    if (record.responsibilities.length > 0) {
      const responsibilities = document.createElement("ul");
      responsibilities.className = "employment-record-responsibilities";

      record.responsibilities.forEach((responsibility) => {
        const item = document.createElement("li");
        item.textContent = responsibility;
        responsibilities.append(item);
      });

      article.append(responsibilities);
    }

    const actions = document.createElement("div");
    actions.className = "employment-record-actions";

    const editButton = document.createElement("button");
    editButton.className = "employment-action";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit ${record.roleTitle} at ${record.employer}`);
    editButton.addEventListener("click", () => beginEmploymentEdit(record));

    const deleteButton = document.createElement("button");
    deleteButton.className = "employment-action employment-action--delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${record.roleTitle} at ${record.employer}`);
    deleteButton.addEventListener("click", () => deleteEmploymentRecord(record));

    actions.append(editButton, deleteButton);
    article.append(actions);
    employmentList.append(article);
  });
}

function beginEmploymentEdit(record) {
  clearFeedback(employmentFeedback);
  clearEmploymentFieldErrors();
  editingEmploymentId = record.id;
  employmentControls.employer.value = record.employer;
  employmentControls.roleTitle.value = record.roleTitle;
  employmentControls.startDate.value = record.startDate;
  employmentControls.endDate.value = record.endDate || "";
  employmentControls.isCurrent.checked = record.isCurrent;
  employmentControls.endDate.disabled = record.isCurrent;
  employmentControls.responsibilities.value = record.responsibilities.join("\n");
  employmentFormTitle.textContent = `Edit ${record.roleTitle}`;
  employmentSubmit.textContent = "Save changes";
  employmentCancel.hidden = false;
  employmentControls.employer.focus();
}

function showEmploymentValidationErrors(errors) {
  const messagesByField = new Map();

  errors.forEach(({ field, message }) => {
    const controlField = field.startsWith("responsibilities[")
      ? "responsibilities"
      : field;

    if (!Object.hasOwn(employmentControls, controlField)) {
      return;
    }

    const messages = messagesByField.get(controlField) || [];
    messages.push(message);
    messagesByField.set(controlField, messages);
  });

  messagesByField.forEach((messages, field) => {
    showFieldError(
      employmentControls[field],
      employmentFieldErrors[field],
      [...new Set(messages)].join(" ")
    );
  });

  const firstInvalidField = employmentFields.find((field) => messagesByField.has(field));

  if (firstInvalidField) {
    employmentControls[firstInvalidField].focus();
  }
}

function readEmploymentForm() {
  return {
    employer: employmentControls.employer.value,
    roleTitle: employmentControls.roleTitle.value,
    startDate: employmentControls.startDate.value,
    endDate: employmentControls.isCurrent.checked
      ? null
      : employmentControls.endDate.value || null,
    isCurrent: employmentControls.isCurrent.checked,
    responsibilities: employmentControls.responsibilities.value
      .split(/\r?\n/)
      .map((responsibility) => responsibility.trim())
      .filter(Boolean)
  };
}

function saveEmploymentRecord(event) {
  event.preventDefault();
  clearEmploymentFieldErrors();
  clearFeedback(employmentFeedback);

  const input = readEmploymentForm();
  const employerRequired = validateRequired(input.employer, "an employer");
  const roleRequired = validateRequired(input.roleTitle, "a role title");
  const startDateRequired = validateRequired(input.startDate, "a start date");

  [
    ["employer", employerRequired],
    ["roleTitle", roleRequired],
    ["startDate", startDateRequired]
  ].forEach(([field, result]) => {
    if (!result.valid) {
      showFieldError(
        employmentControls[field],
        employmentFieldErrors[field],
        result.message
      );
    }
  });

  if (!employerRequired.valid || !roleRequired.valid || !startDateRequired.valid) {
    showFeedback(employmentFeedback, "error", "Enter an employer, role title, and start date.");
    const firstInvalid = [employerRequired, roleRequired, startDateRequired]
      .findIndex((result) => !result.valid);
    employmentControls[["employer", "roleTitle", "startDate"][firstInvalid]].focus();
    return;
  }

  try {
    if (editingEmploymentId) {
      careerState.updateEmploymentRecord(
        editingEmploymentId,
        input,
        new Date().toISOString()
      );
      showFeedback(employmentFeedback, "success", "Employment record updated for this session.");
    } else {
      careerState.addEmploymentRecord(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });
      showFeedback(employmentFeedback, "success", "Employment record added for this session.");
    }

    resetEmploymentForm();
    renderEmploymentRecords();
    renderAchievementRecords();
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showEmploymentValidationErrors(error.errors);
    }

    showFeedback(
      employmentFeedback,
      "error",
      error.message || "The employment record could not be saved."
    );
  }
}

function deleteEmploymentRecord(record) {
  clearFeedback(employmentFeedback);

  try {
    careerState.deleteEmploymentRecord(record.id);
    renderEmploymentRecords();
    renderAchievementRecords();
    if (editingEmploymentId === record.id) {
      resetEmploymentForm();
    }
    showFeedback(employmentFeedback, "success", "Employment record deleted from this session.");
    document.querySelector("#employment-title").focus();
  } catch (error) {
    showFeedback(
      employmentFeedback,
      "error",
      error.message || "The employment record could not be deleted."
    );
  }
}

function clearAchievementFieldErrors() {
  achievementForm.querySelectorAll(".achievement-field").forEach((field) => {
    const control = field.querySelector("input, textarea, select");
    const error = field.querySelector(".achievement-field-error");

    if (control && error) {
      clearFieldError(control, error);
    }
  });
  achievementErrorTargets = {};
}

function createAchievementField(parent, labelText, type, options = {}) {
  const field = document.createElement("div");
  field.className = "achievement-field";

  const id = `achievement-entry-${achievementEntryNumber}`;
  achievementEntryNumber += 1;

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  let control;
  if (type === "textarea") {
    control = document.createElement("textarea");
    control.rows = options.rows || 3;
  } else if (type === "select") {
    control = document.createElement("select");
    options.values.forEach(({ value, label: optionLabel }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = optionLabel;
      control.append(option);
    });
  } else {
    control = document.createElement("input");
    control.type = type;
    if (options.step) {
      control.step = options.step;
    }
  }

  control.id = id;
  control.value = options.value ?? "";
  control.setAttribute("aria-describedby", `${id}-error`);
  if (options.helpId) {
    control.setAttribute("aria-describedby", `${options.helpId} ${id}-error`);
  }
  if (options.fieldAttribute) {
    control.dataset[options.fieldAttribute.name] = options.fieldAttribute.value;
  }

  const error = document.createElement("p");
  error.className = "achievement-field-error";
  error.id = `${id}-error`;
  error.hidden = true;

  field.append(label, control, error);
  parent.append(field);
  return control;
}

function addAchievementAction(value = "") {
  const row = document.createElement("div");
  row.className = "achievement-entry achievement-action-entry";
  const actionIndex = achievementActions.children.length;
  const action = createAchievementField(
    row,
    `Action ${actionIndex + 1}`,
    "text",
    { value }
  );
  const remove = document.createElement("button");
  remove.className = "achievement-remove";
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove action ${actionIndex + 1}`);
  remove.addEventListener("click", () => {
    row.remove();
    renumberAchievementEntries(achievementActions, "Action", "Remove action");
    clearAchievementFieldErrors();
    clearFeedback(achievementFeedback);
    document.querySelector("#achievement-add-action").focus();
  });
  row.append(remove);
  achievementActions.append(row);
  action.focus();
}

function addAchievementMetric(metric = {}) {
  const row = document.createElement("div");
  row.className = "achievement-entry achievement-metric-entry";
  const fields = document.createElement("div");
  fields.className = "achievement-metric-fields";
  const fieldAttribute = (value) => ({
    name: "metricField",
    value
  });

  createAchievementField(fields, "Metric name", "text", {
    value: metric.name,
    fieldAttribute: fieldAttribute("name")
  });
  createAchievementField(fields, "Value", "number", {
    value: metric.value,
    step: "any",
    fieldAttribute: fieldAttribute("value")
  });
  createAchievementField(fields, "Unit", "text", {
    value: metric.unit,
    fieldAttribute: fieldAttribute("unit")
  });
  createAchievementField(fields, "Period (optional)", "text", {
    value: metric.period,
    fieldAttribute: fieldAttribute("period")
  });
  createAchievementField(fields, "Basis", "select", {
    value: metric.basis || "measured",
    values: [
      { value: "measured", label: "Measured" },
      { value: "estimated", label: "Estimated" }
    ],
    fieldAttribute: fieldAttribute("basis")
  });

  const remove = document.createElement("button");
  remove.className = "achievement-remove";
  remove.type = "button";
  remove.textContent = "Remove metric";
  remove.addEventListener("click", () => {
    row.remove();
    clearAchievementFieldErrors();
    clearFeedback(achievementFeedback);
    document.querySelector("#achievement-add-metric").focus();
  });

  row.append(fields, remove);
  achievementMetrics.append(row);
  fields.querySelector("input").focus();
}

function addAchievementEvidence(value = "") {
  const row = document.createElement("div");
  row.className = "achievement-entry achievement-evidence-entry";
  const evidenceIndex = achievementEvidence.children.length;
  const evidence = createAchievementField(
    row,
    `Evidence entry ${evidenceIndex + 1} (JSON)`,
    "textarea",
    {
      value,
      helpId: "achievement-evidence-help"
    }
  );
  const remove = document.createElement("button");
  remove.className = "achievement-remove";
  remove.type = "button";
  remove.textContent = "Remove evidence";
  remove.setAttribute("aria-label", `Remove evidence entry ${evidenceIndex + 1}`);
  remove.addEventListener("click", () => {
    row.remove();
    renumberAchievementEntries(achievementEvidence, "Evidence entry", "Remove evidence entry");
    clearAchievementFieldErrors();
    clearFeedback(achievementFeedback);
    document.querySelector("#achievement-add-evidence").focus();
  });
  row.append(remove);
  achievementEvidence.append(row);
  evidence.focus();
}

function refreshAchievementErrorTargets() {
  achievementErrorTargets = { ...achievementControls };

  achievementActions.querySelectorAll(".achievement-action-entry").forEach((row, index) => {
    achievementErrorTargets[`actions[${index}]`] = row.querySelector("input");
  });

  achievementMetrics.querySelectorAll(".achievement-metric-entry").forEach((row, index) => {
    row.querySelectorAll("[data-metric-field]").forEach((control) => {
      achievementErrorTargets[`metrics[${index}].${control.dataset.metricField}`] = control;
    });
  });

  achievementEvidence.querySelectorAll(".achievement-evidence-entry").forEach((row, index) => {
    achievementErrorTargets[`evidence[${index}]`] = row.querySelector("textarea");
  });
}

function renumberAchievementEntries(container, labelPrefix, removeLabel) {
  container.querySelectorAll(".achievement-action-entry, .achievement-evidence-entry")
    .forEach((row, index) => {
      const number = index + 1;
      const label = row.querySelector("label");
      const remove = row.querySelector(".achievement-remove");

      if (label) {
        label.textContent = labelPrefix === "Action"
          ? `Action ${number}`
          : `${labelPrefix} ${number} (JSON)`;
      }
      if (remove) {
        remove.setAttribute("aria-label", `${removeLabel} ${number}`);
      }
    });
}

function showAchievementValidationErrors(errors) {
  refreshAchievementErrorTargets();
  const invalidFields = [];

  errors.forEach(({ field, message }) => {
    const control = achievementErrorTargets[field];
    if (!control) {
      return;
    }

    const error = control.closest(".achievement-field")?.querySelector(".achievement-field-error");
    if (!error) {
      return;
    }

    showFieldError(control, error, message);
    invalidFields.push(control);
  });

  invalidFields[0]?.focus();
}

function renderAchievementEmploymentOptions(selectedId = achievementEmployment.value) {
  achievementEmployment.replaceChildren();

  const unlinkedOption = document.createElement("option");
  unlinkedOption.value = "";
  unlinkedOption.textContent = "No employment link";
  achievementEmployment.append(unlinkedOption);

  careerState.getEmploymentRecords().forEach((record) => {
    const option = document.createElement("option");
    option.value = record.id;
    option.textContent = `${record.roleTitle} — ${record.employer}`;
    achievementEmployment.append(option);
  });

  const hasSelection = [...achievementEmployment.options]
    .some((option) => option.value === selectedId);
  achievementEmployment.value = hasSelection ? selectedId : "";
}

function appendAchievementText(parent, label, value, className = "achievement-record-text") {
  const section = document.createElement("div");
  section.className = "achievement-record-section";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const text = document.createElement("p");
  text.className = className;
  text.textContent = value;
  section.append(heading, text);
  parent.append(section);
}

function getAchievementVerificationLabel(status) {
  return achievementVerificationStatuses.find((item) => item.value === status)?.label
    || "Unknown";
}

function updateAchievementVerificationStatus(recordId, select) {
  clearFeedback(achievementFeedback);

  try {
    const updatedRecord = careerState.updateAchievementVerificationStatus(
      recordId,
      select.value,
      new Date().toISOString()
    );
    renderAchievementRecords();
    showFeedback(
      achievementFeedback,
      "success",
      `Verification status updated to ${getAchievementVerificationLabel(updatedRecord.verificationStatus)}.`
    );
  } catch (error) {
    renderAchievementRecords();
    showFeedback(
      achievementFeedback,
      "error",
      error.message || "The verification status could not be updated."
    );
  }
}

function renderAchievementRecords() {
  const records = careerState.getAchievementRecords();
  achievementList.replaceChildren();
  achievementEmpty.hidden = records.length > 0;
  renderAchievementEmploymentOptions();

  records.forEach((record, index) => {
    const article = document.createElement("article");
    article.className = "achievement-record";
    article.setAttribute("role", "listitem");

    const heading = document.createElement("h3");
    heading.className = "achievement-record-title";
    heading.textContent = record.title;
    article.append(heading);

    const verification = document.createElement("section");
    verification.className = "achievement-verification";
    verification.setAttribute("aria-labelledby", `achievement-status-heading-${index}`);
    const verificationHeading = document.createElement("h4");
    verificationHeading.className = "achievement-verification-heading";
    verificationHeading.id = `achievement-status-heading-${index}`;
    verificationHeading.textContent = "Verification status";
    const currentStatus = document.createElement("p");
    currentStatus.className = "achievement-verification-current";
    currentStatus.textContent = getAchievementVerificationLabel(record.verificationStatus);
    const statusControl = document.createElement("div");
    statusControl.className = "achievement-verification-control";
    const statusSelectId = `achievement-status-select-${index}`;
    const statusLabel = document.createElement("label");
    statusLabel.htmlFor = statusSelectId;
    statusLabel.textContent = `Change verification status for ${record.title}`;
    const statusSelect = document.createElement("select");
    statusSelect.className = "achievement-status-select";
    statusSelect.id = statusSelectId;
    statusSelect.setAttribute(
      "aria-describedby",
      `achievement-verification-help achievement-status-heading-${index}`
    );
    achievementVerificationStatuses.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusSelect.append(option);
    });
    statusSelect.value = record.verificationStatus;
    const statusButton = document.createElement("button");
    statusButton.className = "achievement-secondary achievement-status-update";
    statusButton.type = "button";
    statusButton.textContent = "Update status";
    statusButton.addEventListener("click", () =>
      updateAchievementVerificationStatus(record.id, statusSelect)
    );
    statusControl.append(statusLabel, statusSelect, statusButton);
    verification.append(verificationHeading, currentStatus, statusControl);
    article.append(verification);

    if (record.context) {
      appendAchievementText(article, "Context", record.context);
    }
    appendAchievementText(article, "Contribution", record.contribution);
    if (record.outcome) {
      appendAchievementText(article, "Actual outcome", record.outcome);
    }
    if (record.potentialImpact) {
      appendAchievementText(article, "Potential impact", record.potentialImpact);
    }

    if (record.actions.length > 0) {
      const section = document.createElement("div");
      section.className = "achievement-record-section";
      const actionsHeading = document.createElement("h4");
      actionsHeading.textContent = "Actions";
      const actions = document.createElement("ul");
      actions.className = "achievement-record-list";
      record.actions.forEach((action) => {
        const item = document.createElement("li");
        item.textContent = action;
        actions.append(item);
      });
      section.append(actionsHeading, actions);
      article.append(section);
    }

    if (record.metrics.length > 0) {
      const section = document.createElement("div");
      section.className = "achievement-record-section";
      const metricsHeading = document.createElement("h4");
      metricsHeading.textContent = "Metrics";
      const metrics = document.createElement("ul");
      metrics.className = "achievement-record-list";
      record.metrics.forEach((metric) => {
        const item = document.createElement("li");
        const period = Object.hasOwn(metric, "period") && metric.period !== ""
          ? ` (${metric.period})`
          : "";
        item.textContent = `${metric.name}: ${metric.value} ${metric.unit}${period} — ${metric.basis}`;
        metrics.append(item);
      });
      section.append(metricsHeading, metrics);
      article.append(section);
    }

    if (record.evidence.length > 0) {
      const section = document.createElement("div");
      section.className = "achievement-record-section";
      const evidenceHeading = document.createElement("h4");
      evidenceHeading.textContent = "Supporting evidence";
      const evidence = document.createElement("ul");
      evidence.className = "achievement-record-list";
      record.evidence.forEach((value) => {
        const item = document.createElement("li");
        const formatted = document.createElement("pre");
        formatted.className = "achievement-evidence-value";
        formatted.textContent = JSON.stringify(value, null, 2);
        item.append(formatted);
        evidence.append(item);
      });
      section.append(evidenceHeading, evidence);
      article.append(section);
    }

    if (record.employmentId) {
      const employment = careerState.getEmploymentRecords()
        .find((item) => item.id === record.employmentId);
      appendAchievementText(
        article,
        "Employment",
        employment
          ? `${employment.roleTitle} — ${employment.employer}`
          : "Linked employment record unavailable"
      );
    }

    const actions = document.createElement("div");
    actions.className = "achievement-record-actions";
    const editButton = document.createElement("button");
    editButton.className = "achievement-action-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit achievement: ${record.title}`);
    editButton.addEventListener("click", () => beginAchievementEdit(record));

    const deleteButton = document.createElement("button");
    deleteButton.className = "achievement-action-button achievement-action-button--delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete achievement: ${record.title}`);
    deleteButton.addEventListener("click", () => deleteAchievementRecord(record));
    actions.append(editButton, deleteButton);
    article.append(actions);
    achievementList.append(article);
  });
}

function resetAchievementForm() {
  achievementForm.reset();
  achievementActions.replaceChildren();
  achievementMetrics.replaceChildren();
  achievementEvidence.replaceChildren();
  editingAchievementId = null;
  achievementFormTitle.textContent = "Add achievement";
  achievementSubmit.textContent = "Add achievement";
  achievementCancel.hidden = true;
  clearAchievementFieldErrors();
}

function beginAchievementEdit(record) {
  clearFeedback(achievementFeedback);
  resetAchievementForm();
  editingAchievementId = record.id;
  achievementControls.title.value = record.title;
  achievementControls.context.value = record.context;
  achievementControls.contribution.value = record.contribution;
  achievementControls.outcome.value = record.outcome;
  achievementControls.potentialImpact.value = record.potentialImpact;
  renderAchievementEmploymentOptions(record.employmentId ?? "");
  record.actions.forEach((action) => addAchievementAction(action));
  record.metrics.forEach((metric) => addAchievementMetric(metric));
  record.evidence.forEach((value) => addAchievementEvidence(JSON.stringify(value)));
  achievementFormTitle.textContent = `Edit ${record.title}`;
  achievementSubmit.textContent = "Save changes";
  achievementCancel.hidden = false;
  achievementControls.title.focus();
}

function readAchievementForm() {
  refreshAchievementErrorTargets();
  const metrics = [...achievementMetrics.querySelectorAll(".achievement-metric-entry")]
    .map((row) => {
      const metric = {};
      row.querySelectorAll("[data-metric-field]").forEach((control) => {
        const field = control.dataset.metricField;
        if (field === "value") {
          metric.value = control.value === "" ? "" : Number(control.value);
        } else if (field === "period") {
          if (control.value !== "") {
            metric.period = control.value;
          }
        } else {
          metric[field] = control.value;
        }
      });
      return metric;
    });
  const evidence = [];

  achievementEvidence.querySelectorAll("textarea").forEach((control, index) => {
    try {
      evidence.push(JSON.parse(control.value));
    } catch {
      const error = new TypeError(`Evidence entry ${index + 1} must contain valid JSON.`);
      error.errors = [{
        field: `evidence[${index}]`,
        message: "Enter a valid JSON value."
      }];
      throw error;
    }
  });

  return {
    title: achievementControls.title.value,
    context: achievementControls.context.value,
    contribution: achievementControls.contribution.value,
    actions: [...achievementActions.querySelectorAll("input")]
      .map((control) => control.value),
    outcome: achievementControls.outcome.value,
    potentialImpact: achievementControls.potentialImpact.value,
    metrics,
    evidence,
    employmentId: achievementEmployment.value || null
  };
}

function saveAchievementRecord(event) {
  event.preventDefault();
  clearAchievementFieldErrors();
  clearFeedback(achievementFeedback);

  try {
    const input = readAchievementForm();
    let successMessage;
    if (editingAchievementId) {
      const existingRecord = careerState.getAchievementRecords()
        .find((record) => record.id === editingAchievementId);
      const updatedRecord = careerState.updateAchievementRecord(
        editingAchievementId,
        input,
        new Date().toISOString()
      );
      successMessage = existingRecord.verificationStatus === "verified"
        && updatedRecord.verificationStatus === "unverified"
        ? "Achievement content changed. Verification was reset to Unverified."
        : "Achievement updated for this session.";
    } else {
      careerState.addAchievementRecord(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });
      successMessage = "Achievement added for this session.";
    }

    resetAchievementForm();
    renderAchievementRecords();
    showFeedback(achievementFeedback, "success", successMessage);
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showAchievementValidationErrors(error.errors);
    }

    showFeedback(
      achievementFeedback,
      "error",
      error.message || "The achievement could not be saved."
    );
  }
}

function deleteAchievementRecord(record) {
  clearFeedback(achievementFeedback);

  try {
    careerState.deleteAchievementRecord(record.id);
    if (editingAchievementId === record.id) {
      resetAchievementForm();
    }
    renderAchievementRecords();
    showFeedback(achievementFeedback, "success", "Achievement deleted from this session.");
    document.querySelector("#achievements-title").focus();
  } catch (error) {
    showFeedback(
      achievementFeedback,
      "error",
      error.message || "The achievement could not be deleted."
    );
  }
}

profileForm.addEventListener("submit", saveProfile);
profileForm.addEventListener("input", (event) => {
  const field = profileFields.find((item) => profileControls[item] === event.target);

  if (field) {
    clearFieldError(profileControls[field], profileFieldErrors[field]);
    clearFeedback(profileFeedback);
  }
});

employmentForm.addEventListener("submit", saveEmploymentRecord);
employmentForm.addEventListener("input", (event) => {
  const field = employmentFields.find((item) => employmentControls[item] === event.target);

  if (field) {
    clearFieldError(employmentControls[field], employmentFieldErrors[field]);
    clearFeedback(employmentFeedback);
  }
});
employmentControls.isCurrent.addEventListener("change", () => {
  employmentControls.endDate.disabled = employmentControls.isCurrent.checked;
  clearFieldError(employmentControls.endDate, employmentFieldErrors.endDate);
  clearFieldError(employmentControls.isCurrent, employmentFieldErrors.isCurrent);
});
employmentCancel.addEventListener("click", () => {
  resetEmploymentForm();
  clearFeedback(employmentFeedback);
  employmentControls.employer.focus();
});

achievementForm.addEventListener("submit", saveAchievementRecord);
achievementForm.addEventListener("input", (event) => {
  const field = event.target.closest(".achievement-field");
  const control = field?.querySelector("input, textarea, select");
  const error = field?.querySelector(".achievement-field-error");

  if (control && error) {
    clearFieldError(control, error);
    clearFeedback(achievementFeedback);
  }
});
achievementForm.addEventListener("change", (event) => {
  const field = event.target.closest(".achievement-field");
  const control = field?.querySelector("input, textarea, select");
  const error = field?.querySelector(".achievement-field-error");

  if (control && error) {
    clearFieldError(control, error);
    clearFeedback(achievementFeedback);
  }
});
document.querySelector("#achievement-add-action").addEventListener("click", () => {
  addAchievementAction();
  clearFeedback(achievementFeedback);
});
document.querySelector("#achievement-add-metric").addEventListener("click", () => {
  addAchievementMetric();
  clearFeedback(achievementFeedback);
});
document.querySelector("#achievement-add-evidence").addEventListener("click", () => {
  addAchievementEvidence();
  clearFeedback(achievementFeedback);
});
achievementCancel.addEventListener("click", () => {
  resetAchievementForm();
  clearFeedback(achievementFeedback);
  achievementControls.title.focus();
});

populateProfileForm(careerState.getProfile());
renderEmploymentRecords();
renderAchievementRecords();

function closeMobileMenu(restoreFocus = false) {
  const wasOpen = sidebar.classList.contains("is-open");

  sidebar.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");

  if (restoreFocus && wasOpen) {
    menuToggle.focus();
  }
}

function focusFirstMobileNavigationLink() {
  if (
    !sidebar.classList.contains("is-open")
    || window.innerWidth > 760
  ) {
    return;
  }

  const firstNavigationLink = sidebar.querySelector(".nav-link");

  if (!firstNavigationLink) {
    return;
  }

  if (getComputedStyle(firstNavigationLink).visibility === "hidden") {
    return;
  }

  firstNavigationLink.focus();
}

function navigateTo(viewName) {
  const view = views[viewName];

  if (!view) {
    return;
  }

  if (!appStatus) {
    console.error("CareerPilot could not find the application status element.");
    return;
  }

  const menuWasOpen = sidebar.classList.contains("is-open");

  navigationLinks.forEach((link) => {
    const isActive = link.dataset.view === viewName;

    if (link.classList.contains("nav-link")) {
      link.classList.toggle("active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  });

  pageViews.forEach((page) => {
    page.hidden = page.dataset.pageView !== viewName;
  });

  currentSection.textContent = view.label;
  pageTitle.textContent = view.title;
  appStatus.textContent = view.status;

  closeMobileMenu();

  if (menuWasOpen) {
    document.querySelector("#main-content").focus();
  }
}

navigationLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();

    const viewName = link.dataset.view;

    if (!views[viewName]) {
      return;
    }

    navigateTo(viewName);

    if (window.location.hash !== `#${viewName}`) {
      window.location.hash = viewName;
    }
  });
});

// Keep the visible page in sync when the URL hash changes, including Back/Forward.
window.addEventListener("hashchange", () => {
  const requestedView = window.location.hash.slice(1);
  const viewName = views[requestedView] ? requestedView : "dashboard";

  navigateTo(viewName);
});

menuToggle.addEventListener("click", () => {
  const isOpen = sidebar.classList.contains("is-open");

  if (isOpen) {
    closeMobileMenu(true);
    return;
  }

  sidebar.classList.add("is-open");
  menuToggle.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(focusFirstMobileNavigationLink);
});

sidebar.addEventListener("transitionend", (event) => {
  if (
    (event.target === sidebar && event.propertyName === "transform")
    || (sidebar.contains(event.target) && event.propertyName === "visibility")
  ) {
    focusFirstMobileNavigationLink();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sidebar.classList.contains("is-open")) {
    closeMobileMenu(true);
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) {
    closeMobileMenu();
  }
});

function initializeApp() {
  const requestedView = window.location.hash.slice(1);
  const initialView = views[requestedView] ? requestedView : "dashboard";

  navigateTo(initialView);
}

initializeApp();
