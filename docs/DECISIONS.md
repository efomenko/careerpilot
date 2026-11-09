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

**Status:** Confirmed

**Decision:** The original CP-014 implementation used browser `localStorage` to persist the Career Knowledge Base in one version-1 JSON envelope containing `profile`, `employmentRecords`, and `achievementRecords`. The current version-4 envelope and recovery behavior are described in the follow-up below.

Stored JSON, envelope structure and version, records, duplicate IDs, and employment relationships must be validated before restoration. Invalid JSON, malformed envelopes, invalid records, and unsupported versions must not be partially restored or silently overwritten. When restoration fails for one of these reasons, the original stored value is preserved and writes to that storage key are disabled for the current session.

Evidence values that cannot be represented faithfully by JSON are rejected at the persistence boundary without changing in-memory evidence. If storage is unavailable or a write fails, the application remains usable in memory and clearly communicates that changes are not persisted. A write must not delete the previous stored value before attempting to save.

**Rationale:** A single versioned browser-storage envelope provides local persistence for the current career records while keeping validation and recovery explicit and avoiding silent data loss.

**Consequences:**

- Persistence is a separate application responsibility; existing record models and CP-010 through CP-013 behavior remain authoritative.
- Restoration must complete successfully before application views render from restored state.
- Persistence failures must be clearly reported, and invalid or unsupported stored data must not be overwritten automatically.
- Browser storage is not a secure cloud backup, and data may be lost if browser data is cleared.
- **Historical CP-014 scope:** import/export and schema migration remain
  separate from that original persistence task.

**CP-021 follow-up — 2026-11-06:** Version 3 added legacy Requirement
preservation and historical Requirement classification. This is a historical
milestone; the current envelope is version 4.

**CV-001 persistence follow-up:** The current version-4 envelope contains
`profile`, `employmentRecords`, `achievementRecords`, `jobs`, `requirements`,
`legacyRequirements`, `achievementMappings`, `educationRecords`,
`certificationRecords`, and `import` with `sessions`, `completedBatches`,
and `importReports`. The last three career/import containers are implemented
as JSON-compatible storage containers, not complete Education, Certification,
or CV Import workflows. The approved workflows and transaction semantics
remain targets in `TECHNICAL_DESIGN.md`.

Valid v1, v2, and v3 snapshots migrate sequentially to v4 in memory, without
writing during load. The v2-to-v3 step classifies Requirements into canonical
and legacy collections; v3-to-v4 converts exact Employment dates to structured
day-precision values and adds the new containers and missing provenance arrays.
Historical negative zero in supported legacy Requirements remains readable but
write-protected; unsafe integer tokens and data that cannot safely migrate are
protected rather than overwritten.

An initial storage-read failure disables saving for that persistence instance.
Recovery requires fresh initialization after storage becomes available;
reloading does not recover unsaved in-memory changes. Read failures after a
successful initialization can be retried. Sequential checks protect data
observed during those checks, but independent concurrent writers are not
coordinated: there is no cross-tab lock, compare-and-swap, stale-write
detection, or atomic multi-writer guarantee.

### DEC-007 — Define the final domain schemas

**Status:** Proposed

**Proposal:** Use separate records for profile, employment, achievements, jobs, requirements, drafts, and applications, with stable identifiers and explicit relationships.

**Rationale:** Separate records support reuse and make evidence tracing easier.

**Next step:** Continue reviewing schemas for records beyond the Career Profile and Employment History before their implementation tasks.

**CP-020 follow-up — 2026-11-05:** CP-020 establishes the implemented Job
record schema documented in `TECHNICAL_DESIGN.md` and validated by
`src/js/job-model.js`. This clarifies the Job portion of the original proposal;
it does not finalize Requirement, draft, or application schemas. Requirements
and achievement-mapping collections support state and persistence
relationships, but their user-facing management workflows are outside CP-020.

