// Original, inert, decorative art (Spec 6 task 4.3; Requirements 5.1, 5.2,
// 5.8, 8.11, 11.1): every drawing is hidden from assistive technology, takes
// no focus, loads nothing, moves nothing by itself and makes no sound.
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { HOUSE_ROOM_IDS, PRESENTATION_DOOR_STATES, PRESENTATION_GHOST_STATES } from '../core/house-registry'
import { CandleArt, DoorArt, DustArt, GHOST_VARIANTS, GhostArt, HouseCutawayArt, RoomArt, ghostVariantOf } from './house-art'
import artSource from './house-art.tsx?raw'
import paletteSource from './house-palette.ts?raw'
import stylesSource from './house-styles.ts?raw'
import { HOUSE_UI_STYLES } from './house-styles'

interface Drawing {
  readonly name: string
  readonly element: ReactElement
}

const DRAWINGS: readonly Drawing[] = [
  { name: 'cutaway', element: <HouseCutawayArt /> },
  { name: 'cutaway with séance bay', element: <HouseCutawayArt seanceRoom /> },
  ...HOUSE_ROOM_IDS.map((room) => ({ name: `room ${room}`, element: <RoomArt room={room} /> })),
  ...GHOST_VARIANTS.flatMap((variant) =>
    PRESENTATION_GHOST_STATES.map((state) => ({ name: `ghost ${variant} ${state}`, element: <GhostArt state={state} variant={variant} /> })),
  ),
  ...PRESENTATION_DOOR_STATES.map((state) => ({ name: `door ${state}`, element: <DoorArt state={state} /> })),
  { name: 'candle lit', element: <CandleArt /> },
  { name: 'candle unlit', element: <CandleArt lit={false} /> },
  { name: 'dust', element: <DustArt /> },
]

const ALLOWED_ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse'])
const FOCUSABLE = 'a, button, input, select, textarea, [tabindex], [contenteditable], audio, video, iframe, object, embed'

function markup(element: ReactElement): string {
  const { container, unmount } = render(element)
  const html = container.innerHTML
  unmount()
  return html
}

describe('every drawing', () => {
  it('covers each room, each ghost role in each state, and each Door state', () => {
    expect(DRAWINGS).toHaveLength(2 + 6 + 6 * 8 + 6 + 3)
  })

  for (const drawing of DRAWINGS) {
    it(`${drawing.name}: one hidden, unfocusable svg of plain shapes`, () => {
      const { container } = render(drawing.element)
      const svgs = container.querySelectorAll('svg')
      expect(svgs).toHaveLength(1)
      const svg = svgs[0]
      expect(container.firstElementChild).toBe(svg)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
      expect(svg.classList.contains('hh-ui-art')).toBe(true)
      expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/)
      expect(container.querySelectorAll(FOCUSABLE)).toHaveLength(0)

      for (const node of container.querySelectorAll('*')) {
        expect(ALLOWED_ELEMENTS.has(node.tagName.toLowerCase())).toBe(true)
        for (const attribute of node.getAttributeNames()) {
          // No name, role, link, handler, inline style or embedded resource on any shape.
          expect(attribute).not.toMatch(/^(?:on|xlink|xmlns)|^(?:href|src|style|role|title|tabindex|id|aria-label|aria-labelledby)$/i)
          expect(node.getAttribute(attribute) ?? '').not.toMatch(/url\(|https?:|data:|javascript:/i)
        }
      }
      // Decoration carries no words.
      expect(container.textContent).toBe('')
      // Colors follow the theme: currentColor, none, or a house token.
      for (const node of container.querySelectorAll('[fill], [stroke]')) {
        for (const name of ['fill', 'stroke']) {
          const value = node.getAttribute(name)
          if (value !== null) expect(value).toMatch(/^(?:none|currentColor|var\(--hh-[a-z-]+, none\))$/)
        }
      }
    })
  }
})

