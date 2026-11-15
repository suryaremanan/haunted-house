---
inclusion: fileMatch
fileMatchPattern: ["app/ui/**", "app/assets/**", "docs/demo-script.md"]
---

# Theme and accessibility

## Tone
Cozy-spooky, not horror. Candlelight, dust, creaky doors, friendly ghosts. No gore, no jump scares, no screams.

## Visual style
- Original SVG art only. The house is a cutaway drawing; each ghost has its own silhouette.
- Build on Crew's theme variables so the house works in light and dark mode. Our accents sit on top.
- Text contrast at least 4.5:1; UI parts and focus rings at least 3:1 (WCAG 2.2 AA).
- Never show state by color alone. Each ghost state has its own pose or icon plus a text label.

## Motion
- Honor `prefers-reduced-motion`, and offer an in-app "Still house" toggle that turns off all non-essential motion.
- Default motion is small: an idle float, a flicker when a ghost starts work. Nothing loops faster than once every 2 seconds.
- Nothing flashes more than 3 times per second. No parallax, no screen shake.

## Sound
Off by default. Only original or CC0 sounds, credited in docs/credits.md. No copyrighted music.

## Keyboard
- Tab reaches every room, door, ghost and approval button, in reading order.
- Arrow keys move between rooms on the house map. Enter opens. Escape closes a panel and returns focus to where it came from.
- Everything focusable has a visible focus ring.
- A "Needs you" shortcut jumps to the first ghost that is waiting or failed.

## Screen readers
- The house map is a navigation list of rooms. Each room's label includes its phase, door state and ghost state.
- One polite live region, used only for events that pass the interruption budget.

## Interruption budget
Ghosts stay quiet unless one of these is true:
1. A ghost is waiting for your approval.
2. A ghost is blocked.
3. A ghost failed.
4. You asked: you opened the room or selected the ghost.

Everything else (progress, streaming text, tool calls) is ambient. It shows in place in the room, never as a toast or a sound.
- Toasts (`useNotify`) only for items 1 to 3, one per ghost per event. Several within 10 seconds merge into one summary.
- The sidebar badge (`useNavBadge`) shows how many things are waiting on you, nothing else.
- Interruptions make no sound unless the user turned sound on.

## Copy
Short and plain. Spooky flavor is welcome in titles, but every action and state also says what it means, for example "Sealed door: approve the requirements to open it."
