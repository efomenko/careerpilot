# CareerPilot — Product Roadmap

## 1. Purpose

This roadmap defines the intended delivery sequence for CareerPilot. GitHub milestones and issues remain the source of truth for execution status.

The task IDs listed below are the established project IDs. This document does not imply that any task is complete.

## 2. Delivery Principles

- Build a working manual MVP before introducing an AI API.
- Deliver small, testable increments.
- Establish data structures before implementing dependent workflows.
- Add evidence and validation before generating application content.
- Test critical behavior as it is introduced.
- Preserve existing user data when changing schemas.
- Update documentation as implementation decisions change.

## 3. Milestones

### M1 — Foundation & Application Shell

**Goal:** Establish the repository, navigation, responsive layout, and reusable user feedback.

Tasks:

- **CP-001:** Repository and project foundation.
- **CP-002:** Responsive application shell.
- **CP-003:** Reusable validation and feedback.

Dependencies: None beyond the repository and development environment.

Exit criteria:

- Repository structure and setup are documented.
- Main sections have distinct content or placeholders.
- Navigation and mobile behavior work.
- Shared validation and feedback patterns are established.
- Basic accessibility and responsive checks pass.

### M2 — Career Knowledge Base

**Goal:** Build the trusted source of career information used by all later features.

Tasks:

- **CP-010:** Data structures for profile and employment.
- **CP-011:** CRUD for profile and employment.
- **CP-012:** Achievement records and evidence.
- **CP-013:** Verification status and warnings.
- **CP-014:** Persistence and recovery.

Dependencies: M1.

Exit criteria:

- Profile and employment records can be maintained.
- Achievement data can be recorded.
- Evidence and verification status are represented.
- Data persistence and recovery behavior are documented and tested.
- The app distinguishes verified information from information needing confirmation.

### M3 — Jobs & Evidence-Based Fit

**Goal:** Help users compare job requirements against career evidence.

Tasks:

- **CP-020:** Job CRUD.
- **CP-021:** Job requirements.
- **CP-022:** Map requirements to achievements.
- **CP-023:** Deterministic weighted assessment.
- **CP-024:** Test scenarios.

Dependencies: M2.

Exit criteria:

- Job opportunities and requirements can be maintained.
- Requirements can be mapped to career records.
- Assessment results are reproducible and explainable.
- Missing evidence is not treated as verified capability.
- Representative assessment scenarios pass.

### M4 — Application Drafts & Review

**Goal:** Create editable application content without losing factual grounding or user control.

Tasks:

- **CP-030:** CV bullet template.
- **CP-031:** Cover letter template.
- **CP-032:** Edit, save, and discard draft.
- **CP-033:** Evidence links, verification status, and approval.
- **CP-034:** Unsupported-claim and metric validation.

Dependencies: M2 and M3.

Exit criteria:

- CV bullets and cover letters can be drafted using templates.
- Drafts can be edited and saved.
- Supporting evidence can be inspected.
- Unsupported claims and metrics are flagged where detectable.
- User approval is explicit.

### M5 — Application Tracking & Quality

**Goal:** Complete the job-search workflow and make the application suitable for portfolio demonstration.

Tasks:

- **CP-040:** Application records.
- **CP-041:** Stages, dates, and follow-ups.
- **CP-042:** Search and filtering.
- **CP-043:** Versioned JSON export.
- **CP-044:** Validated JSON import.
- **CP-050:** Automated tests.
- **CP-051:** Accessibility and responsive checks.
- **CP-052:** Fictional demo data.
- **CP-053:** README, setup, and architecture.
- **CP-054:** Screenshots, demo, and deployment.

Dependencies: M1–M4 for the relevant features. Some testing and documentation tasks can begin earlier and be refined throughout development.

Exit criteria:

- Applications and follow-ups can be tracked.
- Search and filters work as specified.
- Export and import are validated.
- Critical behavior has repeatable tests.
- Demo data is fictional.
- Setup, limitations, screenshots, and demo instructions reflect the actual implementation.

### M6 — AI Integration & Evaluation

**Goal:** Add AI assistance without compromising evidence quality, privacy, or user control.

Tasks:

- **CP-060:** AI service contracts and schemas.
- **CP-061:** AI job-description extraction.
- **CP-062:** Evidence-grounded generation.
- **CP-063:** Unsupported-claim detection, error handling, and retry limits.
- **CP-064:** Repeatable AI evaluation set.

Dependencies: The manual workflows and data structures should be sufficiently stable before AI is introduced. M5 tasks may overlap where sensible, but AI integration must not replace foundational evidence and validation work.

Exit criteria:

- AI inputs and outputs have defined contracts.
- Job-description extraction produces reviewable results.
- Draft generation is grounded in supplied career records.
- Errors and retries are bounded.
- Unsupported claims are evaluated systematically.
- AI quality can be compared across versions.

## 4. Dependency Overview

```text
M1 Foundation
    |
    v
M2 Career Knowledge Base
    |
    v
M3 Jobs & Evidence-Based Fit
    |
    v
M4 Application Drafts & Review
    |
    v
M5 Tracking & Quality
    |
    v
M6 AI Integration & Evaluation
```

This is the primary sequence, not a requirement that every task within a milestone finish before any subsequent work begins. Documentation, testing, and accessibility checks should be performed continuously.

## 5. Definition of Done

A task is complete when:

1. Its GitHub acceptance criteria are satisfied.
2. The implementation is reviewed.
3. Relevant manual or automated tests pass.
4. Errors and edge cases have been considered.
5. Accessibility and responsive behavior are checked where relevant.
6. Documentation is updated where needed.
7. The change is committed and pushed.
8. The GitHub issue is updated with actual test results and remaining limitations.

## 6. Scope Changes

Any new feature should be reviewed against:

- User value.
- Implementation complexity.
- Dependencies.
- Privacy and factual-grounding implications.
- Whether it is necessary for the manual MVP.

New task IDs must be created in GitHub first and then added to this roadmap. Do not assign an invented ID in documentation.

## 7. Current Status

This document records the intended roadmap. Individual task completion must be verified against the GitHub issues and repository. No milestone is declared complete by this document alone.
