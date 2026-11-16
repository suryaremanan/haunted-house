// CSS contract of the house sheet (Spec 6 task 4.3; Requirements 5.4 to 5.9,
// 6.1 to 6.6, 7.2 to 7.7, 10.8). These are static checks of the shipped
// string. They do not replace rendered reflow evidence (HUI-S2).
import { describe, expect, it } from 'vitest'
import packageJson from '../../package.json'
import { HOUSE_PANEL_STYLES } from '../rooms/house/panel-styles'
import { FOYER_STYLES } from '../rooms/foyer/foyer-styles'
import { HOUSE_PALETTES, PALETTE_TOKENS, fallbackVariableName } from './house-palette'
import { HOUSE_UI_STYLES, LINEAR_BREAKPOINT_PX, MIN_ANIMATION_SECONDS, WIDE_BREAKPOINT_PX } from './house-styles'

const css = HOUSE_UI_STYLES

/** The body of the first block that starts at `header`, braces balanced. */
function block(source: string, header: string): string {
  const start = source.indexOf(header)
  if (start < 0) throw new Error(`missing block: ${header}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  throw new Error(`unclosed block: ${header}`)
}

/** Every top-level and nested rule as selector and declarations. */
function rules(source: string): { selector: string; body: string }[] {
  const found: { selector: string; body: string }[] = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    found.push({ selector: match[1].trim(), body: match[2] })
  }
  return found
}

function seconds(value: string, unit: string): number {
  return unit === 'ms' ? Number(value) / 1000 : Number(value)
}

const classNames = (source: string) => new Set(Array.from(source.matchAll(/\.(hh-[a-z0-9-]+)/g), (match) => match[1]))

describe('plain CSS on Crew theme variables', () => {
  it('uses no Tailwind, import, or external resource', () => {
    expect(css).not.toMatch(/@tailwind|@apply|@import|@layer|@config|theme\(/)
    expect(css).not.toMatch(/url\(/i)
    expect(css).not.toMatch(/https?:|\/\/[a-z]/i)
    expect(css).not.toMatch(/data:/i)
  })

  it('has no Tailwind dependency in package.json', () => {
    const names = [
      ...Object.keys((packageJson as { dependencies?: Record<string, string> }).dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys((packageJson as { peerDependencies?: Record<string, string> }).peerDependencies ?? {}),
    ]
    expect(names.filter((name) => /tailwind|autoprefixer|postcss/i.test(name))).toEqual([])
  })

  it('needs no separate stylesheet: no .css file exists or is imported in src', () => {
    expect(Object.keys(import.meta.glob('../**/*.css'))).toEqual([])
    const sources = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const importsCss = /(?:from|import)\s+['"][^'"\n]+\.css(?:\?[a-z]+)?['"]|require\(\s*['"][^'"\n]+\.css['"]/
    expect(Object.keys(sources).filter((path) => importsCss.test(sources[path]))).toEqual([])
  })

  it('reads each semantic token from a Crew variable first and a palette fallback second', () => {
    const root = block(css, '.hh-ui {')
    const expected: Record<string, string> = {
      '--hh-canvas': 'var(--card, var(--hh-fb-canvas))',
      '--hh-surface': 'var(--card, var(--hh-fb-surface))',
      '--hh-surface-raised': 'var(--input, var(--hh-fb-surface-raised))',
      '--hh-text': 'var(--card-fg, var(--text, var(--hh-fb-text)))',
      '--hh-text-muted': 'var(--muted, var(--hh-fb-text-muted))',
      '--hh-border': 'var(--border-strong, var(--hh-fb-border))',
      '--hh-border-soft': 'var(--border, var(--hh-fb-border))',
      '--hh-focus': 'var(--ring, var(--hh-fb-focus))',
      '--hh-accent': 'var(--warn, var(--hh-fb-accent))',
      '--hh-primary': 'var(--accent, var(--hh-fb-accent))',
      '--hh-primary-text': 'var(--accent-fg, var(--hh-fb-accent-text))',
      '--hh-danger': 'var(--warn, var(--hh-fb-danger))',
      '--hh-ok': 'var(--ok, var(--hh-fb-ok))',
      '--hh-candle': 'var(--warn, var(--hh-fb-candle))',
      '--hh-ghost': 'var(--hh-fb-ghost)',
    }
    for (const [token, value] of Object.entries(expected)) expect(root).toContain(`${token}: ${value};`)
  })

  it('carries the light fallbacks by default and the dark ones under data-theme', () => {
    const light = block(css, '.hh-ui {')
    const dark = block(css, ".hh-ui[data-theme='dark'] {")
    for (const token of PALETTE_TOKENS) {
      expect(light).toContain(`${fallbackVariableName(token)}: ${HOUSE_PALETTES.light[token]};`)
      expect(dark).toContain(`${fallbackVariableName(token)}: ${HOUSE_PALETTES.dark[token]};`)
    }
  })

  it('writes no color literal outside the palette fallbacks', () => {
    const withoutFallbacks = css.replace(/--hh-fb-[a-z-]+: #[0-9a-f]{6};/g, '')
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
  })

  it('every var() it reads is a known Crew variable or one of its own', () => {
    const crew = new Set(['--card', '--card-fg', '--text', '--muted', '--border', '--border-strong', '--ring', '--accent', '--accent-fg', '--warn', '--ok', '--input', '--font-sans'])
    for (const match of css.matchAll(/var\((--[a-z-]+)/g)) {
      expect(crew.has(match[1]) || match[1].startsWith('--hh-')).toBe(true)
    }
  })

  it('redefines no class of the Foyer or Spec 4 house sheets', () => {
    const mine = classNames(css)
    for (const name of mine) expect(name.startsWith('hh-ui')).toBe(true)
    const theirs = new Set([...classNames(HOUSE_PANEL_STYLES), ...classNames(FOYER_STYLES)])
    expect([...mine].filter((name) => theirs.has(name))).toEqual([])
  })
})

describe('responsive layout', () => {
  it('has the wide and linear breakpoints', () => {
    expect(WIDE_BREAKPOINT_PX).toBe(900)
    expect(LINEAR_BREAKPOINT_PX).toBe(640)
    expect(css).toContain('@media (min-width: 900px)')
    expect(css).toContain('@media (max-width: 640px)')
  })

  it('is a compact two-column grid by default, one column when narrow, a cutaway when wide', () => {
    const base = rules(css).find((rule) => rule.selector === '.hh-ui-rooms')!
    expect(base.body).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(block(css, '@media (max-width: 640px)')).toContain('.hh-ui-rooms { grid-template-columns: minmax(0, 1fr); }')
    const wide = block(css, '@media (min-width: 900px)')
    // Attic across the top; Drafting Room and Séance Room upstairs; Study, Foyer and the widest Workshop on the ground floor.
    expect(wide).toContain("grid-template-areas: 'attic attic attic attic' 'drafting drafting drafting drafting' 'study foyer workshop workshop'")
    expect(wide).toContain("grid-template-areas: 'attic attic attic attic' 'drafting drafting seance seance' 'study foyer workshop workshop'")
    for (const room of ['foyer', 'study', 'drafting-room', 'workshop', 'attic', 'seance-room']) {
      expect(wide).toContain(`.hh-ui-room-cell[data-room='${room}'] { grid-area:`)
    }
  })

  it('places rooms by grid area only, never by reordering', () => {
    expect(css).not.toMatch(/(^|[\s;{])order\s*:/)
    expect(css).not.toMatch(/flex-direction:\s*[a-z-]*reverse|flex-flow:[^;]*reverse|direction:\s*rtl/)
    // Placement rules exist only inside the wide block.
    const outsideWide = css.replace(block(css, '@media (min-width: 900px)'), '')
    expect(outsideWide).not.toMatch(/grid-area|grid-template-areas/)
  })

  it('lets every grid track and control shrink, and wraps long content', () => {
    expect(css).not.toMatch(/repeat\(\d+,\s*1fr\)/)
    for (const selector of ['.hh-ui-room-cell', '.hh-ui-rooms', '.hh-ui-panel', '.hh-ui-toolbar', '.hh-ui-state']) {
      expect(rules(css).find((rule) => rule.selector === selector)!.body).toContain('min-width: 0')
    }
    const controls = rules(css).find((rule) => rule.selector.includes('.hh-ui-room-control, .hh-ui-ghost-control, .hh-ui-door-control'))!
    expect(controls.body).toContain('min-width: 0')
    expect(controls.body).toContain('overflow-wrap: anywhere')
    expect(block(css, '.hh-ui {')).toContain('overflow-wrap: anywhere')
    expect(rules(css).find((rule) => rule.selector === '.hh-ui-panel')!.body).toContain('overflow-wrap: anywhere')
  })

  it('bounds the panel at min(42rem, 100%)', () => {
    expect(rules(css).find((rule) => rule.selector === '.hh-ui-panel')!.body).toContain('width: min(42rem, 100%)')
  })

  it('fixes no width wider than 320px and no height at all', () => {
    for (const match of css.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*(\d+(?:\.\d+)?)(px|rem|em)/g)) {
      const pixels = match[2] === 'px' ? Number(match[1]) : Number(match[1]) * 16
      expect(pixels).toBeLessThanOrEqual(320)
    }
    // Heights that clip enlarged text: only the 1px announcer and the art layers' 100% are allowed.
    const heights = Array.from(css.matchAll(/(?:^|[\s;{])height:\s*([^;]+);/g), (match) => match[1].trim())
    expect(heights.filter((value) => !['1px', '100%', 'auto'].includes(value))).toEqual([])
  })

  it('never truncates text: no ellipsis, and nowrap or hidden overflow only in visually hidden text', () => {
    expect(css).not.toMatch(/text-overflow|line-clamp/)
    const clipping = rules(css).filter((rule) => /white-space:\s*nowrap|overflow:\s*hidden/.test(rule.body))
    // The announcer and words kept for assistive technology only (the same visually hidden pattern) are the exceptions.
    expect(clipping.map((rule) => rule.selector).sort()).toEqual(['.hh-ui-announcer', '.hh-ui-visually-hidden'])
    expect(css).not.toMatch(/overflow-x:\s*(?:scroll|auto)/)
  })
})

describe('focus and state cues', () => {
  it('shows a focus ring from the focus token on every control class', () => {
    const ring = rules(css).filter((rule) => rule.selector.includes(':focus-visible'))
    expect(ring.length).toBeGreaterThan(0)
    for (const rule of ring) {
      expect(rule.body).toContain('outline: 2px solid var(--hh-focus)')
      expect(rule.body).toContain('outline-offset: 2px')
    }
    const focusable = ring.map((rule) => rule.selector).join(',')
    for (const control of [
      '.hh-ui-needs',
      '.hh-ui-toggle',
      '.hh-ui-button',
      '.hh-ui-panel-close',
      '.hh-ui-status > summary',
      '.hh-ui-room-control',
      '.hh-ui-ghost-control',
      '.hh-ui-door-control',
      '.hh-ui-panel',
    ]) {
      expect(focusable).toContain(`${control}:focus-visible`)
    }
    expect(css).not.toMatch(/outline:\s*(?:none|0)\b/)
  })

  const borderOf = (selector: string) => {
    const rule = rules(css).find((candidate) => candidate.selector.split(',').some((part) => part.trim() === selector))
    if (rule === undefined) throw new Error(`no rule for ${selector}`)
    const style = /border-style:\s*([a-z]+)/.exec(rule.body)?.[1]
    const width = /border-width:\s*([0-9a-z]+)/.exec(rule.body)?.[1]
    const extra = /border-(?:left-width|radius):\s*([^;]+)/.exec(rule.body)?.[1] ?? ''
    return `${style}/${width}/${extra}`
  }

  it('gives every Door state its own border shape, not only a color', () => {
    const states = ['sealed', 'waiting', 'open', 'rejected']
    const shapes = states.map((state) => borderOf(`.hh-ui-door-control[data-door='${state}']`))
    expect(new Set(shapes).size).toBe(states.length)
    expect(borderOf(".hh-ui-door-control[data-door='not_applicable']")).toContain('dashed')
    expect(borderOf(".hh-ui-door-control[data-door='unavailable']")).toContain('dashed')
  })

  it('gives every ghost state its own border shape, not only a color', () => {
    const states = ['idle', 'working', 'waiting', 'blocked', 'failed', 'done']
    const shapes = states.map((state) => borderOf(`.hh-ui-ghost-control[data-ghost='${state}']`))
    expect(new Set(shapes).size).toBe(states.length)
    expect(borderOf(".hh-ui-ghost-control[data-ghost='not_applicable']")).toContain('dashed')
  })

  it('marks disabled, locked, uncertain and zero-count surfaces by border style', () => {
    expect(borderOf(".hh-ui [aria-disabled='true']")).toContain('dashed')
    expect(borderOf(".hh-ui-room-cell[data-locked='true']")).toContain('dotted')
    expect(borderOf(".hh-ui-room-cell[data-integrity='uncertain']")).toContain('dashed')
    expect(borderOf(".hh-ui-room-cell[data-integrity='corrupt']")).toContain('dotted')
    expect(borderOf(".hh-ui-needs[data-count='0']")).toContain('dashed')
    expect(borderOf(".hh-ui-toggle[aria-pressed='true']")).toContain('double')
  })

  it('never dims a control with opacity, which would lower its contrast', () => {
    const dimmed = rules(css).filter((rule) => /opacity:/.test(rule.body) && !/^(?:0%|50%|0%, 100%)$/.test(rule.selector))
    expect(dimmed.map((rule) => rule.selector)).toEqual(['.hh-ui-backdrop'])
  })

  it('hides the announcer visually without removing it from the accessibility tree', () => {
    const announcer = rules(css).find((rule) => rule.selector === '.hh-ui-announcer')!
    expect(announcer.body).toContain('clip-path: inset(50%)')
    expect(announcer.body).not.toMatch(/display:\s*none|visibility:\s*hidden/)
  })

  it('keeps decorative layers out of the way of pointer and keyboard', () => {
    for (const selector of ['.hh-ui-house-art', '.hh-ui-room-art', '.hh-ui-room-wall', '.hh-ui-room-scene']) {
      expect(rules(css).find((rule) => rule.selector === selector)!.body).toContain('pointer-events: none')
    }
  })
})

describe('motion', () => {
  const allowed = block(css, '@media (prefers-reduced-motion: no-preference)')

  it('declares every animation inside the no-preference query and under data-motion low-frequency', () => {
    const outside = css.replace(allowed, '')
    expect(outside).not.toMatch(/animation(?:-name)?:\s*(?!\s|none)/)
    const animated = rules(allowed)
    expect(animated.length).toBeGreaterThan(0)
    for (const rule of animated) {
      expect(rule.selector.startsWith(".hh-ui[data-motion='low-frequency'] ")).toBe(true)
      expect(rule.body).toMatch(/animation:/)
    }
  })

  it('runs no cycle shorter than two seconds', () => {
    expect(MIN_ANIMATION_SECONDS).toBe(2)
    const durations = Array.from(allowed.matchAll(/animation:\s*[a-z-]+\s+(\d+(?:\.\d+)?)(ms|s)\b/g), (match) => seconds(match[1], match[2]))
    expect(durations.length).toBe(rules(allowed).length)
    for (const duration of durations) expect(duration).toBeGreaterThanOrEqual(MIN_ANIMATION_SECONDS)
    expect(css).not.toMatch(/animation-duration/)
  })

  it('declares no transition, so nothing depends on one', () => {
    expect(css).not.toMatch(/transition(?:-[a-z]+)?:\s*(?!\s|none)/)
  })

  it('turns everything off for Still House and for reduced motion', () => {
    const still = rules(css).find((rule) => rule.selector.includes(".hh-ui[data-motion='none'] *"))!
    expect(still.body).toContain('animation: none !important')
    expect(still.body).toContain('transition: none !important')
    // A shell that has not set data-motion yet is still, too.
    expect(still.selector).toContain('.hh-ui:not([data-motion]) *')
    const reduced = block(css, '@media (prefers-reduced-motion: reduce)')
    expect(reduced).toContain('.hh-ui, .hh-ui * { animation: none !important; transition: none !important; }')
  })

  it('keeps keyframes small and slow: at most one dip per cycle, a few pixels of float, no flash', () => {
    const names = Array.from(css.matchAll(/@keyframes\s+([a-z-]+)/g), (match) => match[1])
    expect(names.sort()).toEqual(['hh-ui-drift', 'hh-ui-flicker', 'hh-ui-float'])
    for (const name of names) {
      const frames = block(css, `@keyframes ${name}`)
      // Two distinct values (rest and peak): one change of direction per cycle of at least 2 seconds.
      expect(rules(frames).length).toBe(2)
      expect(frames).not.toMatch(/visibility|display|background|color|filter/)
      for (const match of frames.matchAll(/opacity:\s*([0-9.]+)/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(0.35)
      for (const match of frames.matchAll(/translateY\((-?\d+)px\)/g)) expect(Math.abs(Number(match[1]))).toBeLessThanOrEqual(4)
      expect(frames).not.toMatch(/translateX|translate\(|scale|rotate|skew|v[wh]\b/)
    }
    // Every keyframe set is used, and only keyframes of this sheet are used.
    for (const match of allowed.matchAll(/animation:\s*([a-z-]+)/g)) expect(names).toContain(match[1])
  })

  it('has no parallax, pointer tracking, perspective, shake, or scroll-driven effect', () => {
    expect(css).not.toMatch(/perspective|parallax|shake|wobble|jitter|blink|strobe|flash/i)
    expect(css).not.toMatch(/translate3d|rotate3d|rotate[XY]|preserve-3d|backface/)
    expect(css).not.toMatch(/mousemove|pointermove|--mouse|--pointer|--cursor-[xy]|:hover[^{]*\{[^}]*transform/)
    expect(css).not.toMatch(/background-attachment|scroll-timeline|animation-timeline|view-timeline|scroll-behavior/)
    // The one sticky element is the replay bar, and only in the wide layout: it holds still while the page scrolls under it,
    // and never sticks at narrow widths or high zoom, where it would cover the house.
    const sticky = rules(css).filter((rule) => /position:\s*sticky/.test(rule.body))
    expect(sticky.map((rule) => rule.selector)).toEqual(['.hh-ui-replay-bar'])
    expect(block(css, `@media (min-width: ${WIDE_BREAKPOINT_PX}px)`)).toMatch(/\.hh-ui-replay-bar \{ position: sticky;/)
    expect(css).not.toMatch(/steps\(/)
  })
})
