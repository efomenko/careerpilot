
import { createCareerPersistence } from "./career-persistence.js";
import { createDialogManager } from "./dialogs.js";
import { createNavigationController } from "./navigation.js";
import { createNotifications } from "./notifications.js";
import { clearFieldError, showFieldError } from "./feedback.js";
import { validateRequired } from "./validation.js";

const appStatus = document.querySelector("#app-status");
const persistenceStatus = document.querySelector("#persistence-status");
const persistentWarning = document.querySelector("#persistence-persistent-warning");
const transientWarning = document.querySelector("#persistence-transient-warning");

function renderPersistenceStatus(status) {
  persistentWarning.textContent = status.persistentWarning
    ? `Storage warning: ${status.persistentWarning.message}`
    : "";
  persistentWarning.hidden = !status.persistentWarning;
  transientWarning.textContent = status.transientWarning
    ? `Saving warning: ${status.transientWarning.message}`
    : "";
  transientWarning.hidden = !status.transientWarning;
  persistenceStatus.hidden = !status.persistentWarning && !status.transientWarning;
}

function logPersistenceError(error) {
  try {
    console.error("CareerPilot persistence error.", error);
  } catch {
    return;
  }
}

const browserStorage = {
  getItem(key) {
    return globalThis.localStorage.getItem(key);
  },
  setItem(key, value) {
    globalThis.localStorage.setItem(key, value);
  }
};

const careerPersistence = createCareerPersistence(browserStorage, {
  onStatusChange: renderPersistenceStatus,
  onUnexpectedError: logPersistenceError
});
const careerState = careerPersistence.state;
renderPersistenceStatus(careerPersistence.getStatus());

const notifications = createNotifications({
  region: document.querySelector("#ordinary-notification")
});
const dialogManager = createDialogManager({
  discardDialog: document.querySelector("#discard-confirmation"),
  continueEditingButton: document.querySelector("#continue-editing"),
  discardChangesButton: document.querySelector("#discard-changes"),
  fallbackFocus: document.querySelector("#main-content")
});

const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
const currentSection = document.querySelector("#current-section");
const pageTitle = document.querySelector("#page-title");
const navigationLinks = document.querySelectorAll("[data-view]");
const pageViews = document.querySelectorAll("[data-page-view]");
const profileForm = document.querySelector("#profile-form");
const profileDialog = document.querySelector("#profile-dialog");
const profileAction = document.querySelector("#profile-action");
const profileCancel = document.querySelector("#profile-cancel");

const profileEmptyState = document.querySelector("#profile-empty-state");
const profileDetails = document.querySelector("#profile-details");
const profileDisplayName = document.querySelector("#profile-display-name");
const profileDisplayHeadline = document.querySelector("#profile-display-headline");
const profileSummaryText = document.querySelector("#profile-summary-text");
const profileSummaryToggle = document.querySelector("#profile-summary-toggle");
const profileSkillsList = document.querySelector("#profile-skills-list");
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
let profileFormSnapshot = "";
const employmentForm = document.querySelector("#employment-form");
const employmentDialog = document.querySelector("#employment-dialog");
const employmentList = document.querySelector("#employment-list");
const employmentEmpty = document.querySelector("#employment-empty");
const employmentAddAction = document.querySelector("#employment-add-action");
const employmentDeleteDialog = document.querySelector("#employment-delete-dialog");
const employmentDeleteRecordName = document.querySelector("#employment-delete-record-name");
const employmentDeleteCancel = document.querySelector("#employment-delete-cancel");
const employmentDeleteConfirm = document.querySelector("#employment-delete-confirm");
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
let employmentFormSnapshot = "";
let pendingEmploymentDeletion = null;
let isDeletingEmployment = false;
const achievementForm = document.querySelector("#achievement-form");
const achievementDialog = document.querySelector("#achievement-dialog");
const achievementCreateAction = document.querySelector("#achievement-create-action");
const achievementList = document.querySelector("#achievement-list");
const achievementEmpty = document.querySelector("#achievement-empty");
const achievementFormTitle = document.querySelector("#achievement-form-title");
const achievementSubmit = document.querySelector("#achievement-submit");
const achievementCancel = document.querySelector("#achievement-cancel");
const achievementDeleteDialog = document.querySelector("#achievement-delete-dialog");
const achievementDeleteRecordName = document.querySelector("#achievement-delete-record-name");
const achievementDeleteCancel = document.querySelector("#achievement-delete-cancel");
const achievementDeleteConfirm = document.querySelector("#achievement-delete-confirm");
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
let achievementFormSnapshot = "";
let pendingAchievementDeletion = null;
let isDeletingAchievement = false;

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

