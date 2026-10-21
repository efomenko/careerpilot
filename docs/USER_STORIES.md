# CareerPilot — User Stories and Acceptance Criteria

## 1. Purpose

This document describes CareerPilot from the user's perspective and defines testable outcomes for the existing GitHub tasks.

Task IDs below must remain aligned with the project's GitHub issues. The stories describe intended behavior, not proof that implementation is complete.

## 2. M1 — Foundation & Application Shell

### CP-001 — Repository and project foundation

**Story:** As a developer, I want a clear repository structure so that I can build and maintain CareerPilot incrementally.

Acceptance criteria:

- The agreed repository structure exists.
- Application entry points are documented.
- Project setup instructions are available.
- No unnecessary framework or runtime dependency is introduced without a decision.

### CP-002 — Responsive application shell

**Story:** As a job seeker, I want to navigate between distinct application sections so that I can understand and access the product's main workflows.

Acceptance criteria:

- Dashboard, Career Profile, Achievements, Job Opportunities, Application Drafts, and Application Tracker each have distinct content or placeholders.
- The active navigation item is identifiable.
- Navigation and breadcrumb reflect the selected section.
- Hash navigation handles unknown values safely.
- Mobile navigation works by keyboard and pointer.
- Layout is usable at mobile, tablet, and desktop widths.

### CP-003 — Reusable validation and feedback

**Story:** As a user, I want clear validation and feedback so that I understand whether my actions succeeded or what I need to correct.

Acceptance criteria:

- Shared patterns exist for success, warning, and error feedback where appropriate.
- Invalid input receives a useful explanation.
- Important status changes are accessible to assistive technology.
- Feedback does not rely on color alone.

## 3. M2 — Career Knowledge Base

### CP-010 — Profile and employment data structures

**Story:** As a developer, I want consistent data structures so that career records can be reused across the application.

Acceptance criteria:

- Profile and employment schemas are documented.
- Field names and types are consistent.
- Optional and required fields are identified.
- Invalid record shapes can be detected.

### CP-011 — Profile and employment CRUD

**Story:** As a job seeker, I want to create and maintain my career profile and employment history so that I can reuse accurate information.

Acceptance criteria:

- Records can be created, viewed, edited, and deleted.
- Required fields are validated.
- Existing records remain intact when another record is edited.
- Empty states guide the user.

### CP-012 — Achievement records and evidence

**Story:** As a job seeker, I want to record achievements and supporting evidence so that application content can be grounded in real experience.

Acceptance criteria:

- Achievements support context, contribution, actions, and outcome.
- Metrics are optional and include units where applicable.
- Evidence references can be added.
- Proposed and achieved outcomes are distinguishable.

### CP-013 — Verification status and warnings

**Story:** As a job seeker, I want to know which career claims are verified or need confirmation so that I do not use unsupported information unknowingly.

Acceptance criteria:

- Verification status can be assigned and updated.
- Unverified claims are clearly identified.
- Drafting workflows can warn about unsupported claims.
- Approval is not treated as equivalent to verification.

### CP-014 — Persistence and recovery

**Story:** As a user, I want my career data to persist across sessions so that I do not have to re-enter it each time.

Acceptance criteria:

- Data persists using the selected storage mechanism.
- Storage errors are handled and communicated.
- Data format is versioned where needed.
- Recovery and limitations are documented.

## 4. M3 — Jobs & Evidence-Based Fit

### CP-020 — Job CRUD

**Story:** As a job seeker, I want to save and maintain job opportunities so that I can organize my search.

Acceptance criteria:

- Jobs can be created, viewed, edited, and deleted.
- Company and role information are recorded.
- Optional source URL and notes can be saved.
- Jobs can be associated with applications.

### CP-021 — Job requirements

**Story:** As a job seeker, I want to record individual job requirements so that I can assess my evidence against each requirement.

Acceptance criteria:

- Requirements belong to a specific job.
- Requirement text and category are editable.
- Mandatory and preferred requirements can be distinguished.
- Missing information remains visible.

