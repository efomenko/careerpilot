# CareerPilot — Technical Design

## 1. Purpose

This document separates the verified current implementation from the approved
CV Import target design. Target behavior is not implemented unless explicitly
identified as current implementation.

## 2. Architectural Principles

- Begin with vanilla HTML, CSS, and JavaScript.
- Prefer small modules and straightforward data flow.
- Keep business rules separate from interface rendering.
- Validate user input and imported data.
- Keep career claims linked to source records where possible.
- Keep career-data workflows independent of provider credentials; CV Import
  uses the approved backend LLM adapter described in Section 16.
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
| Persistence | Browser `localStorage` with a version-4 JSON envelope; supported historical data is migrated on load |
| Data interchange | Versioned JSON |
| Testing | Node.js built-in test runner (`npm test`) for automated tests; browser checks for UI behavior |
| AI | Current app has no provider integration; CV Import target uses a provider-independent adapter with OpenAI for initial real extraction evaluation |

No frontend framework or build system is required for the initial static application unless a documented decision changes this approach.

This table records the current implementation baseline. The approved CV
Import target adds the backend processing boundary described in Section 16;
that workflow is not part of the current v4 persistence implementation.

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

The current implementation uses browser `localStorage` and one version-4 JSON
envelope. Persistence remains separate from the model and state contracts.
Storage limitations and failures must be explained to users.

## 6. Career Data Model

The Career Profile and Employment History examples below describe the original
CP-010 contract. Current v4 snapshots add provenance arrays and use structured
Employment dates, as described in Sections 10 and 16.1.
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
not targeted by the deletion. Persistence retains mappings unchanged through
historical migration into the schema-v4 envelope; migration does not tighten
mapping validation.

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

The current implementation uses browser `localStorage` with one version-4 JSON
envelope:

```js
{
  version: 4,
  profile: null,
  employmentRecords: [],
  achievementRecords: [],
  jobs: [],
  requirements: [],
  legacyRequirements: [],
  achievementMappings: [],
  educationRecords: [],
  certificationRecords: [],
  import: {
    sessions: [],
    completedBatches: [],
    importReports: []
  }
}
```

Valid version-1 envelopes containing `profile`, `employmentRecords`, and
`achievementRecords` migrate through versions 2 and 3 to version 4. The v1-to-v2
step adds empty `jobs`, `requirements`, and `achievementMappings`
collections; the v2-to-v3 step adds `legacyRequirements` and classifies
Requirements. Version-2 envelopes migrate through v3 to v4; version-3
envelopes migrate directly to v4. The v3-to-v4 step converts exact Employment
date strings to `{ value, precision: "day" }`, preserves null dates, adds
missing Profile, Employment, and Achievement provenance arrays, and initializes
the new collections empty.

The complete snapshot is restored and validated before application rendering.
Each changed state mutation attempts to save the complete state; no-op
mutations do not save. Validation covers JSON parsing, envelope structure and version, complete
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
Employment, and Job data is preserved subject to the v4 date and provenance
transformations. Loading a valid historical snapshot repeatedly does not
write or duplicate records.

Historical envelopes reject unexpected top-level properties. Profile,
Employment, Achievement, Job, and canonical Requirement records are subject
to their applicable model validation, including rejection of unknown record
properties. In contrast, JSON-compatible values and their properties in
v2 Requirements classified as legacy and in v3 `legacyRequirements` are
retained; historical `achievementMappings` retain their properties as
plain objects. Migration must not silently discard data: malformed or
unsupported snapshots are left untouched and not partially restored.

If JSON is invalid, the envelope or records are invalid, or the version is
unsupported, retain the original value, start with an empty in-memory Career
Knowledge Base, allow the application to remain usable during the session,
show a persistent warning that the existing data could not be restored and
current changes will not be persisted, and disable writes to the affected key
for the rest of the session. Evidence that JSON cannot represent faithfully
must be rejected at the persistence boundary without modifying in-memory
evidence. A missing or non-array Requirements collection in a v2 snapshot
fails safely; migration does not repair or discard malformed data. Loading and
migration are read-only. Only a later successful save writes the complete v4
envelope. Historical negative zero in v2 Requirements or v3 legacy
Requirements remains readable but disables writes; unsafe integer tokens are
detected before hydration and protected. Historical dates with year `0000`
cannot migrate to v4 and are rejected without replacing the original value.

