# Submission checklist

The dated gates and the checklist for the Kiroween 2026 submission. Statuses are `not_started`, `in_progress`, `pending`, `complete` or `blocked`. A row is `complete` only with evidence. Rows that need the public repository or the public site cannot be `complete` until [publication-metadata.json](publication-metadata.json) is verified. `python3 scripts/check-submission.py --release` lists everything still open.

## Schedule

| Date | ID | Gate | Scope | Status |
|---|---|---|---|---|
| 2026-11-15 | `planning` | Spec and current-state review complete | MVP | `complete` |
| 2026-11-22 | `replay-engine` | Canonical replay contract resolved; replay engine and its properties pass | MVP | `complete` |
| 2026-11-26 | `attic-and-pages-candidate` | Attic controls, transport isolation and a public Pages candidate pass | MVP | `in_progress` |
| 2026-11-29 | `permission-freeze-and-rehearsal` | Permission freeze, clean live install rehearsal, document draft and replay smoke pass | MVP | `in_progress` |
| 2026-11-30 | `feature-freeze` | Feature freeze begins | MVP | `not_started` |
| 2026-12-01 | `media-and-checklist-close` | Screenshots, provenance, accessibility evidence and this checklist close | MVP | `not_started` |
| 2026-12-02 | `video` | Final video recorded and uploaded | MVP | `not_started` |
| 2026-12-03 | `submission` | Submission completed, one day before the deadline | MVP | `not_started` |
| 2026-12-04 14:00 PT | `deadline` | External deadline; no planned submission work remains | MVP | `not_started` |
| after MVP rehearsal | `stretch-review-loop` | Séance Room review loop | Stretch | `not_started` |
| after MVP rehearsal | `stretch-attic-extras` | Attic search, filters, bookmarks and export | Stretch | `not_started` |
| after MVP rehearsal | `stretch-polish` | Sound and cosmetic polish | Stretch | `not_started` |

## Checklist

| ID | Item | Due | Status | Evidence |
|---|---|---|---|---|
| `repository-public` | The repository is public and readable without an account | 2026-11-26 | `not_started` | Owner step: publish the repository, then record its address in `docs/publication-metadata.json` |
| `license-detected` | GitHub detects the MIT license | 2026-11-26 | `not_started` | `LICENSE` is in place; detection is checked on the public repository |
| `links` | README links to the public repository and the public replay work | 2026-11-29 | `not_started` | Blocked on `repository-public`; relative links are checked by `scripts/check-submission.py` |
| `permission-freeze` | The manifest permissions match the code and the freeze record | 2026-11-29 | `complete` | `docs/permission-freeze.json`, `spikes/fixtures/replay-permission-inventory.json`; checked by `scripts/check-permission-freeze.py` in `scripts/check-release.sh`. Any later manifest change reopens this row |
| `clean-install` | A clean clone installs with the one command on a prepared host | 2026-11-29 | `not_started` | Owner step: run `scripts/install-local.sh` from a fresh clone; dry-run harness in `scripts/tests/test_install_local.py` |
| `trust-step` | Enable and trust rehearsed; the trust prompt matches the README permission list | 2026-11-29 | `not_started` | Owner step in the Crew dashboard; the script never does this |
| `pages-smoke` | The Pages workflow deployed and its smoke job passed | 2026-11-26 | `not_started` | `.github/workflows/pages.yml` is written; its first run needs the public repository |
| `ci` | Normal CI is green on the default branch | 2026-11-29 | `not_started` | `.github/workflows/ci.yml`; needs the public repository |
| `tests` | Python and UI test suites pass locally | 2026-11-29 | `complete` | `scripts/check-release.sh` ran every offline gate with no failure; `scripts/test-all.sh` runs the two suites alone |
| `accessibility` | Keyboard, contrast, motion and live-region evidence reviewed | 2026-12-01 | `in_progress` | Automated keyboard, motion and live-region tests pass (`app/ui/src/house-accessibility.test.tsx`, `app/ui/src/house-keyboard.test.tsx`); rendered contrast and reflow need a person with a real browser |
| `screenshots` | Light, dark, replay and approval screenshots captured with provenance | 2026-12-01 | `blocked` | `docs/assets-checklist.md`; blocked on the capture runner (a real browser) |
| `video` | Demo video under 3 minutes recorded and uploaded | 2026-12-02 | `not_started` | `docs/demo-script.md` |
| `credits` | Every distributed asset is credited and reviewed by a person | 2026-12-01 | `in_progress` | `docs/credits.md`, `docs/assets-manifest.json` |
| `secret-scan` | No credential or home path in the repository or the replay build | 2026-12-01 | `complete` | `scripts/secret_scan.py`, `scripts/check-replay-publication.py`, both run by `scripts/check-release.sh`; run again before the final push |
| `feature-freeze` | Only fixes, evidence and packaging enter after the freeze | 2026-11-30 | `not_started` | See the rule below |
| `submission` | The hackathon entry is submitted | 2026-12-03 | `not_started` | Owner step |

## Feature freeze rule

Feature freeze begins on 2026-11-30. From then on only these changes enter the judge-facing version: defect fixes, accessibility fixes, security fixes, evidence updates and submission packaging. A permission change after the freeze needs a new app version, updated README trust copy and a newly reviewed `docs/permission-freeze.json`.

## Stretch queue

Stretch work is not scheduled while any MVP gate above is open. It starts only after every MVP gate passes and one complete submission rehearsal (clean install, trust, demo run-through against the script, replay smoke) is done. Order: the Séance Room review loop first, then Attic search, filters, bookmarks and export, then sound and cosmetic polish. None of it may add a permission, an API path, a remote asset or a submission risk.
