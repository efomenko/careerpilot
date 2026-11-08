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
├── tests/
│   ├── career-model.test.js
│   ├── achievement-model.test.js
│   ├── job-model.test.js
│   └── job-ui-helpers.test.js
├── src/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js
│       ├── achievement-model.js
│       ├── career-model.js
│       ├── career-state.js
│       ├── job-model.js
│       └── job-ui-helpers.js
├── index.html
├── README.md
└── .gitignore
```

Additional JavaScript modules and test files may be introduced as the
implementation grows. The structure above highlights the current career and
Job modules; it is not an exhaustive listing of every repository file.

## 4. Initial Technology Stack

| Area | Initial approach |
| --- | --- |
| Markup | Semantic HTML |
| Styling | CSS with responsive layouts |
| Application logic | Vanilla JavaScript |
| Navigation | Client-side view switching |
| Initial routing | URL hash, if retained from the shell implementation |
| Persistence | Browser `localStorage` with a version-3 JSON envelope; valid version-1 and version-2 data are migrated on load |
| Data interchange | Versioned JSON |
| Testing | Node.js built-in test runner (`npm test`) for automated tests; browser checks for UI behavior |
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

`src/js/career-state.js` provides the shared in-memory state factory for the
Career Profile, Employment History, Achievements, Jobs, and Requirements. It
uses the corresponding model constructors and validators, accepts IDs and
timestamps from its caller where needed, returns copies so callers cannot
mutate its internal state, and exposes mutation operations used by the UI.
Requirement operations validate Job ownership, preserve immutable fields, and
leave state unchanged for no-op updates. Requirement deletion also removes
associated Achievement mappings while preserving Achievement records. The
state module also owns Achievement Mapping CRUD and deletion cascades; it is
independent of the DOM and browser storage.
`src/js/career-persistence.js` restores and validates the complete snapshot
before rendering and saves after successful state mutations.

`src/js/job-ui-helpers.js` contains pure Job-list transformations used by the
presentation layer: search matching, status filtering, and sorting. It does
not own Job domain rules, state mutation, or persistence.

### 5.3 Domain logic

Responsibilities:

- Construct and validate career, achievement, and job records.
- Implement achievement construction and validation in
  `src/js/achievement-model.js`.
- Implement Job construction and validation in `src/js/job-model.js`.
- Implement Requirement construction and validation in
  `src/js/requirement-model.js`.
- Manage Requirement–Achievement mappings.
- Calculate deterministic fit scores.
- Build template-based drafts.
- Detect known unsupported or unverified claims.
- Validate import and export structures.

Model functions are tested independently of the UI. Job-list search,
filtering, and sorting are UI transformations implemented separately in
`src/js/job-ui-helpers.js`; they do not implement requirement management or
fit assessment. Requirement management is implemented in the Job detail UI.

### 5.4 Persistence layer

Responsibilities:

- Load and save supported records.
- Handle missing, invalid, or incompatible stored data.
- Version stored data where appropriate.
- Report failures without silently discarding data.

The current implementation uses browser `localStorage` and one version-3 JSON
envelope. Persistence remains separate from the model and state contracts.
Storage limitations and failures must be explained to users.

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
records. CP-013 verification status applies to the CP-012 Achievement record;
approval remains a separate concept.

### Achievement record (CP-012 contract, extended by CP-013)

```js
{
  id: "achievement-id",
  title: "",
  context: "",
  contribution: "",
  actions: [],
  outcome: "",
  potentialImpact: "",
  metrics: [
    {
      name: "",
      value: 0,
      unit: "",
      basis: "measured"
    }
  ],
  evidence: [],
  employmentId: null,
  verificationStatus: "unverified",
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

- `id` is a non-empty string. `title` and `contribution` are required and
  non-empty.
- `context`, `outcome`, and `potentialImpact` are optional strings; empty
  values are allowed. Whether omitted optional strings remain omitted or
  default to empty strings is not specified.
- `actions`, `metrics`, and `evidence` are arrays that default to `[]`.
  `actions` contains strings. Whether individual action strings may be empty is
  not specified.
- `outcome` describes an actual result. `potentialImpact` describes an
  expected, estimated, or possible benefit. They are independent and may both
  contain values.
- Multiple metrics are supported. Each metric has a name, a finite JavaScript
  numeric value, a unit, an optional period, and a `basis` of `"measured"` or
  `"estimated"`. Positive, zero, and negative values are allowed. Whether
  names or units must be non-empty, and whether an empty period is allowed,
  remain unspecified. A measured metric is not automatically verified.
- Evidence means supporting information that helps substantiate an
  achievement. `evidence` is an array defaulting to `[]`; its item structure
  and item-level validation remain open. No source format, upload, or storage
  integration is defined.
- `employmentId` represents zero or one employment relationship; `null` means
  unlinked. The model validates the basic field type/format. The state layer
  checks that a non-null value refers to an existing employment record during
  creation or update. Multiple achievements may link to the same employment
  record. Deleting employment unlinks associated achievements. A linked
  verified achievement becomes `unverified`; its `createdAt`, `updatedAt`, and
  all other content remain unchanged, preserving the CP-012 deletion behavior.
  Recovery behavior for an already-stale link remains open.
- `verificationStatus` applies to the achievement as a whole and accepts only
  `"unverified"`, `"needs_confirmation"`, or `"verified"`. New achievements
  default to `"unverified"`. A user deliberately changes the status; evidence
  is optional and its presence does not automatically verify the achievement.
  The metric `basis` is independent of verification. Deliberate status changes
  use a separate state operation from content updates and apply a caller-
  supplied `updatedAt`; invalid statuses or unknown IDs do not mutate state.
  Content updates compare normalized editable achievement content, excluding
  `id`, `createdAt`, `updatedAt`, and `verificationStatus`. Arrays are
  order-sensitive, plain-object key ordering is insignificant, and primitive
  values are compared using `Object.is`; no particular serialization
  implementation is prescribed. If normalized content changes, a previously
  `verified` achievement resets to `"unverified"`, while `unverified` and
  `needs_confirmation` remain unchanged. An unchanged content save preserves
  verification status. Every successful content save applies the
  caller-supplied `updatedAt`, whether or not content changed. Reading or
  rendering does not change status. Verification history is not required.
- `createdAt` and `updatedAt` use CP-010's strict
  `YYYY-MM-DDTHH:mm:ss.sssZ` ISO UTC format. The application supplies IDs and
  timestamps, and `updatedAt` must not precede `createdAt`.
- Verification, approval, evidence, and metric basis are separate concepts.
  `verificationStatus` is a CP-013 extension to the CP-012 achievement
  contract, not part of the original CP-012 scope; it does not change the
  CP-012 evidence item contract. CP-013 does not add persistence or AI workflows.
  Drafting warnings are deferred to CP-030/CP-034, and job-fit scoring
  treatment is deferred to CP-023.

### Job record (CP-020)

```js
{
  id: "job-id",
  company: "",
  roleTitle: "",
  description: "",
  sourceUrl: "",
  notes: "",
  status: "active",
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

`status` is `active` or `archived`. CP-020 creates and validates Job records
with `src/js/job-model.js`; the application supplies IDs and timestamps.

### Job Requirement (CP-021)

```js
{
  id: "requirement-id",
  jobId: "job-id",
  description: "",
  category: "other",
  importance: "mandatory",
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

The complete record has exactly these fields: `id`, `jobId`, `description`,
`category`, `importance`, `createdAt`, and `updatedAt`. Categories are
`skill`, `experience`, `education`, `certification`, `responsibility`, and
`other`; creation defaults an omitted category to `other`. Importance is
required and must be `mandatory` or `preferred`. Description must be a
non-blank string; its content is otherwise preserved. Complete records require
valid UTC timestamps, and `updatedAt` cannot precede `createdAt`.

The caller supplies the ID and creation timestamp. Updates supply
`updatedAt`; `id`, `jobId`, and `createdAt` are immutable. State CRUD is
provided by `createRequirement(record)`, `getRequirements(jobId)`,
`updateRequirement(id, updates)`, and `deleteRequirement(id)`. The state
validates that the referenced Job exists, returns Requirements in insertion
order, and treats unchanged updates as no-ops without changing timestamps or
notifying subscribers. Deleting a Requirement cascades to its achievement
mappings but preserves Achievement records. Requirements remain manageable
when their Job is archived.

The Job detail UI lists Requirements and provides a shared create/edit form,
validation feedback, and a confirmed delete action. Each Requirement card
displays mapped Achievements in Verified and Unverified groups, with counts
for resolved Achievement records. `needs_confirmation` Achievements appear in
the Unverified group. Users can open an Achievement from its evidence entry,
unmap it, or open the Achievement selector.

The selector searches Achievement title and context with trimmed,
case-insensitive partial matching, excludes Achievements already mapped to
that Requirement, and presents alphabetically ordered Verified and Unverified
groups. It distinguishes no Achievements, all Achievements already mapped,
and no search matches. When no Achievements exist, the selector can navigate
to the dedicated Achievements workflow; the selected Job and Requirement
context remains available when returning. Achievement deletion confirmation
shows the number of mappings that will be removed and explains that related
Requirements and Jobs remain while Fit Assessments may change.

### Achievement Mapping (CP-022)

```js
{
  id: "mapping-id",
  requirementId: "requirement-id",
  achievementId: "achievement-id",
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

An Achievement Mapping has exactly these five required fields. IDs and both
timestamps must be non-blank strings; timestamps must be valid UTC timestamps
in the canonical `YYYY-MM-DDTHH:mm:ss.SSSZ` format, and `updatedAt` cannot
precede `createdAt`. The application creates the mapping ID and timestamps
when the user selects an Achievement; the model does not generate them.
There is no mapping update operation: mapping identity and its Requirement
and Achievement relationship are immutable.

`createAchievementMapping(record)` validates the record and verifies that
both referenced records exist in state. It rejects duplicate mapping IDs and
duplicate Requirement–Achievement pairs. The relationship is many-to-many:
a Requirement can map to multiple Achievements, and an Achievement can map to
Requirements across Jobs. Creation and deletion do not modify endpoint
records or Achievement verification status.

The state APIs are `createAchievementMapping(record)`,
`deleteAchievementMapping(id)`,
`getAchievementMappingsForRequirement(requirementId)`, and
`getAchievementMappingsForAchievement(achievementId)`. Creation returns a
detached copy; both retrieval APIs return detached copies in insertion order.
Mapping mutations assign the resulting state and notify subscribers once on
success; failed mutations leave state unchanged and do not notify.

Deleting a Job removes its Requirements and mappings to those Requirements;
deleting a Requirement removes its mappings; deleting an Achievement removes
its mappings. Each cascade preserves the other Jobs, Requirements,
Achievements, verification statuses, and unrelated or historical mappings
not targeted by the deletion. Persistence retains mappings unchanged in the
schema-v3 envelope and migration does not tighten mapping validation.

### Application draft (conceptual; not finalized by CP-010)

```js
{
  id: "draft-id",
  jobId: "job-id",
  draftType: "cv-bullet",
  content: "",
  evidenceIds: [],
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

The other non-career examples remain conceptual. Do not implement them as
final schemas without reviewing validation, migrations, and task acceptance
criteria.
CP-013 defines verification status for achievement records only; the
conceptual draft shape does not establish a draft verification field.

## 7. Identifiers and Relationships

- Records should have stable identifiers.
- An achievement may be linked to zero or one Employment History record using
  `employmentId`; `null` represents no link. Multiple achievements may link to
  one employment record.
- Deleting an employment record preserves its achievements and sets their
  `employmentId` to `null`. Recovery behavior for an already-stale link remains
  open.
- Requirements belong to a job.
- Drafts should identify the job and evidence they use.
- Applications should reference their job and relevant drafts.
- Deleting a record must not silently leave misleading broken references.

Evidence item structure and its relationship to sources or other records remain
open; no evidence-reference format is defined by CP-012.

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
3. **Relationship validation:** referenced jobs, achievements, and employment
   records must exist where the contract requires a live relationship. The
   state layer validates non-null achievement `employmentId` values during
   creation and update. Evidence is an array defaulting to `[]`; item-level
   validation is not defined while its item structure remains open.
4. **Business-rule validation:** scoring, verification, and draft constraints.
5. **Import validation:** JSON syntax, schema version, and record consistency.

Validation errors should explain what needs to be corrected. Avoid silently coercing uncertain career facts into verified values.

## 10. Persistence and Data Recovery

The current implementation uses browser `localStorage` with one version-3 JSON
envelope:

```js
{
  version: 3,
  profile: null,
  employmentRecords: [],
  achievementRecords: [],
  jobs: [],
  requirements: [],
  legacyRequirements: [],
  achievementMappings: []
}
```

Valid version-1 envelopes containing `profile`, `employmentRecords`, and
`achievementRecords` migrate through version 2 to version 3. The v1-to-v2
step adds empty `jobs`, `requirements`, and `achievementMappings`
collections; the v2-to-v3 step adds `legacyRequirements` and classifies
Requirements. Version-2 envelopes migrate directly to version 3.

The complete snapshot is restored and validated before application rendering,
and the complete state is saved after each successful state mutation.
Validation covers JSON parsing, envelope structure and version, complete
records, duplicate IDs, and relationships. In a v2 snapshot, a Requirement is
placed in canonical `requirements` only if it passes complete Requirement
model validation, references an existing valid Job, and its ID is unique in
the entire source Requirements collection. Every other entry is copied
unchanged to `legacyRequirements`. Every entry in a duplicate-ID group is
legacy; non-object entries are also preserved there. The source collection
must be an array. In v3, `legacyRequirements` must also be an array of
JSON-compatible values; entries, including non-object values, are retained
unchanged. Canonical and legacy entries retain their respective source order,
without adding interleaving metadata.

Achievement mappings are retained unchanged and in order, including mappings
that refer to legacy Requirements or otherwise unresolved records. Mapping
validation is not tightened by this migration. Achievement, Profile,
Employment, and Job records are preserved. Version-3 loads do not rerun
migration or duplicate records, so loading a valid v3 snapshot is
idempotent.

If JSON is invalid, the envelope or records are invalid, or the version is
unsupported, retain the original value, start with an empty in-memory Career
Knowledge Base, allow the application to remain usable during the session,
show a persistent warning that the existing data could not be restored and
current changes will not be persisted, and disable writes to the affected key
for the rest of the session. Evidence that JSON cannot represent faithfully
must be rejected at the persistence boundary without modifying in-memory
evidence. A missing or non-array Requirements collection in a v2 snapshot
fails safely; migration does not repair or discard malformed data. Loading and
migration are read-only. Only a later successful mutation writes the complete
v3 envelope, and a failed load or migration never overwrites the original
stored value.

When storage is unavailable or a write fails, successful in-memory mutations
remain available and the user must be told that changes were not persisted.
A failed write must not produce a persistence-success message, and the previous
stored value must not be deleted before attempting a write.

Browser storage is not a secure cloud backup, and data may be lost if browser
data is cleared. Import/export, backend storage, and cloud synchronization are
outside CP-014. The storage layer implements v1 → v2 → v3 and v2 → v3
migration paths.

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

- Schemas for future record types other than the Career Profile, Employment
  History, Achievement, and Job records remain unresolved. The Achievement
  schema is finalized by DEC-014; the Job record is established by CP-020;
  the Requirement contract is finalized by CP-021. Draft and application
  schemas remain proposals.
- Import merge or replacement behavior.
- Draft versioning strategy.
- Fit scoring weights and treatment of unverified evidence.
- AI provider and API architecture.
- Deployment approach.

Record decisions in `DECISIONS.md` when they are actually made.