const navigation = createNavigationController({
  window,
  dialogManager,
  views,
  navigateTo
});

function openDialogWithNavigation(dialog, options) {
  const { onDiscard, ...dialogOptions } = options;
  dialogManager.open(dialog, {
    ...dialogOptions,
    onDiscard() {
      onDiscard?.();
      navigation.discardAndNavigate();
    },
    onContinueEditing() {
      navigation.continueEditing();
    }
  });
  navigation.dialogOpened();
}

function clearProfileFieldErrors() {
  profileFields.forEach((field) => {
    clearFieldError(profileControls[field], profileFieldErrors[field]);
  });
}

const PROFILE_SUMMARY_LIMIT = 200;
let isProfileSummaryExpanded = false;

function renderProfile(profile = careerState.getProfile()) {
  const hasProfile = Boolean(profile);

  profileEmptyState.hidden = hasProfile;
  profileDetails.hidden = !hasProfile;
  profileAction.textContent = hasProfile ? "Edit Profile" : "Create Profile";

  if (!hasProfile) {
    profileDisplayName.textContent = "";
    profileDisplayHeadline.textContent = "";
    profileSummaryText.textContent = "";
    profileSkillsList.replaceChildren();
    profileSummaryToggle.hidden = true;
    profileSummaryToggle.setAttribute("aria-expanded", "false");
    isProfileSummaryExpanded = false;
    return;
  }

  profileDisplayName.textContent = profile.fullName;
  profileDisplayHeadline.textContent = profile.headline || "Not provided";

  const summary = profile.summary || "Not provided";
  const summaryIsLong = summary.length > PROFILE_SUMMARY_LIMIT;

  isProfileSummaryExpanded = false;
  profileSummaryToggle.hidden = !summaryIsLong;
  profileSummaryToggle.setAttribute("aria-expanded", "false");

  if (summaryIsLong) {
    const cutoff = summary.lastIndexOf(" ", PROFILE_SUMMARY_LIMIT);

    const preview = summary.slice(
      0,
      cutoff > 0 ? cutoff : PROFILE_SUMMARY_LIMIT
    );

    profileSummaryText.textContent = `${preview.trimEnd()}...`;
    profileSummaryToggle.textContent = "Expand summary";
  } else {
    profileSummaryText.textContent = summary;
  }

  profileSkillsList.replaceChildren();

  if (profile.skills.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Not provided";
    profileSkillsList.append(item);
    return;
  }

  profile.skills.forEach((skill) => {
    const item = document.createElement("li");
    item.textContent = skill;
    profileSkillsList.append(item);
  });
}

function populateProfileForm(profile) {
  profileControls.fullName.value = profile?.fullName ?? "";
  profileControls.headline.value = profile?.headline ?? "";
  profileControls.summary.value = profile?.summary ?? "";
  profileControls.skills.value = profile?.skills.join("\n") ?? "";
}

function getProfileFormSnapshot() {
  return JSON.stringify(profileFields.map((field) => profileControls[field].value));
}