An initial storage-read failure disables saving for that persistence instance
even if a later read succeeds. Recovery requires fresh initialization after
storage becomes available; reloading does not recover unsaved in-memory
changes. A read failure after successful initialization can be retried.
Corrupt, unsupported, or protected historical data keeps its original bytes
protected under the sequential checks described below. An ordinary write
failure leaves the mutation in memory, reports a failed save attempt rather
than success for that mutation, and does not delete the previous stored value.
Public `restoreSnapshot` validates into fresh state and attempts one save; a
failed save leaves the restored data in memory.

The adapter checks existing data before saving and again immediately before
writing. These sequential checks protect data observed during the checks, not
independent concurrent writers. There is no cross-tab lock, compare-and-swap,
stale-write detection, or atomic multi-writer guarantee.

Browser storage is not a secure cloud backup, and data may be lost if browser
data is cleared. Generic career-data import/export is outside CP-014.
Persistent backend storage of approved career records and cloud
synchronization are outside the initial MVP. The approved CV Import target
does include temporary backend storage of uploaded CV files for processing,
subject to the retention and deletion requirements in Sections 13 and 16.9.
Education, Certification, and import containers do not by themselves
implement their planned domain models or workflows.

## 11. Job-Fit Assessment

`src/js/fit-assessment-helpers.js` exports the pure
`calculateJobFitAssessment(jobId, requirements, mappings, achievementRecords)`
calculation. The state-aware `calculateJobFitAssessment(jobId)` API in
`src/js/career-state.js` verifies the Job and gathers its current Requirements,
their Achievement Mappings, and current Achievement records through state read
APIs before calling the helper.

Assessments are derived data, calculated on demand from Jobs, Requirements,
Achievement records, Achievement Mappings, and current verification statuses.
They are not cached or stored in state or the persistence schema.

A Requirement is supported if at least one mapped Achievement has
`verificationStatus === "verified"`. `unverified` and
`needs_confirmation` Achievements are listed as evidence but do not support
the Requirement. Multiple verified Achievements for one Requirement count as
one supported Requirement; mappings to missing Achievement records are
ignored. Mandatory Requirements have weight 2 and Preferred Requirements
weight 1. The overall score is the percentage of total Requirement weight
supported by verified evidence. Mandatory coverage is calculated and
displayed separately. An assessment with no Requirements is `not_assessed`
with a null score; Requirements with no verified support produce an
`assessed` score of 0. The calculation retains full precision, and the UI
displays the score to one decimal place. With no Mandatory Requirements, the
UI displays No mandatory requirements.

Requirement results are grouped and ordered as follows:

1. Unsupported Mandatory
2. Unsupported Preferred
3. Supported Mandatory
4. Supported Preferred

Within each group, results sort by Requirement creation date ascending, then
Requirement ID ascending. Each result includes separate verified and
unverified Achievement ID lists; result objects expose the Requirement's
`category`.

The Job detail UI displays assessment status, score, supported Requirement
counts, mandatory coverage, and the ordered per-Requirement results, resolving
current Requirement descriptions and Achievement titles. Verified and
unverified evidence are explicitly distinguished; missing Achievement or
Requirement records are handled with fallback text. Existing Requirement,
mapping, Achievement, and employment-related refresh paths recalculate the
assessment from current state instead of using cached values.

The assessment measures documented evidence coverage only. It must not be
presented through qualitative fit bands, as a hiring prediction, or as a
measure of hiring success.

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

For the approved CV Import target, the Python + FastAPI server-side
processing boundary is required. Use a provider-independent LLM adapter with
OpenAI as the initial provider for real extraction evaluation; keep provider
API keys on the backend. Alternative providers may be evaluated later. Exact
model/version selection remains open. This does not select hosting or public
deployment.

The CV upload boundary must:

- Allow only PDF and DOCX files; validate filename extension, declared MIME
  type, file signature, and file size rather than trusting a single signal.
- Start with a configurable 10 MB upload-size limit.
- Store temporary files outside the public web directory and use
  server-generated safe filenames.
- Delete the original CV after successful processing and no later than
  24 hours after upload.