### CP-022 — Map requirements to achievements

**Story:** As a job seeker, I want to link requirements to relevant achievements so that I can understand which parts of my experience support my application.

Acceptance criteria:

- A requirement can link to one or more career records.
- The user can add and remove mappings.
- Unmapped requirements remain visible.
- Each mapping can be reviewed before drafting.

### CP-023 — Deterministic weighted assessment

**Story:** As a job seeker, I want an explainable job-fit assessment so that I can compare opportunities using consistent criteria.

Acceptance criteria:

- The scoring formula and weights are documented.
- Identical input data produces identical results.
- Missing evidence does not count as proven capability.
- The result explains requirement-level contributions.
- The result is not described as a hiring probability.

### CP-024 — Assessment test scenarios

**Story:** As a developer, I want repeatable test scenarios so that scoring changes do not introduce silent regressions.

Acceptance criteria:

- Tests cover full, partial, missing, and conflicting evidence.
- Boundary conditions are tested.
- Expected results are documented.
- Tests can be repeated after changes.

## 5. M4 — Application Drafts & Review

### CP-030 — CV bullet template

**Story:** As a job seeker, I want to turn verified achievements into structured CV bullets so that I can prepare relevant application content efficiently.

Acceptance criteria:

- The template uses supported facts from an achievement.
- Missing metrics are not invented.
- Drafts remain editable.
- Source records can be identified.

### CP-031 — Cover letter template

**Story:** As a job seeker, I want to create a tailored cover letter draft so that I can explain my relevant experience for a specific role.

Acceptance criteria:

- The draft can reference the selected job.
- Claims come from available career information.
- Missing details are flagged rather than fabricated.
- The draft can be edited before approval.

### CP-032 — Edit, save, and discard draft

**Story:** As a user, I want control over draft changes so that I can refine content without losing approved material unexpectedly.

Acceptance criteria:

- A draft can be edited and saved.
- Discard behavior is explicit.
- Unsaved changes are handled predictably.
- Saved drafts can be reopened.

### CP-033 — Evidence links, status, and approval

**Story:** As a job seeker, I want to review the evidence and status behind draft claims so that I can approve content with confidence.

Acceptance criteria:

- Drafts can reference supporting records.
- Verification and approval are displayed separately.
- The user can review unresolved claims.
- Approval is explicit and associated with the relevant draft.

### CP-034 — Unsupported claim and metric validation

**Story:** As a job seeker, I want unsupported claims flagged before using a draft so that I can correct factual problems.

Acceptance criteria:

- Missing or unsupported metrics are flagged when detectable.
- Unsupported claims can be edited.
- Validation explains the reason for a warning.
- The limits of automatic detection are documented.

## 6. M5 — Application Tracking & Quality

### CP-040 — Application records

**Story:** As a job seeker, I want an application record for each opportunity I pursue so that I can track the process.

Acceptance criteria:

- An application can be linked to a job.
- Application status and relevant dates are stored.
- Draft references can be associated where applicable.
- Records can be edited and deleted.

### CP-041 — Stages, dates, and follow-ups

**Story:** As a job seeker, I want to record stages and follow-up dates so that I can manage next steps.

Acceptance criteria:

- The application stage can be updated.
- Dates can be recorded and validated.
- Follow-up dates are visible.
- Overdue follow-ups are distinguishable from future ones.

### CP-042 — Search and filtering

**Story:** As a job seeker, I want to search and filter records so that I can find relevant jobs and applications quickly.

Acceptance criteria:

- Search works across documented fields.
- Filters can be combined where supported.
- Empty results are communicated.
- Clearing filters restores the full list.

### CP-043 — Versioned JSON export

**Story:** As a user, I want to export my data so that I can back it up and move it elsewhere.

Acceptance criteria:

- Exported JSON has a documented schema version.
- Supported record types are included.
- The exported file can be parsed as valid JSON.
- Export failures are handled.

### CP-044 — Validated JSON import