function openProfileDialog() {
  const profile = careerState.getProfile();
  populateProfileForm(profile);
  clearProfileFieldErrors();
  profileFormSnapshot = getProfileFormSnapshot();

  openDialogWithNavigation(profileDialog, {
    invoker: profileAction,
    initialFocus: profileControls.fullName,
    isDirty: () => getProfileFormSnapshot() !== profileFormSnapshot,
    onDiscard() {
      populateProfileForm(careerState.getProfile());
      clearProfileFieldErrors();
      profileFormSnapshot = getProfileFormSnapshot();
    }
  });
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

  const input = readProfileForm();
  const requiredName = validateRequired(input.fullName, "your full name");

  if (!requiredName.valid) {
    showFieldError(
      profileControls.fullName,
      profileFieldErrors.fullName,
      requiredName.message
    );
    notifications.show("error", requiredName.message);
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

    dialogManager.closeAfterMutation();
    populateProfileForm(profile);
    renderProfile(profile);
    notifications.show(
      "success",
      existingProfile ? "Profile updated." : "Profile created."
    );
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showProfileValidationErrors(error.errors);
    }

    const message = error.message || "The profile could not be saved.";
    notifications.show("error", message);
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
  employmentControls.endDate.disabled = false;
  clearEmploymentFieldErrors();
}

function populateEmploymentForm(record) {
  employmentControls.employer.value = record?.employer ?? "";
  employmentControls.roleTitle.value = record?.roleTitle ?? "";
  employmentControls.startDate.value = record?.startDate ?? "";
  employmentControls.endDate.value = record?.endDate ?? "";
  employmentControls.isCurrent.checked = record?.isCurrent ?? false;
  employmentControls.endDate.disabled = employmentControls.isCurrent.checked;
  employmentControls.responsibilities.value = record?.responsibilities.join("\n") ?? "";
  employmentFormTitle.textContent = record
    ? `Edit ${record.roleTitle}`
    : "Add employment";
  employmentSubmit.textContent = record ? "Save changes" : "Add employment";
}

function getEmploymentFormSnapshot() {
  return JSON.stringify(
    employmentFields.map((field) => field === "isCurrent"
      ? employmentControls[field].checked
      : employmentControls[field].value)
  );
}

function openEmploymentDialog({ invoker, record = null }) {
  editingEmploymentId = record?.id ?? null;
  populateEmploymentForm(record);
  clearEmploymentFieldErrors();
  employmentFormSnapshot = getEmploymentFormSnapshot();

  openDialogWithNavigation(employmentDialog, {
    invoker,
    initialFocus: employmentControls.employer,
    isDirty: () => getEmploymentFormSnapshot() !== employmentFormSnapshot,
    onDiscard() {
      const savedRecord = editingEmploymentId === null
        ? null
        : careerState.getEmploymentRecords()
          .find((item) => item.id === editingEmploymentId) ?? null;

      editingEmploymentId = savedRecord?.id ?? null;
      populateEmploymentForm(savedRecord);
      clearEmploymentFieldErrors();
      employmentFormSnapshot = getEmploymentFormSnapshot();
    }
  });
}

function renderEmploymentRecords() {
  const records = careerState.getEmploymentRecords();
  employmentList.replaceChildren();
  employmentEmpty.hidden = records.length > 0;

  records.forEach((record) => {
    const article = document.createElement("article");
    article.className = "employment-record";
    article.dataset.employmentId = record.id;
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
    editButton.addEventListener("click", () => beginEmploymentEdit(record, editButton));

    const deleteButton = document.createElement("button");
    deleteButton.className = "employment-action employment-action--delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${record.roleTitle} at ${record.employer}`);
    deleteButton.addEventListener("click", () =>
      openEmploymentDeleteDialog(record, deleteButton)
    );

    actions.append(editButton, deleteButton);
    article.append(actions);
    employmentList.append(article);
  });
}

function beginEmploymentEdit(record, invoker) {
  openEmploymentDialog({ invoker, record });
}

