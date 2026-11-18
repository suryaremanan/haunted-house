# Judge scorecard

Two readings. The owner's review on 18 Nov looked at the live build as a judge would, on impression; the earlier self-scores against the plan's "A 9 means" checklist gave 9 on every criterion, and the review showed why that checklist was too easy to pass (an empty results table passes "holds only real data"). The owner's reading is the one that counts.

## Owner's review (18 Nov): 8, 8, 8, 8

| Criterion | Score | What holds it back (owner's words, shortened) |
|---|---|---|
| Potential Impact | 8 | Practice mode works on a public link with no install and the page states real numbers from the log, but the user-test results table is empty |
| Technological Implementation | 8 | 27 commits on `main`, 11 specs, but the live Crew run is only a preflight; eight features are unproven live. Three features are recorded as written and built by Claude Code, not in Kiro |
| Design | 8 | One coherent night look and the séance board, but the room had shrunk to about 480 px wide at 1280×720, the ghosts were still cute, the Warden small, and the page overflowed at 720 high |
| Innovation | 8 | Bob named with why it failed and the comparison table; practice mode and opening your own séance log are new |

## Fixed after the review (agent, 18 Nov), to be judged again by the owner

- **The room is the largest thing on screen.** The replay transport, séance board, the run's numbers and the practice switch are one slim line; the brand plate folds away inside a mansion; the toolbar is one compact row. At 1280×720 the room is about 740 px wide (was about 480) and the page is exactly 720 high: nothing below the fold, the Exit row included. At 1024×768 the page is exactly 768. Evidence: `spikes/fixtures/dread-render.json` (`afterReview`, `practiceFit`).
- **The ghosts are not cute.** Redrawn as tall, translucent, torn shrouds with dark sockets and long reaching hands, drawn 1.55 times larger at Eerie and Dread, dimmed with a cold glow; the held ghost on the Warden's chain hangs limp with its mouth open.
- **The Warden grows with what he holds:** 0.8 at the edge when nothing waits, 1.25 forward when something needs you, 1.6 holding a ghost, red-lit, anchored so he never reaches the balloon or hides the door's light.
- **Still clean:** 48 rendered states (four sizes, three levels, Still House on and off): nothing covered, no sideways scroll, no failed request; axe in a real browser: no contrast or target-size failure (`spikes/fixtures/axe-replay.json`).

Agent's estimate after these fixes, for the owner to confirm by looking: Design 8.5 to 9; the other three stay at 8 until the items below are done, because each of them needs something only the owner can do.

## What gets each to 9, and who can do it

| Criterion | To reach 9 | Who |
|---|---|---|
| Design | Look again at 1280×720 on https://suryaremanan.github.io/haunted-house/ after the next deploy | Owner |
| Potential Impact | Run the five-person test in `docs/user-test.md` and fill the results table | Owner |
| Technological Implementation | Run `scripts/live-acceptance.sh` at your Crew window (about ten minutes); do the remaining work inside Kiro so the coverage table can say Kiro built it | Owner |
| Innovation | Record one real run on Crew and publish its séance log as a second replay beside the scripted one (it also proves the live path) | Owner runs it; the agent can then add the log to the public replay |

## Only you can do this

- Run the live walk: `HH_DASHBOARD_URL="$(kirocrew token --ttl 30m)" scripts/live-acceptance.sh`; when it prints "WAITING FOR YOU", open Haunted House in your own Crew window, go to the Study and press "Open the door". It writes `spikes/fixtures/live-acceptance.json`. Keep that mansion's séance log: it can become the second, real replay.
- Run the user test in `docs/user-test.md` with five people and fill its results table.
- Try the house with a screen reader.
- Do further work inside Kiro, so that what the coverage table credits to Kiro is true.
- Record the video, take the submission screenshots, sign off originality, and submit by 3 Dec.