**Story:** As a user, I want to import a backup safely so that I can restore my data.

Acceptance criteria:

- JSON syntax and schema are validated.
- Invalid files are rejected with useful feedback.
- Import consequences are explained before destructive changes.
- Existing data is not partially corrupted by a failed import.

### CP-050 — Automated tests

**Story:** As a developer, I want automated tests for critical behavior so that I can make changes with confidence.

Acceptance criteria:

- Core logic has repeatable tests.
- Validation and scoring edge cases are covered.
- Test execution instructions are documented.
- Failures are actionable.

### CP-051 — Accessibility and responsive checks

**Story:** As a user, I want the app to work across devices and input methods so that I can use it comfortably.

Acceptance criteria:

- Keyboard navigation is tested.
- Focus is visible.
- Semantic structure and labels are reviewed.
- Common viewport sizes are checked.
- Reduced-motion behavior is considered.

### CP-052 — Fictional demo data

**Story:** As a portfolio reviewer, I want fictional demo records so that I can explore the application without accessing anyone's private career data.

Acceptance criteria:

- Demo data is clearly fictional.
- No private user information is included.
- Demo records cover common workflows and edge cases.
- Demo data can be reset or restored.

### CP-053 — README, setup, and architecture

**Story:** As a developer or reviewer, I want clear setup and architecture instructions so that I can understand and run the project.

Acceptance criteria:

- Prerequisites and startup steps are documented.
- Project structure is explained.
- Current and planned features are distinguished.
- Documentation links work.

### CP-054 — Screenshots, demo, and deployment

**Story:** As a portfolio reviewer, I want to see the application working so that I can evaluate the result.

Acceptance criteria:

- Screenshots reflect the actual application.
- Demo instructions are reproducible.
- Deployment limitations are documented.
- No private career data is exposed.

## 7. M6 — AI Integration & Evaluation

### CP-060 — AI service contracts and schemas

**Story:** As a developer, I want defined AI service contracts so that AI functionality can be tested independently of the interface.

Acceptance criteria:

- Inputs and outputs have documented schemas.
- Invalid outputs can be rejected.
- Provider-specific code is separated from product logic.
- Core workflows retain a non-AI fallback where feasible.

### CP-061 — AI job-description extraction

**Story:** As a job seeker, I want help extracting requirements from a job description so that I can reduce manual entry.

Acceptance criteria:

- Extracted requirements are presented for review.
- Missing or ambiguous information is not invented.
- The original job description remains available.
- The user can edit extracted requirements before saving.

### CP-062 — Evidence-grounded generation

**Story:** As a job seeker, I want AI-assisted drafts based on my career records so that I can tailor content without fabricating experience.

Acceptance criteria:

- Relevant evidence is provided to the generation process.
- Unsupported details are not intentionally added.
- Drafts identify supporting records where feasible.
- The user can edit and approve output.
- Output is validated before use.

### CP-063 — Unsupported claims, errors, and retry limits

**Story:** As a user, I want safe error handling and claim checks so that AI failures do not compromise my data or produce unchecked claims.

Acceptance criteria:

- Provider errors produce understandable feedback.
- Retries are bounded.
- Invalid output is not silently accepted.
- Existing drafts are preserved on failure.
- Unsupported claims are flagged.

### CP-064 — Repeatable AI evaluation set

**Story:** As a developer, I want a repeatable evaluation set so that I can assess whether AI changes improve quality without weakening factual accuracy.

Acceptance criteria:

- Evaluation examples cover representative job descriptions and career evidence.
- Expected behaviors are documented.
- Fabrication and unsupported-claim cases are included.
- Results can be compared across versions.
- Evaluation limitations are recorded.

## 8. Cross-Cutting Rules

- All user-entered career data remains editable.
- Generated content is a proposal until reviewed.
- Verification and approval remain distinct.
- Data loss and destructive actions require careful handling.
- Features are not marked complete until their GitHub acceptance criteria and tests are satisfied.
- AI evaluation must measure factual grounding as well as writing quality.
