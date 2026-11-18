# Haunted House: write-up

Haunted House is a Kiro Crew app for Kiroween 2026 (Resurrection category). It brings back Microsoft Bob (1995), the house-as-interface desktop, for a new job: showing what several AI agents are doing and what each one is allowed to do.

## What is being resurrected

Microsoft Bob (1995) replaced the Windows desktop with a house. You walked into rooms, clicked objects on a desk to open programs, and a cartoon guide spoke to you in speech balloons. It was withdrawn within about a year and is remembered as one of the industry's best-known failures.

It failed for reasons that are still instructive:

- **The house was decoration over a few simple programs.** A letter writer and a checkbook did not need rooms; the rooms only added clicks between you and them.
- **The guide talked down and got in the way.** It interrupted, it performed while idle, and its help could not be turned into knowledge of the real controls.
- **It hid the computer instead of explaining it.** Nothing in the house told you more than the plain program would have.
- **It was heavy for the machines of its day.**

Agents change the arithmetic. Several AI agents working on one project are a set of actors with jobs, limits and moments when they need you, which is what a house with rooms, walls, doors and occupants is good at showing. The rooms are no longer decoration: each one is a phase with its own output, its own agent and its own allowed paths. The doors are real approval gates. The guide is not a performer: he reads the same state as the map, says what is true in one line, and every choice he offers presses a control that is already on the page. Haunted House keeps Bob's idea and treats each of its failures as a rule.

Haunted House uses the idea only. The app, its art, assets and fixtures contain no Microsoft or Bob name, logo, character, artwork or sound; every drawing is original SVG written for this project.

## Against what Crew already has

Crew ships two built-in apps close to this idea. Both are credited by name.

| | Spec Builder | Agent Worlds | Haunted House |
|---|---|---|---|
| What you see | Requirements, design and tasks as documents | Running agents as animated characters | One project as a house: rooms are phases, ghosts are agents |
| Approvals | Gates between documents | None of its own | Doors that open only on your approval, plus exact approvals for risky actions (one command, one folder, one time) |
| What an agent may touch | Not shown | Not shown | Walls: each room's allowed paths, shown in the room and enforced by the room's tool server |
| History | The documents | Live only | An append-only séance log; the Attic replays any run from it alone |
| For someone new to Kiro | Kiro's words | No guidance | The Warden: plain words first, Kiro's words one press away |
| Without Crew | No | No | A public static replay of a whole run, with a practice mode where you make the decisions, and any run's séance log can be opened in it |

## Problem

When you run several AI agents on one project, the interface is usually a set of chat logs. A chat log tells you what an agent said. It does not tell you, at a glance, which agent is working, which one is waiting for you, which files each one may touch, or which of your approvals let a step happen. That information exists, but it is spread across transcripts, permission files and approval prompts.

The cost shows up as lost track of work and as approvals given without context: you click "approve" on a tool call without seeing which phase it belongs to or what else is waiting.

## Spatial approach

Haunted House turns one software project into a mansion you walk through.

| House | Means |
|---|---|
| Mansion | One software project, with its own `.kiro/specs/<name>/` folder |
| Room | One spec phase, with its own ghost and its own allowed paths |
| Ghost | A Kiro custom agent run by Crew, with its own steering and tool permissions |
| Door | An approval gate. It opens only when you approve the room's output |
| Séance log | The append-only record of every tool call, state change and decision |

The rooms follow spec-driven development: the Foyer (pick or create a mansion), the Study (requirements), the Drafting Room (design and correctness properties), the Workshop (the task plan, then implementation by up to three parallel ghosts) and the Attic (replay). A ghost is always in one of six states: idle, working, waiting, blocked, failed or done. Each state has its own pose or icon and a text label, never color alone.

Chat is not the home screen. Rooms, doors and objects are the interface.

## The Warden and the first visit

