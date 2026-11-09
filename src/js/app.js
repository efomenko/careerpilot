
import { createCareerPersistence } from "./career-persistence.js";
import { createDialogManager } from "./dialogs.js";
import { createNavigationController } from "./navigation.js";
import { createNotifications } from "./notifications.js";
import { createJobRecord } from "./job-model.js";
import { createRequirementRecord } from "./requirement-model.js";
import { createAchievementMappingRecord } from "./achievement-mapping-model.js";
import { getJobListResults } from "./job-ui-helpers.js";
import { getDashboardSummary } from "./dashboard-summary-helpers.js";
import {
  getAchievementMappingSelectorState,
  getMappedAchievementEvidence
} from "./achievement-mapping-ui-helpers.js";
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
const dashboardSummaryError = document.querySelector("#dashboard-summary-error");
const dashboardJobCount = document.querySelector("#dashboard-job-count");
const dashboardJobStatusCounts = document.querySelector("#dashboard-job-status-counts");
const dashboardRecentJobs = document.querySelector("#dashboard-recent-jobs");
const dashboardRecentJobsEmpty = document.querySelector("#dashboard-recent-jobs-empty");
const dashboardRequirementCount = document.querySelector("#dashboard-requirement-count");
const dashboardMappedRequirements = document.querySelector(
  "#dashboard-mapped-requirements"
);
const dashboardMappedCoverage = document.querySelector("#dashboard-mapped-coverage");
const dashboardVerifiedRequirements = document.querySelector(
  "#dashboard-verified-requirements"
);
const dashboardVerifiedCoverage = document.querySelector(
  "#dashboard-verified-coverage"
);
const dashboardAssessedJobCount = document.querySelector("#dashboard-assessed-job-count");
const dashboardAverageScore = document.querySelector("#dashboard-average-score");
const dashboardStrongestJobs = document.querySelector("#dashboard-strongest-jobs");
const dashboardStrongestJobsEmpty = document.querySelector(
  "#dashboard-strongest-jobs-empty"
);
const dashboardJobsNeedingEvidence = document.querySelector(
  "#dashboard-jobs-needing-evidence"
);
const dashboardNextStepHeading = document.querySelector("#dashboard-next-step-heading");
const dashboardNextStepDescription = document.querySelector(
  "#dashboard-next-step-description"
);
const dashboardNextStepLink = document.querySelector(
  ".next-step-card .primary-link"
);
const dashboardNextStepLinkLabel = document.querySelector(
  "#dashboard-next-step-link-label"
);
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
const achievementDeleteMappingImpact = document.querySelector(
  "#achievement-delete-mapping-impact"
);
const achievementDeleteCancel = document.querySelector("#achievement-delete-cancel");
const achievementDeleteConfirm = document.querySelector("#achievement-delete-confirm");
const achievementActions = document.querySelector("#achievement-actions");
const achievementMetrics = document.querySelector("#achievement-metrics");
const achievementEvidence = document.querySelector("#achievement-evidence");
const achievementEmployment = document.querySelector("#achievement-employment");
const jobList = document.querySelector("#job-list");
const jobFilter = document.querySelector("#job-filter");
const jobEmpty = document.querySelector("#job-empty");
const jobEmptyMessage = document.querySelector("#job-empty-message");
const jobFilterEmpty = document.querySelector("#job-filter-empty");
const jobSearchInput = document.querySelector("#job-search-input");
const jobSearchClear = document.querySelector("#job-search-clear");
const jobSearchEmpty = document.querySelector("#job-search-empty");
const jobSearchEmptyClear = document.querySelector("#job-search-empty-clear");
const jobResultCount = document.querySelector("#job-result-count");
const jobListPanel = document.querySelector("#job-list-panel");
const jobDialog = document.querySelector("#job-dialog");
const jobForm = document.querySelector("#job-form");
const jobCreateAction = document.querySelector("#job-create-action");
const jobEmptyCreateAction = document.querySelector("#job-empty-create-action");
const jobEditAction = document.querySelector("#job-edit-action");
const jobDetailPanel = document.querySelector("#job-detail-panel");
const jobBackAction = document.querySelector("#job-back-action");
const jobArchiveAction = document.querySelector("#job-archive-action");
const jobDetailTitle = document.querySelector("#job-detail-title");
const jobDetailCompany = document.querySelector("#job-detail-company");
const jobDetailStatus = document.querySelector("#job-detail-status");
const jobDetailDescription = document.querySelector("#job-detail-description");
const jobDetailSourceUrl = document.querySelector("#job-detail-source-url");
const jobDetailNotes = document.querySelector("#job-detail-notes");
const jobDetailCreated = document.querySelector("#job-detail-created");
const jobDetailUpdated = document.querySelector("#job-detail-updated");
const jobFitAssessmentStatus = document.querySelector("#job-fit-assessment-status");
const jobFitAssessmentSummary = document.querySelector("#job-fit-assessment-summary");
const jobFitAssessmentScore = document.querySelector("#job-fit-assessment-score");
const jobFitAssessmentRequirements = document.querySelector(
  "#job-fit-assessment-requirements"
);
const jobFitAssessmentMandatory = document.querySelector(
  "#job-fit-assessment-mandatory"
);
const jobFitAssessmentEmpty = document.querySelector("#job-fit-assessment-empty");
const jobFitAssessmentResults = document.querySelector("#job-fit-assessment-results");
const jobRequirementsList = document.querySelector("#job-requirements-list");
const jobRequirementsEmpty = document.querySelector("#job-requirements-empty");
const requirementAddAction = document.querySelector("#requirement-add-action");
const requirementDialog = document.querySelector("#requirement-dialog");
const requirementForm = document.querySelector("#requirement-form");
const requirementFormTitle = document.querySelector("#requirement-form-title");
const requirementSubmit = document.querySelector("#requirement-submit");
const requirementCancel = document.querySelector("#requirement-cancel");
const requirementDeleteDialog = document.querySelector("#requirement-delete-dialog");
const requirementDeleteDescription = document.querySelector("#requirement-delete-description");
const requirementDeleteCancel = document.querySelector("#requirement-delete-cancel");
const requirementDeleteConfirm = document.querySelector("#requirement-delete-confirm");
const achievementMappingSelectorDialog = document.querySelector(
  "#achievement-mapping-selector-dialog"
);
const achievementMappingSelectorRequirement = document.querySelector(
  "#achievement-mapping-selector-requirement"
);
const achievementMappingSearch = document.querySelector("#achievement-mapping-search");
const achievementMappingSearchClear = document.querySelector(
  "#achievement-mapping-search-clear"
);
const achievementMappingResults = document.querySelector(
  "#achievement-mapping-results"
);
const achievementMappingVerifiedGroup = document.querySelector(
  "#achievement-mapping-verified-group"
);
const achievementMappingVerifiedHeading = document.querySelector(
  "#achievement-mapping-verified-heading"
);
const achievementMappingVerifiedList = document.querySelector(
  "#achievement-mapping-verified-list"
);
const achievementMappingUnverifiedGroup = document.querySelector(
  "#achievement-mapping-unverified-group"
);
const achievementMappingUnverifiedHeading = document.querySelector(
  "#achievement-mapping-unverified-heading"
);
const achievementMappingUnverifiedList = document.querySelector(
  "#achievement-mapping-unverified-list"
);
const achievementMappingNoAchievements = document.querySelector(
  "#achievement-mapping-no-achievements"
);
const achievementMappingAllMapped = document.querySelector(
  "#achievement-mapping-all-mapped"
);
const achievementMappingNoMatches = document.querySelector(
  "#achievement-mapping-no-matches"
);
const achievementMappingGoToAchievements = document.querySelector(
  "#achievement-mapping-go-to-achievements"
);
const achievementMappingCancel = document.querySelector(
  "#achievement-mapping-cancel"
);
const requirementControls = {
  description: document.querySelector("#requirement-description"),
  category: document.querySelector("#requirement-category"),
  importance: document.querySelector("#requirement-importance")
};
const requirementFieldErrors = {
  description: document.querySelector("#requirement-description-error"),
  category: document.querySelector("#requirement-category-error"),
  importance: document.querySelector("#requirement-importance-error")
};
const requirementFields = Object.keys(requirementControls);
const jobDeleteAction = document.querySelector("#job-delete-action");
const jobDeleteDialog = document.querySelector("#job-delete-dialog");
const jobDeleteCancel = document.querySelector("#job-delete-cancel");
const jobDeleteConfirm = document.querySelector("#job-delete-confirm");
const jobFormTitle = document.querySelector("#job-form-title");
const jobSubmit = document.querySelector("#job-submit");
const jobCancel = document.querySelector("#job-cancel");
const jobControls = {
  company: document.querySelector("#job-company"),
  roleTitle: document.querySelector("#job-role-title"),
  description: document.querySelector("#job-description"),
  sourceUrl: document.querySelector("#job-source-url"),
  notes: document.querySelector("#job-notes")
};
const jobFieldErrors = {
  company: document.querySelector("#job-company-error"),
  roleTitle: document.querySelector("#job-role-title-error"),
  description: document.querySelector("#job-description-error"),
  sourceUrl: document.querySelector("#job-source-url-error"),
  notes: document.querySelector("#job-notes-error")
};
const jobFields = Object.keys(jobControls);
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
let selectedJobStatus = "active";
let editingJobId = null;
let jobFormSnapshot = "";
let pendingJobDeletionId = null;
let isDeletingJob = false;
let editingRequirementId = null;
let editingRequirementJobId = null;
let requirementFormSnapshot = "";
let pendingRequirementDeletion = null;
let isDeletingRequirement = false;
let activeAchievementMappingSelection = null;
let pendingMappingReturnContext = null;

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

