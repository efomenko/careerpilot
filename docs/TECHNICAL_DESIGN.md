# CareerPilot — Technical Design

## 1. Purpose

This document describes the proposed technical architecture for CareerPilot. Implementation details should be updated when a decision is confirmed or the code changes.

## 2. Architectural Principles

- Begin with vanilla HTML, CSS, and JavaScript.
- Prefer small modules and straightforward data flow.
- Keep business rules separate from interface rendering.
- Validate user input and imported data.
- Keep career claims linked to source records where possible.
- Make the initial MVP independent of an AI provider.
- Avoid unnecessary dependencies and infrastructure.
- Keep secrets out of browser-side code.

## 3. Proposed Repository Structure

```text
careerpilot/
├── docs/
│   ├── PRODUCT_VISION.md
│   ├── PRD.md
│   ├── USER_STORIES.md
│   ├── ROADMAP.md
│   ├── TECHNICAL_DESIGN.md
│   ├── AI_GUARDRAILS.md
│   ├── TEST_PLAN.md
│   └── DECISIONS.md
├── src/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js
│       ├── career-model.js
│       └── career-state.js
├── index.html
├── README.md
└── .gitignore
```

Additional JavaScript modules and test directories may be introduced as the implementation grows. The structure above is a proposed baseline, not a claim that every file already exists.

## 4. Initial Technology Stack

| Area | Initial approach |
| --- | --- |
| Markup | Semantic HTML |
| Styling | CSS with responsive layouts |
| Application logic | Vanilla JavaScript |
| Navigation | Client-side view switching |
| Initial routing | URL hash, if retained from the shell implementation |
| Initial persistence | To be confirmed; browser storage is a candidate |
| Data interchange | Versioned JSON |
| Testing | Start with manual checks; introduce automated tests for critical logic |
| AI | Deferred until the manual workflow is stable |

No frontend framework or build system is required for the initial static application unless a documented decision changes this approach.

## 5. Application Layers

### 5.1 Presentation layer

Responsibilities:

- Render navigation and section content.
- Display forms, lists, empty states, and status messages.
- Reflect application state.
- Support responsive layouts and accessible interaction.

The presentation layer should not contain complex scoring or evidence-validation rules.

### 5.2 Application logic

Responsibilities:

- Coordinate user actions.
- Validate data before saving.
- Update records.
- Control navigation.
- Connect UI events to data and business rules.

`src/js/career-state.js` provides an in-memory state factory for one Career
Profile and Employment History records. It uses the CP-010 constructors for
creation and validators for complete records, accepts IDs and timestamps from
its caller, and returns copies so callers cannot mutate its internal state.
It is independent of the DOM and browser storage; persistence is not provided.

### 5.3 Domain logic

Responsibilities:

- Validate career and job records.
- Map requirements to evidence.
- Calculate deterministic fit scores.
- Build template-based drafts.
- Detect known unsupported or unverified claims.
- Validate import and export structures.

These functions should be designed to support repeatable tests independently of the UI.

### 5.4 Persistence layer

Responsibilities:

- Load and save supported records.
- Handle missing, invalid, or incompatible stored data.
- Version stored data where appropriate.
- Report failures without silently discarding data.

The initial persistence technology is an open decision. Browser storage is a possible MVP solution, but its limitations must be explained to users.

## 6. Career Data Model

The Career Profile and Employment History records below are the CP-010 contract.
All listed properties are required. Empty values are allowed only where shown.
The model helpers in `src/js/career-model.js` validate these records without
accessing the DOM, storage, the clock, or random ID generation.

### Career profile