- Treat CV contents as untrusted input, including prompt-injection-like
  instructions. CV content must not trigger tool execution.
- Avoid logging CV contents, personal data, API keys, or full sensitive
  prompts, and return sanitized errors.
- Exclude OCR from the initial MVP. Detect scanned or empty PDFs and report
  them as unsupported.

For local development, multi-user authentication may be deferred. Before
public hosting, require authentication, rate limiting, HTTPS, CORS
restrictions, and provider privacy review. Use synthetic or anonymized CVs
during development. Use the Gemini free tier only with synthetic or
anonymized content because of its data-use policy. The initial provider for
real extraction evaluation is the OpenAI paid API, subject to review of
applicable terms.

## 14. Testing Approach

- Unit tests for validation, scoring, and transformations.
- Integration tests for persistence and record relationships.
- UI tests for navigation, forms, and feedback.
- Manual responsive and accessibility checks.
- Import/export round-trip tests.
- AI evaluation tests in M6.

See `TEST_PLAN.md` for test scenarios.

## 15. Unresolved Technical Questions

The following details remain open and must not be inferred from this target
design:

- The exact standalone Skill record schema and deterministic skill
  normalization/deduplication rules. Existing Profile `skills` is an array of
  strings; a skill candidate is an approved import category, not an approved
  standalone career-record collection.
- Exact schema fields not specified for processing attempts, review
  decisions, association metadata, and completed batch reports. The import
  session and source-document metadata fields listed in Section 16.4 are
  approved; their internal status-value details remain open where not
  specified.
- Canonical serialization/hash for `payloadIdentity`.
- Idempotency-key retention duration and collision handling.
- Revision increments for ordinary state mutations and import operations.
- The mechanism for enforcing a single-tab writer, including behavior when
  coordination APIs are unavailable. Detection alone does not provide
  cross-tab atomicity.
- Backend authentication before any remote or public hosting. Hosting is
  outside the initial MVP.
- Operational response if temporary original-CV deletion fails.
- Draft history/versioning and Application record schemas.
- Exact initial OpenAI model/version and evaluation criteria.

The deterministic job-fit weights and treatment of unverified evidence are
confirmed in DEC-008. The 2026-11-09 CV-001 follow-ups to DEC-007 and DEC-010
and decisions DEC-016 and DEC-017 cover the approved CV Import record,
review, retention, and transaction rules. DEC-017 specifies the single-tab
assumption and fail-closed requirement; how to enforce that assumption
remains open.

## 16. CV Import & Onboarding Target Design

### 16.1 Current implementation baseline

The current browser application uses vanilla JavaScript ES modules. Its
version-4 `localStorage` snapshot contains the fields listed in Section 10.
The storage adapter migrates supported v1, v2, and v3 snapshots to v4 and
does not write during load or migration.

Current Employment dates use structured year, month, or day precision.
Profile, Employment, and Achievement records support provenance arrays.
Education, Certification, and import collections are JSON-compatible
containers, not completed domain models or workflows. State mutations
change live memory before the normal persistence callback; a failed write
leaves the in-memory mutation available and reports that it was not persisted.
There is no complete import-session, Education or Certification domain model,
field-level provenance workflow, revision mechanism, idempotency support,
atomic batch API, storage-event handling, or cross-tab lock. `restoreSnapshot`
validates and restores into a fresh state; it is not an atomic live-state
replacement API.
Drafts and Application Tracker are placeholders: no M4 Draft/Review model or
workflow is implemented.

These are current implementation facts, not the target behavior below.

### 16.2 Target architecture and trust boundary

The existing vanilla JavaScript frontend and local-first browser career
storage remain. A Python + FastAPI backend handles CV upload and validation,
parsing, LLM orchestration, candidate generation, and temporary-file cleanup.
It does not store approved career records or provide a career database.
Hosting, OCR, multi-user support, and a cloud career database are outside the
initial MVP. English and Russian are the initial supported languages.

Backend output is untrusted candidate data, not a command to mutate career
state. The frontend validates the response, presents guided category-by-
category review, and persists candidate edits and decisions locally. Only an
explicit user decision to add or merge an acceptable candidate may update
career state. Skipped or rejected candidates do not enter career state.
Imported Achievements remain `unverified`; import approval is not draft
approval or claim verification.

