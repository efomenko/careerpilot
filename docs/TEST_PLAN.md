# CareerPilot — Test Plan

## 1. Purpose

This plan defines how CareerPilot functionality, data integrity, accessibility, and evidence-grounding behavior should be verified.

Tests should be introduced alongside features. A listed test is planned until it has been executed and its result recorded.

## 2. Testing Principles

- Test behavior, not merely whether the page loads.
- Verify both valid and invalid inputs.
- Test boundary conditions and missing information.
- Keep scoring and validation tests repeatable.
- Use fictional demo data in public demonstrations.
- Never use test success as proof that an unsupported career claim is true.
- Record failures and limitations honestly.

## 3. Test Levels

### Manual UI testing

Use the browser to verify navigation, forms, responsive behavior, feedback, and common workflows.

### Unit testing

Test isolated functions for validation, scoring, transformations, and schema checks.

### Integration testing

Test relationships between data records, persistence, drafts, and import/export.

### Accessibility testing

Check keyboard interaction, focus, labels, semantic structure, contrast, and reduced motion.

### AI evaluation

For M6, compare generated output against known evidence and documented expected behavior.

## 4. M1 — Foundation & Application Shell

### CP-001 — Repository foundation

- Confirm the documented entry point exists.
- Follow the README setup instructions from a clean checkout.
- Confirm paths to CSS and JavaScript resolve.
- Check the browser console for loading errors.
- Confirm no unnecessary dependency is required.

### CP-002 — Responsive application shell

- Open Dashboard and confirm it displays its own content.
- Navigate to each other section and confirm the main content changes.
- Confirm the active navigation item updates.
- Test a valid URL hash.
- Test an unknown hash and confirm safe fallback behavior.
- Test mobile menu open and close.
- Test Escape-key behavior if implemented.
- Confirm focus remains visible.
- Test widths of 375, 760, 1000, and 1440 CSS pixels.
- Check for unintended horizontal scrolling.
- Confirm no JavaScript errors occur during navigation.

### CP-003 — Validation and feedback

**Standalone harness checks (available now):**

- Open `validation-demo.html` through a local static server.
- Submit with the required demo value blank; confirm an explanatory field error and form-level error feedback appear.
- Enter a non-empty value that does not match the example format; confirm the format explanation appears.
- Submit with a valid required value and either a blank optional format value or a matching value; confirm success feedback.
- Use the warning button and confirm its message is understandable without color.
- Confirm invalid fields receive `aria-invalid="true"` and reference their error text in `aria-describedby` while retaining their help-text association.
- After a valid submission, confirm the error state and error association are cleared.
- Check that feedback uses a polite live region, that focus moves to the first invalid field after a failed submission, and that no `role="alert"` is used indiscriminately.
- Confirm the harness is only a demonstration and does not save or create product records.

**Regression checks for CP-002:**

- Open `index.html` and verify all six navigation views, active navigation state, hash navigation, and browser Back/Forward behavior.
- Test mobile navigation by keyboard and pointer at about 375 CSS pixels; confirm there is no horizontal scrolling or console error.

**Repeat when business forms are added:**

- Confirm each real form uses the correct required fields and explicitly defined format rules.
- Submit missing and malformed business data; confirm messages explain how to correct the actual fields and are associated with the correct controls.
- Verify successful, warning, and error feedback in real workflows, including accessible announcements and sensible focus behavior.
- Confirm invalid records cannot be saved and failed validation does not corrupt existing data.

## 5. M2 — Career Knowledge Base

### CP-010 — Data structures

- Run `npm test` from the project root (requires Node.js 18 or later).
- Validate valid Career Profile and Employment History records.
- Verify empty headline, summary, skills, and responsibilities are accepted.
- Reject missing required fields, blank required strings, incorrect field types, and non-string array items.
- Reject malformed inputs and unknown properties in the construction helpers.
- Reject missing, blank, or malformed ID/timestamp metadata.
- Verify creation preserves supplied IDs and initializes `createdAt` and `updatedAt` to the supplied timestamp.
- Reject invalid UTC timestamps and calendar dates, including impossible dates such as `2025-02-30`.
- Accept current roles (`isCurrent: true`, `endDate: null`), past roles with unknown end dates (`isCurrent: false`, `endDate: null`), and past roles with known end dates.
- Reject current roles with a non-null end date and known end dates earlier than the start date.
- Confirm validation leaves its input unchanged.

