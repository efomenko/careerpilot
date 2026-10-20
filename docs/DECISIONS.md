# CareerPilot — Architecture Decision Log

This document records important product and technical decisions.

## ADR-001: Start with vanilla JavaScript

**Status:** Accepted

**Decision:** Use HTML, CSS, and vanilla JavaScript for the initial MVP.

**Reason:** The project should build programming fundamentals and
keep the initial architecture easy to understand.

**Consequences:** UI components, data handling, and navigation must
be implemented without a frontend framework. Reconsider a framework
if the application becomes difficult to maintain.

## ADR-002: Use local-first persistence

**Status:** Accepted

**Decision:** Use browser localStorage for the initial single-user MVP.

**Reason:** It allows the core workflow to be validated without a
backend, database, or account system.

**Consequences:** Data stays in the current browser profile.
Backup and restore are required. localStorage is not encrypted
storage and must not be treated as a secure vault.

## ADR-003: Separate career facts from generated drafts

**Status:** Accepted

**Decision:** Store source career records separately from
application-specific generated drafts.

**Reason:** Editing a CV bullet or cover letter must not modify
the underlying employment history or achievement records.

**Consequences:** Drafts reference source records by stable IDs.

## ADR-004: Make job-fit assessment explainable

**Status:** Accepted

**Decision:** Start with deterministic, documented scoring rules.

**Reason:** Users must understand which requirements are supported
by evidence and where gaps remain.

**Consequences:** A score represents evidence coverage, not the
probability of receiving a job offer.

## ADR-005: Defer AI integration

**Status:** Accepted

**Decision:** Validate the manual workflow before integrating
an AI model API.

**Reason:** This isolates product and data-model problems from
AI-specific errors and costs.

**Consequences:** The first version uses manually entered
requirements and deterministic draft templates.

## ADR-006: Route future AI API calls through a backend

**Status:** Accepted

**Decision:** Never expose AI provider secret keys in frontend code.

**Reason:** Browser code and network requests can be inspected
by users. Secret keys must remain server-side.

**Consequences:** AI integration will require a backend API.

## ADR-007: Support JSON backup and restore

**Status:** Accepted

**Decision:** Include versioned JSON export and validated import
in the MVP.

**Reason:** Browser-local data can be lost when browser storage
is cleared or the user changes devices.

**Consequences:** Imported data must be validated before it
replaces existing data.

## ADR-008: Approval does not verify source facts

**Status:** Accepted

**Decision:** Draft approval applies to a specific draft version.
It does not change the verification status of source records.

**Reason:** Approving wording is not the same as independently
verifying a career claim.

**Consequences:** Editing an approved draft returns it to review.
Source evidence must be verified separately.
