// The Warden's drawing (Spec 8, Requirement 1): five poses of one original
// figure, drawn in code from the paint box, hidden from assistive technology,
// twice a ghost's height, and never moving on its own.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GHOST_ASPECT, GHOST_WIDTH, WARDEN_ASPECT, WARDEN_WIDTH } from '../core/guide-layout'
import { WARDEN_POSES, type WardenPose } from '../core/house-guide'
import { HOUSE_STAGE_STYLES } from './house-stage-styles'
import { SpectreArt, WardenArt } from './room-paint'
import { PAINT_FILL_NAMES, PAINT_LINE_NAMES, ROOM_PAINT_STYLES } from './room-paint-styles'
import paintSource from './room-paint.tsx?raw'

function drawn(pose: WardenPose): { svg: Element; html: string; count: (selector: string) => number } {
  const { container, unmount } = render(<WardenArt pose={pose} />)
  const svg = container.firstElementChild!
  const html = container.innerHTML
  const clone = container.cloneNode(true) as Element
  unmount()
  return { svg, html, count: (selector) => clone.querySelectorAll(selector).length }
}

/** Every rule of a sheet whose selector names the Warden. */
function wardenRules(sheet: string): string[] {
  return Array.from(sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((match) => /warden/.test(match[1]))
    .map((match) => `${match[1].trim()} { ${match[2].trim()} }`)
}

describe('the Warden', () => {
  it('has five poses and each is a different drawing', () => {
    expect([...WARDEN_POSES]).toEqual(['watching', 'pointing', 'offering-key', 'holding', 'stepped-back'])
    const drawings = WARDEN_POSES.map((pose) => drawn(pose).html)
    expect(new Set(drawings).size).toBe(5)
    for (const pose of WARDEN_POSES) expect(drawn(pose).svg.getAttribute('data-pose')).toBe(pose)
  })

  it('is one hidden, unfocusable, wordless drawing of plain shapes from the paint box', () => {
    for (const pose of WARDEN_POSES) {
      const { container, unmount } = render(<WardenArt pose={pose} />)
      const svg = container.firstElementChild!
      expect(container.querySelectorAll('svg')).toHaveLength(1)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
      expect(container.textContent).toBe('')
      for (const node of container.querySelectorAll('*')) {
        expect(['svg', 'g', 'path', 'rect', 'circle', 'ellipse']).toContain(node.tagName.toLowerCase())
        for (const attribute of node.getAttributeNames()) {
          expect(attribute).not.toMatch(/^(?:on|xlink|xmlns)|^(?:href|src|style|role|title|tabindex|id)$/i)
          expect(node.getAttribute(attribute) ?? '').not.toMatch(/NaN|undefined|url\(|https?:|#[0-9a-f]{3,8}\b|rgba?\(/i)
        }
        for (const name of ['fill', 'stroke']) {
          const value = node.getAttribute(name)
          if (value !== null) expect(value).toMatch(/^(?:none|currentColor)$/)
        }
        for (const name of node.classList) {
          if (name.startsWith('hh-p-')) expect(PAINT_FILL_NAMES).toContain(name.slice(5))
          if (name.startsWith('hh-ps-')) expect(PAINT_LINE_NAMES).toContain(name.slice(6))
        }
      }
      unmount()
    }
    expect(paintSource).not.toMatch(/<image\b|<use\b|<animate|<script|<text\b|dangerouslySetInnerHTML|data:[a-z]+\//i)
    expect(paintSource).not.toMatch(/Caretaker/i)
  })

  it('has lantern eyes, keys and a chain, and shows restraint only', () => {
    for (const pose of WARDEN_POSES) {
      const art = drawn(pose)
      // A chain in every pose; no red anywhere on him.
      expect(art.count('.hh-ps-chain'), pose).toBeGreaterThanOrEqual(8)
      expect(art.count('.hh-p-cloth, .hh-p-cloth-d'), pose).toBe(0)
      if (pose === 'stepped-back') {
        // Turned away: no eyes, no hands, no keys on show.
        expect(art.count('.hh-p-lamp')).toBe(0)
        expect(art.count('.hh-ps-brass')).toBe(0)
        continue
      }
      expect(art.count('.hh-p-lamp'), pose).toBe(1)
      expect(art.count('.hh-p-hood'), pose).toBeGreaterThanOrEqual(1)
      expect(art.count('.hh-ps-brass'), pose).toBeGreaterThanOrEqual(3)
    }
    // Watching: three keys hang from the ring. Offering: one of them is on his hand.
    const hanging = (pose: WardenPose) => drawn(pose).count('g[transform^="rotate("][transform$=" 110 221)"]')
    expect(hanging('watching')).toBe(3)
    expect(hanging('offering-key')).toBe(2)
    // Holding: one small ghost, in the ghosts' own paint, with the chain around it.
    expect(drawn('holding').count('.hh-p-ghost')).toBe(1)
    expect(drawn('watching').count('.hh-p-ghost')).toBe(0)
    expect(drawn('holding').count('.hh-ps-chain')).toBeGreaterThan(drawn('watching').count('.hh-ps-chain'))
  })

  it('is exactly twice as tall as a ghost of the room', () => {
    const box = (element: Element) => (element.getAttribute('viewBox') ?? '').split(' ').map(Number)
    const warden = box(drawn('watching').svg)
    const { container, unmount } = render(<SpectreArt state="idle" />)
    const ghost = box(container.firstElementChild!)
    unmount()
    // The layout constants describe the drawings as they are.
    expect(warden[3] / warden[2]).toBeCloseTo(WARDEN_ASPECT, 9)
    expect(ghost[3] / ghost[2]).toBeCloseTo(GHOST_ASPECT, 9)
    expect(WARDEN_WIDTH * WARDEN_ASPECT).toBeCloseTo(2 * GHOST_WIDTH * GHOST_ASPECT, 9)
  })

  it('never moves on his own: no sheet gives him an animation', () => {
    for (const sheet of [HOUSE_STAGE_STYLES, ROOM_PAINT_STYLES]) {
      for (const rule of wardenRules(sheet)) expect(rule).not.toMatch(/animation/)
    }
    // The loop the Caretaker had is gone with him.
    expect(HOUSE_STAGE_STYLES).not.toMatch(/caretaker/i)
    expect(ROOM_PAINT_STYLES).not.toMatch(/caretaker/i)
  })
})