**CP-021 follow-up — 2026-11-06:** CP-021 finalizes the Requirement record
contract and Job-detail management workflow. A Requirement has `id`, `jobId`,
`description`, `category`, `importance`, `createdAt`, and `updatedAt`, and is
managed through state CRUD with Job ownership validation. The Job detail view
supports creating, editing, and deleting Requirements, including for archived
Jobs. Requirement deletion also removes its achievement mappings while
preserving Achievement records. The finalized contract and behavior are
documented in `TECHNICAL_DESIGN.md`; drafts and applications remain proposals.

**CV-001 follow-up - 2026-11-09:** Separate Education and Certification
records are approved for CV Import. Their target contracts, along with
field-level provenance and structured Employment dates, are specified in
`TECHNICAL_DESIGN.md`. This does not finalize Draft or Application schemas;
those remain proposals.

### DEC-013 — Define Career Profile and Employment History schemas

**Status:** Confirmed

**Decision:** CP-010 defines canonical Career Profile and Employment History records in `TECHNICAL_DESIGN.md` and implements their deterministic construction and validation in `src/js/career-model.js`. Each record has a stable non-empty string ID and creation/update timestamps. Profile skills and employment responsibilities are arrays of strings. Employment dates are calendar dates; `isCurrent` distinguishes a current role from a past role whose end date is unknown.

**Rationale:** Later career workflows need a consistent, independently testable contract that does not require UI or persistence behavior.

**Consequences:**

- Constructors receive the record ID and creation timestamp from the caller; both timestamps are initialized to the supplied creation timestamp.
- Validation is pure and reports field-specific errors without mutating records.
- Focused model tests use Node.js's built-in test runner through `npm test`; no third-party test framework is added.
- Verification and approval fields are not part of these CP-010 schemas. Their behavior remains governed by later verification and approval work, including the existing distinction in DEC-009.
- At the time of DEC-013, schemas for jobs, requirements, drafts, and
  applications remained proposals. CP-020 has since established the Job
  record schema, and CP-021 has since finalized the Requirement contract.
  Draft and application schemas remain proposals. The achievement schema is
  confirmed by DEC-014.

### DEC-014 — Define the CP-012 Achievement Record Contract

**Status:** Confirmed

**Decision:** An achievement is a separate structured career record with the
fields `id`, `title`, `context`, `contribution`, `actions`, `outcome`,
`potentialImpact`, `metrics`, `evidence`, `employmentId`, `createdAt`, and
`updatedAt`.
`id` is a non-empty string. `title` and `contribution` are required and
non-empty. `context`, `outcome`, and `potentialImpact` are optional strings and
may be empty. `actions`, `metrics`, and `evidence` are arrays that default to
`[]`; actions contain strings.

`outcome` describes an actual result. `potentialImpact` describes an expected,
estimated, or possible benefit. These fields are independent and may both
contain values.

Multiple metrics are supported. Each metric has a name, a finite JavaScript
number as its value, a unit, an optional period, and a basis of `"measured"` or
`"estimated"`. Metric values may be positive, zero, or negative. A measured
metric is not automatically verified.

An achievement may be unlinked or linked to one employment record through
`employmentId`; `null` means unlinked. Multiple achievements may link to one
employment record. The model layer validates the basic `employmentId`
field type/format, and the state layer checks that a non-null link refers to an
existing employment record during creation and update. Deleting employment
preserves its achievements and sets their `employmentId` to `null`. Recovery
behavior for an already-stale employment link remains open.

Timestamps follow CP-010's strict ISO UTC format. The application supplies IDs
and timestamps; `updatedAt` must not precede `createdAt`.

The architecture uses a dedicated `src/js/achievement-model.js`, achievement
CRUD in the existing `src/js/career-state.js`, the existing Achievements view,
and one shared `careerState` instance.

Evidence means supporting information that helps substantiate an achievement.
The evidence item structure remains open. This decision defines no evidence
item properties, source formats, uploads, or storage integrations. Evidence is
distinct from verification and approval; verification belongs to CP-013.
CP-012 does not add persistence or AI workflows.

