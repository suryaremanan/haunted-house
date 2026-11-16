# Assets checklist

The icon, screenshots and video thumbnail for the submission. A row is `complete` only when its file exists and has a provenance entry in [assets-manifest.json](assets-manifest.json); `scripts/check-submission.py` enforces that in both directions. No screenshot has been captured yet, so those rows are `pending`. The interface they will show is built and passes its tests; only the capture is missing.

## Assets

| Asset | Path | Dimensions | Theme | Alt text | Provenance | Status |
|---|---|---|---|---|---|---|
| `icon` | `app/assets/icon.png` | 256 × 256 | n/a | A small amber house with a rust-red roof and a round attic window; a smiling pale ghost stands in the glowing arched doorway. | Original | `complete` |
| `house-light` | `docs/screenshots/house-light.png` | 1200 × 675 | light | Light theme: the Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon. | Original | `pending` |
| `house-dark` | `docs/screenshots/house-dark.png` | 1200 × 675 | dark | Dark theme: the same Haunted House cutaway map with its rooms, doors and ghosts, each showing its state as text and an icon. | Original | `pending` |
| `attic-replay` | `docs/screenshots/attic-replay.png` | 1200 × 675 | light | The Attic replay panel: play, pause, speed and seek controls above an ordered event timeline with the current event marked. | Original | `pending` |
| `door-approval` | `docs/screenshots/door-approval.png` | 1200 × 675 | light | A sealed door waiting for approval: the room shows the waiting ghost, the requested action and the approve and deny choices. | Original | `pending` |
| `hero-light` | `app/assets/hero-light.png` | 1200 × 675 | light | The Haunted House cutaway drawing with friendly ghosts at work in their rooms. | Original | `not_planned` |
| `video-thumbnail` | `docs/screenshots/video-thumbnail.png` | 1280 × 720 | dark | The Haunted House cutaway drawing in dark theme, used as the demo video thumbnail. | Original | `pending` |

The hero image is optional. It is `not_planned` until the four screenshots are done; if it is made, change its row and add its provenance entry. Sizes follow Crew's publishing guide (screenshots 1200 pixels wide at 16:9, hero 1200 × 675).

## Capture steps

Screenshots must be real captures of the built interface. A test-environment layout is not screenshot evidence, and no file may be added by hand-drawing or editing.

The capture plan (file names, sizes, themes, the fixture digest and alt text) is printed by:

```bash
node scripts/capture-submission-assets.mjs --plan
```

The capture command itself stays closed until the media-capture spike (RS-S3, task 1.3 of the `replay-and-submission` spec) has chosen and proven a development-only browser runner. Until then `node scripts/capture-submission-assets.mjs` exits with `capture_unavailable` and writes nothing.

For each pending row, once the runner exists:

1. Build the static replay: `bun run --cwd app/ui build:replay`, then `bun scripts/check-replay-artifact.mjs`.
2. Serve `app/ui/dist-replay/` locally and open it at the row's size and theme.
3. Put the page in the row's state: the house map at the final event (`house-light`, `house-dark`, `video-thumbnail`), the Attic paused at a middle event (`attic-replay`), or the replay paused at the approval request (`door-approval`).
4. Save the capture at the row's path. Confirm no browser chrome, bookmark, account name or local path is visible.
5. Add an entry for the file to `docs/assets-manifest.json` (provenance `original`, the alt text from this table) and a row to the table in [credits.md](credits.md).
6. Set the row to `complete` and run `python3 scripts/check-assets.py` and `python3 scripts/check-submission.py`.

## Human review

Static checks cannot prove authorship. Before submission a person confirms each item and records the date here.

- [ ] Every image is an original capture or drawing of this project's own interface.
- [ ] No third-party name, logo, character, artwork, sound or music appears in any asset.
- [ ] No gore, jump scare or scream; the tone is cozy-spooky.
- [ ] Light and dark screenshots show the same state, and state is readable without color.
- [ ] No credential, token, account name or home folder path is visible in any capture.
