# Requirements Document

## Introduction

Spec 1 builds the skeleton every later spec stands on: the repository baseline, a Crew app that installs on Kiro Crew 0.12.1, a backend that only trusts the gateway, a gateway client that keeps its token secret, a UI that can run live or from a recorded log, a local install path, and the tests, CI and Kiro hooks that guard all of it. It adds no rooms, ghosts or doors. The facts it relies on come from the day-one spikes recorded in `.kiro/steering/tech.md`.

## Glossary

- **Repo**: This Haunted House GitHub repository.
- **App**: The Crew app in `app/`, described by `app/app.json`.
- **Manifest**: The file `app/app.json`.
- **Gateway**: The local Kiro Crew gateway (version 0.12.1 or later).
- **Backend**: The App's Python HTTP server, started by the Gateway and reached through the Gateway's proxy at `/apps/haunted-house/api/*`.
- **Proxy_Signature**: The `X-KiroCrew-Proxy` header, `<unix-seconds>:<hex HMAC-SHA256>`, computed with the App secret over `<unix-seconds>:<METHOD>:<path and query>:<hex SHA-256 of body>`.
- **App_Secret**: The per-app secret the Gateway passes to the Backend in the `KIROCREW_PROXY_SECRET` environment variable.
- **App_Token**: A short-lived token the Backend gets from `POST /api/apps/haunted-house/token` by sending the App_Secret.
- **Gateway_Client**: The Backend module that calls Gateway REST APIs.
- **UI**: The App's dashboard page, built as one ESM bundle.
- **Host_Modules**: Modules the Crew dashboard supplies at runtime: `react`, `react-dom`, `react/jsx-runtime`, `lucide-react`, and `@kirocrew/app-sdk` (including subpaths).
- **SDK_Adapter**: The only UI module allowed to import `@kirocrew/app-sdk`.
- **Replay_Build**: A static build of the UI that uses a stand-in SDK and recorded events instead of a Gateway.
- **Install_Script**: `scripts/install-local.sh`.
- **Kiro_Check**: `scripts/check-kiro-tracked.sh`.
- **CI**: The GitHub Actions workflow in `.github/workflows/`.

## Requirements

### Requirement 1: Repository baseline

**User Story:** As a hackathon judge, I want a public repo with a clear license, source and run instructions, so that I can review and run the project.

#### Acceptance Criteria

1. THE Repo SHALL contain an MIT `LICENSE` file at its root.
2. THE Repo SHALL contain a `README.md` that states what the App is, the Crew version it needs, how to install it, and the one-time trust step the operator performs in the Crew dashboard.
3. THE Repo SHALL contain a `.gitignore` that ignores `kiro-docs/`, `node_modules/`, Python caches and virtual environments, and local build caches.
4. THE Repo SHALL track the committed UI bundle under `app/ui/dist/`.

### Requirement 2: Keep `.kiro` tracked

**User Story:** As the developer, I want an automatic check that `.kiro` is never ignored, so that the submission keeps the evidence of how Kiro was used.

#### Acceptance Criteria

1. WHEN the Kiro_Check runs, THE Kiro_Check SHALL exit with a non-zero status if `.kiro/` or any file under it is ignored by git.
2. WHEN the Kiro_Check fails, THE Kiro_Check SHALL print each ignored path and the ignore rule that matched it.
3. WHEN no path under `.kiro/` is ignored, THE Kiro_Check SHALL exit with status zero.

### Requirement 3: App manifest

**User Story:** As an operator, I want a manifest Crew accepts that asks only for what the App uses, so that I can review and trust it quickly.

#### Acceptance Criteria

1. THE Manifest SHALL declare `name` `haunted-house`, a semver `version`, `displayName`, `description`, `license` `MIT`, and `minKiroCrewVersion` `0.12.1`.
2. THE Manifest SHALL declare one UI page and a Python Backend whose paths are relative and stay inside `app/`.
3. THE Manifest SHALL list in `permissions.api` only Gateway path prefixes that App code calls.
4. THE Manifest SHALL NOT contain any `autoApprove` list.
5. WHEN the manifest test runs, THE test SHALL fail if any rule in criteria 1 to 4 is broken or if the Manifest fails Crew's documented validation rules.

### Requirement 4: UI bundle

**User Story:** As the developer, I want a UI bundle that shares the dashboard's React and SDK, so that hooks work and the page loads inside Crew.

#### Acceptance Criteria

1. WHEN the UI is built, THE build SHALL produce one ES module at `app/ui/dist/index.mjs`.
2. THE UI bundle SHALL import no bare module specifier other than the Host_Modules.
3. THE UI build SHALL NOT require installing `@kirocrew/app-sdk` from npm.
4. WHEN the UI page loads in the Gateway, THE UI SHALL show whether the Backend is reachable.
5. IF the UI source has changed since the committed bundle was built, THEN CI SHALL fail and name the stale bundle.