### CP-011 — Profile and employment CRUD

- Automated state-layer tests (`tests/career-state.test.js`):
  - Confirm a newly created state has no profile and no employment records.
  - Create a profile and reject a second profile.
  - Update a profile while preserving its ID and `createdAt`.
  - Add multiple employment records; update one without changing others.
  - Delete one record without affecting the other records.
  - Reject invalid profile and employment data without changing state.
  - Reject updates and deletes for unknown IDs.
  - Confirm returned records and arrays cannot mutate internal state.
  - Confirm caller-supplied IDs and timestamps are used without clock access or
    random ID generation.
- UI workflows, accessibility, and responsive checks will be added when the
  Career Profile and Employment History interface is implemented.

### CP-012 — Achievement and evidence

- Model tests:
  - Require a non-empty achievement `id`.
  - Require non-empty `title` and `contribution`.
  - Accept optional `context`, `outcome`, and `potentialImpact`, including
    empty values, and verify the approved array defaults.
  - Validate `actions` as an array of strings without imposing unapproved
    constraints on individual action strings.
  - Support multiple metric records and finite numeric values, including
    positive, zero, and negative values.
  - Accept only `"measured"` or `"estimated"` metric bases.
  - Confirm `outcome` and `potentialImpact` are independent, including when
    both are populated.
  - Validate strict ISO UTC timestamps and reject `updatedAt` earlier than
    `createdAt`.
  - Accept `employmentId: null` or a non-empty string ID, and reject values
    with an invalid basic type or blank string, consistent with the model's
    identifier conventions.
  - Confirm `evidence` defaults to an array and accepts array handling without
    asserting any evidence item schema.
  - Do not invent missing metrics; the approved missing-metrics default is an
    empty `metrics` array.
- State tests:
  - Create, read, update, and delete achievements.
  - Create an achievement with no employment link and with a valid optional
    employment link.
  - Reject a non-null employment link to a nonexistent employment record
    during state-layer creation or update.
  - Delete linked employment and confirm achievements are preserved with
    `employmentId: null`.
  - Compare each affected achievement before and after employment deletion;
    every field and value remains unchanged except `employmentId`, which is
    set to `null`. Under CP-013, a linked `verified` achievement also resets
    to `unverified` while preserving its timestamps and other content.
  - Confirm achievement content and unrelated employment and achievement
    records remain unchanged by updates or deletion.
- Verification and approval workflows are CP-013, not CP-012. Evidence item
  structure and item-level validation remain open and are not asserted here.

### CP-013 — Verification

- Model and state tests:
  - Confirm a new achievement defaults to `verificationStatus: "unverified"`.
  - Accept only `"unverified"`, `"needs_confirmation"`, and `"verified"`;
    reject invalid status values and types without changing state.
  - Confirm the user-controlled status update can set each supported status;
    status is not inferred automatically.
  - Confirm evidence is optional and evidence presence or absence does not
    change verification status. Keep evidence items open and unvalidated.
  - Confirm a metric's `"measured"` or `"estimated"` basis does not determine
    verification status.
  - Confirm content updates compare normalized editable content, excluding
    `id`, `createdAt`, `updatedAt`, and `verificationStatus`; arrays are
    order-sensitive, plain-object key ordering is insignificant, and
    primitives use `Object.is` equality.
  - Confirm a verified achievement resets to `"unverified"` only when
    normalized content changes. Content changes preserve
    `"unverified"` and `"needs_confirmation"`.
  - Confirm an unchanged content save preserves verification status while
    applying the caller-supplied `updatedAt`; changed-content saves also use
    the caller-supplied timestamp.
  - Confirm deliberate status changes use an operation separate from content
    updates and apply the caller-supplied timestamp. Invalid statuses and
    unknown IDs must leave state unchanged.
  - Confirm employment deletion unlinks associated achievements and resets
    linked `"verified"` achievements to `"unverified"` while preserving
    `createdAt`, `updatedAt`, and all other content.
  - Confirm reading or rendering an achievement does not change its status.
  - Confirm verification remains separate from approval. CP-013 does not
    introduce or modify draft approval behavior. Future draft approval
    workflows must not implicitly change achievement verification status.
  - Confirm existing achievement create, read, update, delete, employment-link,
    and employment-deletion-unlink behavior continues to pass.
  - Confirm invalid updates leave the achievement unchanged.