A house you can walk through still has to be learned. The words on its controls are Kiro's (spec, requirements, design, tasks, approve), and someone who has never used Kiro does not know which room to open first. The Warden is the answer: one guide, in the corner of every room, who says what is true now and offers what can be done about it.

He is a tall hooded figure with lantern eyes, a ring of keys and a trailing chain, twice the height of the room ghosts. The keys are your approvals. He stands in one of five poses, each also written in words beside him: watching, pointing to your next step, holding out a key when a door waits for you, holding a ghost that the house has stopped, and stepped back. He never moves on his own. The tone is menacing, never harmful: he is a danger to ghosts that stray, not to the person at the keyboard.

His balloon always reads the same way. One line says what is true now. One line asks "What do you want to do?". Up to four choices follow, verb first, each with a second line that says what pressing it does. "Something else…" holds every other choice and the whole word list, and "Step back" puts the balloon away.

**A first visit, start to finish.** A visitor with no mansion yet starts at the front gate: one question ("Who is knocking?"), one optional name, one Knock. In the hall the Warden asks "What do you want to build?"; three small examples fill one field, the project folder's name is shown before anything is made, and "Build this" makes the mansion and takes the visitor inside. In the Study the first choice is to have the Archivist write what the software must do. When that is written, the choices are to read it, to ask for a change (with ready-made requests that fill the real form), or to go to the door; at the door, the first choice is to open it. The Drafting Room and the Workshop ask the same things in the same order. When every door is open, the Foyer lists what was made, each document under its plain word, Kiro's word and its real file path, with the steps that open the same folder in Kiro.

**He decides nothing and sends nothing.** What he says is a pure function of the same state the house map shows. Each choice is a short list of presses on controls the house already has: the map's room, ghost and door controls, and a panel's own start, approve, reject, revise, task and retry buttons. The page presses them one at a time, as a person would, and stops with the room's own reason if a control is missing or switched off. A choice that decides is offered only beside the thing being decided, and focus lands on that thing, never on the button. Each choice names the controls it presses (`data-presses`), so the claim can be read off the page. With the Warden stepped back, every one of those controls is still there, reached through the house map.

**Plain words first, Kiro's words one press away.**

| The Warden says | Kiro calls it |
|---|---|
| plan | spec |
| what it must do | requirements |
| how it will work | design |
| to-do list | tasks |
| ghost | agent |
| open the door | approve |
| house rules | steering |
| wall | path limit |

"Show Kiro's words" puts Kiro's word beside each plain one, and "What is this?" explains a word in two sentences. "Show me what I can press" (or the `?` key) puts a text label on every working object of the painted room, each a real button. Nothing is renamed: the house's own controls keep Kiro's words.

**The same in a recording.** The static replay starts at the same gate and shows the same Warden. For the same log he says the same thing and stands the same way live and replayed; in a recording he offers nothing that starts, decides or asks for a change.

The Warden is an original character drawn in code. No name, logo, character, artwork or sound of any earlier product is used.

## Architecture

Haunted House is a gateway-managed Crew app (`resources` and `lifecycle` are both `gateway`). Crew runs the ghosts; the app owns phases, doors and the séance log.

- **UI** (`app/ui/`): React and TypeScript, built with Vite into one ES module, `app/ui/dist/index.mjs`, which the Crew dashboard loads. React, `lucide-react` and the Crew app SDK are supplied by the dashboard and are not bundled. One file, `app/ui/src/adapters/sdk.ts`, is the only importer of the SDK.
- **Backend** (`app/backend/`): Python 3.12 and aiohttp, both from Crew's own interpreter, so the app installs no dependency. Every route verifies the gateway's signed proxy header. The backend listens on loopback only.
- **Room tools** (`app/mcp/`): one MCP server per room. Ghosts write spec documents and ask for risky actions only through these tools, which check the room's path policy and the approval ledger.
- **Ghosts** (`app/agents/`, `app/skills/`): four agent profiles (the Archivist, the Draughtsman, the Foreman and the Tinker) with least-privilege tools, deny rules for anything outside their room, and no auto-approve list.
- **Pure cores**: `app/backend/haunted_house/core/` and `app/ui/src/core/` hold the logic with no network, filesystem, SDK or clock access. Every correctness property is tested there. Only `adapters/` talk to Crew, the disk or the clock.

