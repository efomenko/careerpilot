# CareerPilot — Product Vision

## 1. Product Overview

**CareerPilot** is a personal job-search copilot that helps job seekers organize their professional experience, evaluate opportunities, and prepare accurate, evidence-based job applications.

The product turns scattered career information into a reusable knowledge base. Users can connect their experience and achievements to job requirements, assess how well their evidence matches a role, and prepare tailored CV bullets and cover letters.

CareerPilot is designed to help users make better application decisions without sacrificing accuracy or personal control.

## 2. Problem Statement

Job seekers often manage their career information across CVs, documents, spreadsheets, notes, job boards, and previous applications.

This creates several problems:

- Repeatedly rewriting CVs and cover letters for similar positions.
- Losing track of achievements and the evidence supporting them.
- Struggling to distinguish strong matches from genuine experience gaps.
- Accidentally using inconsistent or unsupported claims in applications.
- Losing track of application versions, statuses, deadlines, and follow-ups.
- Spending time on administrative work instead of evaluating opportunities and improving applications.

Generic AI writing tools can make these problems worse if they generate plausible but inaccurate experience or metrics.

CareerPilot addresses these problems through structured career data, explicit evidence links, reusable application drafts, and transparent validation.

## 3. Target Users

### Primary user

An individual job seeker who wants to manage a job search systematically and prepare tailored applications using their actual experience.

Examples include:

- Experienced professionals exploring new roles.
- Product managers applying to different companies.
- Professionals changing industries or moving into more specialized roles.
- Job seekers managing multiple applications simultaneously.

These are intended user groups, not claims that formal user research has already been completed.

### Secondary potential users

- Professionals maintaining an ongoing career portfolio.
- Career coaches helping clients organize application materials.
- Users preparing for a career transition.

These groups may be considered after the individual job-seeker workflow is validated.

## 4. Value Proposition

CareerPilot helps users move from scattered career information to structured, traceable, and reusable job applications.

Its core value proposition is:

**Prepare more relevant applications with less repetitive work, while keeping every professional claim grounded in evidence and under the user's control.**

## 5. Product Principles

### 5.1 Evidence over invention

CareerPilot must not invent employment history, responsibilities, achievements, qualifications, or numerical results.

When information is missing, the product should ask the user to provide or confirm it.

### 5.2 User control

Users can review, edit, approve, save, or discard generated drafts. Generated content must not silently overwrite verified career information.

### 5.3 Transparency

Users should be able to understand why a job appears to be a good match, which evidence supports the assessment, and which requirements remain unverified or unsupported.

### 5.4 Incremental delivery

The product will be built in milestones, starting with a usable manual workflow and adding AI only after the underlying data structures and validation rules are established.

### 5.5 Privacy by design

Career information can be sensitive. The application should minimize data collection, explain where information is stored, and avoid transmitting career data to external services without an explicit, informed workflow.

### 5.6 Useful simplicity

The interface should be understandable to a first-time user. Navigation, forms, validation, and empty states should communicate what the user can do next.

## 6. Product Goals

The initial product aims to enable users to:

1. Maintain a structured career profile.
2. Record employment history and achievements.
3. Attach evidence and verification status to achievements.
4. Save job opportunities and their requirements.
5. Map job requirements to relevant career evidence.
6. Produce a transparent, rule-based job-fit assessment.
7. Prepare and edit CV bullets and cover letters.
8. Track application stages and follow-up dates.
9. Export and restore application data.
10. Introduce AI-assisted extraction and drafting without removing evidence requirements or human approval.

## 7. Non-Goals for the Initial MVP

The initial MVP will not attempt to:

- Automatically submit job applications.
- Log into job boards on the user's behalf.
- Scrape job boards or bypass access restrictions.
- Guarantee interviews, job offers, or hiring outcomes.
- Replace the user's judgment about career decisions.
- Invent or infer unsupported achievements and metrics.
- Require a paid AI API to perform core workflows.
- Implement complex multi-user collaboration or team administration.
- Provide authoritative legal, immigration, or employment advice.

## 8. Success Measures

Success should be evaluated using measurable product behavior rather than assumed business outcomes.

Potential measures include:

- Time required to create a tailored application draft.
- Percentage of saved job requirements linked to relevant evidence.
- Number of unsupported claims caught before approval.
- Percentage of users who successfully complete an end-to-end application workflow.
- Data export and import success rate.
- Application completion and return-use rates.
- User-reported usefulness and trust.

Baselines and targets must be defined after measurement methods are agreed. No baseline, user research result, or achieved improvement is assumed in this document.

## 9. Product Evolution

### Phase 1 — Foundation

Establish the repository, responsive application shell, navigation, validation, and user feedback.

### Phase 2 — Career Knowledge Base

Introduce structured profile information, employment history, achievements, evidence, verification, and persistence.

### Phase 3 — Job Matching

Save jobs, represent requirements, map requirements to evidence, and calculate a transparent deterministic assessment.

### Phase 4 — Application Drafting

Generate rule-based CV bullets and cover letter drafts, support editing and saving, and validate claims against evidence.

### Phase 5 — Application Management

Track applications, manage follow-ups, improve quality, and support data portability.

### Phase 6 — AI Assistance

Add AI-assisted extraction and drafting through defined service contracts, evidence constraints, error handling, and repeatable evaluation.

## 10. Product Vision

CareerPilot should become a trusted personal workspace for job searching: a place where career evidence is organized once, job opportunities are evaluated consistently, and every application can be tailored without losing accuracy or user control.

## 11. Open Questions

- Which career profile fields are essential for the first usable release?
- Should local storage be the initial persistence mechanism, and what limitations must be communicated?
- Which job-fit scoring weights should be configurable?
- Which AI provider, if any, should be supported first?
- What data deletion and backup experience should be provided?
- Which user workflows should be evaluated first?

These questions should be resolved through documented decisions rather than hidden assumptions.