- Manual UI checks:
  - Verify the status applies to the achievement as a whole and the meanings
    of all three statuses are understandable without relying on color.
  - Deliberately change status, then edit verified content and confirm it
    returns to `unverified`; merely opening or viewing the achievement leaves
    the status unchanged.
- Drafting warnings for unsupported claims are deferred to CP-030/CP-034.
  Job-fit scoring treatment of unverified achievements is deferred to CP-023.

### CP-014 — Persistence and recovery

- With an empty storage key, start with an empty in-memory Career Knowledge
  Base and verify the version-1 envelope is written after the first successful
  mutation.
- Restore a valid version-1 envelope and confirm the profile, employment
  records, and achievement records are available before the application
  renders.
- Validate the envelope structure and version, complete profile/employment/
  achievement records, duplicate IDs, and employment relationships. Reject
  invalid snapshots without partially restoring or normalizing records.
- Confirm each successful profile, employment, and achievement mutation saves
  the complete snapshot, including verification-status changes and employment
  deletion updates to linked achievements.
- Reload after saving and confirm the profile, employment records,
  achievements, relationships, and verification statuses persist.
- For invalid JSON, malformed envelopes, invalid records, and unsupported
  versions, verify the original stored value is preserved, the in-memory state
  starts empty, no partial restore occurs, and writes to that key remain
  disabled for the session.
- Confirm failed restoration produces a persistent, understandable warning
  that existing data could not be restored and current changes will not be
  persisted.
- Confirm evidence values that cannot be faithfully represented by JSON are
  rejected at the persistence boundary without modifying in-memory evidence.
- Simulate unavailable storage and failed writes. Verify successful in-memory
  mutations remain usable, the user is told changes were not persisted, no
  persistence-success feedback is shown, and the previous stored value is not
  deleted before the write attempt.
- Keep CP-043/CP-044 import/export scenarios separate; import/export is not
  implemented by CP-014.

## 6. M3 — Jobs & Evidence-Based Fit

### CP-020 — Job CRUD

#### Automated coverage

- `tests/job-model.test.js`: validate Job construction, required and optional
  fields, source URL formats, status, timestamps, and invalid or unknown fields.
- `tests/job-ui-helpers.test.js`: verify search over company, role title,
  description, and notes; case-insensitive partial matching; empty queries;
  Active/Archived filtering combined with search; updated-time sorting with
  created-time tie-breaking; and that inputs are not mutated.
- `tests/career-state.test.js`: verify Job creation, update, archive,
  reactivate, and deletion, including deletion of the selected Job's
  Requirements and their achievement mappings while preserving Achievement
  and Employment History records.
- `tests/career-persistence.test.js` and `tests/career-storage.test.js`: verify
  Job mutations persist, v1 snapshots migrate through v2 to v3 with empty
  Jobs, Requirements, and achievement-mapping collections, v2 snapshots
  migrate to v3, and a successful mutation writes the complete v3 envelope.
- Run `npm test` to execute the automated suite.

#### Manual browser regression — pending

These browser checks have not been recorded as performed. Do not treat them as
passed until run and reported.

- Create and edit Jobs; test missing required fields, invalid source URLs, and
  optional description, source URL, and notes.
- Search each supported field; check case-insensitive and partial matches,
  surrounding whitespace, the result count, and the clear-search control.
- Switch between Active and Archived while searching; verify filtering,
  updated-time sorting with created-time tie-breaking, status-specific empty
  states, and the no-search-matches state.
- Open a Job's details and return to the list; confirm the selected filter and
  search query remain unchanged.
- Archive an active Job and reactivate an archived Job; confirm each appears
  under the corresponding filter without losing its other displayed details.