```js
{
  id: "profile-id",
  fullName: "",
  headline: "",
  summary: "",
  skills: [],
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

- `id` and `fullName` are non-empty strings.
- `headline` and `summary` are strings; an empty string is allowed.
- `skills` is an array of strings; an empty array is allowed.
- `createdAt` and `updatedAt` are valid timestamps in the exact
  `YYYY-MM-DDTHH:mm:ss.sssZ` format produced by `Date.prototype.toISOString()`.
  Numeric timezone offsets, missing milliseconds, and other fractional-second
  widths are not accepted.
- `updatedAt` must not be earlier than `createdAt`.
- Creation receives an ID and timestamp from its caller and initializes both
  timestamps from that creation timestamp. Editing behavior belongs to CP-011.

### Employment History record

```js
{
  id: "employment-id",
  employer: "",
  roleTitle: "",
  startDate: "2020-01-01",
  endDate: null,
  isCurrent: true,
  responsibilities: [],
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

- `id`, `employer`, and `roleTitle` are non-empty strings.
- `startDate` is a valid calendar date in `YYYY-MM-DD` form.
- `endDate` is either a valid calendar date in `YYYY-MM-DD` form or `null`.
- `isCurrent` is a boolean. Current roles require `endDate: null`; past roles
  may also have `endDate: null` when their end date is unknown.
- A known end date cannot be earlier than the start date.
- `responsibilities` is an array of strings; an empty array is allowed.
- `createdAt` and `updatedAt` are valid timestamps in the exact
  `YYYY-MM-DDTHH:mm:ss.sssZ` format produced by `Date.prototype.toISOString()`.
  Numeric timezone offsets, missing milliseconds, and other fractional-second
  widths are not accepted.
- `updatedAt` must not be earlier than `createdAt`.
- Creation receives an ID and timestamp from its caller and initializes both
  timestamps from that creation timestamp. Editing behavior belongs to CP-011.
- Date values are calendar dates, not timestamps.

The validators return `{ valid, errors }`; each error identifies a `field` and
explains the problem in `message`. Constructors throw a `TypeError` with an
`errors` array when input or metadata is invalid. Non-object inputs are reported
at `input` or `record`; omitted required properties, incorrect types, blank
required strings, and unknown properties are reported by field. Constructors
require all user-provided fields and reject unknown fields rather than silently
dropping them. Invalid calendar dates, invalid UTC timestamps, and inconsistent
employment dates are rejected. Validation does not mutate its input.
Verification and approval fields are intentionally outside these CP-010
records; verification is addressed by CP-013, and approval remains a separate
concept.

### Achievement record (conceptual; not finalized by CP-010)

```js
{
  id: "achievement-id",
  title: "",
  context: "",
  contribution: "",
  actions: [],
  outcome: "",
  metric: null,
  evidence: [],
  verificationStatus: "unverified",
  createdAt: "",
  updatedAt: ""
}
```

A metric, when present, should have an explicit value, unit, context, and source
or evidence reference. Do not infer a metric merely because the outcome would be
more persuasive with one.

### Job record (conceptual; not finalized by CP-010)

```js
{
  id: "job-id",
  company: "",
  roleTitle: "",
  description: "",
  sourceUrl: "",
  requirements: [],
  savedAt: ""
}
```

### Job requirement (conceptual; not finalized by CP-010)

```js
{
  id: "requirement-id",
  jobId: "job-id",
  description: "",
  category: "",
  importance: "preferred",
  evidenceIds: []
}
```

### Application draft (conceptual; not finalized by CP-010)

```js
{
  id: "draft-id",
  jobId: "job-id",
  draftType: "cv-bullet",
  content: "",
  evidenceIds: [],
  verificationStatus: "needs-confirmation",
  approvalStatus: "draft",
  createdAt: "",
  updatedAt: ""
}
```

### Application record (conceptual; not finalized by CP-010)

```js
{
  id: "application-id",
  jobId: "job-id",
  draftIds: [],
  stage: "saved",
  appliedAt: null,
  followUpAt: null,
  notes: ""
}
```

The non-career examples remain conceptual. Do not implement them as final
schemas without reviewing validation, migrations, and task acceptance criteria.

## 7. Identifiers and Relationships

- Records should have stable identifiers.
- Requirements belong to a job.
- Evidence should refer to the relevant career record or source.
- Drafts should identify the job and evidence they use.
- Applications should reference their job and relevant drafts.
- Deleting a record must not silently leave misleading broken references.

The behavior for deletion of linked records needs an explicit implementation decision.

## 8. Navigation and UI State

The application shell may use a view registry mapping view identifiers to titles and rendering behavior.

Expected sections:

- Dashboard.
- Career Profile.
- Achievements.
- Job Opportunities.
- Application Drafts.
- Application Tracker.

Each section must display its own content. A shared shell does not mean every navigation item should display the same dashboard content.

If hash navigation is used:

- Unknown hashes must fall back safely.
- The selected section must have a visible active state.
- Keyboard navigation must remain functional.
- Mobile navigation should close after a selection where appropriate.

## 9. Validation Strategy

Validation should be layered:

1. **Input validation:** required fields, formats, ranges, and date consistency.
2. **Record validation:** correct data types and required properties.
3. **Relationship validation:** referenced jobs, achievements, and evidence must exist.
4. **Business-rule validation:** scoring, verification, and draft constraints.
5. **Import validation:** JSON syntax, schema version, and record consistency.

Validation errors should explain what needs to be corrected. Avoid silently coercing uncertain career facts into verified values.

## 10. Persistence and Data Recovery

Before implementation, decide:

- Which storage mechanism to use.
- How records are serialized.
- How schema versions are represented.
- How corrupted data is detected.
- Whether automatic recovery is possible.
- How export and import interact with existing data.
- What data is lost when browser storage is cleared.

If local browser storage is selected, users must be informed that it is not equivalent to a secure, synchronized cloud backup.

## 11. Job-Fit Assessment

The assessment should be deterministic and explainable.

A possible conceptual calculation is:

**Weighted coverage = sum of the weights of supported requirements divided by the sum of all applicable requirement weights.**

This formula is illustrative. The exact treatment of partially supported, unverified, missing, and mandatory requirements must be decided before implementation.

The UI should explain:

- Which requirements are supported.
- Which records support them.
- Which requirements are missing or uncertain.
- How weights influence the result.

The score must not be presented as a probability of receiving an interview or job offer.

## 12. Draft Generation

### Initial MVP

Use deterministic templates and user-approved career records. For example, a CV bullet template may combine a verified action with a supported outcome.

The template must omit unavailable information rather than inventing details.

### Future AI integration

AI should be accessed through a defined service interface. UI components should not depend directly on a particular provider's response format.

The service should:

- Accept explicit input data.
- Return structured output.
- Validate output against a schema.
- preserve references to source records where feasible.
- Handle timeouts, errors, and bounded retries.
- Never bypass the draft approval workflow.

## 13. Security and Privacy

- Never commit API keys or secrets to the repository.
- Do not put secrets in browser-side JavaScript.
- Use fictional records for public demos.
- Avoid logging full career profiles or cover letters unnecessarily.
- Explain external data transmission before enabling AI features.
- Validate imported content and safely render user-provided text.
- Avoid injecting user content as executable HTML.

If a remote AI API is introduced, evaluate whether a server-side component is needed to protect credentials.

## 14. Testing Approach

- Unit tests for validation, scoring, and transformations.
- Integration tests for persistence and record relationships.
- UI tests for navigation, forms, and feedback.
- Manual responsive and accessibility checks.
- Import/export round-trip tests.
- AI evaluation tests in M6.

See `TEST_PLAN.md` for test scenarios.

## 15. Technical Decisions Requiring Confirmation

- Browser storage choice.
- Schemas for records beyond the Career Profile and Employment History.
- Import merge or replacement behavior.
- Draft versioning strategy.
- Fit scoring weights and treatment of unverified evidence.
- AI provider and API architecture.
- Deployment approach.

Record decisions in `DECISIONS.md` when they are actually made.
