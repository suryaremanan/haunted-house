// The Warden's balloon, as a sheet of its own (Spec 8, Requirement 3). The
// same balloon speaks in every room, in the Foyer hall and at the Gate, so its
// rules are kept apart from the stage's: the house sheet includes them, and so
// does the page before a mansion is open.
//
// It reads the Scene Palette (`--hh-sc-*`) and one font variable
// (`--hh-font-serif`); whoever includes it defines both. Text is always
// `ink` on `balloon`, far above 4.5:1 in either theme.
const tint = (token: string, percent: number) => `color-mix(in srgb, var(${token}) ${percent}%, transparent)`

export const GUIDE_BALLOON_STYLES = `
.hh-guide-balloon { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; color: var(--hh-sc-ink); background: var(--hh-sc-balloon);
  border: 2px solid var(--hh-sc-ink); border-radius: 10px; box-shadow: 3px 4px 0 ${tint('--hh-sc-ink', 55)}; }
/* What is true now stays in view. What can be done lies under it, and scrolls where the layout gives the balloon a height. */
.hh-guide-head, .hh-guide-body { display: grid; gap: 6px; min-width: 0; padding: 0 16px; }
.hh-guide-head { flex: none; padding-top: 12px; padding-bottom: 6px; }
.hh-guide-body { flex: 0 1 auto; min-height: 0; padding-bottom: 12px; }
.hh-guide-head:empty, .hh-guide-body:empty { display: none; }
.hh-guide-balloon p, .hh-guide-balloon ul, .hh-guide-balloon dl, .hh-guide-balloon dd { margin: 0; }
.hh-guide-status { font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.125rem; line-height: 1.25; overflow-wrap: anywhere; }
.hh-guide-status:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 3px; border-radius: 2px; }
.hh-guide-terms { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 0.8125rem; }
.hh-guide-term { display: contents; }
.hh-guide-what { font: inherit; font-family: var(--hh-font-serif); color: var(--hh-sc-ink); background: none; border: 0; padding: 0;
  text-decoration: underline; cursor: pointer; }
.hh-guide-what:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }
.hh-guide-about { flex-basis: 100%; font-size: 0.875rem; line-height: 1.35; padding: 4px 8px; border-left: 4px solid var(--hh-sc-ink); }
.hh-guide-note { font-size: 0.875rem; line-height: 1.35; padding: 4px 8px; border-left: 4px solid var(--hh-sc-ink); background: ${tint('--hh-sc-brass', 30)}; }
.hh-guide-question { font-family: var(--hh-font-serif); font-size: 0.9375rem; }
.hh-guide-options { list-style: none; padding: 0; display: grid; gap: 2px 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); min-width: 0; }
.hh-guide-option { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; width: 100%; min-width: 0; font: inherit;
  font-family: var(--hh-font-serif); text-align: left; color: var(--hh-sc-ink); background: transparent; border: 2px solid transparent; border-radius: 10px;
  padding: 3px 10px 3px 4px; cursor: pointer; }
.hh-guide-option:hover { border-color: var(--hh-sc-ink); background: ${tint('--hh-sc-brass', 40)}; }
.hh-guide-option:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 1px; background: ${tint('--hh-sc-brass', 40)}; }
.hh-guide-bullet { width: 1.25rem; aspect-ratio: 1; margin-top: 1px; border-radius: 50%; border: 2px solid var(--hh-sc-ink);
  background: radial-gradient(circle at 35% 30%, var(--hh-sc-moon), var(--hh-sc-brass) 62%); }
.hh-guide-option-words { display: grid; min-width: 0; }
.hh-guide-option-label { font-size: 1rem; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.hh-guide-consequence { font-size: 0.8125rem; line-height: 1.3; overflow-wrap: anywhere; }
.hh-guide-kiro { font-weight: 400; font-style: italic; }
.hh-guide-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 2px; }
.hh-guide-foot-button, .hh-stage-setting, .hh-stage-call { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--hh-font-serif);
  font-size: 0.875rem; font-weight: 700; color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 999px;
  padding: 1px 12px; cursor: pointer; }
.hh-guide-foot-button:hover, .hh-stage-setting:hover, .hh-stage-call:hover { background: var(--hh-sc-brass); }
.hh-guide-foot-button:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }
.hh-stage-setting:focus-visible, .hh-stage-call:focus-visible { outline: 3px solid var(--hh-sc-lamp); outline-offset: 2px; }
/* Pressed: brass and a double border. The same height as unpressed, so pressing one never moves the row. */
.hh-stage-setting[aria-pressed='true'] { background: var(--hh-sc-brass); border-style: double; border-width: 3px; padding: 0 11px; }
.hh-guide-everything { display: grid; gap: 8px; padding-top: 8px; border-top: 2px dashed var(--hh-sc-ink); min-width: 0; }
.hh-guide-book-title { font-family: var(--hh-font-serif); font-size: 0.9375rem; font-weight: 700; }
.hh-guide-book { display: grid; gap: 6px; font-size: 0.8125rem; line-height: 1.35; }
.hh-guide-book dt { font-weight: 700; }
.hh-guide-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`