- Start deletion for an active and an archived Job. Confirm Cancel and Escape
  do not delete; confirm the warning explains the Job/Requirements/mapping
  cascade and explicitly states that Achievement and Employment History
  records remain. Confirm deletion removes the Job and returns to a correctly
  updated list.
- Reload after create, edit, archive, reactivate, and delete to check
  persistence.
- Use keyboard-only navigation to check visible focus, dialog initial focus,
  cancellation focus restoration, and post-deletion focus. Check narrow
  responsive widths, long text, horizontal overflow, and browser-console
  errors.

### CP-021 — Requirements

#### Automated coverage

- `tests/requirement-model.test.js`: verify the exact Requirement fields,
  supported categories and importance values, default category, required
  non-blank description, timestamps, rejection of unknown fields, and
  non-mutation of inputs.
- `tests/career-state.test.js`: verify Requirement CRUD, Job ownership,
  immutable fields, no-op update behavior, insertion order, detached copies,
  archived-Job management, and deletion of related mappings while preserving
  Achievement records. Also verify `legacyRequirements` survives restore,
  snapshots, and unrelated mutations without appearing in canonical CRUD
  results.
- `tests/career-storage.test.js`: verify v1 → v2 → v3 and v2 → v3 migration,
  v3 loading and round trips, Requirement classification and duplicate-ID
  handling, legacy and mapping preservation, read-only loads, and safe
  failures for malformed Requirements and invalid envelopes.
- `tests/career-persistence.test.js`: verify v1/v2 migration restores without
  writing, later successful mutations persist the complete v3 snapshot,
  legacy entries survive persistence, and failed loads do not overwrite
  stored data or enable writes.
- No dedicated automated UI test was added.

#### Manual browser regression — completed

- Create Requirements and verify required-field validation.
- Verify user-provided descriptions render as text, not markup.
- Edit Requirements; confirm unchanged submissions preserve timestamps and
  do not cause unnecessary updates.
- Verify dirty Escape shows the discard confirmation, Continue editing
  retains values, and discard closes without saving.
- Verify delete cancellation leaves the Requirement unchanged and confirmed
  deletion removes it.
- Verify focus restoration after cancel, discard, save, and delete.
- Verify archived Jobs still allow Requirement creation, editing, and
  deletion.
- Verify navigation, keyboard interaction, and responsive layout.
- Semantic interpretation or ambiguity of Requirement descriptions is not
  validated.

### CP-022 — Evidence mapping

#### Automated coverage

- `tests/achievement-mapping-model.test.js`: verify mapping construction
  initializes `updatedAt` from caller-supplied `createdAt`; validate the exact
  fields, required values, canonical UTC timestamps, timestamp ordering,
  unknown fields, invalid values, and non-mutation of inputs.
- `tests/career-state.test.js`: verify creation requires existing Requirement
  and Achievement endpoints, rejects duplicate mapping IDs and duplicate
  Requirement–Achievement pairs atomically, supports many-to-many mappings,
  and returns detached copies in insertion order. Verify mapping deletion
  and failed mutations preserve endpoint records and do not notify.
- `tests/career-state.test.js`: verify Job, Requirement, and Achievement
  deletion cascades remove only targeted mappings and preserve unrelated
  records and surviving Achievement verification statuses.
- `tests/achievement-mapping-ui-helpers.test.js`: verify trimmed,
  case-insensitive partial title/context search, mapped-Achievement exclusion,
  Verified and Unverified grouping (including `needs_confirmation`),
  case-insensitive alphabetical ordering, empty groups, and input
  immutability. Also verify the no-Achievements, all-mapped, and no-matches
  selector states and resolved evidence grouping/counts, including orphaned
  mapping references.
- `tests/career-storage.test.js` and `tests/career-persistence.test.js`:
  verify v1 → v2 → v3 and v2 → v3 migration behavior, preservation of
  mappings present in v2 snapshots, v1's empty mapping collection, and
  persistence of restored mappings through later successful mutations.
- No dedicated automated DOM/UI test harness exists; selector dialog,
  navigation, focus, and confirmation rendering are not covered by automated
  UI tests.

#### Manual browser regression — completed

The user confirmed that the Achievement evidence/selector browser checks and
the complete Achievement deletion confirmation checklist passed.

