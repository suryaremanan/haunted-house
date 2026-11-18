# Credits

Everything a judge sees or installs is listed here with its origin. The machine-readable record is [assets-manifest.json](assets-manifest.json), and `scripts/check-assets.py` fails if a distributed media file has no entry there.

## Visual assets

| File | What it is | Creator | License | Source |
|---|---|---|---|---|
| `app/assets/icon.png` | App icon, 256 × 256: a small amber house with a smiling ghost in the doorway | Haunted House contributors | Original | Made for this project |

The house, rooms, doors, objects and ghosts in the interface are drawn in code as original SVG (`app/ui/src/components/house-art.tsx`). They are not separate image files. No third-party image, icon set artwork, font or texture is distributed, and nothing is loaded from a remote host at run time. Interface icons come from `lucide-react`, which the Crew dashboard supplies at run time; see below.

The Warden, the guide who stands in every room, at the gate and in the Foyer, is an original character drawn in code (`WardenArt` in `app/ui/src/components/room-paint.tsx`): a hooded figure with lantern eyes, a ring of keys and a trailing chain, in five still poses. The painted rooms and the front door are in the same file. He is based on no existing character, mascot or assistant.

Screenshots and the video thumbnail are not captured yet. Each will be an original capture of this interface and will be added to this table and to the manifest when it exists. Their status is tracked in [assets-checklist.md](assets-checklist.md).

## The demo recording

`fixtures/replay/demo.jsonl`, the séance log the public replay plays, is scripted, not recorded from a live run. `scripts/build_replay_fixture.py` writes it from a fixed story about an invented `demo-mansion`, using the backend's own event builders and the same validate, redact, sequence and hash pipeline a live append goes through. It holds no recorded Crew data. Its 91 records run in two halves: up to record 64 every ghost state shows at once and Tinker 2 waits on a test command; after it, the owner refuses that command, Tinker 2 asks again for less, the owner releases it, the work finishes and the last door opens.

## Audio

No audio file ships. The house's optional sounds (a door creak, a knock, a latch, a draught, two small bells, a moan, and at the Eerie and Dread levels a low drone and a heartbeat) are synthesised in the browser by `app/ui/src/adapters/house-sound.ts` from oscillators and filtered noise written for this repository. There is no sample, no music and no recording. Sound is off on every visit until you press Sound.

## Software acknowledgements

Haunted House is MIT licensed. It is built with, but does not redistribute the source of, these projects:

- React, React DOM and lucide-react: supplied by the Crew dashboard at run time for the live app, and bundled into the static replay build.
- Vite, Vitest, Testing Library, jsdom and fast-check: UI build and tests.
- pytest, Hypothesis and aiohttp: backend tests. The backend runs on the Python and aiohttp that Crew bundles.
- Kiro and Kiro Crew: the IDE this repo was built in and the platform the app runs on.

Exact versions are in `app/ui/bun.lock` and `requirements-dev.txt`.

## Related work

Crew's built-in **Spec Builder** and **Agent Worlds** apps are related work and are credited by name. Spec Builder runs approval-gated requirements, design and tasks; Agent Worlds shows running agents as animated characters. Both belong to Crew. We read them to learn how Crew apps work and copied no code, characters or art from either.

The "house as interface" idea dates from 1990s desktop software. Haunted House uses the idea only. It uses no name, logo, character, artwork or sound from any earlier product.