**Rationale:** A stable, independently validated achievement record supports
later evidence-based workflows while distinguishing actual results from
potential impact and keeping achievement capture separate from verification,
approval, persistence, and AI workflows.

**Consequences:**

- Achievement construction and validation belong in the dedicated achievement
  model module; achievement CRUD extends the existing state factory.
- State-level employment relationship checks must preserve achievements when
  linked employment is deleted.
- Tests must not assume an evidence item schema or add unapproved validation
  constraints.
- Verification and approval remain outside CP-012.

### DEC-015 — Define CP-013 achievement verification

**Status:** Confirmed

**Decision:** Verification applies to the achievement record as a whole. The
supported `verificationStatus` values are `"unverified"`,
`"needs_confirmation"`, and `"verified"`. New achievements default to
`"unverified"`. A user must deliberately confirm an achievement before it can
be marked `"verified"`; evidence is optional. Editing the content of a
verified achievement resets its status to `"unverified"`. Verification
history is not required.

Verification is separate from user approval, supporting evidence, and a
metric's `"measured"` or `"estimated"` basis. CP-013 does not implement
drafting warnings or define job-fit scoring behavior; those are deferred to
CP-030/CP-034 and CP-023 respectively.

CP-013 defines verification only for Achievement records. It does not define
verification fields or behavior for Career Profiles or Employment History
records; any future verification requirements for those records require a
separate decision.

**Rationale:** An explicit user-controlled status communicates whether the
achievement as a whole has been reviewed without treating evidence presence,
metric basis, or draft approval as verification.

**Approved implementation details:**

- Content updates compare normalized editable achievement content, excluding
  `id`, `createdAt`, `updatedAt`, and `verificationStatus`. Arrays are
  order-sensitive, plain-object key ordering is insignificant, and primitive
  values are compared using `Object.is`. The comparison does not prescribe a
  particular serialization or implementation technique.
- A content update resets `verified` to `unverified` only when normalized
  content changes. Unchanged content preserves verification status, and
  content changes preserve `unverified` and `needs_confirmation`. Every
  successful content save uses the caller-supplied `updatedAt`, including an
  unchanged save.
- Deliberate verification changes use a separate state operation from content
  updates. The caller supplies the timestamp, which updates `updatedAt`.
  Invalid statuses and unknown IDs do not mutate state.
- Deleting employment automatically unlinks associated achievements. A linked
  achievement with `verified` status becomes `unverified`; its `createdAt`,
  `updatedAt`, and all other achievement content are preserved, maintaining
  the CP-012 employment-deletion behavior.

**Consequences:**

- Achievement status is initialized and changed deliberately; it is not
  inferred from evidence or metric basis.
- Changed content invalidates a verified status, while unchanged saves,
  reading, or rendering an achievement do not change its verification status.
- CP-013 adds no verification-history requirement, drafting-warning behavior,
  or fit-scoring rule.

### DEC-008 — Use transparent deterministic job-fit scoring

**Status:** Confirmed and implemented

**Decision:** The Fit Assessment uses documented, reproducible rules rather than an opaque AI-generated judgment:

- Mandatory Requirements have weight 2; Preferred Requirements have weight 1.
- A Requirement is supported when at least one mapped Achievement has
  `verificationStatus === "verified"`. `unverified` and
  `needs_confirmation` evidence does not support a Requirement. Multiple
  verified Achievements supporting one Requirement count only once.
- The overall score is the percentage of weighted Requirements supported by
  verified evidence. Mandatory Requirement coverage is calculated and
  displayed separately.
- With no Requirements, the assessment is `not_assessed` and its score is
  `null`. With Requirements and no verified evidence, it is `assessed` with a
  score of 0.
- Scores retain full precision internally and display to one decimal place.
- Assessments are derived dynamically from current source records and are not
  persisted or cached.
- The assessment describes documented evidence coverage only. It does not use
  qualitative fit bands, predict hiring outcomes, or claim to measure hiring
  success.

**Rationale:** Users can see which documented, verified evidence supports each
Requirement and how Requirement importance affects the result without
mistaking the score for a hiring prediction.