### 16.3 Target record contracts

Existing Profile, Employment, and Achievement records gain a `provenance`
array. Provenance is field-level and distinct from Achievement `evidence`.
Existing fields and relationships remain; records without prior provenance
receive an empty array during migration.

Education records have this target shape:

```js
{
  id: "education-id",
  institution: "",
  qualification: "",
  fieldOfStudy: "",
  startDate: null,
  endDate: null,
  isCurrent: false,
  provenance: [],
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

`institution` and `qualification` are required non-empty strings.
`fieldOfStudy` defaults to an empty string. `startDate` and `endDate` keys
are required and accept a structured date or `null`; current Education has a
null `endDate`. `isCurrent` defaults to `false`; `provenance` defaults to an
empty array. IDs and timestamps follow existing caller-supplied record
conventions and timestamp ordering.

Certification records have this target shape:

```js
{
  id: "certification-id",
  name: "",
  issuer: "",
  issuedDate: null,
  expirationDate: null,
  credentialId: "",
  credentialUrl: "",
  provenance: [],
  createdAt: "2025-04-20T14:30:00.000Z",
  updatedAt: "2025-04-20T14:30:00.000Z"
}
```

`name` and `issuer` are required non-empty strings. Date keys are required
and accept a structured date or `null`; `credentialId` and `credentialUrl`
default to empty strings. A supplied URL must be an absolute HTTP or HTTPS
URL; preserve its entered value rather than silently rewriting it. A definite
expiration before issue is invalid; ambiguous chronology may warn. Missing
expiration does not imply indefinite validity. `provenance` defaults to an
empty array.

Skills are an import candidate category. Existing Profile `skills` remains a
string array; no standalone Skill record or collection is approved. A user
decision is required before an accepted skill value is added to Profile.
Normalization, case/whitespace equivalence, and duplicate presentation rules
are unresolved technical details.

### 16.4 Import session and candidate lifecycle

One CV belongs to one locally persisted import session. Session status is one
of `processing`, `ready_for_review`, `review_in_progress`,
`import_completed`, `failed`, or `expired`. Sessions persist across reloads
and expire seven days after creation; activity does not extend expiry.
Processing attempts are recorded separately. A failed extraction can be
retried in the same session, and retry must not overwrite already-reviewed
candidates.

Each candidate has the following approved fields. Values are illustrative
placeholders, not a validated candidate; `"valid"` illustrates a validation
status and does not define the internal shape of `validation`:

```js
{
  id: "candidate-id",
  category: "employment",
  originalData: {},
  reviewedData: {},
  fieldProvenance: {},
  validation: "valid",
  reviewStatus: "pending",
  possibleDuplicates: []
}
```

Categories are `profile`, `employment`, `education`, `certification`,
`skill`, and `achievement`. `originalData` is immutable; `reviewedData` is
editable and any edit triggers revalidation. Provenance retains the
originally extracted value even when reviewed data changes. Editing a
supported value sets the associated provenance status to `needs_review`.
The validation value above illustrates a status, not a finalized property
contract. Validation status is `valid`, `warning`, or `invalid`; findings
are reported separately as errors and warnings. Validation error and warning
codes must be stable, but the code catalog is not specified here. Warnings
require explicit user acknowledgement before acceptance or merge. Invalid
candidates cannot be accepted or merged. Editing `reviewedData` triggers
revalidation. Review status is `pending`, `accepted`, `rejected`, or
`merged`. Partial category approval is supported, and each candidate can be
imported at most once.

The approved import-session fields are `id`, `status`, `sourceDocument`,
`createdAt`, `expiresAt`, `lastActivityAt`, `currentCategory`, `candidates`,
`reviewDecisions`, and `processingAttempts`. Source-document metadata has
the approved fields `id`, `fileName`, `mimeType`, `language`, `uploadedAt`,
`deleteBy`, and `status`. Status values not specified by the approved
contract and internal processing-attempt details remain implementation-level
details.

Decision actions are `add`, `merge`, and `skip`. Duplicate suggestions
identify a target record ID, similarity signals, and match level `possible`
or `strong`. Detection is deterministic, explainable, advisory, and
dismissible. There is no automatic merge. Merge requires a target and
explicit per-field conflict choices. A changed or deleted merge target
requires renewed review. A completed session has no pending importable
decisions.

Processing-attempt details and any additional decision or association object
fields remain implementation details to be finalized without changing the
approved session fields, candidate fields, states, and behaviors above.

### 16.5 Field-level provenance and structured dates

Each provenance item has:

```js
{
  id: "provenance-id",
  sourceDocumentId: "document-id",
  sourceType: "cv",
  fieldPath: "roleTitle",
  extractedValue: "Engineering Manager",
  excerpt: "Relevant text from the CV.",
  language: "en",
  associationStatus: "supports",
  createdAt: "2025-04-20T14:30:00.000Z"
}
```

`page` is optional. Association status is `supports`, `needs_review`, or
`context_only`. Excerpts are limited to 500 characters. A field may have
multiple provenance items and one excerpt may support multiple fields.
Users may permanently delete provenance but may not manually edit its
excerpt. Deleting provenance does not alter career values or verification
status. Approved career records retain their provenance; unapproved
provenance is temporary and is removed when its session expires. Provenance
must not be orphaned when a career record is deleted. Stable field paths and
stable item IDs are required; permanent array-index references are not.
Provenance does not verify claims and does not replace Achievement evidence.

Employment `startDate` and `endDate` use the structured date form:

```js
{ value: "2021-05", precision: "month" }
```

Precision is `year` (`YYYY`), `month` (`YYYY-MM`), or `day`
(`YYYY-MM-DD`). Unknown dates are `null`; use the precision actually
supported by the source and never invent it. Dates use the Gregorian
calendar, years 0001-9999. Current Employment requires `isCurrent: true` and
`endDate: null`; past Employment may have an unknown null end date.

Validate date format, Gregorian calendar validity, and the supported year
range. Compare the possible calendar intervals represented by each date's
precision. Reject chronology only when those intervals establish a definite
reversal. Ambiguous chronology may warn; different precision alone is not a
warning. Future and unusual dates remain valid without warnings unless they
violate these validation rules; future and unusual-date warnings are deferred
until their policy is approved. For Certification, definite
expiration-before-issue is invalid. Never invent missing date precision.

### 16.6 Snapshot v4 and historical migration

Version 4 is the current storage schema. The v4 envelope retains all v3
fields and adds `educationRecords`, `certificationRecords`, and these
explicitly approved collections:

```js
{
  educationRecords: [],
  certificationRecords: [],
  import: {
    sessions: [],
    completedBatches: [],
    importReports: []
  }
}
```

The new collections currently hold JSON-compatible data without implementing
the target session, candidate, report, or idempotency domain contracts.
Internal fields for completed batches and reports must be finalized with the
future implementation contract. The target stores provenance on applicable
career records, candidates and pending decisions with their session, and
completed idempotency markers and minimal reports with career changes.

Migrations are sequential: v1 -> v2 -> v3 -> v4. Validate every historical
snapshot under its original version contract before transforming it. Preserve
the existing v1 -> v2 addition of empty Job/Requirement/mapping collections
and v2 -> v3 Requirement classification, including retention of legacy
entries. For v3 -> v4, validate the full v3 snapshot first, then convert
non-null exact `YYYY-MM-DD` Employment dates to `{ value, precision: "day" }`
and preserve nulls. Add empty `educationRecords`, `certificationRecords`,
`import.sessions`, `import.completedBatches`, and `import.importReports`
collections; add empty provenance where missing on legacy Profile, Employment,
and Achievement records and preserve existing provenance. Preserve validated
Profile, Employment, Achievement, and Job records, canonical Requirements,
legacy Requirements, and historical Achievement Mappings, including their
IDs, timestamps, and relationships where present, subject to the stated
transformations. Canonical and legacy Requirements retain their respective
source order. Unknown top-level envelope properties and unknown properties
on model-validated records are rejected; JSON-compatible properties within
legacy Requirement values and properties of historical plain-object
Achievement Mappings are retained as described in Section 10. Migration must
never silently discard data or repair malformed records.

Each migration stage validates its input and output against that stage's
contract. Any malformed or unsupported snapshot is preserved unchanged and
not partially restored or overwritten. Migration and loading remain
read-only; a later successful save writes the full v4 envelope. Historical
negative zero in supported legacy Requirements remains readable but
write-protected; unsafe integer tokens and unrepresentable historical dates
are protected without overwriting the original value.

### 16.7 Atomic import transaction, revisions, and idempotency

The proposed, not-yet-implemented transaction sequence is `prepare ->
validate -> persist -> publish`. Its atomic import guarantee depends on
enforcing the single-tab writer constraint across all writers. If safe writer
coordination cannot be established, the import commit must fail closed.

The conceptual API is:

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

The import path must not call existing sequential CRUD APIs to apply the
batch. It prepares a detached complete next snapshot, applies approved adds
and explicitly selected merge fields there, resolves valid relationships,
and validates every record and relationship in the complete candidate
snapshot. It checks career/session revisions, duplicate and changed merge
targets, candidate approval/validation status, prior candidate import, and
idempotency before writing.

After validation, serialize and persist the entire snapshot with one
`localStorage.setItem()` call. Only after that succeeds publish the prepared
state in memory. Preparation or persistence failure leaves the prior
in-memory state authoritative and leaves the prior stored value intact.
Publication should be a prepared, synchronous state replacement whose
failure is prevented by design; a browser storage write cannot be rolled
back if a later publish step throws.

The same idempotency key and same payload identity returns the original
result; the same key with a different payload is rejected. Already-imported
candidates cannot be imported again. The same snapshot stores the completion
marker and report as the approved career changes. Reports include batch,
session, key, completion, candidate IDs, counts, record IDs, and
non-sensitive warnings; they exclude original CV content and unapproved
excerpts. Exact canonical payload serialization/hash and marker retention
remain open.

Stale revisions or changed/deleted merge targets block commit and require
renewed review. Revision checks require a defined revision source and
enforced writer constraint; a check followed by `setItem()` is not cross-tab
atomic. Exact revision increments are open.

### 16.8 Single-tab concurrency and external changes

The initial MVP assumes one browser tab modifies data, but the current
implementation does not enforce that constraint. Its sequential checks
protect data observed during those checks; independent writers are not
coordinated, and there is no stale-write detection or atomic multi-writer
guarantee. The current implementation has no storage-event handling or
cross-tab lock. A future
implementation must detect external snapshot changes and block commits based
on stale data. It must not claim that `localStorage` provides cross-tab
atomicity: a read/revision check followed by `setItem()` is not compare-and-
swap, and an asynchronous storage event cannot prevent another tab's write.

The mechanism for enforcing the single-tab writer constraint, including
behavior when a coordination API is unavailable, remains open. If the
constraint cannot be enforced safely, commit must fail closed rather than
silently overwrite a newer snapshot. This limitation also applies to ordinary
state writers; a transaction-only lock would not protect against a normal
mutation in another tab. The proposed import transaction guarantee depends on
enforcing this constraint across all writers, not on revision checks alone.

### 16.9 Backend files, expiry, failure, and recovery

The original CV is temporary backend input, not a career record and not a
localStorage value. Delete it after successful processing and no later than
24 hours after upload. The operational response if deletion fails remains
open and must be explicitly designed and tested. Backend validation and
parsing failures are surfaced as failed attempts; retry in the same session
records a distinct attempt and preserves reviewed candidates.

At seven-day session expiry, remove temporary candidates, unapproved
provenance, and pending decisions. Keep approved career records and their
provenance. Completed sessions retain only the minimal report. Any cleanup
must preserve this boundary and must not delete approved career data.

For import, validation or preparation failure occurs before persistence and
does not publish state. A failed `setItem()` leaves the previous persisted
snapshot and live state authoritative for the import. The existing ordinary
mutation behavior is different: ordinary mutations currently remain visible
in memory after save failure and report a persistence warning. Do not
silently describe that existing behavior as transactional.

### 16.10 Compatibility with M4 Drafts and Review

The Drafts and Application Tracker sections are currently placeholders; no
Draft or Review model/workflow is implemented. CV Import approval only
authorizes adding or merging career records. It does not approve a generated
draft, verify an Achievement, or make provenance equivalent to evidence.
Future M4 features may consume imported career records and their provenance,
but must preserve the separate approval and verification semantics in
DEC-009 and DEC-015.