- Verify Requirement evidence groups, resolved counts, and empty states.
- Open an Achievement from a Requirement; return to Jobs and confirm the same
  Job and Requirement context remains available.
- Open the mapping selector and verify title/context search, status grouping,
  alphabetical order, exclusion of already-mapped Achievements, and immediate
  mapping.
- With no Achievements, navigate to the Achievements workflow, create an
  Achievement, return to the same Job/Requirement, and map it.
- Unmap an Achievement and verify its evidence group and count update.
- Verify Achievement deletion confirmation for zero, one, and multiple
  mappings. Cancel and confirm deletion; confirm related Requirements and Jobs,
  unrelated Achievements, and unrelated mappings are preserved.
- Use keyboard-only interaction to verify selector search, result selection,
  Escape/Cancel behavior, dialog focus, and return focus. Check responsive
  layout and the browser console for errors.

### CP-023 and CP-024 — Scoring

#### Automated coverage

- `tests/fit-assessment-helpers.test.js`: verify empty/not-assessed and zero-
  and full-coverage results, weighted partial scores, Mandatory counts,
  verified versus unverified and `needs_confirmation` classification,
  multiple verified Achievements counting once, missing Achievement records,
  Requirements without mappings, evidence ID order and deduplication,
  four-group and deterministic secondary ordering, exact result fields,
  input validation, repeated-call determinism, and input/output immutability.
- `tests/career-state.test.js`: verify existing Job validation, live source
  data gathered through public state APIs, verified-only support, isolation
  between Jobs sharing an Achievement, and fresh results after mapping
  creation/deletion, verification changes, content edits that reset
  verification, and Requirement importance updates. The integrated Job
  matching lifecycle verifies Mandatory/Preferred weighting and
  verification-aware evidence before and after a verification change.
  Verify that Achievement deletion removes mapped evidence, Requirement
  deletion removes its mappings, and Job deletion recalculates the surviving
  Job's assessment while preserving unrelated records. Also verify failed
  mutations preserve assessment results, calculation does not notify
  subscribers or mutate source records, and snapshots do not contain
  `fitAssessments`.
- `tests/career-persistence.test.js`: verify save/reload restoration of Jobs,
  Requirements, Achievements, mappings, and verification statuses, followed
  by Fit Assessment recalculation from restored source records rather than
  persisted assessment data.
- Full automated test suite: 346 passed, 0 failed.

#### Manual browser regression — completed

The user confirmed that CP-023 Fit Assessment browser QA passed. No browser
version or test-environment details are recorded.

- Verify Jobs with no Requirements show a not-assessed state without a score;
  verify zero and partial evidence coverage.
- Verify Mandatory/Preferred weighting, Mandatory coverage, and multiple
  verified Achievements counting as support for one Requirement.
- Verify verified evidence is distinguished from `unverified` and
  `needs_confirmation` evidence, and that unverified evidence is not presented
  as supporting a Requirement.
- Create, edit, and delete Requirements; create and remove mappings; verify
  the assessment refreshes.
- Change Achievement verification, edit Achievement content so verification
  resets, and delete an Achievement; verify the assessment refreshes.
- Delete Employment History linked to verified Achievements; verify the
  resulting verification reset is reflected in the assessment.
- Navigate away from the Job detail and back to Jobs; verify the selected
  Job's assessment reflects current data.
- Verify responsive layout and keyboard/accessibility behavior.

## 7. M4 — Application Drafts & Review

### CP-030 — CV bullet templates

- Generate a bullet from a supported achievement.
- Test an achievement without a metric.
- Confirm no metric is invented.
- Confirm the source achievement can be identified.

### CP-031 — Cover letters

- Create a draft for a selected job.
- Confirm job details and career evidence are used appropriately.
- Test missing job information.
- Test insufficient career evidence.
- Confirm unsupported details are omitted or flagged.

### CP-032 — Draft editing

- Create and save a draft.
- Edit and save it again.
- Discard changes and verify documented behavior.
- Reopen a saved draft.
- Test unsaved-change handling.

### CP-033 — Evidence and approval

- Confirm source references are visible.
- Confirm unverified claims are identified.
- Approve a draft explicitly.
- Edit an approved draft and verify whether reapproval is required according to the design.
- Confirm approval does not alter source verification status.