describe('state is drawn, not only colored', () => {
  it('gives each ghost state its own pose in every role', () => {
    for (const variant of GHOST_VARIANTS) {
      const poses = PRESENTATION_GHOST_STATES.map((state) => markup(<GhostArt state={state} variant={variant} />).replace(/data-ghost="[a-z_]+"/, ''))
      expect(new Set(poses).size).toBe(PRESENTATION_GHOST_STATES.length)
    }
  })

  it('gives each role its own silhouette in every real state', () => {
    for (const state of PRESENTATION_GHOST_STATES) {
      const outlines = GHOST_VARIANTS.map((variant) => {
        const { container, unmount } = render(<GhostArt state={state} variant={variant} />)
        const body = container.querySelector('svg > g > path')!.getAttribute('d')
        unmount()
        return body
      })
      expect(new Set(outlines).size).toBe(GHOST_VARIANTS.length)
    }
  })

  it('gives each Door state its own shape', () => {
    const shapes = PRESENTATION_DOOR_STATES.map((state) => markup(<DoorArt state={state} />).replace(/data-door="[a-z_]+"/, ''))
    expect(new Set(shapes).size).toBe(PRESENTATION_DOOR_STATES.length)
  })

  it('gives each room its own furniture', () => {
    const rooms = HOUSE_ROOM_IDS.map((room) => markup(<RoomArt room={room} />).replace(/data-room="[a-z-]+"/, ''))
    expect(new Set(rooms).size).toBe(HOUSE_ROOM_IDS.length)
  })

  it('draws an absent or unreadable ghost as a dotted outline without a face or prop', () => {
    for (const state of ['not_applicable', 'unavailable'] as const) {
      const { container, unmount } = render(<GhostArt state={state} variant="tinker" />)
      const body = container.querySelector('svg > g > path')!
      expect(body.getAttribute('stroke-dasharray')).toBe('2 4')
      expect(body.getAttribute('fill')).toBe('none')
      unmount()
    }
    expect(markup(<GhostArt state="not_applicable" />)).not.toContain('<circle')
  })

  it('exposes the state and role as data attributes for the sheet', () => {
    const ghost = render(<GhostArt state="working" variant="foreman" />).container.querySelector('svg')!
    expect(ghost.getAttribute('data-ghost')).toBe('working')
    expect(ghost.getAttribute('data-variant')).toBe('foreman')
    expect(ghost.classList.contains('hh-ui-art-ghost')).toBe(true)
    const door = render(<DoorArt state="sealed" />).container.querySelector('svg')!
    expect(door.getAttribute('data-door')).toBe('sealed')
    expect(render(<CandleArt />).container.querySelector('.hh-ui-art-flame')).not.toBeNull()
    expect(render(<CandleArt lit={false} />).container.querySelector('.hh-ui-art-flame')).toBeNull()
    expect(render(<HouseCutawayArt seanceRoom />).container.querySelector('svg')!.getAttribute('data-seance')).toBe('shown')
  })

  it('uses only art classes the house sheet defines', () => {
    for (const drawing of DRAWINGS) {
      const { container, unmount } = render(drawing.element)
      for (const node of container.querySelectorAll('[class]')) {
        for (const name of node.classList) expect(HOUSE_UI_STYLES).toContain(`.${name}`)
      }
      unmount()
    }
  })
})

describe('ghost roles', () => {
  it('maps a ghost id to its role silhouette', () => {
    expect(ghostVariantOf('archivist')).toBe('archivist')
    expect(ghostVariantOf('tinker-2')).toBe('tinker')
    expect(ghostVariantOf('foreman')).toBe('foreman')
    expect(ghostVariantOf('draughtsman-1')).toBe('draughtsman')
    expect(ghostVariantOf('medium')).toBe('medium')
    expect(ghostVariantOf('tinkerer')).toBe('plain')
    expect(ghostVariantOf('plain')).toBe('plain')
    expect(ghostVariantOf('')).toBe('plain')
  })
})

describe('visual-system sources', () => {
  const SOURCES: Readonly<Record<string, string>> = {
    'house-art.tsx': artSource,
    'house-styles.ts': stylesSource,
    'house-palette.ts': paletteSource,
  }

  it('reads the real files', () => {
    expect(artSource).toContain('export function GhostArt')
    expect(stylesSource).toContain('export const HOUSE_UI_STYLES')
    expect(paletteSource).toContain('export const HOUSE_PALETTES')
  })

  for (const [file, source] of Object.entries(SOURCES)) {
    describe(file, () => {
      it('loads nothing: no URL, data URI, image, external use, script or SVG animation', () => {
        expect(source).not.toMatch(/https?:|\/\/[a-z0-9-]+\.[a-z]{2,}/i)
        expect(source).not.toMatch(/data:[a-z]+\//i)
        expect(source).not.toMatch(/url\(/i)
        expect(source).not.toMatch(/<image\b|<img\b|<use\b|<script\b|<foreignObject\b|<title\b|<desc\b|<style\b/i)
        expect(source).not.toMatch(/<animate\b|<animateTransform\b|<animateMotion\b|<set\b|\bSMIL\b/)
        expect(source).not.toMatch(/xlink:|xmlns|\bhref\b|dangerouslySetInnerHTML|\.(?:png|jpe?g|gif|webp|svg|avif)\b/i)
      })

      it('makes no sound: no audio API, element or asset', () => {
        expect(source).not.toMatch(/\bAudio\s*\(|AudioContext|webkitAudioContext|<audio\b|<video\b|speechSynthesis|\.play\s*\(/)
        expect(source).not.toMatch(/\.(?:mp3|ogg|wav|m4a|aac|flac|webm|mid)\b/i)
      })

      it('names no third-party product, company or character', () => {
        expect(source).not.toMatch(/\bmicrosoft\b|\bbob\b|\bclippy\b|\brover\b|\bwindows\b|\bcasper\b|\bpac-?man\b|\bboo\b/i)
      })

      it('imports only this app and React types', () => {
        const imports = Array.from(source.matchAll(/from\s+'([^']+)'/g), (match) => match[1])
        for (const path of imports) expect(path).toMatch(/^(?:react|\.\.?\/[a-z/-]+)$/)
        expect(source).not.toMatch(/lucide-react|@kirocrew|tailwind/)
      })
    })
  }

  it('the art module has no state, effect, handler, timer or pointer tracking', () => {
    expect(artSource).not.toMatch(/use(?:State|Effect|Ref|LayoutEffect)\b|setTimeout|setInterval|requestAnimationFrame/)
    expect(artSource).not.toMatch(/\bon[A-Z][A-Za-z]+=|addEventListener|mousemove|pointermove|clientX|clientY/)
    expect(artSource).not.toMatch(/\bstyle=/)
  })

  it('every <svg> in the art module comes from the one hidden wrapper', () => {
    // Comments mention the tag; only one JSX element opens it.
    expect(artSource.match(/^\s*<svg$/gm)).toHaveLength(1)
    expect(artSource).toMatch(/^\s*<svg\n[^>]*aria-hidden="true"[^>]*focusable="false"/m)
  })
})
