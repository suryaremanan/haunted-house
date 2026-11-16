// axe-core over a rendered container (Spec 6 task 8.1). Not shipped: only
// *.test.tsx files import it. It runs every axe rule that jsdom can evaluate,
// next to the structural rules in `test/a11y-audit.ts`.
import axe from 'axe-core'

/**
 * Rules turned off because they need layout or painted colour, which jsdom
 * does not compute (every box is 0 by 0 and no style cascade is painted):
 * - `color-contrast`, `link-in-text-block`: need computed foreground and
 *   background colours. The palette tests compute contrast from the tokens.
 * - `target-size`: needs element boxes.
 * - `scrollable-region-focusable`: needs scroll sizes.
 * Every other rule runs.
 */
export const LAYOUT_RULES = ['color-contrast', 'link-in-text-block', 'target-size', 'scrollable-region-focusable'] as const

/**
 * Rules whose "needs review" (incomplete) results count as failures here, as
 * the reason axe gives is a known defect rather than something it could not
 * see: `aria-valid-attr-value` reports an `aria-level` above 6 this way, which
 * screen readers do not support. Other incomplete results (for example
 * `label-content-name-mismatch`, an experimental rule) are not failures.
 */
export const REVIEW_AS_FAILURE = ['aria-valid-attr-value'] as const

const OPTIONS: axe.RunOptions = {
  resultTypes: ['violations', 'incomplete'],
  rules: Object.fromEntries(LAYOUT_RULES.map((id) => [id, { enabled: false }])),
}

function lines(results: axe.Result[], suffix = ''): string[] {
  return results.flatMap((result) => result.nodes.map((node) => `${result.id}: ${node.target.join(' ')} (${result.help})${suffix}`))
}

/** One line per failing node: `rule-id: selector (help)`. Empty when nothing fails. */
export async function axeViolations(context: Element): Promise<string[]> {
  const results = await axe.run(context, OPTIONS)
  const review = results.incomplete.filter((result) => (REVIEW_AS_FAILURE as readonly string[]).includes(result.id))
  return [...lines(results.violations), ...lines(review, ' [needs review]')]
}