### CP-034 — Claim validation

- Test an unsupported metric.
- Test a new responsibility absent from the evidence.
- Test an unsupported employment date.
- Test a claim with incomplete evidence.
- Test a supported claim that has not been explicitly verified.
- Confirm warnings explain the issue.
- Document false positives and false negatives.

## 8. M5 — Tracking and Quality

### CP-040 — Application records

- Create an application linked to a job.
- Edit its status.
- Associate a draft.
- Test missing or deleted job references.

### CP-041 — Stages and follow-ups

- Update an application stage.
- Record and edit dates.
- Test invalid date values.
- Test overdue and future follow-ups.
- Confirm displayed status matches stored data.

### CP-042 — Search and filtering

- Search by company and role title.
- Apply one filter.
- Combine filters where supported.
- Clear filters.
- Confirm empty results are handled clearly.

### CP-043 — JSON export

- Export a dataset containing supported record types.
- Parse the output as JSON.
- Confirm the schema version exists.
- Confirm linked identifiers remain consistent.
- Confirm private test data is not accidentally included in public demo assets.

### CP-044 — JSON import

- Import a valid export.
- Import malformed JSON.
- Import missing required properties.
- Import unsupported schema versions.
- Test duplicate identifiers.
- Test broken references.
- Confirm invalid imports do not partially corrupt existing data.
- Verify merge or replacement behavior before destructive changes.

### CP-050 — Automated tests

- Run the documented test command.
- Confirm critical tests are repeatable.
- Confirm test failures are visible.
- Verify edge cases for validation and scoring.
- Avoid tests that depend on real personal data.

### CP-051 — Accessibility and responsiveness

- Navigate using the keyboard alone.
- Confirm visible focus.
- Inspect semantic headings and form labels.
- Check accessible names for interactive controls.
- Test narrow and wide viewports.
- Check zoom and text wrapping.
- Confirm reduced-motion preferences are respected where relevant.

### UX-005A — Browser navigation while dialogs are open

- In Chrome, navigate between Profile, Employment, and Achievements.
- With a clean dialog open, use Back and Forward; confirm it closes and the destination view receives focus.
- With a dirty dialog open, use Back and Forward; confirm discard confirmation appears without losing the form values.
- Choose Continue editing; confirm the original view, dialog, and entered values remain, and the URL returns to the original history entry.
- Repeat and confirm discard; confirm the destination navigation completes once and focus moves to the destination.
- Repeat Back and Forward while the discard confirmation is open; confirm the pending destination is not lost and no extra history entries are created.
- Confirm ordinary navigation without a dialog, direct hashes, unknown-hash fallback, and browser Back/Forward remain unchanged.
- Unit tests use a controlled History API fake; they do not prove native browser history behavior or screen-reader behavior.

### CP-052 — Demo data

- Confirm demo records are fictional.
- Check for personal identifiers and real private career details.
- Confirm common and edge-case states are represented.
- Confirm demo data can be restored.

### CP-053 and CP-054 — Documentation and deployment

- Follow setup instructions from a clean checkout.
- Verify documentation links.
- Compare screenshots with the current UI.
- Test the deployed version if one exists.
- Confirm no private data or API keys are published.
- Document any known deployment limitations.

## 9. M6 — AI Integration and Evaluation

### CP-060 — Contracts and schemas

- Validate well-formed model output.
- Reject malformed output.
- Test missing required fields.
- Test unexpected values.
- Confirm provider failures are handled.

### CP-061 — Job-description extraction

- Extract requirements from a clear job description.
- Test ambiguous wording.
- Test missing qualifications.
- Test irrelevant or instruction-like content in the source.
- Confirm extracted content remains editable.
- Confirm the original source remains available.

### CP-062 — Grounded generation

- Generate content from verified evidence.
- Generate content with missing evidence.
- Include a source that contains no metric.
- Confirm unsupported metrics are not accepted.
- Test contradictory source records.
- Confirm draft approval is required.

### CP-063 — Error and claim handling

