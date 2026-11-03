# UX-000 — UX Refinement Specification

**Project:** CareerPilot — AI Job Search Copilot

**Workstream:** UX Refinement

**Status:** Approved

**Scope:** UX-001 through UX-005

## 1. Purpose

Improve the usability, clarity, consistency, and accessibility of the existing CareerPilot interface.

The workstream will:

- Reduce the amount of form content permanently displayed on the main views.
- Separate read-only information from create/edit interactions.
- Introduce a shared dialog and notification foundation.
- Make destructive actions explicit and understandable.
- Improve discoverability of achievement verification guidance.
- Preserve existing data, validation, state-management, and persistence behavior.

The workstream is a UX refinement of existing functionality, not a redesign of CareerPilot's product scope.

## 2. Guiding principles

1. **Preserve data integrity.** UX changes must not weaken existing model or state validation.
2. **Preserve user input.** Validation failures must not discard entered data.
3. **Make destructive actions explicit.** Users must understand the consequences before confirming deletion.
4. **Keep verification deliberate.** The application must not automatically verify achievements.
5. **Keep feedback understandable.** Notifications, field errors, and persistence warnings have distinct responsibilities.
6. **Maintain accessibility.** Dialogs, notifications, forms, and navigation must remain usable with keyboard and assistive technology.
7. **Avoid scope expansion.** No new persistence, migration, AI, or dashboard functionality is included.

## 3. Shared dialog behavior — UX-001

Use native HTML `<dialog>` elements and a reusable dialog foundation.

### 3.1 Opening and closing

- Open dialogs using `showModal()`.
- Provide an accessible title and, where useful, a description.
- Provide explicit primary and Cancel actions.
- Set initial focus appropriately.
- Restore focus to the invoking control after closing.
- If the invoking control no longer exists after a state update, restore focus to a stable, logical fallback.
- Prevent interaction with background content while the modal is open.

### 3.2 Unsaved changes

- Escape closes a dialog without additional confirmation when there are no unsaved changes.
- Escape on a dialog containing unsaved changes must ask the user to confirm discarding them.
- Choosing to continue editing keeps the dialog open and preserves entered values.
- Choosing to discard closes the dialog and abandons the unsaved changes.
- Cancel follows the same discard-confirmation rule when changes have been made.
- Backdrop clicks do not close dialogs.

### 3.3 Validation

- Existing validation rules and field-level feedback must remain in place.
- Validation failures keep the dialog open.
- Entered values remain available for correction.
- Focus moves to the first invalid field where appropriate.
- Successful state mutation closes the dialog.

## 4. Shared notification behavior — UX-001

Introduce one shared notification area for ordinary application feedback.

### 4.1 Success notifications

- Success notifications are dismissible.
- They automatically disappear after 4 seconds.
- They do not steal keyboard focus.
- They are cleared when navigating to an unrelated view.

### 4.2 Error notifications

- Error notifications remain visible until resolved or dismissed.
- A new ordinary notification replaces the previous ordinary notification.
- Field-level validation errors remain associated with their respective fields.
- Notifications must not replace or hide field-level errors.

### 4.3 Persistence warnings

CP-014 persistence and recovery behavior must remain intact.

- Persistence warnings remain in their dedicated status region.
- Ordinary notifications must not overwrite, clear, or hide persistence warnings.
- A successful in-memory state mutation does not necessarily mean that data was successfully persisted.
- The interface must not claim that data has been saved when the persistence layer reports a failure.
- The persistence coordinator remains responsible for reporting persistence status.

## 5. Career Profile — UX-002

### 5.1 Empty state

When no career profile exists:

- Display a clear empty state.
- Provide a Create Profile action.
- Do not display the full profile form permanently.

### 5.2 Populated state

When a profile exists:

- Display a compact, read-only summary.
- Include full name, headline, summary, and skills.
- Provide an Edit action.
- Do not display the full editing form permanently.

### 5.3 Create and edit

- Use a shared create/edit dialog where practical.
- Preserve existing fields and validation behavior.
- Cancel discards unsaved changes, subject to the shared dialog rules.
- Editing must preserve the profile identity and existing persistence behavior.
- Do not introduce profile deletion.

### 5.4 Long summaries

- Summaries longer than approximately 200 characters should initially be collapsed.
- Provide an accessible Expand/Collapse control.
- Short summaries remain fully visible.

## 6. Employment History — UX-003

### 6.1 Main view

- Display employment records as compact cards.
- Provide an Add Employment action.
- Do not display the full employment form permanently.
- Preserve the existing record order; do not introduce a new sorting rule.

### 6.2 Employment cards

Each card should display:

- Role title.
- Employer.
- Employment dates.
- Responsibilities.

Provide Edit and Delete actions.

### 6.3 Create and edit

- Use a shared create/edit dialog where practical.
- Preserve all existing employment fields and validation rules.
- Preserve current date handling, including support for an unknown end date.
- Editing preserves the record ID and `createdAt`.
- Successful changes continue through the existing state and persistence mechanisms.

### 6.4 Deletion confirmation

