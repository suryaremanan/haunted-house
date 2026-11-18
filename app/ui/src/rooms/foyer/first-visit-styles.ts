// The first visit, before a mansion is open (Spec 8, Requirements 9 and 10):
// the Warden beside his balloon at the Gate and in the Foyer hall, the Gate's
// one field and Knock, and the Idea Step. The balloon's own rules are in
// components/guide-balloon-styles.ts; the page includes both.
//
// Everything here is ink on the balloon's colour or the balloon's colour on
// ink: the two pairs of the Scene Palette that carry text. Nothing moves.
// A field is a shade darker than the night paper it sits on, so the words typed in it read as ink on slate.
const field = `color-mix(in srgb, var(--hh-sc-balloon) 70%, black)`

export const FIRST_VISIT_STYLES = `
/* The Warden and his balloon. On a narrow page he stands under it, small; on a wide one beside it, at full height. */
.hh-hall-guide { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; align-items: end; min-width: 0; }
.hh-hall-guide .hh-guide-balloon { min-width: 0; }
.hh-hall-own { color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px; padding: 12px 16px; min-width: 0; }
.hh-hall-keeper { display: flex; align-items: flex-end; gap: 10px; min-width: 0; }
/* His drawing fills this box, so the box is what places it. */
.hh-hall-warden { position: relative; display: block; flex: none; width: clamp(56px, 16vw, 88px); aspect-ratio: 200 / 300; }
.hh-hall-caption { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.hh-hall-pose { margin: 0; padding: 2px 10px; font-family: var(--hh-font-serif); font-size: 0.8125rem; line-height: 1.3;
  color: var(--hh-sc-ink); background: var(--hh-sc-balloon); border: 1px solid var(--hh-sc-ink); border-radius: 4px; }
.hh-foyer-guide { margin: 0 0 14px; }

/* The Gate's one field and its Knock; the Idea Step's field and its "Build this". They sit in the balloon. */
.hh-gate-form, .hh-idea { display: grid; gap: 6px; min-width: 0; margin: 0; }
.hh-gate-question, .hh-idea-field label { font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.0625rem; line-height: 1.25; }
.hh-idea-field { display: grid; gap: 4px; min-width: 0; }
.hh-gate-name, .hh-idea-field textarea { box-sizing: border-box; width: 100%; max-width: 24rem; font: inherit; color: var(--hh-sc-ink); background: ${field};
  border: 2px solid var(--hh-sc-ink); border-radius: 6px; padding: 6px 10px; }
.hh-idea-field textarea { max-width: none; min-height: 4.5rem; resize: vertical; }
.hh-gate-name:focus-visible, .hh-idea-field textarea:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 2px; }
.hh-idea-field textarea[aria-invalid='true'] { border-width: 3px; }
.hh-gate-hint, .hh-idea-hint { font-size: 0.8125rem; line-height: 1.3; overflow-wrap: anywhere; }
.hh-gate-actions, .hh-idea-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 4px; }
.hh-gate-knock { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-family: var(--hh-font-serif); font-weight: 700; font-size: 1.0625rem;
  color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 2px solid var(--hh-sc-ink); border-radius: 6px; padding: 5px 18px;
  box-shadow: 0 3px 0 var(--hh-sc-ink); cursor: pointer; }
.hh-gate-knock:hover { background: var(--hh-sc-moon); }
.hh-gate-knock:focus-visible { outline: 3px solid var(--hh-sc-ink); outline-offset: 3px; }
.hh-gate-knock[aria-disabled='true'] { cursor: not-allowed; opacity: 0.6; }
.hh-idea-examples { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 8px; }
.hh-idea-error { display: flex; align-items: flex-start; gap: 6px; margin: 0; padding: 4px 8px; font-size: 0.875rem; font-weight: 600; line-height: 1.35;
  border-left: 4px solid var(--hh-sc-ink); overflow-wrap: anywhere; }
.hh-idea-error svg { flex: none; margin-top: 2px; }
.hh-idea-name { margin: 0; font-size: 0.9375rem; overflow-wrap: anywhere; }
.hh-idea-name code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }

@media (min-width: 900px) {
  .hh-hall-guide { grid-template-columns: minmax(0, 1fr) auto; column-gap: 22px; }
  .hh-hall-keeper { display: grid; justify-items: center; gap: 6px; width: 9.5rem; text-align: center; }
  .hh-hall-warden { width: 9.5rem; }
  .hh-hall-caption { justify-content: center; }
  .hh-hall-guide .hh-guide-balloon::after { content: ''; position: absolute; right: -11px; bottom: 5.5rem; width: 18px; aspect-ratio: 1; background: var(--hh-sc-balloon);
    border-top: 2px solid var(--hh-sc-ink); border-right: 2px solid var(--hh-sc-ink); transform: rotate(45deg); }
}
`