function renderDashboardUnavailable(error) {
  dashboardSummaryError.textContent =
    error.message || "The Dashboard summary could not be calculated.";
  dashboardSummaryError.hidden = false;
  dashboardJobCount.textContent = "Unavailable";
  dashboardJobStatusCounts.textContent = "Job counts unavailable.";
  dashboardRecentJobs.replaceChildren();
  dashboardRecentJobsEmpty.textContent = "Recent Jobs unavailable.";
  dashboardRecentJobsEmpty.hidden = false;
  dashboardRequirementCount.textContent = "Unavailable";
  dashboardMappedRequirements.textContent = "Unavailable";
  dashboardMappedCoverage.textContent = "Unavailable";
  dashboardVerifiedRequirements.textContent = "Unavailable";
  dashboardVerifiedCoverage.textContent = "Unavailable";
  dashboardAssessedJobCount.textContent = "Unavailable";
  dashboardAverageScore.textContent = "Unavailable";
  dashboardStrongestJobs.replaceChildren();
  dashboardStrongestJobsEmpty.textContent = "Strongest Job data unavailable.";
  dashboardStrongestJobsEmpty.hidden = false;
  dashboardJobsNeedingEvidence.textContent = "Unavailable";
}

function renderDashboard() {
  try {
    const hasProfile = Boolean(careerState.getProfile());
    dashboardNextStepHeading.textContent = hasProfile
      ? "Build your career evidence"
      : "Start with your career story";
    dashboardNextStepDescription.textContent = hasProfile
      ? "Record your achievements and supporting evidence to connect your experience with Job Requirements."
      : "Before tailoring applications, build a reliable record of your experience, achievements, and supporting evidence.";
    dashboardNextStepLinkLabel.textContent = hasProfile
      ? "Add achievements"
      : "Set up profile";
    dashboardNextStepLink.href = hasProfile ? "#achievements" : "#profile";
    dashboardNextStepLink.dataset.view = hasProfile ? "achievements" : "profile";

    const jobs = careerState.getJobs();
    const requirements = jobs.flatMap((job) => careerState.getRequirements(job.id));
    const mappings = requirements.flatMap((requirement) =>
      careerState.getAchievementMappingsForRequirement(requirement.id)
    );
    const assessments = jobs.map((job) =>
      careerState.calculateJobFitAssessment(job.id)
    );
    const summary = getDashboardSummary(jobs, requirements, mappings, assessments);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    dashboardSummaryError.textContent = "";
    dashboardSummaryError.hidden = true;
    dashboardJobCount.textContent =
      `${summary.jobCounts.total} ${summary.jobCounts.total === 1 ? "Job" : "Jobs"}`;
    dashboardJobStatusCounts.textContent =
      `${summary.jobCounts.active} Active · ${summary.jobCounts.archived} Archived`;

    dashboardRecentJobs.replaceChildren();
    dashboardRecentJobsEmpty.hidden = summary.recentJobs.length > 0;
    summary.recentJobs.forEach((job) => {
      const item = document.createElement("li");
      item.textContent =
        `${job.roleTitle} at ${job.company} — ${formatJobTimestamp(job.updatedAt)}`;
      dashboardRecentJobs.append(item);
    });

    const coverage = summary.requirementCoverage;
    dashboardRequirementCount.textContent =
      `${coverage.totalRequirements} ${coverage.totalRequirements === 1 ? "Requirement" : "Requirements"}`;
    dashboardMappedRequirements.textContent =
      `${coverage.mappedRequirements} of ${coverage.totalRequirements}`;
    dashboardMappedCoverage.textContent = coverage.mappedCoveragePercent === null
      ? "N/A"
      : `${coverage.mappedCoveragePercent.toFixed(1)}%`;
    dashboardVerifiedRequirements.textContent =
      `${coverage.verifiedSupportedRequirements} of ${coverage.totalRequirements}`;
    dashboardVerifiedCoverage.textContent = coverage.verifiedCoveragePercent === null
      ? "N/A"
      : `${coverage.verifiedCoveragePercent.toFixed(1)}%`;

    const fitAssessments = summary.fitAssessments;
    dashboardAssessedJobCount.textContent = String(fitAssessments.assessedJobCount);
    dashboardAverageScore.textContent = fitAssessments.averageScore === null
      ? "N/A"
      : `${fitAssessments.averageScore.toFixed(1)}%`;
    dashboardJobsNeedingEvidence.textContent =
      String(fitAssessments.jobsNeedingEvidenceCount);
    dashboardStrongestJobs.replaceChildren();
    dashboardStrongestJobsEmpty.hidden = fitAssessments.strongestJobs.length > 0;
    fitAssessments.strongestJobs.forEach(({ jobId, score }) => {
      const item = document.createElement("li");
      const job = jobsById.get(jobId);
      item.textContent = job
        ? `${job.roleTitle} at ${job.company} — ${score.toFixed(1)}%`
        : `Job record unavailable — ${score.toFixed(1)}%`;
      dashboardStrongestJobs.append(item);
    });
  } catch (error) {
    renderDashboardUnavailable(error);
  }
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

function renderJobRecords() {
  const records = careerState.getJobs();
  const {
    statusRecords,
    matchingRecords,
    normalizedQuery: searchQuery
  } = getJobListResults(records, selectedJobStatus, jobSearchInput.value);

  jobList.replaceChildren();
  matchingRecords.forEach((record) => {
    const article = document.createElement("article");
    article.className = "job-record";
    article.dataset.jobId = record.id;
    article.setAttribute("role", "listitem");

    const openButton = document.createElement("button");
    openButton.className = "job-record-open";
    openButton.type = "button";
    openButton.setAttribute(
      "aria-label",
      `Open ${record.roleTitle} at ${record.company}`
    );
    openButton.addEventListener("click", () => openJobDetail(record.id));

    const main = document.createElement("span");
    main.className = "job-record-main";

    const company = document.createElement("span");
    company.className = "job-record-company";
    company.textContent = record.company;

    const roleTitle = document.createElement("span");
    roleTitle.className = "job-record-title";
    roleTitle.textContent = record.roleTitle;

    const status = document.createElement("span");
    status.className = "job-record-status";
    const statusBadge = document.createElement("span");
    statusBadge.className = record.status === "archived"
      ? "job-status job-status--archived"
      : "job-status";
    statusBadge.textContent = record.status === "archived" ? "Archived" : "Active";
    status.append(statusBadge);

    main.append(company, roleTitle);
    openButton.append(main, status);
    article.append(openButton);
    jobList.append(article);
  });

  const hasJobs = records.length > 0;
  const hasStatusJobs = statusRecords.length > 0;
  const hasMatchingJobs = matchingRecords.length > 0;
  jobSearchClear.hidden = searchQuery.length === 0;
  jobSearchEmpty.hidden = !searchQuery || hasMatchingJobs;
  jobEmpty.hidden = hasJobs || Boolean(searchQuery);
  jobFilterEmpty.hidden = !hasJobs || hasStatusJobs || Boolean(searchQuery);
  jobResultCount.textContent = `${matchingRecords.length} ${matchingRecords.length === 1 ? "job" : "jobs"} found`;
  if (!searchQuery && !hasStatusJobs && hasJobs) {
    const statusName = selectedJobStatus === "archived" ? "archived" : "active";
    jobFilterEmpty.textContent = `No ${statusName} Jobs yet. ${statusName[0].toUpperCase()}${statusName.slice(1)} Jobs will appear here when available.`;
  } else if (!searchQuery && !hasJobs) {
    const statusName = selectedJobStatus === "archived" ? "archived" : "active";
    jobEmptyMessage.textContent = `No ${statusName} Jobs yet. ${statusName[0].toUpperCase()}${statusName.slice(1)} Jobs will appear here when available.`;
  }
}

function formatJobTimestamp(value) {
  return new Date(value).toLocaleString();
}

function formatRequirementCategory(category) {
  return category[0].toUpperCase() + category.slice(1);
}

function renderAchievementMappingResults() {
  const selection = activeAchievementMappingSelection;
  if (!selection) {
    return;
  }

  const achievements = careerState.getAchievementRecords();
  const mappings = careerState.getAchievementMappingsForRequirement(
    selection.requirementId
  );
  const selectorState = getAchievementMappingSelectorState(
    achievements,
    achievementMappingSearch.value,
    mappings.map((mapping) => mapping.achievementId)
  );
  const { results } = selectorState;

  achievementMappingResults.hidden = selectorState.status !== "results";
  achievementMappingNoAchievements.hidden = selectorState.status !== "no-achievements";
  achievementMappingGoToAchievements.hidden =
    selectorState.status !== "no-achievements";
  achievementMappingAllMapped.hidden = selectorState.status !== "all-mapped";
  achievementMappingNoMatches.hidden = selectorState.status !== "no-matches";
  achievementMappingVerifiedGroup.hidden = results.verified.length === 0;
  achievementMappingUnverifiedGroup.hidden = results.unverified.length === 0;
  achievementMappingVerifiedHeading.textContent =
    `Verified (${results.verified.length})`;
  achievementMappingUnverifiedHeading.textContent =
    `Unverified (${results.unverified.length})`;
  achievementMappingVerifiedList.replaceChildren();
  achievementMappingUnverifiedList.replaceChildren();

  [
    [results.verified, achievementMappingVerifiedList],
    [results.unverified, achievementMappingUnverifiedList]
  ].forEach(([records, list]) => {
    records.forEach((record) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "achievement-mapping-option";
      button.type = "button";
      button.setAttribute("aria-label", `Map Achievement: ${record.title}`);

      const title = document.createElement("span");
      title.className = "achievement-mapping-option__title";
      title.textContent = record.title;

      const context = document.createElement("span");
      context.className = "achievement-mapping-option__context";
      context.textContent = record.context || "No context provided.";

      button.append(title, context);
      button.addEventListener("click", () => createRequirementAchievementMapping(record));
      item.append(button);
      list.append(item);
    });
  });
}

