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

- Validate a valid profile record.
- Reject missing required properties.
- Reject unexpected data types.
- Test optional and empty values.
- Validate employment date consistency.

### CP-011 — Profile and employment CRUD

- Create a profile.
- Edit a profile.
- Create multiple employment records.
- Edit one record and confirm others remain unchanged.
- Delete a record and confirm the result.
- Test invalid input.
- Test empty-state behavior.

### CP-012 — Achievement and evidence

- Create an achievement with evidence.
- Create an achievement without a metric.
- Confirm missing metrics remain absent.
- Edit an outcome and verify the record is updated.
- Confirm source references remain associated correctly.
- Test missing and duplicate references where relevant.

### CP-013 — Verification

- Mark a claim unverified.
- Mark a claim as needing confirmation.
- Verify a claim through the defined workflow.
- Confirm generated content does not automatically change verification status.
- Confirm approval is distinct from verification.
- Confirm warnings appear in relevant drafting workflows.

### CP-014 — Persistence and recovery

- Save data and reload the application.
- Confirm records persist according to the chosen storage mechanism.
- Test empty storage.
- Test malformed stored data.
- Test a storage failure where feasible.
- Confirm the user receives feedback.
- Test recovery behavior and document limitations.

## 6. M3 — Jobs & Evidence-Based Fit

### CP-020 — Job CRUD

- Create, edit, and delete a job.
- Test missing required fields.
- Save a source URL and notes where supported.
- Confirm job references remain consistent.

### CP-021 — Requirements

- Add mandatory and preferred requirements.
- Edit and delete a requirement.
- Confirm each requirement belongs to the correct job.
- Test empty and ambiguous requirement text.

### CP-022 — Evidence mapping

- Map a requirement to a relevant achievement.
- Map multiple achievements to one requirement.
- Remove a mapping.
- Test a requirement with no supporting evidence.
- Test a missing or deleted evidence reference.

### CP-023 and CP-024 — Scoring

- Test a job with all requirements supported.
- Test partial coverage.
- Test no supporting evidence.
- Test mandatory requirements without evidence.
- Test unverified evidence.
- Test conflicting or duplicate mappings.
- Confirm identical inputs produce identical results.
- Confirm explanation and score agree.
- Confirm the score is not described as a probability of being hired.

Expected outputs must be documented after the scoring formula is agreed.

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

## 11. Release Readiness

A release should not be considered ready until:

- Critical workflows have been tested.
- No unresolved data-loss defect is known.
- Validation and import/export behavior are verified.
- Responsive and accessibility checks are complete.
- Known limitations are documented.
- The demo contains no private data.
- AI features, when introduced, pass the agreed factual-grounding evaluations.