Crew has no API for Kiro's native spec phases, so the house writes Kiro-format spec files (`requirements.md`, `design.md`, `tasks.md`) itself.

## Canonical log and replay

Every decision and tool call becomes one record in the mansion's séance log: a versioned, append-only JSON Lines file with a sequence number and a hash chain. The log is redacted before it is written.

Replay reads only this log. The Attic parses it with the same parser the live view uses, orders the records with the same selector, and folds them with the same functions. Playback adds a cursor on top: the cursor is a prefix length, and the state shown at cursor `n` is always a fresh fold of the first `n` records. The playback controls cannot approve, start or change anything. Property tests check that replaying a log to the end gives the same state as folding it live, in any delivery order and with duplicates.

The static replay is the same root component built with the Crew SDK swapped for a stand-in. The stand-in loads one relative file, `./fixture.jsonl`, and nothing else. The fixture is synthetic: it is generated by `scripts/build_replay_fixture.py` through the backend's own writer pipeline, with invented ghosts and fixed times. A publication gate (`scripts/check-replay-artifact.mjs` and `scripts/check-replay-publication.py`) refuses a build that contains a credential, a home path, a localhost origin, a remote asset, a live transport or a link out of its own folder.

## Visible authority and guardrails

The house's rules are enforced in the backend, not only drawn in the UI.

