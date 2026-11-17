# WG-S2: the Warden's layout, rendered

**Question.** jsdom has no layout, so three requirements of the Warden guide cannot be proven there: that he is drawn at least twice as tall as a ghost (1.6), that his balloon lies outside the room and he overlaps it only inside the Guide Reserve (5.6, 5.7), and that nothing overlays anything or scrolls sideways on a narrow page (5.8).

**Method.** The static replay build is served from loopback and opened in headless Comet over the DevTools protocol. The page is walked the way a visitor walks it: Knock, "Watch demo-mansion get built", 40 records forward in the Attic, then into the first working room that holds a ghost, and into the Workshop for its two Doors. There the boxes of the room, the Warden, the balloon, every ghost figure, every pressable spot, every label (Reveal on), every toolbar control, the open room sheet and the house map sheet are read with `getBoundingClientRect`, in five windows: 1280 by 720 and 1440 by 900 (balloon beside the room), 900 by 1100 and 1920 by 1080 (balloon under the room), and 320 by 800 (narrow).

**Result.** `spikes/fixtures/warden-guide-layout.json`. Numbers only: no screenshot is kept.

- The Warden is exactly twice a ghost's height in the four wide windows, and more on the narrow page.
- He and his balloon touch no working object and no label, and no label touches another or a toolbar control. The balloon lies outside the room. The open sheet and the map sheet lie inside the room and touch neither of them.
- Beside the room, he stands inside the Guide Reserve.
- The room and the guide fit one window in the four wide windows. Nothing scrolls sideways in any of the five.

**What it found.** Four things no jsdom test could see, each fixed before the numbers were recorded:

1. With the balloon under the room and Reveal on, the labels lay under the room too, over the balloon and the Warden. An absolutely placed child of a grid is placed against its grid area, and the list still carried the area it has on a narrow page. It was given the room's area (`components/stage-layout.test.tsx` holds the rule).
2. In the Workshop, whose two Doors stand side by side, one Door's label covered the other's. The back-wall Door's label now sits a line higher.
3. On a small room the labels of the ledger and the bell touched. Labels are set a little smaller on a small room.
4. A pressed setting was two pixels taller than an unpressed one, which pushed the page two pixels past a 720-pixel window.

**By keyboard, in the same browser.** jsdom does not turn Enter on a button into a press, so the test suite's keyboard walk sends the press itself. Here the static replay was driven with real key events and no pointer event: Tab to the name field, a typed name and Enter open the Gate and put focus on the greeting; one Tab and Enter enter the recording; eleven Tabs reach the Warden's first choice in the room, and Enter plays the recording through its own bar; "Step back" and "Call the Warden" work on Enter and move focus as designed; `?` puts five labels on the room and Escape takes them off without leaving the mansion. The steps are in the fixture under `keyboardRun`.

**Limits.** One browser engine, one recording, one room. The property test of `stageFit` covers the sizes this run does not.
