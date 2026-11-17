# Credits

Everything a judge sees or installs is listed here with its origin. The machine-readable record is [assets-manifest.json](assets-manifest.json), and `scripts/check-assets.py` fails if a distributed media file has no entry there.

## Visual assets

| File | What it is | Creator | License | Source |
|---|---|---|---|---|
| `app/assets/icon.png` | App icon, 256 × 256: a small amber house with a smiling ghost in the doorway | Haunted House contributors | Original | Made for this project |

The house, rooms, doors, objects and ghosts in the interface are drawn in code as original SVG (`app/ui/src/components/house-art.tsx`). They are not separate image files. No third-party image, icon set artwork, font or texture is distributed, and nothing is loaded from a remote host at run time. Interface icons come from `lucide-react`, which the Crew dashboard supplies at run time; see below.

Screenshots and the video thumbnail are not captured yet. Each will be an original capture of this interface and will be added to this table and to the manifest when it exists. Their status is tracked in [assets-checklist.md](assets-checklist.md).

## Audio

No audio file ships. The house's optional sounds (a door creak, a knock, a latch, a draught, two small bells and a moan) are synthesised in the browser by `app/ui/src/adapters/house-sound.ts` from oscillators and filtered noise written for this repository. There is no sample, no music and no recording. Sound is off on every visit until you press Sound.

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
