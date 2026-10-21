# CareerPilot — Architecture and Product Decision Log

## 1. Purpose

This log records important CareerPilot product and technical decisions, their rationale, and their status.

It distinguishes confirmed project direction from proposed choices that still need approval.

## 2. Decision Status Definitions

- **Confirmed:** explicitly agreed as part of the project direction.
- **Proposed:** recommended, but not yet approved.
- **Open:** requires a decision.
- **Superseded:** replaced by a later decision, with a reference to the replacement where available.

Do not mark a decision confirmed merely because it appears in this document.

## 3. Decision Records

### DEC-001 — Start with a manual MVP

**Status:** Confirmed

**Decision:** Build the core CareerPilot workflow without requiring an AI API. Introduce AI only after the relevant manual workflows and data structures exist.

**Rationale:** This keeps the initial application easier to understand, test, and demonstrate. It also establishes the evidence model before introducing probabilistic generation.

**Consequences:**

- Initial features must work without AI credentials.
- Rule-based templates and scoring are used where appropriate.
- AI integration remains a later milestone.

### DEC-002 — Use vanilla HTML, CSS, and JavaScript initially

**Status:** Confirmed

**Decision:** Start with a lightweight browser application using vanilla web technologies.

**Rationale:** This supports the project's learning objectives and avoids unnecessary framework complexity during the initial build.

**Consequences:**

- Keep the architecture modular and testable.
- Avoid dependencies unless they offer clear value.
- Revisit the decision only if demonstrated requirements justify a change.

### DEC-003 — Keep career claims grounded in evidence

**Status:** Confirmed

**Decision:** CareerPilot must not invent achievements, responsibilities, employment facts, or metrics.

**Rationale:** Accurate professional representation is a core product requirement.

**Consequences:**

- Career records require explicit verification information.
- Drafts must be editable and reviewable.
- Missing evidence must be surfaced rather than silently filled in.
- AI output must be validated and approved by the user.

### DEC-004 — Maintain a staged delivery roadmap

**Status:** Confirmed

**Decision:** Organize implementation around the six established milestones, M1 through M6, and the existing CP task IDs.

**Rationale:** Incremental delivery supports learning, review, and regression testing.

**Consequences:**

- Preserve the existing GitHub task IDs.
- Update the roadmap when scope or dependencies change.
- Do not report planned functionality as complete without verification.

### DEC-005 — Use a responsive application shell

**Status:** Confirmed

**Decision:** Provide a shared application shell with distinct sections for Dashboard, Career Profile, Achievements, Job Opportunities, Application Drafts, and Application Tracker.

**Rationale:** The application needs consistent navigation while keeping each workflow distinct.

**Consequences:**

- Each navigation item must display its own section content.
- Mobile navigation and keyboard behavior must be considered.
- The shell should be built before detailed feature screens.

### DEC-006 — Choose the initial persistence mechanism

**Status:** Open

**Problem:** Career data must persist between sessions, but the storage mechanism has not been finalized in this decision log.

**Candidate:** Browser storage for the initial single-user MVP.

**Questions:**

- Which browser storage mechanism best fits the expected data size and complexity?
- How will malformed or outdated data be handled?
- What happens when users clear browser data?
- What backup and recovery instructions are required?

**Next step:** Decide during CP-014 after considering export/import requirements.

### DEC-007 — Define the final domain schemas

**Status:** Proposed

**Proposal:** Use separate records for profile, employment, achievements, jobs, requirements, drafts, and applications, with stable identifiers and explicit relationships.

**Rationale:** Separate records support reuse and make evidence tracing easier.

**Next step:** Review the conceptual schemas in `TECHNICAL_DESIGN.md` before implementing CP-010 and related tasks.

### DEC-008 — Use transparent deterministic job-fit scoring

**Status:** Confirmed in principle; formula open

**Decision:** The initial job-fit assessment must use documented, reproducible rules rather than an opaque AI-generated judgment.

**Open questions:**

- Which weights apply to mandatory and preferred requirements?
- How should partial evidence be represented?
- How should unverified evidence affect scoring?
- Should missing mandatory requirements impose a cap or separate warning?

**Next step:** Define and test the formula during CP-023 and CP-024.

### DEC-009 — Separate verification from approval

**Status:** Confirmed

**Decision:** Verification of a career claim and approval of a draft are separate states.

**Rationale:** A user can approve text for editing or use without having independently verified every underlying claim. The interface must not confuse these actions.

**Consequences:**

- Career records and drafts require appropriate status fields.
- Material edits after approval should trigger review.
- Generated output cannot verify itself.

### DEC-010 — Validate imported data before applying it

**Status:** Confirmed in principle; import behavior open

**Decision:** Imported JSON must be validated before it changes stored data.

**Open questions:**

- Should import replace existing data or merge records?
- How should duplicate identifiers be handled?
- How should unsupported schema versions be treated?

**Next step:** Decide and document the behavior before completing CP-044.

### DEC-011 — Choose an AI provider and architecture

**Status:** Open

**Problem:** AI features are planned, but provider selection and deployment architecture have not been finalized.

**Considerations:**

- Quality and structured-output support.
- Cost and usage limits.
- Data handling and retention.
- API key protection.
- Latency, failure behavior, and retry limits.
- Ability to evaluate outputs consistently.

**Next step:** Revisit during CP-060. Do not place provider secrets in frontend code.

### DEC-012 — Define draft history and versioning

**Status:** Open

**Problem:** Users need to edit and approve drafts, but the desired history and rollback behavior needs clarification.

**Questions:**

- Is only the latest draft required initially?
- Should approval be associated with an immutable draft version?
- Should users be able to restore an earlier version?

**Next step:** Resolve during CP-032 and CP-033.

## 4. Decision Change Process

For each significant decision:

1. State the problem.
2. Describe viable options.
3. Explain the chosen option and rationale.
4. Record consequences and limitations.
5. Update the relevant design or requirements document.
6. Mark the old decision superseded when applicable.

## 5. Maintenance

Review this file when:

- The architecture changes.
- A requirement changes materially.
- A new dependency is introduced.
- Data storage or privacy behavior changes.
- AI integration decisions are made.
- A decision is superseded by implementation evidence.
