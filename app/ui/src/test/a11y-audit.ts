// Structural accessibility rules checked on a rendered container (Spec 6 task
// 8.1). These are the rules the house depends on, written out so they run in
// jsdom without a rule engine. Not shipped. Color contrast is not here: jsdom
// cannot compute it, and the palette tests calculate it from the tokens.

/**
 * The accessible name of an element, by the parts of the algorithm the house
 * uses: `aria-labelledby`, then `aria-label`, then a form label, then content
 * that is not hidden from assistive technology.
 */
function computeAccessibleName(element: Element, fromContent = true): string {
  const root = element.getRootNode() as Document | ShadowRoot
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy !== null) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => (id === '' ? '' : visibleText(root.querySelector(`[id="${id}"]`))))
      .join(' ')
      .trim()
    if (text !== '') return text
  }
  const label = element.getAttribute('aria-label')
  if (label !== null && label.trim() !== '') return label.trim()
  if (element.matches('input, select, textarea')) {
    const id = element.getAttribute('id')
    const explicit = id === null || id === '' ? null : root.querySelector(`label[for="${id}"]`)
    return visibleText(explicit ?? element.closest('label'))
  }
  // Landmarks, regions and dialogs take their name from a label only, never from what they hold.
  return fromContent ? visibleText(element) : ''
}

function visibleText(node: Node | null): string {
  if (node === null) return ''
  if (node.nodeType === 3) return node.textContent ?? ''
  if (node.nodeType !== 1) return ''
  const element = node as Element
  if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden')) return ''
  return Array.from(element.childNodes, visibleText).join('').replace(/\s+/g, ' ').trim()
}

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"], [role="timer"], [role="marquee"], output'
const ID_REFERENCES = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'for']

function describe(element: Element): string {
  const id = element.id === '' ? '' : `#${element.id}`
  const classes = element.classList.length === 0 ? '' : `.${Array.from(element.classList).join('.')}`
  return `${element.tagName.toLowerCase()}${id}${classes}`
}