Deletion requires explicit confirmation.

The confirmation must explain that:

- The employment record will be deleted.
- Achievements linked to it will remain.
- Those achievements will become unlinked.
- Linked achievements currently marked Verified will be reset to Unverified.

The user must be able to cancel without changing any data.

## 7. Achievements — UX-004

### 7.1 Main view

- Display achievements as compact cards.
- Provide an Add Achievement action.
- Do not display the full achievement form permanently.

### 7.2 Achievement cards

Cards should expose the following information:

- Achievement title.
- Contribution.
- Outcome.
- Employment association, when present.
- Verification status.

Provide Edit and Delete actions.

### 7.3 Create and edit

- Use a shared create/edit dialog where practical.
- Preserve all existing achievement fields:
  - Title
  - Context
  - Contribution
  - Actions
  - Outcome
  - Potential impact
  - Metrics
  - Evidence
  - Employment association
- Preserve support for multiple metrics and their measured/estimated basis.
- Preserve arbitrary evidence values and the existing evidence-array contract.
- Preserve existing validation and state-management behavior.
- Do not introduce an evidence schema, uploads, or external integrations.

### 7.4 Verification status

- Keep verification status visible on the achievement card.
- Preserve the existing statuses: Unverified, Needs Confirmation, and Verified.
- Keep status changes explicit and separate from ordinary achievement content editing.
- Preserve the existing status update operation and its validation behavior.
- Editing achievement content must continue to follow the existing verification-reset rules.

### 7.5 Verification guidance

Add a clearly titled and visually distinct section:

**About verification statuses**
It must explain the meaning of the three statuses and make clear that verification is a deliberate user action. It must not imply that the presence of evidence or a measured metric automatically makes an achievement verified.

### 7.6 Deletion

Achievement deletion requires explicit confirmation. Canceling must leave the achievement unchanged.

## 8. Accessibility and responsive behavior — UX-005

All changes must preserve or improve accessibility.

Required checks include:

- Semantic headings and controls.
- Accessible dialog names and descriptions.
- Correct labels and field-error associations.
- Visible keyboard focus.
- Keyboard operation of dialog actions and notifications.
- Escape behavior for clean and dirty dialogs.
- Correct focus restoration after closing dialogs.
- Appropriate live-region behavior for notifications and persistence warnings.
- No notification stealing focus.
- Dialog content and actions usable on narrow screens.
- No horizontal overflow or obscured dialog actions.

Existing navigation behavior must remain intact:

- Hash-based navigation.
- Direct links to views.
- Browser Back and Forward.
- Active navigation state.
- Mobile navigation and keyboard behavior.

## 9. CP-014 persistence and recovery compatibility

CP-014 is complete. The UX workstream must preserve its implementation and contract.

Specifically:

- Continue using the existing browser persistence mechanism.
- Do not introduce a new persistence mechanism or data migration.
- Load and restore state before the application renders its data-dependent views.
- Preserve existing autosave behavior after successful state mutations.
- Preserve recovery behavior for corrupt, unsupported, and unavailable storage.
- Keep persistence warnings separate from ordinary notifications.
- Do not roll back a successful in-memory mutation solely because persistence failed.
- Do not close a dialog only after a successful storage write. Close it after a successful state mutation; persistence feedback is handled separately.

UX-005 must include regression checks for persistence and recovery.

## 10. Out of scope

The following are explicitly excluded:

- Profile deletion.
- Dashboard counter changes or dynamic dashboard metrics.
- Changes to profile, employment, or achievement data contracts.
- Changes to achievement verification rules.
- Verification history or audit trails.
- New evidence structure, uploads, or integrations.
- New persistence mechanisms, migration, or cloud synchronization.
- AI functionality or AI-generated content changes.
- New functionality for Jobs, Drafts, or Application Tracker.
- New UI libraries or frameworks.

## 11. Implementation sequence and dependencies

| Issue | Scope | Dependency |
| --- | --- | --- |
| UX-000 | Finalize UX specification and workstream | None |
| UX-001 | Shared dialog and notification foundation | UX-000 |
| UX-002 | Career Profile compact view and dialog editing | UX-000, UX-001 |
| UX-003 | Employment History dialog-based CRUD | UX-000, UX-001 |
| UX-004 | Achievements dialog-based CRUD | UX-000, UX-001 |
| UX-005 | Integrated UX quality, accessibility, and regression testing | UX-002, UX-003, UX-004 |

UX-002, UX-003, and UX-004 can be implemented independently after UX-001 is complete.

## 12. Acceptance criteria for UX-000

UX-000 is complete when:

1. This specification is reviewed and approved.
2. The relevant GitHub issue descriptions reflect the approved behavior.
3. The stale CP-014 dependency wording is corrected.
4. The CP-014 compatibility requirements are included.
5. The employment deletion side effects are explicit.
6. UX-005 includes persistence regression testing.
7. GitHub blocker relationships reflect the agreed implementation sequence, or any inability to configure them is documented.
8. No implementation changes are made as part of UX-000.
**End of specification**
