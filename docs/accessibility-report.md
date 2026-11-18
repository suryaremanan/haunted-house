# Accessibility report

What was checked, how, and what was found, on 18 Nov 2026. Every number here comes from a run recorded in this repository. Nobody using a screen reader or switch access has tested the house yet; that is listed at the end.

## Summary

| Check | Tool | Scope | Result | Evidence |
|---|---|---|---|---|
| Every axe rule jsdom can evaluate | axe-core in jsdom | 15 house states (Gate, hall, every room, open sheets, Word Book, map, live and replay) | No violation | `app/ui/src/house-accessibility.axe.test.tsx` |
| Colour contrast, target size and every WCAG 2.0, 2.1 and 2.2 A/AA rule | axe-core inside headless Comet, on the built static replay | 14 states: the Gate; the Workshop at the held moment and the house at the end, at Calm, Eerie and Dread; the open Attic; a practice question; at 1280×720 and 390×844 | No colour-contrast or target-size violation. One finding, explained below | `spikes/fixtures/axe-replay.json`, `scripts/axe-replay.mjs` |
| Keyboard: Tab reaches every control in reading order, with Still House, reduced motion and motion on | Testing Library | Every room, ghost, door, panel and decision | Pass | `app/ui/src/house-keyboard.test.tsx` |
| A first visit to an approved door by keyboard alone | Testing Library | Gate to requirements door | Pass | `app/ui/src/first-visit-walk.test.tsx` |
| Practice mode by keyboard alone | Testing Library | All six decisions of the demo | Pass | `app/ui/src/replay-practice.test.tsx` |
| One polite live region; announcements only within the interruption budget | Testing Library | Live and replay | Pass | `app/ui/src/house-accessibility.test.tsx` |
| Palette contrast, every text pair at least 4.5:1 and every boundary 3:1 | Calculation from the tokens | Night palette and night paper | Pass | `app/ui/src/components/house-palette.test.ts`, `app/ui/src/components/house-stage.test.tsx` |
| Reflow: no sideways scroll; nothing atmospheric covers a control | Headless Comet | 48 states: four window sizes down to 390 wide, three Fright levels, Still House on and off | Pass | `spikes/fixtures/dread-render.json` |
| Motion: only transform and opacity move, no loop under two seconds, all stopped by Still House or reduced motion | Static check of every sheet | All stylesheets | Pass | `app/ui/scripts-tests/check-house-ui-contract.test.ts` |

## The one browser finding

axe's `label-content-name-mismatch` rule reports the Warden's choices (12 times, the same buttons in each state). Each choice shows a bold label ("Play or pause the recording") and a second line saying what pressing it does. The button's accessible name is the bold label, and the second line is its description (`aria-describedby`). The rule wants the whole visible text inside the name. WCAG 2.5.3 Label in Name asks that the visible *label* be in the name, which it is, word for word. axe marks this rule as experimental, and `app/ui/src/test/axe-audit.ts` already treats it as advisory. It is recorded here rather than hidden.

## Not yet checked

- A person using VoiceOver, NVDA or a switch has not used the house.
- Contrast was measured on the static replay. The live app in Crew uses the same night palette, but it was not measured inside the Crew dashboard.