function focusEmploymentEditAction(recordId) {
  const record = [...employmentList.querySelectorAll(".employment-record")]
    .find((item) => item.dataset.employmentId === recordId);
  const editAction = record?.querySelector(
    ".employment-action:not(.employment-action--delete)"
  );

  (editAction ?? employmentAddAction).focus();
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
    notifications.show("error", "Enter an employer, role title, and start date.");
    const firstInvalid = [employerRequired, roleRequired, startDateRequired]
      .findIndex((result) => !result.valid);
    employmentControls[["employer", "roleTitle", "startDate"][firstInvalid]].focus();
    return;
  }

  const existingId = editingEmploymentId;
  try {
    const savedRecord = existingId !== null
      ? careerState.updateEmploymentRecord(
        existingId,
        input,
        new Date().toISOString()
      )
      : careerState.addEmploymentRecord(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });

    dialogManager.closeAfterMutation();
    resetEmploymentForm();
    renderEmploymentRecords();
    renderAchievementRecords();
    notifications.show(
      "success",
      existingId !== null ? "Employment record updated." : "Employment record added."
    );
    focusEmploymentEditAction(savedRecord.id);
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showEmploymentValidationErrors(error.errors);
    }

    notifications.show(
      "error",
      error.message || "The employment record could not be saved."
    );
  }
}

function openEmploymentDeleteDialog(record, invoker) {
  if (
    dialogManager.isOpen()
    || employmentDialog.open
    || employmentDeleteDialog.open
  ) {
    return;
  }

  const records = careerState.getEmploymentRecords();
  const recordIndex = records.findIndex((item) => item.id === record.id);
  if (recordIndex === -1) {
    notifications.show("error", "The employment record could not be found.");
    return;
  }

  pendingEmploymentDeletion = {
    id: record.id,
    focusRecordId: records[recordIndex + 1]?.id
      ?? records[recordIndex - 1]?.id
      ?? null
  };
  employmentDeleteRecordName.textContent = `${record.roleTitle} at ${record.employer}`;

  try {
    dialogManager.open(employmentDeleteDialog, {
      invoker,
      initialFocus: employmentDeleteCancel,
      isDirty: () => false
    });
  } catch (error) {
    pendingEmploymentDeletion = null;
    notifications.show(
      "error",
      error.message || "The employment deletion confirmation could not be opened."
    );
  }
}

function confirmEmploymentDeletion() {
  const pendingDeletion = pendingEmploymentDeletion;
  if (
    !pendingDeletion
    || !employmentDeleteDialog.open
    || isDeletingEmployment
  ) {
    return;
  }

  isDeletingEmployment = true;
  try {
    careerState.deleteEmploymentRecord(pendingDeletion.id);
  } catch (error) {
    isDeletingEmployment = false;
    notifications.show(
      "error",
      error.message || "The employment record could not be deleted."
    );
    return;
  }

  pendingEmploymentDeletion = null;
  isDeletingEmployment = false;
  dialogManager.closeAfterMutation();
  renderEmploymentRecords();
  renderAchievementRecords();
  if (editingEmploymentId === pendingDeletion.id) {
    resetEmploymentForm();
  }
  notifications.show("success", "Employment record deleted.");
  focusEmploymentEditAction(pendingDeletion.focusRecordId);
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

function addAchievementAction(value = "", shouldFocus = true) {
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
    document.querySelector("#achievement-add-action").focus();
  });
  row.append(remove);
  achievementActions.append(row);
  if (shouldFocus) {
    action.focus();
  }
}

function addAchievementMetric(metric = {}, shouldFocus = true) {
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
    document.querySelector("#achievement-add-metric").focus();
  });

  row.append(fields, remove);
  achievementMetrics.append(row);
  if (shouldFocus) {
    fields.querySelector("input").focus();
  }
}

