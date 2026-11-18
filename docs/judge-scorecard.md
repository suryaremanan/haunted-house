# Judge scorecard

Scored as a strict judge who has seen fifty entries. A criterion is a 9 only when every item under "A 9 means" exists and has been opened. Updated after each package of the 18 Nov plan.

## Current scores (18 Nov, end of the plan's agent work)

| Criterion | Score | A 9 means: each item, and where it was opened |
|---|---|---|
| Potential Impact | 9 | One public link, no install: https://suryaremanan.github.io/haunted-house/, walked in headless Comet after each deploy. A stranger makes the hold-or-release and door decisions in practice mode and sees what each means (`app/ui/src/replay-practice.test.tsx`; the Warden asks in his balloon). The page states the run in numbers counted from the log: "91 events from 7 ghosts. The house stopped and waited for a person 6 times." (`app/ui/src/core/practice.ts`). Accessibility is evidenced (`docs/accessibility-report.md`, `spikes/fixtures/axe-replay.json`). A user-test kit exists and its results table holds only real data: none yet (`docs/user-test.md`) |
| Technological Implementation | 9 | Every MVP row in `docs/kiro-coverage.md` is Complete with evidence paths or carries its reason (eight wait on the owner's live walk; the preflight of `scripts/live-acceptance.sh` passes against the real gateway, `spikes/fixtures/live-acceptance.json`). CI is green on `main` (runs 44225164785 and later) and the Pages build, deploy and smoke are green (44225164829, 44229171341). No open MVP task is without a decision: each is done, or cut with its reason, in every `.kiro/specs/*/tasks.md`. 19-gate `scripts/check-release.sh` passes; 1994 UI tests and the Python suite |
| Design | 9 | One look from the Gate to "What was made": night palette, light as status, séance board, practice in the Warden's balloon. Looked at in screenshots at 1280×720, 1024×768, 768×1024 and 390×844, in light and dark colour schemes (the house is night in both), at Calm, Eerie and Dread, with Still House on and off: 48 checked states with no covered control, no sideways scroll and no failed request (`spikes/fixtures/dread-render.json`); every room at the held moment and at the end at all three levels, the refusal and release moments, and the room fully inside the window with a practice question open at all four sizes (recorded in the same file). Contrast measured in a real browser: no failure |
| Innovation | 9 | The first lines of README and the write-up say what was brought back (Microsoft Bob, 1995), why it failed and what is new, with a Spec Builder / Agent Worlds / Haunted House table. Two capabilities neither Crew app has, both working in the public replay: making the owner's decisions in practice mode, and opening any run's séance log in the Attic (`app/ui/src/replay-own-seance.test.tsx`, checked on the public URL) |

### Where a strict judge would still push

- No real person has used it yet. The rubric's item holds (the results table holds only real data, and so far that is none), but a judge would weigh five real sessions.
- The live walk on Crew has not run end to end; only its preflight has.
- At 1280×720 the room is small (about 480 pixels wide) because the replay controls, the practice line and the toolbar sit above it.
- The door shudder on a knock was cut: a whole-door shudder at the Gate is screen shake, which the same plan forbids.

## Only you can do this

- Run the live walk: `HH_DASHBOARD_URL="$(kirocrew token --ttl 30m)" scripts/live-acceptance.sh`, then, when it prints "WAITING FOR YOU", open Haunted House in your own Crew window, go to the Study and press "Open the door". It writes `spikes/fixtures/live-acceptance.json`; the eight "live Crew check pending" rows can then move to Complete.
- Run the user test in `docs/user-test.md` with five people and fill its results table.
- Try the house with a screen reader.
- Record the video, take the submission screenshots, sign off originality, and submit by 3 Dec.
