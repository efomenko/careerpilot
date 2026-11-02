# CareerPilot — Product Requirements Document (PRD)

## 1. Document Purpose

This document defines the product requirements, scope, constraints, and acceptance principles for CareerPilot.

It is the product-level reference for implementation tasks. GitHub issues remain the execution-level source of truth for individual task status and acceptance criteria.

## 2. Product Summary

CareerPilot helps job seekers maintain career information, evaluate job opportunities, create evidence-based application drafts, and track application progress.

The initial MVP uses deterministic JavaScript logic and user-provided data. AI functionality is a later milestone.

## 3. Scope

### In scope

- Responsive single-page application interface.
- Career profile and employment history management.
- Achievement records and their supporting evidence (CP-012).
- Verification workflows for career claims (CP-013).
- Job opportunity management.
- Job requirement extraction through user entry initially.
- Requirement-to-evidence mapping.
- Transparent rule-based fit assessment.
- CV bullet and cover letter templates.
- Draft editing, saving, approval, and discard.
- Application tracking.
- Search and filtering.
- JSON export and validated import.
- Testing, accessibility, documentation, and deployment.
- Later AI-assisted extraction and generation.

### Out of scope initially

- Automated job submissions.
- Direct integrations with job boards.
- Paid AI API dependency for core functionality.
- Automatic claims about unverified career information.
- Multi-user accounts and server-side synchronization.
- Guaranteed match scores or hiring predictions.
- Automatic email sending or recruiter contact.

## 4. Target User and Primary Workflow

The primary user is an individual job seeker who wants to reuse verified career information across multiple applications.

The intended workflow is:

1. Create a career profile.
2. Add employment history.
3. Record achievements and supporting evidence.
4. Review and verify the information.
5. Add a job opportunity.
6. Record the job's requirements.
7. Map requirements to career evidence.
8. Review the rule-based fit assessment.
9. Create a tailored CV bullet or cover letter.
10. Edit and approve the draft.
11. Track the application and follow-up.
12. Export or back up the data when needed.

## 5. Functional Requirements

### FR-01 — Application navigation

The application must provide navigation for Dashboard, Career Profile, Achievements, Job Opportunities, Application Drafts, and Application Tracker.

Acceptance criteria:

- Each navigation item has a distinct view.
- The active section is visually identifiable.
- The selected view is reflected in the URL hash where appropriate.
- Unknown hashes fall back safely to Dashboard.
- Navigation is usable with a keyboard.
- Mobile navigation can be opened and closed.

### FR-02 — Career profile

The user must be able to create, view, edit, and save career profile information.

Acceptance criteria:

- Required fields are clearly indicated.
- Invalid values produce understandable feedback.
- Existing information can be edited without unnecessarily recreating the record.
- Empty fields are not represented as verified facts.

### FR-03 — Employment history

The user must be able to manage employment records.

A record may contain employer, role title, start date, end date or current-role status, description, and relevant skills.

Acceptance criteria:

- Records can be created, viewed, edited, and deleted.
- Date values are validated.
- Deletion is confirmed when appropriate.
- Employment information is kept separate from achievement evidence.

### FR-04 — Achievement records

The user must be able to record professional achievements.

A record should support:

- Required, non-empty title and contribution.
- Optional context, outcome, and potential impact; each may be empty.
- Actions as an array of strings, defaulting to an empty array.
- Multiple optional metrics, each with a name, finite numeric value, unit,
  optional period, and a basis of measured or estimated. Positive, zero, and
  negative values are allowed.
- Supporting evidence, represented by an array defaulting to an empty array.
  Evidence means information that helps substantiate an achievement; its item
  structure remains open. No evidence format, upload, or storage integration
  is defined by CP-012.
- An optional link to one employment record; deleting that employment record
  preserves the achievement and removes the link.

Acceptance criteria:

- Missing metrics default to an empty array and are not invented.
- `outcome` describes an actual result; `potentialImpact` describes an
  expected, estimated, or possible benefit. The fields are independent and
  may both contain values.
- A measured metric is not automatically verified.
- Verification and approval are handled separately under FR-05, not as part of
  CP-012 achievement records.

### FR-05 — Verification and approval

CP-013 adds user-controlled verification status to the achievement record as
a whole. Verification is not a prerequisite for creating an achievement.
Verification, user approval, supporting evidence, and a metric's measured or
estimated basis are separate concepts.

Acceptance criteria:

- An achievement has one verification status: `unverified`,
  `needs_confirmation`, or `verified`.
- A new achievement defaults to `unverified`.
- The interface explains that `unverified` is the initial state,
  `needs_confirmation` means the user has identified it for further review,
  and `verified` means the user deliberately reviewed and confirmed the
  achievement.
- Evidence is optional and its presence does not itself verify an achievement.
- Editing verified achievement content resets its status to `unverified`.
- Reading or rendering an achievement does not change its status.
- Verification does not record history and is not equivalent to approval.
- Drafting warnings are deferred to CP-030/CP-034; job-fit scoring treatment
  is deferred to CP-023.

### FR-06 — Job opportunities

The user must be able to create, view, edit, and delete job records.

A record may include company, role title, job description, location, employment type, source URL, date saved, and user notes.

Acceptance criteria:

- Multiple job records can be maintained.
- Required fields are validated.
- A job can be linked to application drafts and tracking records.
- Missing job information is clearly identified.

### FR-07 — Job requirements

The user must be able to represent requirements for each saved job.

Requirements may include skills, experience, responsibilities, qualifications, domain knowledge, and preferred criteria.

Acceptance criteria:

- Requirements are stored against the correct job.
- The user can edit requirement text and category.
- Mandatory versus preferred status can be represented.
- Requirements are not automatically treated as proven user capabilities.

### FR-08 — Requirement-to-evidence mapping

The user must be able to associate a job requirement with one or more career records.

Acceptance criteria:

- Each mapping identifies the requirement and the supporting career evidence.
- Unsupported requirements can remain unmapped.
- Users can review and change mappings.
- The interface distinguishes evidence coverage from verified capability.

### FR-09 — Deterministic fit assessment

CareerPilot must calculate a transparent assessment using documented rules.

Acceptance criteria:

- Scoring uses explicit inputs and documented weights.
- Missing evidence is not silently treated as a strong match.
- Results can be explained through requirement-level contributions.
- The assessment does not claim to predict hiring outcomes.
- Tests cover representative scoring scenarios.

The initial scoring algorithm and weights must be documented and reviewed before implementation.

### FR-10 — Application drafts

The user must be able to prepare CV bullet and cover letter drafts using templates and verified career information.

Acceptance criteria:

- Drafts are editable.
- The user can save, discard, and revisit drafts.
- A draft can reference its source job and supporting career records.
- Unsupported claims are flagged.
- The user explicitly approves a draft before treating it as ready for use.

### FR-11 — Claim validation

Draft validation must detect claims that cannot be supported by the available career records.

Acceptance criteria:

- Missing or unverified metrics are flagged.
- Unsupported responsibility or achievement claims are identified when detectable.
- The user receives an explanation and can revise the text.
- Validation does not silently rewrite a claim into a different factual assertion.
- The limitations of deterministic validation are documented.

### FR-12 — Application tracking

The user must be able to maintain application records and statuses.

Acceptance criteria:

- An application can reference a job and relevant draft.
- Status, dates, and follow-up reminders can be recorded.
- Users can update application progress.
- Search and filtering work across supported fields.

### FR-13 — Data export

The application must support versioned JSON export.

Acceptance criteria:

- Export contains the documented supported data.
- The export includes a schema version.
- Exported data can be inspected as JSON.
- The user receives feedback if export fails.

### FR-14 — Data import

The application must validate imported JSON before applying changes.

Acceptance criteria:

- Invalid JSON is rejected with understandable feedback.
- Unsupported schema versions are handled safely.
- Required fields and data types are validated.
- Import does not silently corrupt existing records.
- Replacement or merge behavior is explicit and confirmed before destructive changes.

### FR-15 — AI-assisted features

AI features are introduced only after the manual workflow is usable.

Potential capabilities:

- Extracting job requirements from descriptions.
- Drafting application content grounded in career records.
- Suggesting evidence mappings.
- Identifying unsupported claims.

Acceptance criteria:

- AI output is treated as a proposal, not an authoritative fact.
- Output is validated against a defined schema.
- Evidence and verification rules remain in force.
- Failures are handled without data loss.
- Users review and approve generated content.

## 6. Non-Functional Requirements

### Usability

- Navigation and feedback should be understandable without technical knowledge.
- Empty states should explain the next useful action.
- Destructive actions should be clear.

### Accessibility

- Semantic HTML should be used.
- Controls must have accessible names.
- Keyboard focus must remain visible.
- Color must not be the only indicator of state.
- Reduced-motion preferences should be respected.

### Responsive design

- Core workflows must remain usable on mobile, tablet, and desktop.
- No essential action should depend on hover.
- Layouts should avoid unintended horizontal overflow.

### Reliability

- Invalid data must be handled safely.
- Persistence failures must be communicated.
- Import must be validated before data is changed.

### Privacy and security

- Collect only information required for the workflow.
- Do not include personal career data in public demo fixtures.
- Explain where data is stored and what is transmitted externally.
- Do not embed secret API keys in client-side JavaScript.
- Before integrating an AI provider, document data transmission and consent.

### Maintainability

- Keep the initial architecture understandable and modular.
- Avoid dependencies unless they provide clear value.
- Use repeatable tests for important behavior.

## 7. Data and Content Rules

CareerPilot must distinguish:

- **Verified:** for an achievement, the user has deliberately reviewed and
  confirmed the achievement as a whole.
- **Needs confirmation:** for an achievement, the user has identified it for
  further review.
- **Unverified:** the default achievement status before deliberate user
  confirmation, or after verified achievement content is edited.
- **Unsupported:** available records do not support the claim.
- **Proposed:** suggested content that has not been approved.
- **Approved:** content explicitly accepted by the user for the relevant use.

Only `unverified`, `needs_confirmation`, and `verified` are CP-013 achievement
verification statuses. Unsupported is a separate support classification;
proposed and approved describe content/approval, not achievement verification.
These concepts are not interchangeable. User approval does not automatically
prove a claim's accuracy, and supporting evidence or a measured metric does not
automatically verify an achievement.

## 8. MVP Acceptance Criteria

The manual MVP is considered functionally ready when:

1. Users can navigate all core sections.
2. Career profile, employment, and achievement data can be maintained.
3. Evidence and verification information can be recorded.
4. Jobs and requirements can be maintained.
5. Requirements can be mapped to career evidence.
6. Fit assessment is deterministic and explainable.
7. Drafts can be created, edited, saved, and reviewed.
8. Application records and follow-ups can be maintained.
9. Data export and validated import work.
10. Core tests pass, responsive behavior is checked, and limitations are documented.
11. The application can be used without an AI API.

The specific implementation status must be checked against the repository before declaring these criteria satisfied.

## 9. Dependencies and Delivery

The delivery order follows the established six-milestone roadmap in `ROADMAP.md`.

GitHub issues are the source of truth for task-level completion. This PRD describes intended product behavior rather than asserting that the behavior already exists.

## 10. Open Decisions

- Exact profile fields and validation rules.
- Initial storage mechanism and recovery behavior.
- Fit scoring weights and explanation format.
- Import merge versus replacement strategy.
- AI provider, budget, and privacy policy.
- Draft versioning and history requirements.
- Definition of verification and approval in the UI.

Record final decisions in `DECISIONS.md`.