- Simulate a provider timeout.
- Simulate rate limiting.
- Simulate invalid model output.
- Confirm retries are bounded.
- Confirm existing drafts remain intact.
- Confirm unsupported claims are flagged where detectable.

### CP-064 — AI evaluation set

Maintain a repeatable dataset containing:

- Straightforward supported claims.
- Claims with missing metrics.
- Unverified achievements.
- Conflicting evidence.
- Requirements absent from a job description.
- Prompt-injection-like text in untrusted source material.
- Cases where the correct response is to ask for clarification.

Record model or prompt version, expected behavior, actual result, and known limitations.

## 10. Test Execution Record

For each execution, record:

- Date.
- Build or commit identifier.
- Task ID.
- Test scenario.
- Expected result.
- Actual result.
- Pass, fail, or blocked status.
- Defect or follow-up issue.

Do not mark a test as passed without executing it.

### UX-005B–UX-005E — Completed UX refinement verification

- Date: Not recorded in the supplied verification results.
- Task IDs: UX-005B, UX-005C, UX-005D, and UX-005E.

#### UX-005B — Contrast verification

- Chrome browser verification: 7/7 passed.
- Verified welcome-gradient and muted-text readability, translucent top-bar
  breadcrumb readability, input/date/select boundaries, keyboard focus
  visibility, focus indicators in editor and discard-confirmation states, and
  responsive and zoom behavior.
- Contrast CSS changes were committed as `6f2109a`
  (`fix: improve text and focus contrast`).

#### UX-005C — Responsive and visual usability

- Chrome browser verification: 7/7 passed.
- Verified Profile, Employment, and Achievements on desktop, tablet, and
  mobile; no overflow or inaccessible controls at 320px and 375px; 200% zoom;
  breakpoint transitions; and direct hash navigation, active navigation, and
  mobile navigation after resizing.

#### UX-005D — Keyboard-only regression

- Chrome browser verification: 8/8 passed.
- Verified navigation; Profile, Employment, and Achievement CRUD; validation
  and first-invalid-field focus; dirty-dialog confirmation; notification
  dismissal; and focus restoration.

#### UX-005E — Persistence and recovery

- Chrome Incognito browser verification:
  - Clean-session persistence and reload: 6/6 passed.
  - Malformed JSON: the original corrupt value was preserved and a warning
    displayed.
  - Unsupported version 999: the original value and all data sections were
    preserved and a warning displayed.
  - Valid version-1 state restored successfully.
  - Simulated `Storage.prototype.setItem` failures for Profile, Employment,
    and Achievement: 3/3 passed. In-memory mutations remained visible, and a
    separate persistence warning appeared alongside ordinary operation
    notifications.
  - After restoring the storage method, a later successful mutation saved the
    complete current state; reload restored all changes.

#### Final automated regression

- `npm test`: 195 passed, 0 failed.
- `node --check` passed for `src/js/app.js`, `src/js/dialogs.js`,
  `src/js/navigation.js`, and `src/js/notifications.js`.
- `git diff --check` passed.
- The working tree was clean at final regression time. The final regression's
  commit identifier was not recorded in the supplied results.

### CP-021 — Requirement model, persistence, and UI verification

- Date: Not recorded in the supplied verification results.
- Task: CP-021.
- Automated regression: `npm test` — 279 passed, 0 failed.
- `node --check src/js/app.js` passed.
- `git diff --check` passed.
- Manual browser regression passed for Requirement creation and validation,
  safe text rendering, editing and no-op timestamp stability, dirty Escape and
  Continue editing, discard, delete cancel/confirm, focus restoration,
  archived Jobs, navigation, keyboard use, and responsive layout.
- No dedicated automated UI test was added.

#### Assistive-technology limitation

- Screen-reader testing was not performed because a screen reader was
  unavailable. Semantic markup, keyboard behavior, visible focus, and
  browser-based accessibility checks were performed, but this is not full
  assistive-technology verification.

## 11. Release Readiness

A release should not be considered ready until:

- Critical workflows have been tested.
- No unresolved data-loss defect is known.
- Validation and import/export behavior are verified.
- Responsive and accessibility checks are complete.
- Known limitations are documented.
- The demo contains no private data.
- AI features, when introduced, pass the agreed factual-grounding evaluations.