### DEC-009 — Separate verification from approval

**Status:** Confirmed

**Decision:** Verification of a career claim and approval of a draft are separate states.

**Rationale:** A user can approve text for editing or use without having independently verified every underlying claim. The interface must not confuse these actions.

**Consequences:**

- Career records and drafts require appropriate status fields.
- Material edits after approval should trigger review.
- Generated output cannot verify itself.

### DEC-010 — Validate imported data before applying it

**Status:** Confirmed; JSON import/export behavior outside CV Import remains
separate from the approved CV Import workflow.

**Decision:** Imported JSON must be validated before it changes stored data.

**Historical open questions, resolved for CV Import by the 2026-11-09
follow-up below:**

- CV Import merges only explicitly approved candidates. Duplicate suggestions
  are advisory; users explicitly choose add, merge, or skip. Merge requires a
  target and explicit per-field conflict choices. No automatic merge occurs.
- Candidate IDs and state relationships are validated before commit.
- Unsupported or malformed snapshots are not overwritten; migration validates
  each historical snapshot under its source-version contract.

**CV-001 follow-up - 2026-11-09:** One import session contains one CV.
Review is guided by category and may be partially approved. Candidate data
does not enter career state before explicit approval. A candidate may be
imported at most once. A changed or deleted merge target requires renewed
review. A completed session has no pending importable decisions.

Import approval is distinct from Achievement verification and draft approval.
Imported Achievements remain `unverified`; provenance does not verify claims.
The detailed session and transaction rules are in `TECHNICAL_DESIGN.md`.

### DEC-011 — Choose an AI provider and architecture

**Status:** Partially confirmed; adapter and initial provider are approved

**Problem:** The provider-independent LLM adapter and initial provider are
approved. Exact model/version selection and future provider evaluation remain
open. Hosting and public deployment are outside the initial CV Import MVP.

**Considerations:**

- Quality and structured-output support.
- Cost and usage limits.
- Data handling and retention.
- API key protection.
- Latency, failure behavior, and retry limits.
- Ability to evaluate outputs consistently.

**CV-001 follow-up - 2026-11-09:** Keep the existing vanilla JavaScript
frontend and local-first browser career storage. A Python + FastAPI backend
handles CV upload, validation, parsing, LLM orchestration, candidate
generation, and temporary-file cleanup only. It does not store approved
career records or operate a career database. Backend output is untrusted
candidate data, and only explicit user approval updates local career state.
Use a provider-independent LLM adapter with OpenAI as the initial provider
for real extraction evaluation. Provider API keys remain backend-only.
Alternative providers may be evaluated later. The MVP does not include
hosting, OCR, multi-user support, or a cloud career database.

### DEC-012 — Define draft history and versioning

**Status:** Open

**Problem:** Users need to edit and approve drafts, but the desired history and rollback behavior needs clarification.

**Questions:**

- Is only the latest draft required initially?
- Should approval be associated with an immutable draft version?
- Should users be able to restore an earlier version?

**Next step:** Resolve during CP-032 and CP-033.

### DEC-016 — Approve CV Import data and review contracts

**Status:** Confirmed (2026-11-09)

**Decision:** CV Import handles one CV per locally persisted import session.
The session statuses are `processing`, `ready_for_review`,
`review_in_progress`, `import_completed`, `failed`, and `expired`. Sessions
expire seven days after creation; activity does not extend expiry. Processing
attempts are recorded separately. A failed extraction may be retried in the
same session, but retry must not overwrite candidates already reviewed.

The approved session fields are `id`, `status`, `sourceDocument`,
`createdAt`, `expiresAt`, `lastActivityAt`, `currentCategory`, `candidates`,
`reviewDecisions`, and `processingAttempts`. Source-document metadata has
`id`, `fileName`, `mimeType`, `language`, `uploadedAt`, `deleteBy`, and
`status`.

