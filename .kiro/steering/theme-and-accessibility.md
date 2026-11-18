---
inclusion: fileMatch
fileMatchPattern: ["app/ui/**", "app/assets/**", "docs/demo-script.md"]
---

# Theme and accessibility

## Tone
Menacing, never harmful. The house is old and watchful: candlelight, dust, creaky doors, tall still figures. The menace is aimed at ghosts that stray, never at the person using the house. No gore, no jump scares, no flashing, no screams.

## Visual style
- Original SVG art only. The house is a cutaway drawing; each ghost has its own silhouette.
- The house is night in every theme: its own night palette (`house-palette.ts`), never a pale Crew background. Words on the house's own paper (balloon, tags, plates) are bone ink on dark slate. Crew's font is kept.
- Frightening by dread and scale, never by shock. Every effect shows a real state (spec `dread-and-night`, effect table in its design):
  - Light is status. A room is dark and moonlit when nothing happens, a candle pool burns where a ghost works, light leaks under a door that waits. On the map a lit window means work, a dark one idle, a red glow something held.
  - The Warden stands small at the edge when nothing waits and steps forward, eyes brighter, shadow across the floor, when something needs you. A held ghost hangs from his chain.
  - Ghosts have hollow eyes and torn hems; each state keeps its own silhouette and its text label.
  - Sealed doors carry a chain and a wax seal, broken when the door opens. Cobwebs lie where no ghost has worked.
  - Fog, dust and rain are atmosphere only: they lie under every control and take no pointer.
- One Fright setting: Calm (the house as it was, under a night sky), Eerie (default) and Dread. It changes no word, control, request or announcement.
- Text contrast at least 4.5:1; UI parts and focus rings at least 3:1 (WCAG 2.2 AA).
- Never show state by color alone. Each ghost state has its own pose or icon plus a text label.

## Motion
- Honor `prefers-reduced-motion`, and offer an in-app "Still house" toggle that turns off all non-essential motion.
- Default motion is small: an idle float, a flicker when a ghost starts work. Nothing loops faster than once every 2 seconds.
- Nothing flashes more than 3 times per second. No parallax, no screen shake.
- Still House and reduced motion stop all non-essential motion at every Fright level. Only `transform` and `opacity` move. The one pointer-following effect is the Gate knocker's eyes, and only while motion is allowed.

## Sound
Off by default. Only original or CC0 sounds, credited in docs/credits.md. No copyrighted music.
- All synthesised in the browser. Wind always; at Eerie and Dread a low drone, and a slow heartbeat while something waits on you (48 to 90 beats a minute, faster as more waits, stopping when nothing does). Every one rises from silence; nothing starts loud.

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
Short and plain. Adult and exact. No baby talk. Spooky flavor is welcome in titles, but every action and state also says what it means, for example "Sealed door: approve the requirements to open it."