function openAchievementMappingSelector({ invoker, jobId, requirement }) {
  if (dialogManager.isOpen()) {
    return;
  }

  activeAchievementMappingSelection = {
    jobId,
    requirementId: requirement.id
  };
  achievementMappingSelectorRequirement.textContent = requirement.description;
  achievementMappingSearch.value = "";
  achievementMappingVerifiedGroup.open = true;
  achievementMappingUnverifiedGroup.open = true;
  renderAchievementMappingResults();

  try {
    openDialogWithNavigation(achievementMappingSelectorDialog, {
      invoker,
      initialFocus: achievementMappingSearch,
      isDirty: () => false
    });
  } catch (error) {
    activeAchievementMappingSelection = null;
    notifications.show(
      "error",
      error.message || "The Achievement selector could not be opened."
    );
  }
}

function createRequirementAchievementMapping(achievement) {
  const selection = activeAchievementMappingSelection;
  if (!selection || !achievementMappingSelectorDialog.open) {
    return;
  }

  try {
    const createdAt = new Date().toISOString();
    const mapping = createAchievementMappingRecord({
      requirementId: selection.requirementId,
      achievementId: achievement.id
    }, {
      id: createRecordId(),
      createdAt
    });
    careerState.createAchievementMapping(mapping);
  } catch (error) {
    notifications.show(
      "error",
      error.message || "The Achievement could not be mapped to this Requirement."
    );
    return;
  }

  const { jobId, requirementId } = selection;
  dialogManager.closeAfterMutation();
  activeAchievementMappingSelection = null;
  renderJobRequirements(jobId);
  focusRequirementAction(requirementId, "open-achievement");
  notifications.show("success", "Achievement mapped to Requirement.");
}

