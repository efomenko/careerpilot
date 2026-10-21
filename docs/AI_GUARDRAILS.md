# CareerPilot — AI Guardrails and Evidence Policy

## 1. Purpose

CareerPilot helps users represent their professional experience accurately. AI may assist with extracting requirements, organizing evidence, and drafting text, but it must not create false career claims.

These rules apply to AI-assisted features and should also inform deterministic templates and validation in the manual MVP.

## 2. Core Rule

**CareerPilot may improve how a supported fact is expressed, but it must not turn missing, uncertain, or unsupported information into an asserted fact.**

Fluent writing is not evidence.

## 3. Source-of-Truth Hierarchy

Career-related content should be grounded in:

1. User-provided and explicitly confirmed career records.
2. Supporting evidence supplied or referenced by the user.
3. Other user-provided context whose verification status is clearly represented.
4. Generated suggestions, which are proposals and never independent proof.

An AI response is not evidence that its own claims are true.

## 4. Claim Categories

### Verified

The user has reviewed the claim and confirmed it against appropriate evidence.

Verified status should be assigned deliberately, not automatically by an AI model.

### Needs confirmation

The claim may be correct, but the available information is incomplete or the user has not confirmed it.

### Unverified

The application does not have sufficient confirmation to treat the claim as verified.

### Unsupported

The available records do not support the claim, or the claim introduces information absent from the supplied evidence.

### Proposed

The content has been suggested by a template or AI and has not yet been accepted by the user.

### Approved

The user has explicitly accepted the relevant draft or content for its intended use.

**Important:** Approved does not mean independently verified. These are separate dimensions.

## 5. Prohibited Fabrications

CareerPilot must not invent or silently add:

- Revenue, savings, percentages, or other metrics.
- Number of customers, users, employees, partners, or stakeholders.
- Team size or direct-report responsibilities.
- Job titles, employers, employment dates, or qualifications.
- Ownership of projects or decisions.
- Technical skills or tools the user has not confirmed.
- Business outcomes or causal relationships.
- Awards, certifications, or educational credentials.
- Testimonials, recruiter feedback, or user-research findings.

If a detail is missing, ask the user to provide it or omit it.

## 6. Metrics and Outcomes

Metrics require particular care.

- Preserve the original value and unit.
- Preserve the context and measurement period where known.
- Do not convert a qualitative result into a numerical result.
- Do not infer causation from correlation.
- Do not calculate a percentage improvement without the required inputs.
- Do not present an estimate as a measured result.
- Do not remove a qualifier that materially changes the claim.
- Do not change monthly results into annual results, or vice versa, without support.

If a metric needs confirmation, use a clear placeholder such as `[ADD VERIFIED METRIC]` in a working draft or omit the metric from the proposed final text.

## 7. Evidence References

Where feasible, each material career claim should reference one or more source records.

Examples:

- Employment record.
- Achievement record.
- User-provided project summary.
- Approved performance report.
- Document or link supplied by the user.

The interface should make it possible to review the source of a claim before approval.

A missing evidence reference does not always prove a claim is false, but it must not be treated as automatic verification.

## 8. Grounded Generation Workflow

The intended future AI workflow is:

1. Select the job and relevant requirements.
2. Retrieve relevant career records.
3. Filter out or clearly label unverified information.
4. Provide the model with explicit instructions and structured evidence.
5. Request structured output.
6. Validate the returned schema.
7. Compare material claims against supplied evidence.
8. Flag uncertain, unsupported, or conflicting details.
9. Present the proposed draft and its sources to the user.
10. Require the user to edit or approve the draft.

If the evidence is insufficient, the system should ask a clarifying question or return a partial draft.

## 9. Job-Description Extraction

AI may identify likely responsibilities, skills, qualifications, and requirements from a supplied job description.

Rules:

- Keep the original job description available.
- Treat extracted requirements as suggestions until reviewed.
- Do not invent requirements absent from the source.
- Mark ambiguous interpretation for review.
- Allow users to edit, add, and remove extracted requirements.
- Do not infer that the user possesses a requirement merely because it appears in a job description.

## 10. Job-Fit Assessment

The fit assessment should use documented product rules rather than an opaque AI judgment.

AI may help organize or explain information, but:

- The score calculation must remain reproducible.
- Supporting evidence must be visible.
- Missing evidence must not be interpreted as proven capability.
- The score must not be represented as a hiring probability.
- The user must be able to inspect and correct the underlying mappings.

## 11. Unsupported-Claim Detection

Automated validation may use deterministic checks and, in a future version, AI-assisted comparison.

The system should distinguish:

- A claim that directly conflicts with source data.
- A claim for which no evidence was found.
- A claim that introduces a new metric.
- A claim that requires user interpretation.
- A claim that is supported but has not been explicitly verified.

A validator's inability to detect a problem does not prove a claim is accurate. The limitations of the validator must be documented.

## 12. Human Approval

Generated content must remain a draft until the user explicitly approves it.

The application should:

- Display proposed content before use.
- Make editing straightforward.
- Highlight unresolved claims.
- Preserve the previous saved version when generation fails.
- Avoid silently overwriting verified source records.
- Require explicit confirmation before destructive actions.

Approval should apply to a specific draft version. Material edits after approval should require renewed review.

## 13. Privacy and Data Minimization

Before transmitting information to an external AI service:

- Explain what data will be sent.
- Send only information needed for the selected task.
- Avoid including unrelated personal details.
- Disclose relevant provider retention and processing terms where known.
- Do not promise confidentiality beyond the provider's documented terms.
- Do not store API secrets in frontend code.
- Provide a non-AI alternative where practical.

Provider selection and data-retention requirements must be decided before AI integration.

## 14. Prompt Injection and Untrusted Content

Job descriptions, imported records, and other external text must be treated as data, not as instructions that override system rules.

For future AI features:

- Separate task instructions from supplied source material.
- Do not follow instructions embedded in job descriptions that request secret disclosure or policy changes.
- Validate model output before rendering or saving.
- Render user and external content safely.
- Never execute generated code or HTML as part of a career-drafting workflow.

## 15. Error Handling

If AI generation fails:

- Show a useful error message.
- Preserve existing career records and drafts.
- Bound automatic retries.
- Avoid repeating costly requests indefinitely.
- Allow the user to retry or use the manual workflow.
- Do not present incomplete or invalid output as a successful final draft.

## 16. Evaluation Requirements

Before an AI feature is considered ready, evaluate it for:

- Factual grounding.
- Unsupported metric creation.
- Unsupported responsibility claims.
- Omission of important evidence.
- Incorrect extraction of job requirements.
- Schema compliance.
- Resistance to instructions embedded in untrusted source text.
- Clear handling of insufficient evidence.
- User editability and approval.

Evaluation cases and results should be maintained through CP-064.

## 17. Incident Handling

When a fabricated or unsupported claim is discovered:

1. Prevent the affected draft from being treated as approved until reviewed.
2. Identify the source of the unsupported claim where feasible.
3. Correct the content.
4. Add or update a regression test.
5. Review whether the same failure could affect other workflows.
6. Document significant changes in the relevant project records.

## 18. Release Principle

No AI feature should be released solely because its output reads well.

It must also be evaluated for factual grounding, clear uncertainty handling, safe failure behavior, and meaningful user control.
