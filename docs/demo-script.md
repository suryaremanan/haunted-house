# Demo script

A timed walkthrough for the demo video. Planned length: 2 minutes 45 seconds (165 seconds), which leaves 15 seconds under the 3 minute limit for natural pacing or one retry.

The main route uses the static replay, so it works without Crew. The live route is optional and shown briefly near the end.

## Before recording

1. Build the static replay and check it: `bun run --cwd app/ui build:replay`, then `bun scripts/check-replay-artifact.mjs` and `bun scripts/smoke-replay-site.mjs --local`.
2. Open the replay page. Use the public Pages link once [publication-metadata.json](publication-metadata.json) lists it; until then serve `app/ui/dist-replay/` with any static file server.
3. For the optional live route: Crew 0.12.1 or later is running, the app is installed with `scripts/install-local.sh`, and it is enabled and trusted.
4. Set the browser window to 1280 by 720. Turn off notifications. No music. Press Sound in the house toolbar before recording so the door creaks are captured; it is off by default.
5. Rehearse once with a timer. If a beat runs long, cut words, not beats.

## Script

### 0:00–0:15 The gate, the problem and the premise

**Action:** The page opens at the front gate. Type a name and press Knock.

**Say:** "When you run several AI agents, a chat log does not show who is working, who is waiting for you, or what each one may touch. Haunted House turns a project into a house you can walk through. This is the Warden. He keeps the keys."

**Expect:** The front door with its knocker, the Warden beside his balloon, one question ("Who is knocking?") and one Knock. After the knock he greets the visitor by name.

### 0:15–0:35 Into the house, room by room

**Action:** Press "Watch demo-mansion get built", then "Play or pause the recording". Press "See the whole house" and move through the rooms with the arrow keys: Study, Drafting Room, Workshop, Attic.

**Say:** "Each room is a spec phase with its own ghost. The Study writes requirements, the Drafting Room writes the design, the Workshop plans and builds. In every room the Warden says what is true now and what I can do about it, in plain words."

**Expect:** One painted room with the Warden in its corner and his balloon beside it; then the house map, where focus moves room to room with a visible focus ring. Each room label names its phase, its door state and its ghost state.

### 0:35–1:05 A door and an approval: visible authority

**Action:** Open the room whose ghost is waiting. Press "Go to the door". Show the approval request and the exact revision it covers. Press "Show Kiro's words".

**Say:** "Doors are approvals. The Warden holds out a key: this document waits for me, and nothing goes on until I open the door. Every choice he offers presses a control the house already has, and each says what pressing it does. One press shows Kiro's own word beside each plain one."

**Expect:** The Warden holding out a key, the waiting ghost, the proposal, the approve and reject choices, and the sealed door of the next phase. In the static replay these controls are labelled read-only and the Warden offers nothing that decides.

### 1:05–1:30 The Workshop: bounded parallel ghosts

**Action:** Go to the Workshop. Point at the Foreman, the Tinkers and the paths each Tinker has claimed. Press "Show me what I can press".

**Say:** "The Workshop runs up to three Tinkers at once. Each one claims the files of its task, so two ghosts never write the same file. When a ghost asks for something risky, the house stops it and the Warden holds it until I decide. One key labels everything in the room that works."

**Expect:** The task plan, up to three Tinkers with separate path claims, distinct working, waiting, blocked and failed states, and a text label on every working object of the painted room.

### 1:30–2:15 The Attic: replay from the séance log

**Action:** Open the Attic. Press Play. Pause. Change the speed to 2×. Drag the seek control back to the middle, then press Next twice. Seek to the end.

**Say:** "Everything that happened is in the séance log, and replay reads only that log. I can play, pause, change speed and seek. Every position is rebuilt from the log, so the end state is always the same, however I get there."

**Expect:** The timeline advances one event at a time with the current event marked. The summary shows "Event n of N". At the end the house shows the same final state as before.

### 2:15–2:35 Static replay and the optional live app

**Action:** Show the address bar of the static replay page, then (optional live route) switch to the Crew dashboard: Apps, Library, Haunted House, and the trust prompt with its permission list. At the live gate, knock, pick "A word counter" and show the project folder's name above "Build this".

**Say:** "What you just saw is a static page: no Crew, no account, read-only. To run it live, one script installs the app, and you enable and trust it yourself. A first visit asks one thing: what do you want to build?"

**Expect:** The static replay page, then the live Haunted House page with "Backend reachable" on its plate, the gate, and the idea step with the folder name shown before anything is made.

### 2:35–2:45 Built with Kiro, and close

**Action:** Show the `.kiro/specs/` folder with its eight specs, then the test run summary.

**Say:** "Eight Kiro specs, each correctness property backed by a property-based test. Haunted House: see what your agents may do, not only what they say."

**Expect:** The spec folders and a passing test summary.

## Fallbacks

- If the live Crew route is not ready or misbehaves, skip the live part of the 2:15 beat and stay on the static replay. Say that the live install path is in the README.
- If the public Pages link is not available, serve `app/ui/dist-replay/` locally and say so.
- If a replay control misbehaves on camera, press Restart and play from the start; every position is rebuilt from the log.
- Do not show a terminal with tokens, a home folder path or a private chat on screen.