function goToAchievementsFromMappingSelector() {
  const selection = activeAchievementMappingSelection;
  if (!selection || !achievementMappingSelectorDialog.open) {
    return;
  }

  pendingMappingReturnContext = {
    jobId: selection.jobId,
    requirementId: selection.requirementId
  };
  dialogManager.closeAfterMutation();
  activeAchievementMappingSelection = null;

  if (!navigation.navigate("achievements")) {
    pendingMappingReturnContext = null;
    notifications.show("error", "The Achievements page could not be opened.");
    return;
  }
  achievementCreateAction.focus();
}

function openAchievementFromRequirement(achievementId) {
  if (!navigation.navigate("achievements")) {
    notifications.show("error", "The Achievements page could not be opened.");
    return;
  }

  const achievementCard = [...achievementList.querySelectorAll(".achievement-record")]
    .find((item) => item.dataset.achievementId === achievementId);
  if (!achievementCard) {
    notifications.show("error", "The Achievement could not be found.");
    return;
  }

  achievementCard.focus();
  achievementCard.scrollIntoView({ block: "center" });
}

function unmapAchievementFromRequirement(mappingId, requirementId, jobId) {
  try {
    careerState.deleteAchievementMapping(mappingId);
  } catch (error) {
    notifications.show(
      "error",
      error.message || "The Achievement could not be unmapped."
    );
    return;
  }

  renderJobRequirements(jobId);
  if (
    !jobDetailPanel.hidden
    && jobDetailPanel.dataset.jobId === jobId
  ) {
    focusRequirementAction(requirementId, "unmap-achievement")
      || focusRequirementAction(requirementId, "edit");
  }
  notifications.show("success", "Achievement unmapped from Requirement.");
}

