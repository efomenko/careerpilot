# CareerPilot — AI Job Search Copilot

CareerPilot is a portfolio project exploring how to organize a job search, maintain structured career evidence, assess job opportunities, and prepare accurate, tailored applications.

The project is being built incrementally using vanilla HTML, CSS, and JavaScript, with a manual MVP before AI integration.

> **Project status:** In development. Check the repository and GitHub issues to confirm which features are currently implemented.

## Vision

Help job seekers prepare relevant applications with less repetitive work while keeping every professional claim grounded in evidence and under the user's control.

## Planned Capabilities

The product roadmap includes:

- A responsive application dashboard and navigation.
- A reusable career profile and employment history.
- Achievement records with evidence and verification status.
- Job opportunity and requirement management.
- Transparent, rule-based job-fit assessment.
- Editable CV bullet and cover letter drafts.
- Application tracking and follow-up management.
- JSON export and validated import.
- Future AI-assisted job-description extraction and evidence-grounded drafting.

These are planned capabilities; their presence in this list does not confirm implementation.

## Product Principles

- **Evidence first:** never invent career facts, achievements, or metrics.
- **Human control:** generated content remains editable and requires user approval.
- **Transparency:** show the evidence and limitations behind assessments.
- **Incremental delivery:** implement and test one feature at a time.
- **Privacy:** use fictional data in public demonstrations and protect credentials.

## Technology

The initial technology direction is:

- HTML for structure.
- CSS for styling and responsive layout.
- Vanilla JavaScript for application behavior.
- JSON for data interchange.
- Automated tests for critical logic as the project evolves.

The persistence mechanism, test tooling, and future AI provider must be confirmed in the relevant technical decisions before being described as finalized.

## Getting Started

### Prerequisites

- Git.
- A code editor such as Visual Studio Code.
- A modern web browser.

### Run locally

The initial application is intended to be a lightweight browser application.

1. Clone the repository or download its contents.
2. Open the project folder in Visual Studio Code.
3. Open `index.html` in a browser, or use a local development server if your setup requires one.
4. Open the browser developer tools and check the Console for errors.

Example Git commands:

```bash
git clone <your-repository-url>
cd careerpilot
```

Replace `<your-repository-url>` with the actual URL of your GitHub repository.

If module loading or browser restrictions prevent the application from running directly from a file, use a local static server. Document the confirmed method once it has been tested.

## Project Structure

The intended structure is:

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
│       └── app.js
├── index.html
├── README.md
└── .gitignore
```

Additional modules and test directories may be introduced as implementation grows.

## Roadmap

The project follows six milestones:

| Milestone | Focus |
| --- | --- |
| M1 | Foundation and application shell |
| M2 | Career knowledge base |
| M3 | Jobs and evidence-based fit |
| M4 | Application drafts and review |
| M5 | Application tracking and quality |
| M6 | AI integration and evaluation |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the task-level plan and dependencies.

## Documentation

- [Product Vision](docs/PRODUCT_VISION.md)
- [Product Requirements Document](docs/PRD.md)
- [User Stories](docs/USER_STORIES.md)
- [Roadmap](docs/ROADMAP.md)
- [Technical Design](docs/TECHNICAL_DESIGN.md)
- [AI Guardrails](docs/AI_GUARDRAILS.md)
- [Test Plan](docs/TEST_PLAN.md)
- [Decision Log](docs/DECISIONS.md)

## Testing

Testing instructions will be expanded as the test tooling and automated tests are implemented.

The test plan covers:

- Navigation and responsive layout.
- Input validation and record management.
- Evidence relationships and verification.
- Deterministic job-fit assessment.
- Draft editing and unsupported-claim checks.
- Application tracking.
- JSON import/export.
- Accessibility.
- Future AI grounding and evaluation.

Do not treat a test as passed until it has been executed and its result recorded.

## Privacy and Demo Data

Do not commit private CVs, personal contact details, API keys, or other sensitive information to a public repository.

Use fictional demo data for screenshots and public demonstrations. Before enabling an external AI service, document what data is transmitted and how credentials are protected.

## Contribution and Development Workflow

The project is developed incrementally through GitHub issues.

Recommended workflow:

1. Select an existing task.
2. Review its acceptance criteria and dependencies.
3. Implement the smallest complete change.
4. Test the relevant behavior.
5. Review the code diff.
6. Update documentation if needed.
7. Commit and push the change.
8. Update the GitHub issue with actual test results.

Preserve the established CP task IDs and milestone structure.

## Limitations

CareerPilot is a learning and portfolio project under development. It does not guarantee job-search outcomes, replace professional judgment, or automatically establish the truth of career claims.

AI features, once introduced, will require separate evaluation for factual grounding, privacy, reliability, and safe error handling.

## License

Add a license before redistributing the project publicly. No license is specified here because the intended licensing choice has not yet been confirmed.