/** Every rule violation in `container`, as readable lines. An accessible page returns []. */
export function auditAccessibility(container: ParentNode): string[] {
  const problems: string[] = []
  const all = Array.from(container.querySelectorAll<HTMLElement>('*'))

  // Exactly one live region, explicit or implicit.
  const live = Array.from(container.querySelectorAll(LIVE))
  if (live.length !== 1) problems.push(`live regions: expected 1, found ${live.length} (${live.map(describe).join(', ')})`)

  // Unique ids, and every id reference resolves.
  const ids = new Map<string, number>()
  for (const element of all) if (element.id !== '') ids.set(element.id, (ids.get(element.id) ?? 0) + 1)
  for (const [id, count] of ids) if (count > 1) problems.push(`duplicate id "${id}" (${count})`)
  for (const element of all) {
    for (const attribute of ID_REFERENCES) {
      const value = element.getAttribute(attribute)
      if (value === null) continue
      for (const id of value.split(/\s+/).filter((part) => part !== '')) {
        if (!ids.has(id)) problems.push(`${describe(element)} ${attribute} names a missing id "${id}"`)
      }
    }
  }

  // Interactive elements: native, named, not nested, no positive tabindex.
  for (const element of Array.from(container.querySelectorAll<HTMLElement>(INTERACTIVE))) {
    if (element.closest('svg') !== null) problems.push(`focusable element inside art: ${describe(element)}`)
    if (element.tabIndex > 0) problems.push(`positive tabindex on ${describe(element)}`)
    if (element.querySelector(INTERACTIVE) !== null) problems.push(`nested interactive content in ${describe(element)}`)
    const role = element.getAttribute('role')
    if (role === 'button' && element.tagName !== 'BUTTON') problems.push(`non-native button ${describe(element)}`)
    const needsName = element.matches('button, a[href], input, select, textarea, summary')
    if (needsName && computeAccessibleName(element).trim() === '') problems.push(`no accessible name: ${describe(element)}`)
    if (element.tagName === 'BUTTON' && element.getAttribute('type') === null) problems.push(`button without type: ${describe(element)}`)
  }
  for (const element of Array.from(container.querySelectorAll('[onclick], div[role="button"], span[role="button"]'))) {
    problems.push(`click target that is not a native control: ${describe(element)}`)
  }

  // Landmarks, lists, dialogs, regions.
  for (const nav of Array.from(container.querySelectorAll('nav, [role="navigation"]'))) {
    if (computeAccessibleName(nav, false).trim() === '') problems.push(`unlabelled navigation ${describe(nav)}`)
  }
  for (const list of Array.from(container.querySelectorAll('ol, ul'))) {
    for (const child of Array.from(list.children)) if (child.tagName !== 'LI') problems.push(`${describe(list)} has a non-item child ${describe(child)}`)
  }
  for (const item of Array.from(container.querySelectorAll('li'))) {
    if (item.parentElement === null || !/^(OL|UL)$/.test(item.parentElement.tagName)) problems.push(`list item outside a list: ${describe(item)}`)
  }
  for (const term of Array.from(container.querySelectorAll('dt, dd'))) {
    if (term.closest('dl') === null) problems.push(`${describe(term)} outside a description list`)
  }
  for (const panel of Array.from(container.querySelectorAll('[role="dialog"], [role="region"], section[aria-labelledby], section[aria-label], article'))) {
    if (computeAccessibleName(panel, false).trim() === '') problems.push(`unlabelled ${panel.getAttribute('role') ?? panel.tagName.toLowerCase()} ${describe(panel)}`)
  }
  for (const dialog of Array.from(container.querySelectorAll('[role="dialog"]'))) {
    if (dialog.getAttribute('aria-modal') !== 'true') problems.push(`dialog without aria-modal ${describe(dialog)}`)
  }

  // Headings: non-empty, never skipping a level on the way down.
  let previous = 0
  for (const heading of Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))) {
    const level = heading.matches('[role="heading"]') ? Number(heading.getAttribute('aria-level') ?? '2') : Number(heading.tagName.slice(1))
    if ((heading.textContent ?? '').trim() === '') problems.push(`empty heading ${describe(heading)}`)
    if (previous !== 0 && level > previous + 1) problems.push(`heading level jumps from ${previous} to ${level} at "${heading.textContent?.trim()}"`)
    previous = level
  }

  // Art: hidden, unfocusable, unnamed.
  for (const svg of Array.from(container.querySelectorAll('svg'))) {
    if (svg.getAttribute('aria-hidden') !== 'true') problems.push(`art exposed to assistive technology: ${describe(svg)}`)
    if (svg.querySelector('title, desc, a, [tabindex], image, script, animate, animateTransform, animateMotion, set') !== null) {
      problems.push(`art with a name, link, image, script or animation element: ${describe(svg)}`)
    }
  }
  for (const hidden of Array.from(container.querySelectorAll('[aria-hidden="true"]'))) {
    if (hidden.matches(INTERACTIVE) || hidden.querySelector(INTERACTIVE) !== null) problems.push(`focusable content hidden from assistive technology: ${describe(hidden)}`)
  }

  // Controls that are off say why, in text the control points at.
  for (const off of Array.from(container.querySelectorAll<HTMLElement>('button[aria-disabled="true"], button:disabled'))) {
    const described = (off.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .map((id) => (id === '' ? '' : (container.querySelector(`[id="${id}"]`)?.textContent ?? '')))
      .join('')
      .trim()
    const scope = off.closest('.hh-ui-panel, li, [data-toolbar]') ?? off.parentElement
    const nearby = scope?.querySelector('.hh-ui-reason, .hh-ui-note, .hh-proposal-blocked, .hh-session-link-note, [data-room-reason]')
    const selfExplained = /Nothing needs you/.test(off.getAttribute('aria-label') ?? '')
    if (described === '' && nearby == null && !selfExplained) problems.push(`control is off without a stated reason: ${describe(off)} "${computeAccessibleName(off)}"`)
  }

  // Valid ARIA booleans.
  for (const element of all) {
    for (const attribute of ['aria-expanded', 'aria-pressed', 'aria-disabled', 'aria-busy', 'aria-modal', 'aria-hidden', 'aria-atomic']) {
      const value = element.getAttribute(attribute)
      if (value !== null && value !== 'true' && value !== 'false') problems.push(`${describe(element)} ${attribute}="${value}"`)
    }
  }
  return problems
}
