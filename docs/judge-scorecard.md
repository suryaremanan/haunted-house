# Judge scorecard

Scored as a strict judge who has seen fifty entries. A criterion is a 9 only when every item under "A 9 means" exists and has been opened. Updated after each package of the 18 Nov plan.

## Current scores (18 Nov, after publishing, practice, own séance and the write-up)

| Criterion | Score | Was | Evidence (opened) | What is missing for a 9 |
|---|---|---|---|---|
| Potential Impact | 8 | 6 | Public, no-install link: https://suryaremanan.github.io/haunted-house/ (walked in headless Comet to a practice question, 18 Nov). A stranger makes the owner's six decisions in practice mode (`app/ui/src/replay-practice.test.tsx`). The page states the run in numbers from the log ("91 events from 7 ghosts", times it waited). `docs/accessibility-report.md` with axe in a real browser. `docs/user-test.md` kit with an empty results table | No real person has used it: the user-test table is empty; no screen-reader user has tried it |
| Technological Implementation | 8.5 | 8 | CI green on `main` (run 44225164785); Pages build, deploy and smoke green (run 44225164829); 19-gate `scripts/check-release.sh`; 1993 UI tests and the Python suite; nine new properties across `dread`, `practice`, `own-seance`; `scripts/live-acceptance.sh` preflight passes against the real gateway (`spikes/fixtures/live-acceptance.json`) | The live walk on Crew has not run (it needs your sign-in), so 8 coverage rows still say "live Crew check pending"; open spec tasks still to be closed or cut |
| Design | 8.5 | 8 | Night palette, light as status, Warden stance, séance board, practice board; 48 rendered states (`spikes/fixtures/dread-render.json`) and 14 axe states in a real browser (`spikes/fixtures/axe-replay.json`): no covered control, no sideways scroll, no contrast failure | At 1280×720 the replay head (bar, practice board, start note) pushes the room down; the knock shudder is cut (it would be screen shake) |
| Innovation | 8.5 | 7 | README and write-up name Microsoft Bob (1995), why it failed, and why agents make the house work, with a Spec Builder / Agent Worlds / Haunted House table. In the public replay a stranger can make the decisions and open any run's séance log (`app/ui/src/replay-own-seance.test.tsx`); neither Crew app can do either | Nothing further needed from the code; a judge's first ten seconds still depend on the video, which is out of scope |

## Only you can do this

- Run the live walk: `HH_DASHBOARD_URL="$(kirocrew token --ttl 30m)" scripts/live-acceptance.sh`, then, when it says so, open the Study's door in your own Crew window. It records `spikes/fixtures/live-acceptance.json` and the coverage rows can then move to Complete.
- Run the user test in `docs/user-test.md` with five people and fill its results table.
- Walk a first visit in Crew with real ghosts, and try the house with a screen reader.
- Record the video, take the submission screenshots, sign off originality, and submit by 3 Dec.
