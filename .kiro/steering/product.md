# Product: Haunted House

## Vision
Haunted House is a spatial home for AI agents. You walk through a house instead of reading a chat log. Each room is a phase of spec-driven development, each ghost is an agent with its own job and limits, and you can see at a glance what every ghost is doing. It is not a chatbot with a face.

Built for Kiroween 2026 (Resurrection category): the 1990s "house as interface" idea, remade for the agent era.

## Positioning
Crew already ships two built-in apps that overlap with this idea: Spec Builder (approval-gated requirements, design and tasks) and Agent Worlds (running agents shown as animated characters). Haunted House adds one thing neither has: it makes each agent's authority visible. Walls are a ghost's path limits, doors are your approvals, and the séance log lets you replay everything that happened. The write-up credits both built-in apps by name.

## Who it is for
- Developers who run several AI agents and lose track of what each one is doing.
- Hackathon judges, who must understand the idea in under 3 minutes.

## The metaphor
| House | Means |
|---|---|
| Mansion | One software project. Entering a new mansion creates the project folder and its `.kiro/specs/<name>/` |
| Room | One spec phase, with its own ghost and its own allowed paths |
| Ghost | A Kiro custom agent run by Crew, with its own steering and tool permissions |
| Door | An approval gate. It opens only when you approve the room's output |
| Séance log | Append-only record of every tool call, state change and decision. Replay reads only this log |
| Warden | The guide. The guardrails made visible: he holds a ghost that strays and hands you the key when a door waits. A drawing, not an agent; it has no authority |

## Rooms
| Room | Phase | Output | Ghost | Scope |
|---|---|---|---|---|
| Foyer | Pick or create a mansion | Mansion folder | none (UI only) | MVP |
| Study | Requirements | `requirements.md` (EARS) | The Archivist | MVP |
| Drafting Room | Design and correctness properties | `design.md` | The Draughtsman | MVP |
| Workshop | Task plan, then implementation by parallel ghosts | `tasks.md`, code | The Foreman and up to 3 Tinkers | MVP |
| Séance Room | Review and test loop; sends work back until it passes | Review verdicts | The Medium | Stretch (first) |
| Attic | Browse and replay past séance logs | none | none | MVP for replay; extras are stretch |

Character names are placeholders. All characters and art are original.

## Ghost states
| State | Meaning |
|---|---|
| idle | No assigned work |
| working | A run is in progress |
| waiting | Needs your approval (a door or a tool call) |
| blocked | Can't continue for a reason other than approval (locked door upstream, missing input, stalled run) |
| failed | Run ended in an error or ran out of retries |
| done | Run finished and its output is ready |

## Product rules (never break these)
1. Doors open only on an explicit user approval. Nothing auto-advances.
2. Phase order: design starts only after requirements are approved; tasks start only after design is approved.
3. A ghost reads and writes only inside its room's allowed paths.
4. A risky action (shell, delete, git write, any write outside the room's paths) runs only with a matching approval event.
5. Creating a mansion is idempotent and never overwrites an existing project.
6. Every decision and tool call lands in the séance log. Replay is rebuilt from the log alone.
7. Ghosts stay quiet unless they are waiting, blocked or failed, or you asked. See theme-and-accessibility.md.
8. Spatial first: rooms, objects and doors are the main interface. Chat is a link out to the Crew session, not the home screen.

## Out of scope
Multi-user houses, cloud hosting of ghosts, voice, and driving Kiro IDE's native spec engine (the house writes compatible files instead).

## Legal and originality
No Microsoft or "Bob" names, logos, characters, art or sounds anywhere in the app or its assets. No copyrighted music. Third-party assets only if CC0 or similar, credited in `docs/credits.md`.
