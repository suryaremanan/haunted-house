# Demo script

A timed walkthrough for the demo video. Planned length: 2 minutes 45 seconds (165 seconds), which leaves 15 seconds under the 3 minute limit for natural pacing or one retry.

The main route uses the static replay, so it works without Crew. The live route is optional and shown briefly near the end.

## Before recording

1. Build the static replay and check it: `bun run --cwd app/ui build:replay`, then `bun scripts/check-replay-artifact.mjs` and `bun scripts/smoke-replay-site.mjs --local`.
2. Open the replay page. Use the public Pages link once [publication-metadata.json](publication-metadata.json) lists it; until then serve `app/ui/dist-replay/` with any static file server.
3. For the optional live route: Crew 0.12.1 or later is running, the app is installed with `scripts/install-local.sh`, and it is enabled and trusted.
4. Set the browser window to 1280 by 720. Turn off notifications. No music and no sound effects: the MVP has no sound.
5. Rehearse once with a timer. If a beat runs long, cut words, not beats.

## Script

### 0:00–0:15 The problem and the premise

**Action:** Show the house map of the demo mansion, with nothing selected.

**Say:** "When you run several AI agents, a chat log does not show who is working, who is waiting for you, or what each one may touch. Haunted House turns a project into a house you can walk through."

**Expect:** The cutaway house with its rooms, each showing its ghost and state as text and an icon.

### 0:15–0:35 Open the mansion and read the rooms

**Action:** Move through the rooms on the house map with the arrow keys: Study, Drafting Room, Workshop, Attic.

**Say:** "Each room is a spec phase with its own ghost. The Study writes requirements, the Drafting Room writes the design, the Workshop plans and builds. Every ghost shows one of six states."

**Expect:** Focus moves room to room with a visible focus ring. Each room label names its phase, its door state and its ghost state.

### 0:35–1:05 A door and an approval: visible authority

**Action:** Open the room whose ghost is waiting. Show the approval request, the exact action it asks for, and the room's allowed paths.

**Say:** "Doors are approvals. This ghost is waiting: it asked for one exact action and cannot go on until I approve it. The walls are real too. A ghost reads and writes only inside its room's paths, and the backend enforces that."

**Expect:** The waiting ghost, the requested action, the approve and deny choices, and the sealed door of the next phase. In the static replay these controls are labelled read-only.

### 1:05–1:30 The Workshop: bounded parallel ghosts

**Action:** Open the Workshop. Point at the Foreman, the Tinkers and the paths each Tinker has claimed.

**Say:** "The Workshop runs up to three Tinkers at once. Each one claims the files of its task, so two ghosts never write the same file. One here is blocked and one failed, and the house says so plainly."

**Expect:** The task plan, up to three Tinkers with separate path claims, and distinct working, waiting, blocked and failed states.

### 1:30–2:15 The Attic: replay from the séance log

**Action:** Open the Attic. Press Play. Pause. Change the speed to 2×. Drag the seek control back to the middle, then press Next twice. Seek to the end.

**Say:** "Everything that happened is in the séance log, and replay reads only that log. I can play, pause, change speed and seek. Every position is rebuilt from the log, so the end state is always the same, however I get there."

**Expect:** The timeline advances one event at a time with the current event marked. The summary shows "Event n of N". At the end the house shows the same final state as before.

### 2:15–2:35 Static replay and the optional live app

**Action:** Show the address bar of the static replay page, then (optional live route) switch to the Crew dashboard: Apps, Library, Haunted House, and the trust prompt with its permission list.

**Say:** "What you just saw is a static page: no Crew, no account, read-only. To run it live, one script installs the app, and you enable and trust it yourself. It asks for the smallest set of permissions it uses."

**Expect:** The static replay page, then the live Haunted House page with "Backend reachable" in the status panel.

### 2:35–2:45 Built with Kiro, and close

**Action:** Show the `.kiro/specs/` folder with its seven specs, then the test run summary.

**Say:** "Seven Kiro specs, each correctness property backed by a property-based test. Haunted House: see what your agents may do, not only what they say."

**Expect:** The spec folders and a passing test summary.

## Fallbacks

- If the live Crew route is not ready or misbehaves, skip the live part of the 2:15 beat and stay on the static replay. Say that the live install path is in the README.
- If the public Pages link is not available, serve `app/ui/dist-replay/` locally and say so.
- If a replay control misbehaves on camera, press Restart and play from the start; every position is rebuilt from the log.
- Do not show a terminal with tokens, a home folder path or a private chat on screen.