function addAchievementEvidence(value = "", shouldFocus = true) {
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
    document.querySelector("#achievement-add-evidence").focus();
  });
  row.append(remove);
  achievementEvidence.append(row);
  if (shouldFocus) {
    evidence.focus();
  }
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
  try {
    const updatedRecord = careerState.updateAchievementVerificationStatus(
      recordId,
      select.value,
      new Date().toISOString()
    );
    dialogManager.closeAfterMutation();
    renderAchievementRecords();
    notifications.show(
      "success",
      `Verification status updated to ${getAchievementVerificationLabel(updatedRecord.verificationStatus)}.`
    );
    focusAchievementAction(recordId, ".achievement-status-update");
  } catch (error) {
    renderAchievementRecords();
    notifications.show(
      "error",
      error.message || "The verification status could not be updated."
    );
    focusAchievementAction(recordId, ".achievement-status-update");
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
    article.dataset.achievementId = record.id;
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

    appendAchievementText(article, "Contribution", record.contribution);
    if (record.outcome) {
      appendAchievementText(article, "Actual outcome", record.outcome);
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
    } else {
      appendAchievementText(article, "Employment", "No employment link");
    }

    const actions = document.createElement("div");
    actions.className = "achievement-record-actions";
    const editButton = document.createElement("button");
    editButton.className = "achievement-action-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit achievement: ${record.title}`);
    editButton.addEventListener("click", () =>
      beginAchievementEdit(record, editButton)
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "achievement-action-button achievement-action-button--delete";
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete achievement: ${record.title}`);
    deleteButton.addEventListener("click", () =>
      openAchievementDeleteDialog(record, deleteButton)
    );
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
  clearAchievementFieldErrors();
}

function populateAchievementForm(record) {
  resetAchievementForm();

  if (!record) {
    renderAchievementEmploymentOptions();
    return;
  }

  editingAchievementId = record.id;
  achievementControls.title.value = record.title;
  achievementControls.context.value = record.context;
  achievementControls.contribution.value = record.contribution;
  achievementControls.outcome.value = record.outcome;
  achievementControls.potentialImpact.value = record.potentialImpact;
  renderAchievementEmploymentOptions(record.employmentId ?? "");
  record.actions.forEach((action) => addAchievementAction(action, false));
  record.metrics.forEach((metric) => addAchievementMetric(metric, false));
  record.evidence.forEach((value) =>
    addAchievementEvidence(JSON.stringify(value), false)
  );
  achievementFormTitle.textContent = `Edit ${record.title}`;
  achievementSubmit.textContent = "Save changes";
}

function getAchievementFormSnapshot() {
  const metrics = [...achievementMetrics.querySelectorAll(".achievement-metric-entry")]
    .map((row) => [...row.querySelectorAll("[data-metric-field]")]
      .map((control) => [control.dataset.metricField, control.value]));

  return JSON.stringify({
    title: achievementControls.title.value,
    context: achievementControls.context.value,
    contribution: achievementControls.contribution.value,
    outcome: achievementControls.outcome.value,
    potentialImpact: achievementControls.potentialImpact.value,
    employmentId: achievementEmployment.value,
    actions: [...achievementActions.querySelectorAll("input")]
      .map((control) => control.value),
    metrics,
    evidence: [...achievementEvidence.querySelectorAll("textarea")]
      .map((control) => control.value)
  });
}

function openAchievementDialog({ invoker, record = null }) {
  if (dialogManager.isOpen() || achievementDeleteDialog.open) {
    return;
  }

  populateAchievementForm(record);
  achievementFormSnapshot = getAchievementFormSnapshot();

  openDialogWithNavigation(achievementDialog, {
    invoker,
    initialFocus: achievementControls.title,
    isDirty: () => getAchievementFormSnapshot() !== achievementFormSnapshot,
    onDiscard() {
      const savedRecord = editingAchievementId === null
        ? null
        : careerState.getAchievementRecords()
          .find((item) => item.id === editingAchievementId) ?? null;

      populateAchievementForm(savedRecord);
      achievementFormSnapshot = getAchievementFormSnapshot();
    }
  });
}

function beginAchievementEdit(record, invoker) {
  openAchievementDialog({ invoker, record });
}

function focusAchievementAction(recordId, selector) {
  const article = [...achievementList.querySelectorAll(".achievement-record")]
    .find((item) => item.dataset.achievementId === recordId);
  const action = article?.querySelector(selector);

  (action ?? achievementCreateAction).focus();
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

  try {
    const input = readAchievementForm();
    let successMessage;
    let savedRecord;
    if (editingAchievementId) {
      const existingRecord = careerState.getAchievementRecords()
        .find((record) => record.id === editingAchievementId);
      savedRecord = careerState.updateAchievementRecord(
        editingAchievementId,
        input,
        new Date().toISOString()
      );
      successMessage = existingRecord.verificationStatus === "verified"
        && savedRecord.verificationStatus === "unverified"
        ? "Achievement content changed. Verification was reset to Unverified."
        : "Achievement updated.";
    } else {
      savedRecord = careerState.addAchievementRecord(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });
      successMessage = "Achievement added.";
    }

    dialogManager.closeAfterMutation();
    resetAchievementForm();
    renderAchievementRecords();
    notifications.show("success", successMessage);
    focusAchievementAction(
      savedRecord.id,
      ".achievement-action-button:not(.achievement-action-button--delete)"
    );
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showAchievementValidationErrors(error.errors);
    }

    notifications.show(
      "error",
      error.message || "The achievement could not be saved."
    );
  }
}

function openAchievementDeleteDialog(record, invoker) {
  if (dialogManager.isOpen() || achievementDialog.open || achievementDeleteDialog.open) {
    return;
  }

  const records = careerState.getAchievementRecords();
  const recordIndex = records.findIndex((item) => item.id === record.id);
  if (recordIndex === -1) {
    notifications.show("error", "The achievement could not be found.");
    return;
  }

  pendingAchievementDeletion = {
    id: record.id,
    focusRecordId: records[recordIndex + 1]?.id
      ?? records[recordIndex - 1]?.id
      ?? null
  };
  achievementDeleteRecordName.textContent = record.title;

  try {
    dialogManager.open(achievementDeleteDialog, {
      invoker,
      initialFocus: achievementDeleteCancel,
      isDirty: () => false
    });
  } catch (error) {
    pendingAchievementDeletion = null;
    notifications.show(
      "error",
      error.message || "The achievement deletion confirmation could not be opened."
    );
  }
}

function confirmAchievementDeletion() {
  const pendingDeletion = pendingAchievementDeletion;
  if (
    !pendingDeletion
    || !achievementDeleteDialog.open
    || isDeletingAchievement
  ) {
    return;
  }

  isDeletingAchievement = true;
  try {
    careerState.deleteAchievementRecord(pendingDeletion.id);
  } catch (error) {
    isDeletingAchievement = false;
    notifications.show(
      "error",
      error.message || "The achievement could not be deleted."
    );
    return;
  }

  pendingAchievementDeletion = null;
  isDeletingAchievement = false;
  dialogManager.closeAfterMutation();
  if (editingAchievementId === pendingDeletion.id) {
    resetAchievementForm();
  }
  renderAchievementRecords();
  notifications.show("success", "Achievement deleted.");
  focusAchievementAction(
    pendingDeletion.focusRecordId,
    ".achievement-action-button:not(.achievement-action-button--delete)"
  );
}

profileSummaryToggle.addEventListener("click", () => {
  const profile = careerState.getProfile();

  if (!profile) {
    return;
  }

  isProfileSummaryExpanded = !isProfileSummaryExpanded;

  if (isProfileSummaryExpanded) {
    profileSummaryText.textContent = profile.summary;
    profileSummaryToggle.textContent = "Collapse summary";
  } else {
    const cutoff = profile.summary.lastIndexOf(" ", PROFILE_SUMMARY_LIMIT);
    const preview = profile.summary.slice(
      0,
      cutoff > 0 ? cutoff : PROFILE_SUMMARY_LIMIT
    );

    profileSummaryText.textContent = `${preview.trimEnd()}...`;
    profileSummaryToggle.textContent = "Expand summary";
  }

  profileSummaryToggle.setAttribute(
    "aria-expanded",
    String(isProfileSummaryExpanded)
  );
});
profileAction.addEventListener("click", openProfileDialog);
profileCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
profileForm.addEventListener("submit", saveProfile);
profileForm.addEventListener("input", (event) => {
  const field = profileFields.find((item) => profileControls[item] === event.target);

  if (field) {
    clearFieldError(profileControls[field], profileFieldErrors[field]);
  }
});

employmentAddAction.addEventListener("click", () => {
  resetEmploymentForm();
  openEmploymentDialog({ invoker: employmentAddAction });
});
employmentForm.addEventListener("submit", saveEmploymentRecord);
employmentForm.addEventListener("input", (event) => {
  const field = employmentFields.find((item) => employmentControls[item] === event.target);

  if (field) {
    clearFieldError(employmentControls[field], employmentFieldErrors[field]);
  }
});
employmentControls.isCurrent.addEventListener("change", () => {
  employmentControls.endDate.disabled = employmentControls.isCurrent.checked;
  clearFieldError(employmentControls.endDate, employmentFieldErrors.endDate);
  clearFieldError(employmentControls.isCurrent, employmentFieldErrors.isCurrent);
});
employmentCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
employmentDeleteDialog.addEventListener("cancel", () => {
  if (!isDeletingEmployment) {
    pendingEmploymentDeletion = null;
  }
});
employmentDeleteCancel.addEventListener("click", () => {
  dialogManager.requestClose();
  pendingEmploymentDeletion = null;
});
employmentDeleteConfirm.addEventListener("click", confirmEmploymentDeletion);

achievementForm.addEventListener("submit", saveAchievementRecord);
achievementForm.addEventListener("input", (event) => {
  const field = event.target.closest(".achievement-field");
  const control = field?.querySelector("input, textarea, select");
  const error = field?.querySelector(".achievement-field-error");

  if (control && error) {
    clearFieldError(control, error);
  }
});
achievementForm.addEventListener("change", (event) => {
  const field = event.target.closest(".achievement-field");
  const control = field?.querySelector("input, textarea, select");
  const error = field?.querySelector(".achievement-field-error");

  if (control && error) {
    clearFieldError(control, error);
  }
});
achievementCreateAction.addEventListener("click", () => {
  openAchievementDialog({ invoker: achievementCreateAction });
});
document.querySelector("#achievement-add-action").addEventListener("click", () => {
  addAchievementAction();
});
document.querySelector("#achievement-add-metric").addEventListener("click", () => {
  addAchievementMetric();
});
document.querySelector("#achievement-add-evidence").addEventListener("click", () => {
  addAchievementEvidence();
});
achievementCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
achievementDeleteDialog.addEventListener("cancel", () => {
  if (!isDeletingAchievement) {
    pendingAchievementDeletion = null;
  }
});
achievementDeleteCancel.addEventListener("click", () => {
  dialogManager.requestClose();
  pendingAchievementDeletion = null;
});
achievementDeleteConfirm.addEventListener("click", confirmAchievementDeletion);

const initialProfile = careerState.getProfile();

populateProfileForm(initialProfile);
renderProfile(initialProfile);
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

function navigateTo(viewName, { focusDestination = false } = {}) {
  const view = views[viewName];

  if (!view) {
    return;
  }

  if (!appStatus) {
    console.error("CareerPilot could not find the application status element.");
    return;
  }

  const menuWasOpen = sidebar.classList.contains("is-open");
  const viewChanged = ![...pageViews].some((page) =>
    !page.hidden && page.dataset.pageView === viewName
  );
  if (viewChanged) {
    notifications.clearSuccess();
  }

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

  if (menuWasOpen || focusDestination) {
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

    navigation.navigate(viewName);
  });
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
  if (
    event.key === "Escape"
    && !dialogManager.isOpen()
    && sidebar.classList.contains("is-open")
  ) {
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

navigation.start();
initializeApp();