function renderAchievementEvidenceGroup(requirementId, jobId, label, group) {
  const section = document.createElement("section");
  section.className = "job-requirement__evidence-group";

  const heading = document.createElement("h4");
  heading.className = "job-requirement__evidence-heading";
  heading.textContent = `${label} (${group.count})`;
  section.append(heading);

  if (group.entries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "job-requirement__evidence-empty";
    empty.textContent = "No mapped Achievements.";
    section.append(empty);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "job-requirement__evidence-list";
  group.entries.forEach(({ mapping, achievement }) => {
    const item = document.createElement("li");
    item.className = "job-requirement__evidence-item";

    const title = document.createElement("p");
    title.className = "job-requirement__evidence-title";
    title.textContent = achievement.title;

    const context = document.createElement("p");
    context.className = "job-requirement__evidence-context";
    context.textContent = achievement.context || "No context provided.";

    const actions = document.createElement("div");
    actions.className = "job-requirement__evidence-actions";

    const openButton = document.createElement("button");
    openButton.className = "job-action";
    openButton.type = "button";
    openButton.dataset.requirementAction = "open-achievement";
    openButton.textContent = "Open Achievement";
    openButton.setAttribute("aria-label", `Open Achievement: ${achievement.title}`);
    openButton.addEventListener("click", () =>
      openAchievementFromRequirement(achievement.id)
    );

    const unmapButton = document.createElement("button");
    unmapButton.className = "job-action";
    unmapButton.type = "button";
    unmapButton.dataset.requirementAction = "unmap-achievement";
    unmapButton.textContent = "Unmap";
    unmapButton.setAttribute(
      "aria-label",
      `Unmap ${achievement.title} from this Requirement`
    );
    unmapButton.addEventListener("click", () =>
      unmapAchievementFromRequirement(mapping.id, requirementId, jobId)
    );

    actions.append(openButton, unmapButton);
    item.append(title, context, actions);
    list.append(item);
  });

  section.append(list);
  return section;
}

function renderFitEvidenceGroup(label, achievementIds, achievementsById, className) {
  if (achievementIds.length === 0) {
    return null;
  }

  const section = document.createElement("section");
  section.className = `job-fit-assessment__evidence ${className}`;
  const heading = document.createElement("h5");
  heading.className = "job-fit-assessment__evidence-heading";
  heading.textContent = label;

  const list = document.createElement("ul");
  list.className = "job-fit-assessment__evidence-list";
  achievementIds.forEach((achievementId) => {
    const item = document.createElement("li");
    const achievement = achievementsById.get(achievementId);
    item.textContent = achievement
      ? achievement.title
      : "Achievement record unavailable.";
    list.append(item);
  });

  section.append(heading, list);
  return section;
}

function renderJobFitAssessment(jobId) {
  try {
    const assessment = careerState.calculateJobFitAssessment(jobId);
    const requirementsById = new Map(
      careerState.getRequirements(jobId).map((record) => [record.id, record])
    );
    const achievementsById = new Map(
      careerState.getAchievementRecords().map((record) => [record.id, record])
    );

    jobFitAssessmentResults.replaceChildren();
    jobFitAssessmentEmpty.hidden = assessment.status !== "not_assessed";
    jobFitAssessmentSummary.hidden = assessment.status !== "assessed";
    jobFitAssessmentResults.hidden = assessment.status !== "assessed";

    if (assessment.status === "not_assessed") {
      jobFitAssessmentStatus.textContent = "Not assessed";
      jobFitAssessmentEmpty.textContent = "No Requirements are available to assess.";
      return;
    }

    jobFitAssessmentStatus.textContent = "Assessed";
    jobFitAssessmentScore.textContent = `${assessment.score.toFixed(1)}%`;
    jobFitAssessmentRequirements.textContent =
      `${assessment.supportedRequirementCount} of ${assessment.totalRequirementCount}`;
    jobFitAssessmentMandatory.textContent = assessment.totalMandatoryCount === 0
      ? "No mandatory requirements"
      : `${assessment.supportedMandatoryCount} of ${assessment.totalMandatoryCount}`;

    assessment.requirementResults.forEach((result) => {
      const item = document.createElement("li");
      item.className = "job-fit-assessment__result";

      const heading = document.createElement("h4");
      heading.className = "job-fit-assessment__requirement";
      heading.textContent = requirementsById.get(result.requirementId)?.description
        ?? "Requirement description unavailable.";

      const status = document.createElement("p");
      status.className = "job-fit-assessment__result-status";
      const supportLabel = result.status === "supported" ? "Supported" : "Unsupported";
      const importanceLabel = result.importance === "mandatory"
        ? "Mandatory"
        : "Preferred";
      status.textContent = `${supportLabel} · ${importanceLabel} · ${formatRequirementCategory(result.category)}`;

      const evidence = document.createElement("div");
      evidence.className = "job-fit-assessment__evidence-groups";
      const verifiedGroup = renderFitEvidenceGroup(
        "Verified evidence (supports this Requirement)",
        result.verifiedAchievementIds,
        achievementsById,
        "job-fit-assessment__evidence--verified"
      );
      const unverifiedGroup = renderFitEvidenceGroup(
        "Unverified evidence (does not support this Requirement)",
        result.unverifiedAchievementIds,
        achievementsById,
        "job-fit-assessment__evidence--unverified"
      );

      if (verifiedGroup) {
        evidence.append(verifiedGroup);
      }
      if (unverifiedGroup) {
        evidence.append(unverifiedGroup);
      }
      if (!verifiedGroup && !unverifiedGroup) {
        const empty = document.createElement("p");
        empty.className = "job-fit-assessment__no-evidence";
        empty.textContent = "No mapped Achievement evidence.";
        evidence.append(empty);
      }

      item.append(heading, status, evidence);
      jobFitAssessmentResults.append(item);
    });
  } catch (error) {
    jobFitAssessmentStatus.textContent = "Assessment unavailable";
    jobFitAssessmentSummary.hidden = true;
    jobFitAssessmentEmpty.hidden = false;
    jobFitAssessmentResults.hidden = true;
    jobFitAssessmentEmpty.textContent = "The Fit Assessment could not be calculated.";
    jobFitAssessmentResults.replaceChildren();
    notifications.show(
      "error",
      error.message || "The Fit Assessment could not be calculated."
    );
  }
}

function renderJobRequirements(jobId, { refreshAssessment = true } = {}) {
  const records = careerState.getRequirements(jobId);
  const achievements = careerState.getAchievementRecords();
  jobRequirementsList.replaceChildren();
  jobRequirementsEmpty.hidden = records.length > 0;

  records.forEach((record) => {
    const article = document.createElement("article");
    article.className = "job-requirement";
    article.dataset.requirementId = record.id;
    article.setAttribute("role", "listitem");

    const description = document.createElement("p");
    description.className = "job-requirement__description";
    description.textContent = record.description;

    const details = document.createElement("div");
    details.className = "job-requirement__details";

    const category = document.createElement("span");
    category.className = "job-requirement__category";
    category.textContent = formatRequirementCategory(record.category);

    const importance = document.createElement("span");
    importance.className = "job-requirement__importance";
    importance.textContent = record.importance === "mandatory"
      ? "Mandatory"
      : "Preferred";

    details.append(category, importance);

    const mappings = careerState.getAchievementMappingsForRequirement(record.id);
    const evidence = getMappedAchievementEvidence(mappings, achievements);
    const evidenceSection = document.createElement("section");
    evidenceSection.className = "job-requirement__evidence";
    evidenceSection.setAttribute(
      "aria-label",
      `Achievement evidence for ${record.description}`
    );
    evidenceSection.append(
      renderAchievementEvidenceGroup(
        record.id,
        jobId,
        "Verified Achievements",
        evidence.verified
      ),
      renderAchievementEvidenceGroup(
        record.id,
        jobId,
        "Unverified Achievements",
        evidence.unverified
      )
    );

    const actions = document.createElement("div");
    actions.className = "job-requirement__actions";

    const addAchievementButton = document.createElement("button");
    addAchievementButton.className = "job-action";
    addAchievementButton.type = "button";
    addAchievementButton.dataset.requirementAction = "add-achievement";
    addAchievementButton.textContent = "Add Achievement";
    addAchievementButton.addEventListener("click", () =>
      openAchievementMappingSelector({
        invoker: addAchievementButton,
        jobId,
        requirement: record
      })
    );

    const editButton = document.createElement("button");
    editButton.className = "job-action";
    editButton.type = "button";
    editButton.dataset.requirementAction = "edit";
    editButton.textContent = "Edit";
    editButton.setAttribute("aria-label", `Edit requirement: ${record.description}`);
    editButton.addEventListener("click", () =>
      openRequirementDialog({
        invoker: editButton,
        jobId,
        record
      })
    );

    const deleteButton = document.createElement("button");
    deleteButton.className = "job-action job-action--delete";
    deleteButton.type = "button";
    deleteButton.dataset.requirementAction = "delete";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete requirement: ${record.description}`);
    deleteButton.addEventListener("click", () =>
      openRequirementDeleteDialog(record, deleteButton)
    );

    actions.append(addAchievementButton, editButton, deleteButton);
    article.append(description, details, evidenceSection, actions);
    jobRequirementsList.append(article);
  });

  if (refreshAssessment) {
    renderJobFitAssessment(jobId);
  }
}

function focusRequirementAction(requirementId, action = "edit") {
  const card = [...jobRequirementsList.querySelectorAll("[data-requirement-id]")]
    .find((item) => item.dataset.requirementId === requirementId);
  const target = card?.querySelector(`[data-requirement-action="${action}"]`);

  if (!target) {
    requirementAddAction.focus();
    return false;
  }
  target.focus();
  return true;
}

function clearRequirementFieldErrors() {
  requirementFields.forEach((field) => {
    clearFieldError(requirementControls[field], requirementFieldErrors[field]);
  });
}

function resetRequirementForm() {
  requirementForm.reset();
  requirementControls.category.value = "other";
  requirementControls.importance.value = "";
  editingRequirementId = null;
  editingRequirementJobId = null;
  requirementFormTitle.textContent = "Add Requirement";
  requirementSubmit.textContent = "Add Requirement";
  clearRequirementFieldErrors();
}

function populateRequirementForm(record, jobId) {
  resetRequirementForm();
  editingRequirementId = record?.id ?? null;
  editingRequirementJobId = jobId;
  requirementControls.description.value = record?.description ?? "";
  requirementControls.category.value = record?.category ?? "other";
  requirementControls.importance.value = record?.importance ?? "";
  requirementFormTitle.textContent = record ? "Edit Requirement" : "Add Requirement";
  requirementSubmit.textContent = record ? "Save changes" : "Add Requirement";
}

function getRequirementFormSnapshot() {
  return JSON.stringify(
    requirementFields.map((field) => requirementControls[field].value)
  );
}

function openRequirementDialog({ invoker, jobId, record = null }) {
  if (dialogManager.isOpen()) {
    return;
  }

  const job = careerState.getJobs().find((item) => item.id === jobId);
  if (!job) {
    notifications.show("error", "The Job could not be found.");
    return;
  }

  const existingRecord = record
    ? careerState.getRequirements(jobId).find((item) => item.id === record.id)
    : null;
  if (record && !existingRecord) {
    notifications.show("error", "The Requirement could not be found.");
    renderJobRequirements(jobId);
    return;
  }

  populateRequirementForm(existingRecord, jobId);
  requirementFormSnapshot = getRequirementFormSnapshot();

  openDialogWithNavigation(requirementDialog, {
    invoker,
    initialFocus: requirementControls.description,
    isDirty: () => getRequirementFormSnapshot() !== requirementFormSnapshot,
    onDiscard() {
      const savedRecord = editingRequirementId === null
        ? null
        : careerState.getRequirements(jobId)
          .find((item) => item.id === editingRequirementId) ?? null;

      populateRequirementForm(savedRecord, jobId);
      requirementFormSnapshot = getRequirementFormSnapshot();
    }
  });
}

function showRequirementValidationErrors(errors) {
  const messagesByField = new Map();

  errors.forEach(({ field, message }) => {
    if (!Object.hasOwn(requirementControls, field)) {
      return;
    }
    const messages = messagesByField.get(field) ?? [];
    messages.push(message);
    messagesByField.set(field, messages);
  });

  messagesByField.forEach((messages, field) => {
    showFieldError(
      requirementControls[field],
      requirementFieldErrors[field],
      [...new Set(messages)].join(" ")
    );
  });

  const firstInvalidField = requirementFields.find((field) => messagesByField.has(field));
  if (firstInvalidField) {
    requirementControls[firstInvalidField].focus();
  }
}

function readRequirementForm() {
  return {
    description: requirementControls.description.value,
    category: requirementControls.category.value,
    importance: requirementControls.importance.value
  };
}

function saveRequirement(event) {
  event.preventDefault();
  clearRequirementFieldErrors();

  const input = readRequirementForm();
  const descriptionRequired = validateRequired(
    input.description,
    "a Requirement description"
  );
  const importanceRequired = validateRequired(input.importance, "an importance");
  [
    ["description", descriptionRequired],
    ["importance", importanceRequired]
  ].forEach(([field, result]) => {
    if (!result.valid) {
      showFieldError(
        requirementControls[field],
        requirementFieldErrors[field],
        result.message
      );
    }
  });

  const firstInvalidField = [
    ["description", descriptionRequired],
    ["importance", importanceRequired]
  ].find(([, result]) => !result.valid)?.[0];
  if (firstInvalidField) {
    notifications.show("error", "Enter a description and choose an importance.");
    requirementControls[firstInvalidField].focus();
    return;
  }

  const jobId = editingRequirementJobId;
  const existingRecord = editingRequirementId === null
    ? null
    : careerState.getRequirements(jobId)
      .find((record) => record.id === editingRequirementId) ?? null;
  if (editingRequirementId !== null && !existingRecord) {
    notifications.show("error", "The Requirement could not be found.");
    return;
  }

  if (
    existingRecord
    && requirementFields.every((field) => input[field] === existingRecord[field])
  ) {
    dialogManager.closeAfterMutation();
    resetRequirementForm();
    return;
  }

  try {
    const savedRecord = existingRecord
      ? careerState.updateRequirement(existingRecord.id, {
        ...input,
        updatedAt: new Date().toISOString()
      })
      : careerState.createRequirement(createRequirementRecord({
        ...input,
        jobId
      }, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      }));

    dialogManager.closeAfterMutation();
    resetRequirementForm();
    if (
      !jobDetailPanel.hidden
      && jobDetailPanel.dataset.jobId === jobId
    ) {
      renderJobRequirements(jobId);
      focusRequirementAction(savedRecord.id);
    }
    notifications.show("success", existingRecord
      ? "Requirement updated."
      : "Requirement added.");
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showRequirementValidationErrors(error.errors);
    }
    notifications.show(
      "error",
      error.message || "The Requirement could not be saved."
    );
  }
}

function openRequirementDeleteDialog(record, invoker) {
  if (dialogManager.isOpen()) {
    return;
  }

  const jobId = jobDetailPanel.dataset.jobId;
  const records = careerState.getRequirements(jobId);
  const recordIndex = records.findIndex((item) => item.id === record.id);
  if (recordIndex === -1) {
    notifications.show("error", "The Requirement could not be found.");
    renderJobRequirements(jobId);
    return;
  }

  pendingRequirementDeletion = {
    id: record.id,
    jobId,
    nextId: records[recordIndex + 1]?.id ?? null,
    previousId: records[recordIndex - 1]?.id ?? null
  };
  requirementDeleteDescription.textContent =
    `"${record.description}" will be deleted. Achievement mappings associated with this Requirement will also be deleted. Achievement records themselves will remain.`;

  try {
    openDialogWithNavigation(requirementDeleteDialog, {
      invoker,
      initialFocus: requirementDeleteCancel,
      isDirty: () => false
    });
  } catch (error) {
    pendingRequirementDeletion = null;
    notifications.show(
      "error",
      error.message || "The Requirement deletion confirmation could not be opened."
    );
  }
}

function confirmRequirementDeletion() {
  const pendingDeletion = pendingRequirementDeletion;
  if (
    !pendingDeletion
    || !requirementDeleteDialog.open
    || isDeletingRequirement
  ) {
    return;
  }

  isDeletingRequirement = true;
  try {
    careerState.deleteRequirement(pendingDeletion.id);
  } catch (error) {
    isDeletingRequirement = false;
    notifications.show(
      "error",
      error.message || "The Requirement could not be deleted."
    );
    return;
  }

  pendingRequirementDeletion = null;
  isDeletingRequirement = false;
  dialogManager.closeAfterMutation();
  if (
    !jobDetailPanel.hidden
    && jobDetailPanel.dataset.jobId === pendingDeletion.jobId
  ) {
    renderJobRequirements(pendingDeletion.jobId);
    if (!focusRequirementAction(pendingDeletion.nextId)) {
      focusRequirementAction(pendingDeletion.previousId);
    }
  }
  notifications.show("success", "Requirement deleted.");
}

function renderJobDetail(record, { refreshAssessment = true } = {}) {
  jobDetailPanel.dataset.jobId = record.id;
  jobDetailTitle.textContent = record.roleTitle;
  jobDetailCompany.textContent = record.company;
  jobDetailStatus.textContent = record.status === "archived" ? "Archived" : "Active";
  jobDetailStatus.className = record.status === "archived"
    ? "job-status job-status--archived"
    : "job-status";
  jobDetailDescription.textContent = record.description;
  jobDetailSourceUrl.textContent = record.sourceUrl;
  jobDetailNotes.textContent = record.notes;
  jobDetailCreated.textContent = formatJobTimestamp(record.createdAt);
  jobDetailUpdated.textContent = formatJobTimestamp(record.updatedAt);
  jobArchiveAction.textContent = record.status === "archived"
    ? "Reactivate"
    : "Archive";
  renderJobRequirements(record.id, { refreshAssessment });
}

function openJobDetail(jobId) {
  const record = careerState.getJobs().find((item) => item.id === jobId);

  if (!record) {
    notifications.show("error", "The Job could not be found.");
    renderJobRecords();
    return;
  }

  renderJobDetail(record);
  jobListPanel.hidden = true;
  jobDetailPanel.hidden = false;
  jobDetailTitle.focus();
}

function returnToJobList() {
  jobDetailPanel.hidden = true;
  jobListPanel.hidden = false;
  jobDetailPanel.dataset.jobId = "";
  jobDetailTitle.textContent = "";
  jobDetailCompany.textContent = "";
  jobDetailStatus.textContent = "";
  jobDetailStatus.className = "job-status";
  jobDetailDescription.textContent = "";
  jobDetailSourceUrl.textContent = "";
  jobDetailNotes.textContent = "";
  jobDetailCreated.textContent = "";
  jobDetailUpdated.textContent = "";
  renderJobRecords();
  document.querySelector("#jobs-title").focus();
}

function changeSelectedJobStatus() {
  const jobId = jobDetailPanel.dataset.jobId;
  const record = careerState.getJobs().find((item) => item.id === jobId);

  if (!record) {
    notifications.show("error", "The Job could not be found.");
    returnToJobList();
    return;
  }

  try {
    if (record.status === "archived") {
      careerState.reactivateJob(record.id, new Date().toISOString());
    } else {
      careerState.archiveJob(record.id, new Date().toISOString());
    }

    returnToJobList();
    notifications.show(
      "success",
      record.status === "archived" ? "Job reactivated." : "Job archived."
    );
  } catch (error) {
    notifications.show(
      "error",
      error.message || "The Job status could not be changed."
    );
  }
}

function openJobDeleteDialog() {
  if (dialogManager.isOpen()) {
    return;
  }

  const jobId = jobDetailPanel.dataset.jobId;
  const record = careerState.getJobs().find((item) => item.id === jobId);
  if (!record) {
    notifications.show("error", "The Job could not be found.");
    returnToJobList();
    return;
  }

  pendingJobDeletionId = record.id;
  try {
    dialogManager.open(jobDeleteDialog, {
      invoker: jobDeleteAction,
      initialFocus: jobDeleteCancel,
      isDirty: () => false
    });
  } catch (error) {
    pendingJobDeletionId = null;
    notifications.show(
      "error",
      error.message || "The Job deletion confirmation could not be opened."
    );
  }
}

function confirmJobDeletion() {
  const jobId = pendingJobDeletionId;
  if (!jobId || !jobDeleteDialog.open || isDeletingJob) {
    return;
  }

  isDeletingJob = true;
  try {
    careerState.deleteJob(jobId);
  } catch (error) {
    isDeletingJob = false;
    notifications.show(
      "error",
      error.message || "The Job could not be deleted."
    );
    return;
  }

  pendingJobDeletionId = null;
  isDeletingJob = false;
  dialogManager.closeAfterMutation();
  returnToJobList();
  notifications.show("success", "Job deleted.");
}

function clearJobFieldErrors() {
  jobFields.forEach((field) => {
    clearFieldError(jobControls[field], jobFieldErrors[field]);
  });
}

function resetJobForm() {
  jobForm.reset();
  editingJobId = null;
  jobFormTitle.textContent = "Create Job";
  jobSubmit.textContent = "Create Job";
  clearJobFieldErrors();
}

function populateJobForm(record) {
  resetJobForm();
  editingJobId = record?.id ?? null;

  jobFields.forEach((field) => {
    jobControls[field].value = record?.[field] ?? "";
  });

  jobFormTitle.textContent = record
    ? `Edit ${record.roleTitle}`
    : "Create Job";
  jobSubmit.textContent = record ? "Save changes" : "Create Job";
}

function getJobFormSnapshot() {
  return JSON.stringify(jobFields.map((field) => jobControls[field].value));
}

function openJobDialog({ invoker, record = null }) {
  if (dialogManager.isOpen()) {
    return;
  }

  populateJobForm(record);
  jobFormSnapshot = getJobFormSnapshot();

  openDialogWithNavigation(jobDialog, {
    invoker,
    initialFocus: jobControls.company,
    isDirty: () => getJobFormSnapshot() !== jobFormSnapshot,
    onDiscard() {
      const savedRecord = editingJobId === null
        ? null
        : careerState.getJobs()
          .find((item) => item.id === editingJobId) ?? null;

      populateJobForm(savedRecord);
      jobFormSnapshot = getJobFormSnapshot();
    }
  });
}

function showJobValidationErrors(errors) {
  const messagesByField = new Map();

  errors.forEach(({ field, message }) => {
    if (!Object.hasOwn(jobControls, field)) {
      return;
    }

    const messages = messagesByField.get(field) || [];
    messages.push(message);
    messagesByField.set(field, messages);
  });

  messagesByField.forEach((messages, field) => {
    showFieldError(
      jobControls[field],
      jobFieldErrors[field],
      [...new Set(messages)].join(" ")
    );
  });

  const firstInvalidField = jobFields.find((field) => messagesByField.has(field));
  if (firstInvalidField) {
    jobControls[firstInvalidField].focus();
  }
}

function readJobForm() {
  return Object.fromEntries(
    jobFields.map((field) => [field, jobControls[field].value.trim()])
  );
}

function saveJob(event) {
  event.preventDefault();
  clearJobFieldErrors();

  const input = readJobForm();
  const companyRequired = validateRequired(input.company, "a company");
  const roleTitleRequired = validateRequired(input.roleTitle, "a role title");
  const requiredResults = [
    ["company", companyRequired],
    ["roleTitle", roleTitleRequired]
  ];

  requiredResults.forEach(([field, result]) => {
    if (!result.valid) {
      showFieldError(jobControls[field], jobFieldErrors[field], result.message);
    }
  });

  const firstInvalidField = requiredResults.find(([, result]) => !result.valid)?.[0];
  if (firstInvalidField) {
    notifications.show("error", "Enter a company and role title.");
    jobControls[firstInvalidField].focus();
    return;
  }

  const existingJob = editingJobId === null
    ? null
    : careerState.getJobs().find((record) => record.id === editingJobId) ?? null;

  if (editingJobId !== null && !existingJob) {
    notifications.show("error", "The Job could not be found.");
    return;
  }

  if (
    existingJob
    && jobFields.every((field) => input[field] === existingJob[field])
  ) {
    return;
  }

  try {
    if (existingJob) {
      careerState.updateJob(existingJob.id, {
        ...input,
        updatedAt: new Date().toISOString()
      });
      if (!jobDetailPanel.hidden) {
        const updatedRecord = careerState.getJobs()
          .find((item) => item.id === existingJob.id);
        if (updatedRecord) {
          renderJobDetail(updatedRecord, { refreshAssessment: false });
        }
      }
    } else {
      const record = createJobRecord(input, {
        id: createRecordId(),
        createdAt: new Date().toISOString()
      });
      careerState.createJob(record);
    }

    dialogManager.closeAfterMutation();
    resetJobForm();
    renderJobRecords();
    notifications.show(
      "success",
      existingJob ? "Job updated." : "Job created."
    );
  } catch (error) {
    if (Array.isArray(error.errors)) {
      showJobValidationErrors(error.errors);
    }

    notifications.show(
      "error",
      error.message || "The Job could not be saved."
    );
  }
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
    article.tabIndex = -1;
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
    const mappingCount = careerState
      .getAchievementMappingsForAchievement(record.id)
      .length;
    achievementDeleteMappingImpact.hidden = mappingCount === 0;
    achievementDeleteMappingImpact.textContent = mappingCount === 1
      ? "Deleting this Achievement will remove 1 mapping. The related Requirements and Jobs will remain, but Fit Assessments may change."
      : `Deleting this Achievement will remove ${mappingCount} mappings. The related Requirements and Jobs will remain, but Fit Assessments may change.`;
  } catch (error) {
    pendingAchievementDeletion = null;
    notifications.show(
      "error",
      error.message || "The Achievement mappings could not be checked."
    );
    return;
  }

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
jobCreateAction.addEventListener("click", () => {
  openJobDialog({ invoker: jobCreateAction });
});
jobEmptyCreateAction.addEventListener("click", () => {
  openJobDialog({ invoker: jobCreateAction });
});
jobBackAction.addEventListener("click", returnToJobList);
jobArchiveAction.addEventListener("click", changeSelectedJobStatus);
jobDeleteAction.addEventListener("click", openJobDeleteDialog);
jobDeleteDialog.addEventListener("cancel", () => {
  if (!isDeletingJob) {
    pendingJobDeletionId = null;
  }
});
jobDeleteCancel.addEventListener("click", () => {
  dialogManager.requestClose();
  pendingJobDeletionId = null;
});
jobDeleteConfirm.addEventListener("click", confirmJobDeletion);
requirementAddAction.addEventListener("click", () => {
  openRequirementDialog({
    invoker: requirementAddAction,
    jobId: jobDetailPanel.dataset.jobId
  });
});
requirementForm.addEventListener("submit", saveRequirement);
requirementForm.addEventListener("input", (event) => {
  const field = requirementFields.find(
    (item) => requirementControls[item] === event.target
  );
  if (field) {
    clearFieldError(requirementControls[field], requirementFieldErrors[field]);
  }
});
requirementForm.addEventListener("change", (event) => {
  const field = requirementFields.find(
    (item) => requirementControls[item] === event.target
  );
  if (field) {
    clearFieldError(requirementControls[field], requirementFieldErrors[field]);
  }
});
requirementCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
requirementDeleteDialog.addEventListener("cancel", () => {
  if (!isDeletingRequirement) {
    pendingRequirementDeletion = null;
  }
});
requirementDeleteCancel.addEventListener("click", () => {
  dialogManager.requestClose();
  pendingRequirementDeletion = null;
});
requirementDeleteConfirm.addEventListener("click", confirmRequirementDeletion);
achievementMappingSearch.addEventListener("input", renderAchievementMappingResults);
achievementMappingSearchClear.addEventListener("click", () => {
  achievementMappingSearch.value = "";
  renderAchievementMappingResults();
  achievementMappingSearch.focus();
});
achievementMappingGoToAchievements.addEventListener(
  "click",
  goToAchievementsFromMappingSelector
);
achievementMappingCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
achievementMappingSelectorDialog.addEventListener("close", () => {
  if (!achievementMappingSelectorDialog.open) {
    activeAchievementMappingSelection = null;
  }
});
jobEditAction.addEventListener("click", () => {
  const record = careerState.getJobs()
    .find((item) => item.id === jobDetailPanel.dataset.jobId);

  if (!record) {
    notifications.show("error", "The Job could not be found.");
    return;
  }

  openJobDialog({ invoker: jobEditAction, record });
});
jobForm.addEventListener("submit", saveJob);
jobForm.addEventListener("input", (event) => {
  const field = jobFields.find((item) => jobControls[item] === event.target);

  if (field) {
    clearFieldError(jobControls[field], jobFieldErrors[field]);
  }
});
jobCancel.addEventListener("click", () => {
  dialogManager.requestClose();
});
jobFilter.addEventListener("change", () => {
  const selectedFilter = jobFilter.querySelector('input[name="job-filter"]:checked');

  if (selectedFilter) {
    selectedJobStatus = selectedFilter.value;
    renderJobRecords();
  }
});
jobSearchInput.addEventListener("input", renderJobRecords);
jobSearchClear.addEventListener("click", () => {
  jobSearchInput.value = "";
  renderJobRecords();
  jobSearchInput.focus();
});
jobSearchEmptyClear.addEventListener("click", () => {
  jobSearchInput.value = "";
  renderJobRecords();
  jobSearchInput.focus();
});

const initialProfile = careerState.getProfile();

populateProfileForm(initialProfile);
renderProfile(initialProfile);
renderEmploymentRecords();
renderAchievementRecords();
renderJobRecords();

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

  if (viewName === "dashboard") {
    renderDashboard();
  }

  if (viewName === "jobs") {
    renderJobRecords();
    if (!jobDetailPanel.hidden) {
      renderJobRequirements(jobDetailPanel.dataset.jobId);
    }
  }

  currentSection.textContent = view.label;
  pageTitle.textContent = view.title;
  appStatus.textContent = view.status;

  closeMobileMenu();

  if (menuWasOpen || focusDestination) {
    document.querySelector("#main-content").focus();
  }

  if (
    viewName === "jobs"
    && pendingMappingReturnContext
  ) {
    const { jobId, requirementId } = pendingMappingReturnContext;
    pendingMappingReturnContext = null;
    if (
      !jobDetailPanel.hidden
      && jobDetailPanel.dataset.jobId === jobId
    ) {
      focusRequirementAction(requirementId, "add-achievement");
    }
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
