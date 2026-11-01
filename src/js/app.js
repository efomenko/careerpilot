
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
    status: "Achievement management is planned for a future development task."
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

populateProfileForm(careerState.getProfile());
renderEmploymentRecords();

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