1. Doors open only on an explicit user approval. Nothing advances on its own.
2. Design starts only after requirements are approved; tasks start only after design is approved.
3. A ghost reads and writes only inside its room's allowed paths. The backend resolves real paths, rejects `..` and escaping symlinks, then matches the room's allowlist. The agent profile's deny rules are a second layer.
4. A risky action (shell, delete, git write, any write outside the room's paths) runs only with a matching approval record for that exact action.
5. Creating a mansion is idempotent and never overwrites an existing project.
6. Every decision and tool call lands in the séance log.

The manifest asks for the smallest permission set the code uses, and that set is frozen in `docs/permission-freeze.json`. The app does not ask for subagent spawning or the global approval queue. It answers approval prompts only for chat sessions it created, and only after you approve in the house.

## Accessibility

- Every room, door, ghost and approval button is reachable by Tab in reading order. Arrow keys move between rooms on the house map, Enter opens a room, and Escape closes a panel and returns focus to where it came from.
- State is never shown by color alone. Text contrast targets WCAG 2.2 AA.
- Motion is small and slow, honors `prefers-reduced-motion`, and can be turned off with a "Still house" toggle. There is no parallax and no screen shake.
- There is one polite live region. Ghosts stay quiet unless one is waiting for you, blocked or failed, or you asked. Progress is shown in place, never as a toast or a sound.
- Sound is optional and off on every visit. Pressing Sound turns on short synthesised cues (a door creak when a door opens, a knock when one waits for you). Every cue repeats something already shown and said in words; nothing is told by sound alone.
- The house is drawn as a 3D model: each room is a real box in perspective. That is a still drawing; a Side view toggle turns the model, and nothing follows the pointer.

## How Kiro was used

The repository's `.kiro/` folder is the build record.

- **Steering** (`.kiro/steering/`): four files (product, structure, tech, and theme and accessibility) hold the product rules, the repo layout, verified facts about Crew, and the accessibility constraints. Spike results are written back into `tech.md` so later specs start from verified behavior, including the places where the installed Crew differs from its documentation.
- **Specs** (`.kiro/specs/`): seven requirements-first feature specs, each with `requirements.md` in EARS form, `design.md` with numbered correctness properties, and `tasks.md` with a dependency graph: `crew-app-foundation`, `seance-log-and-ghost-state`, `mansion-lifecycle`, `doors-and-guardrails`, `room-ghosts`, `house-ui-and-accessibility` and `replay-and-submission`.
- **Correctness properties**: the seven designs state 81 properties between them. Each implemented property has one primary property-based test (Hypothesis for Python, fast-check for TypeScript) tagged with its feature and property number.
- **Hooks** (`.kiro/hooks/`): run the core tests when a core file is saved, run all tests when a spec task is completed, block a write that contains a credential, and fail if `.kiro/` would be ignored by git.
- **Spikes** (`spikes/`): each unverified assumption about Crew became a small executable probe with a scrubbed, machine-readable result in `spikes/fixtures/`.

The mapping from each feature to its Kiro capability and its evidence is in [kiro-coverage.md](kiro-coverage.md).

## Related work

Crew ships two built-in apps that overlap with this idea, and Haunted House owes both a credit.

- **Spec Builder** runs approval-gated requirements, design and tasks. The room order in the house follows the same phases.
- **Agent Worlds** shows running agents as animated characters.

Both are Crew's own work, not ours. We read them to learn how Crew apps are put together and copied no code or art from either. What Haunted House adds is a view of each agent's authority: walls for path limits, doors for approvals, and a log you can replay.

## Original work

All characters, room art and the app icon are original to this project. There are no third-party images, fonts, sounds or music, and nothing is loaded from a remote host at run time. Provenance is recorded in [credits.md](credits.md) and `docs/assets-manifest.json`.

## Trade-offs

- **The house writes spec files itself.** Crew cannot drive Kiro's native spec engine, so the app emulates the phases and writes compatible files.
- **Ghosts are app-owned chat sessions, not spawned subagents.** A spawned subagent waits for an owner-only approval the app cannot see. An app-owned session lets the app show the prompt in the house and answer it after you approve.
- **Replay recomputes instead of reversing.** Seeking folds the log prefix again rather than undoing events. Demo logs are small, and this makes every cursor position provably equal to a fresh replay.
- **Cancel and "open the Crew session" ship switched off.** Their Crew contracts were verified against Crew's packaged code but not yet against a running gateway, so both controls report that the contract is unavailable instead of guessing.
- **Approved shell and git actions need macOS confinement.** They run only inside a no-fork sandbox profile. On a host without it, those actions are refused.
- **Mansions live under `~/workspace`.** Crew only allows agent working folders under a few roots.

## MVP and stretch

MVP: the Foyer, Study, Drafting Room and Workshop with their ghosts; doors and risky-action approvals; the séance log; the Attic replay with playback controls; the static replay; the install script; the permission freeze; and these documents.

Stretch, started only after every MVP gate and a full rehearsal pass: the Séance Room review loop (the Medium), Attic search, filters, bookmarks and export, sound, and cosmetic polish.

## Verification status

This section separates what was checked against a running Crew from what is so far checked only by automated tests. It is updated as checks are done; nothing is listed as verified live unless it was.

Checked against a running Crew gateway:

- Install, trust and enable of the foundation build (Crew 0.12.2, 2026-11-15): the status route answered, the UI bundle loaded, unsigned and forged requests were refused, and the backend listened on loopback only.
- The Crew behaviors recorded as "pass" in `.kiro/steering/tech.md`: signed proxy requests, app tokens, app-owned chat sessions and their approval prompts, and the agent deny rule that refuses an out-of-room write.

Checked by the offline release check, `scripts/check-release.sh` (all gates pass):

- The Python and UI test suites, including one property-based test for each implemented correctness property, and the type check.
- The first visit, walked end to end in the test harness over the real page with only the host client replaced: from the gate to an approved requirements door on the Warden's choices alone, once with pointer presses and once with the keyboard alone. The two requests that go out are compared with the ones the panels' own buttons send.
- The Warden's twelve correctness properties (what he says, what he may offer, live and replay parity, plain and Kiro words, the visitor's name, the project folder's name, the visit, the landing room, the stage layout, what was made, and the window fit), each with a fast-check test.
- Accessibility rules (axe) on the gate, the idea step, each pose, the stepped-back state, the labels, the word list and the list of what was made, in light, dark and reduced-motion states.
- The live UI bundle: it imports only host modules and a fresh build leaves the committed file unchanged.
- The static replay: its build, the publication gate, the transport-isolation tests and a local one-shot smoke request for the page, its module and the fixture.
- Live and replay parity in the test harness: the same root component, driven by the same canonical log through a backend double and through the fixture, shows the same house and the same Attic, and a record the backend has not acknowledged never appears in a replay.
- The permission freeze, the secret scan, the asset provenance check and the document checks.

Not yet checked against a running Crew; each needs the owner's live session:

- The complete room flow with real ghosts: Study, Drafting Room and Workshop runs, door approvals and risky-action approvals end to end.
- The first visit with real ghosts: the gate, "Build this" and the Warden's choices against a running gateway. The test harness walks it against a backend double.
- Three parallel Workshop ghosts on a real gateway.
- Delivery of the per-session label to the room tool servers through Crew's own sandbox.
- The clean install rehearsal of the final build, including the exact trust prompt and permission list a judge sees.

Not yet done because they need a real browser, a public repository or a person:

- The public replay site. The Pages workflow is written and tested locally; it has not run, and no public link exists yet.
- Screenshots and the demo video. None has been captured yet; see [assets-checklist.md](assets-checklist.md).
- Rendered contrast, and reflow of the open panels and the Foyer at small widths and at high zoom. The palette pairs are checked by calculation, not from pixels, and the browser run below measured the room and the guide only.

Checked in a real browser (headless Comet, 2026-11-17), numbers in `spikes/fixtures/warden-guide-layout.json`:

- The Warden is drawn twice as tall as a ghost. He and his balloon touch no working object, label or sheet; the open sheet and the house map lie inside the room; the room and the guide fit one window at 1280 by 720, 1440 by 900, 900 by 1100 and 1920 by 1080; nothing scrolls sideways down to 320 pixels. The same browser was then driven with real key presses and no pointer: Tab and Enter open the gate, enter the recording and press the Warden's choices, and `?` and Escape turn the labels on and off. The first runs of this check found four layout faults that no test without a layout engine could see (labels misplaced in one layout, two labels covering each other, two labels touching on a small room, and a two-pixel overflow); each was fixed before the numbers were recorded.
- The human originality review of the assets, and the submission itself.

Known limits of the live app today:

- **The feature brief is given once.** A ghost's task comes from the room's fixed prompt and skill, plus the idea given when the mansion is made: the Warden's "What do you want to build?" at a first visit, or the brief field of the Foyer's form. It is kept as `.kiro/specs/<spec>/brief.md`; the house has no control to change it afterwards.
- **Ordinary room-tool prompts are answered in Crew's dashboard.** The house shows and answers door approvals and risky-action approvals. A non-risky room tool call that Crew still asks about is answered only in Crew's own dashboard, not in the house.
- **A run needs the dashboard open to finish.** The end of a ghost's turn reaches the backend through the open page. With the dashboard closed no turn end is forwarded, so the run is not settled until the page is open again.
- **Cancel and "open the Crew session" are switched off.** Both report that their contract is unavailable until each has been verified against a running gateway.
- **Host hook shapes are unverified.** The theme, notification and sidebar-badge hooks follow Crew's documentation and shipped dashboard code. Their exact shapes have not been observed on a running dashboard; if a hook is absent the house falls back to doing nothing for that effect.

The dated gates for closing these are in [submission-checklist.md](submission-checklist.md).