### Requirement 5: Backend trusts only the Gateway

**User Story:** As an operator, I want the Backend to refuse any request the Gateway did not sign, so that other local processes cannot drive the App.

#### Acceptance Criteria

1. WHEN a request to `/health` arrives, THE Backend SHALL return HTTP 200 without checking the Proxy_Signature.
2. WHEN a request to any `/api/` path carries a Proxy_Signature that matches the method, path and query, and body, and whose timestamp is within 60 seconds of the Backend's clock, THE Backend SHALL pass the request to its handler.
3. IF a request to an `/api/` path that the HTTP layer accepts has a missing, malformed, mismatched or stale Proxy_Signature, THEN THE Backend SHALL return HTTP 401 without running any handler.
4. IF the App_Secret is absent or empty, THEN THE Backend SHALL return HTTP 401 for every `/api/` request.
5. THE Backend SHALL compare signatures in constant time.
6. THE Backend SHALL bind to the loopback interface only.

### Requirement 6: Gateway client

**User Story:** As the developer, I want one client for Gateway calls that handles the App_Token safely, so that later specs don't each reinvent authentication.

#### Acceptance Criteria

1. WHEN the Gateway_Client needs an App_Token and holds none, THE Gateway_Client SHALL obtain one by sending the App_Secret in the `X-App-Secret` header.
2. WHEN the Gateway_Client calls a Gateway path, THE Gateway_Client SHALL send the App_Token as the `token` query parameter.
3. IF a Gateway call returns HTTP 401 or 403 for an expired token, THEN THE Gateway_Client SHALL get a new App_Token and retry the call once.
4. THE Gateway_Client SHALL NOT write the App_Secret or App_Token to logs, files, error messages or responses.
5. IF a Gateway call does not respond within its timeout, THEN THE Gateway_Client SHALL return a timeout error to its caller.

### Requirement 7: Live and replay from one UI

**User Story:** As a judge without Crew, I want to open a static replay of the App, so that I can see it work without installing anything.

#### Acceptance Criteria

1. THE UI SHALL import `@kirocrew/app-sdk` only from the SDK_Adapter.
2. WHEN the Replay_Build is built, THE build SHALL replace the SDK_Adapter's backing module with a stand-in that plays a recorded event file.
3. THE Replay_Build SHALL make no request to a Gateway.
4. WHEN the Replay_Build's page is rendered in a DOM test with a recorded fixture, THE page SHALL render the same root component as the live UI.

### Requirement 8: Local install

**User Story:** As an operator, I want one command that installs or updates the App locally, so that setup is short and repeatable.

#### Acceptance Criteria

1. WHEN the Install_Script runs, THE Install_Script SHALL check that Crew 0.12.1 or later, Node.js and git are present and stop with a clear message if any is missing.
2. WHEN the App is not installed, THE Install_Script SHALL build the UI and install the App through the `kirocrew` CLI.
3. WHEN the App is already installed, THE Install_Script SHALL update it instead of failing.
4. THE Install_Script SHALL NOT change Crew trust, approval or security settings.
5. WHEN the Install_Script finishes, THE Install_Script SHALL print the dashboard steps the operator must do by hand, including trusting and enabling the App.

### Requirement 9: Tests and CI

**User Story:** As the developer, I want tests and CI from day one, so that every later property test has a home and regressions are caught on push.

#### Acceptance Criteria

1. THE Repo SHALL provide one command that runs the TypeScript tests (Vitest with fast-check) and one that runs the Python tests (pytest with Hypothesis).
2. WHEN code is pushed or a pull request is opened, CI SHALL run both test suites, the manifest test, the Kiro_Check, the stale-bundle check, and a secret scan.
3. IF any CI step fails, THEN CI SHALL mark the run as failed.

### Requirement 10: Secrets stay out

**User Story:** As the developer, I want secrets blocked before they reach the repo, so that a public repo leaks nothing.

#### Acceptance Criteria

1. THE Repo SHALL contain no credentials, tokens, App_Secret values, or `.app_secret` files.
2. WHEN the secret scan finds a likely credential in tracked files, THE secret scan SHALL fail and name the file and line without printing the matched value.
3. WHEN a recorded fixture is added under `fixtures/` or `spikes/fixtures/`, THE secret scan SHALL also fail if the fixture contains an absolute home-directory path.

### Requirement 11: Build-time Kiro hooks

**User Story:** As the developer, I want Kiro hooks that run the cheap checks while I work, so that problems show up before CI.

#### Acceptance Criteria

1. WHEN `.gitignore` is saved, THE Kiro hook SHALL run the Kiro_Check.
2. WHEN a file under a `core/` folder is saved, THE Kiro hook SHALL run that language's tests once.
3. WHEN a Kiro spec task finishes, THE Kiro hook SHALL run both test suites.
4. WHEN the agent is about to write a file, THE Kiro hook SHALL block the write if its content matches the secret scan's patterns.
