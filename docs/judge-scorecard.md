# Judge scorecard

Scored as a strict judge who has seen fifty entries. A criterion is a 9 only when every item under "A 9 means" exists and has been opened. Updated after each package of the 18 Nov plan.

## Current scores (18 Nov, after the story and the dread pass)

| Criterion | Score | Was | Evidence | What is missing for a 9 |
|---|---|---|---|---|
| Potential Impact | 6.5 | 6 | The public replay now runs the whole story to "What was made" (`fixtures/replay/demo.jsonl`, `app/ui/src/replay-guide.test.tsx`) | The public link is not live yet (PR not merged, Pages not deployed); no practice mode where a stranger decides; no numbers from the log on the page; no user-test kit; no axe report |
| Technological Implementation | 8 | 8 | 19-gate `scripts/check-release.sh` passes; 1982 UI and 3310 Python tests; five new properties (`app/ui/src/core/dread.property.test.ts`); story built from backend builders (`scripts/build_replay_fixture.py`) | CI not yet green on `main`; 9 coverage rows still "live Crew check pending"; open spec tasks not yet closed or cut; no `scripts/live-acceptance.sh` |
| Design | 8.5 | 8 | Night palette, light as status, Warden stance, séance board, toolbar off the art; 48 rendered states checked in headless Comet at 1280×720, 1024, 768 and 390 wide, three Fright levels, Still House on and off: nothing covered, no sideways scroll, no failed request (`spikes/fixtures/dread-render.json`) | The hall and the "What was made" page not yet looked at at every level; the knock shudder cut (it would be screen shake) |
| Innovation | 7 | 7 | Authority made visible (walls, doors, exact approvals); a guide whose every choice presses a real control | README and write-up do not yet name what is resurrected or compare against Spec Builder and Agent Worlds; no "bring your own séance" in the public replay |

## Only you can do this

Filled in as packages finish. So far:

- Walk a first visit in Crew with real ghosts (the dashboard needs your sign-in).
- Run the user test in `docs/user-test.md` with five people and fill its results table (once the kit is added).