Candidates belong to `profile`, `employment`, `education`, `certification`,
`skill`, or `achievement`. Each candidate has `id`, `category`,
`originalData`, `reviewedData`, `fieldProvenance`, `validation`,
`reviewStatus`, and `possibleDuplicates`. `originalData` is immutable;
`reviewedData` is editable and editing triggers revalidation. Validation is
`valid`, `warning`, or `invalid`; review status is `pending`, `accepted`,
`rejected`, or `merged`. Invalid candidates cannot be accepted or merged;
warnings require explicit acknowledgement. Validation findings use stable
error and warning codes; the code catalog remains an implementation detail.
Partial category approval is supported, and candidates are imported at most
once.

Provenance retains the original extracted value. Editing a supported value
changes its association status to `needs_review`. Approved provenance
survives session expiry; unapproved provenance is removed on expiry.

Duplicate detection is deterministic, explainable, advisory, and dismissible.
Suggestions identify a target record, similarity signals, and `possible` or
`strong` match level. Decisions are `add`, `merge`, or `skip`. Merge requires
an explicit target and per-field conflict choices; no automatic merge occurs.

Field-level provenance records `id`, `sourceDocumentId`, `sourceType: "cv"`,
`fieldPath`, `extractedValue`, `excerpt`, `language`,
`associationStatus`, and `createdAt`, with optional `page`. Association
statuses are `supports`, `needs_review`, and `context_only`. Excerpts are at
most 500 characters; multiple excerpts may support one field and one excerpt
may support multiple fields. Excerpts are not manually editable, but users
may permanently delete provenance. Provenance is distinct from Achievement
evidence and never verifies a claim. Stable field paths and item IDs are used
instead of permanent array-index references. Editing a supported value marks
its association `needs_review`. Deleting provenance does not change career
values or verification status, and deleting a career record must not leave
orphaned provenance.

The original CV is deleted after successful processing and no later than
24 hours after upload. Session expiry removes temporary candidates,
unapproved provenance, and pending decisions. Approved records and their
provenance survive expiry. Completed sessions retain a minimal import report.
The report excludes original CV content and unapproved excerpts. English and
Russian are the initial supported languages.

**Consequences:**

- Education and Certification have dedicated career-record contracts.
- Import approval, draft approval, Achievement verification, and provenance
  association status remain separate concepts.
- Skill candidates are supported, but a standalone Skill record schema and
  exact deduplication rules are not finalized; these remain open technical
  details in `TECHNICAL_DESIGN.md`.

### DEC-017 — Commit approved imports as one snapshot transaction

**Status:** Confirmed (2026-11-09)

**Decision:** An approved batch follows `prepare -> validate -> persist ->
publish`. The conceptual state API is:

```js
commitApprovedImport({
  importSessionId,
  expectedCareerRevision,
  expectedSessionRevision,
  idempotencyKey,
  payloadIdentity,
  approvedChanges,
  report
})
```

The operation prepares all changes without mutating live state, validates the
complete next snapshot, and persists the complete snapshot with one
`localStorage.setItem()` call. It publishes the new in-memory state only
after persistence succeeds. Preparation or persistence failure leaves the
previous in-memory and persisted state authoritative. Existing sequential
CRUD operations must not implement an import batch.

An identical idempotency key and payload returns the original result; reuse
of a key for a different payload is rejected. Already-imported candidates
cannot be imported again. Stale revisions or changed merge targets block the
commit and require renewed review. A completed report records batch/session/
key, completion, candidate IDs, counts, record IDs, and non-sensitive
warnings.

The single-key write is the import commit boundary, not a distributed
transaction or guaranteed filesystem durability. The MVP permits one browser
tab to modify data. External snapshot changes must be detected and stale
commits blocked. The application must not claim cross-tab atomicity; if it
cannot safely enforce the single-tab assumption, it must fail closed instead
of silently overwriting newer data.

**Unresolved implementation details:** Canonical payload serialization/hash,
idempotency-key retention and collision handling, revision increments for
normal and import mutations, and the mechanism/fallback for enforcing the
single-tab writer constraint remain open. The complete target behavior and
failure semantics are specified in `TECHNICAL_DESIGN.md`.

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
