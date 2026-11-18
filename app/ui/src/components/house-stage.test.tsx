// Contract of the 3D stage: its sheet, its drawings and the room box. Static
// checks of what ships; rendered evidence is the screenshot pass.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HOUSE_ROOM_IDS, PRESENTATION_GHOST_STATES } from '../core/house-registry'
import { WARDEN_POSES } from '../core/house-guide'
import { Shell, newRecorded, waitingHouse } from '../test/shell-kit'
import { SCENE_PALETTES, contrastRatio, sceneVariableName } from './house-palette'
import { DESK_ITEMS, StageDeskArt, StagePropArt, StageRoofArt, StageSkyArt, StageWallArt, StageYardArt } from './house-stage-art'
import { DOOR_SWING_SECONDS, HOUSE_STAGE_STYLES, STAGE_MIN_LOOP_SECONDS } from './house-stage-styles'
import { RoomDiorama } from './RoomDiorama'
import { DeskPainting, FrontDoorPainting, RoomPainting, SPECTRE_ROLES, SpectreArt, WardenArt } from './room-paint'
import { PAINT_FILL_NAMES, PAINT_LINE_NAMES, ROOM_PAINT_STYLES } from './room-paint-styles'
import paintSource from './room-paint.tsx?raw'
import artSource from './house-stage-art.tsx?raw'
import dioramaSource from './RoomDiorama.tsx?raw'

const css = HOUSE_STAGE_STYLES

function block(source: string, header: string): string {
  const open = source.indexOf('{', source.indexOf(header))
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}' && (depth -= 1) === 0) return source.slice(open + 1, index)
  }
  throw new Error(`unclosed block: ${header}`)
}

describe('stage sheet', () => {
  it('takes every scene color from the Scene Palette', () => {
    const withoutPalette = css.replace(/--hh-sc-[a-z0-9-]+: #[0-9a-f]{6};/g, '')
    expect(withoutPalette).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    for (const mode of ['light', 'dark'] as const) {
      for (const [token, value] of Object.entries(SCENE_PALETTES[mode])) {
        expect(css).toContain(`${sceneVariableName(token as keyof (typeof SCENE_PALETTES)['light'])}: ${value};`)
      }
    }
    expect(css).not.toMatch(/url\(|@import|https?:/)
  })

  it('moves only when motion is allowed: every animation and transition sits under low-frequency and no-preference', () => {
    const allowed = block(css, '@media (prefers-reduced-motion: no-preference)')
    const outside = css.replace(allowed, '')
    expect(outside).not.toMatch(/animation(?:-name)?:\s*(?!\s|none)/)
    expect(outside).not.toMatch(/transition(?:-[a-z]+)?:\s*(?!\s|none)/)
    for (const match of allowed.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const part of match[1].split(',')) expect(part.trim().startsWith(".hh-ui[data-motion='low-frequency'] ")).toBe(true)
    }
  })

  it('loops no faster than the Motion Policy allows, and swings a Door once, slowly', () => {
    const allowed = block(css, '@media (prefers-reduced-motion: no-preference)')
    const loops = Array.from(allowed.matchAll(/animation:\s*[a-z-]+\s+(\d+(?:\.\d+)?)s\b/g), (match) => Number(match[1]))
    expect(loops.length).toBeGreaterThan(0)
    for (const loop of loops) expect(loop).toBeGreaterThanOrEqual(STAGE_MIN_LOOP_SECONDS)
    expect(DOOR_SWING_SECONDS).toBeGreaterThanOrEqual(1)
    for (const name of Array.from(css.matchAll(/@keyframes\s+([a-z-]+)/g), (match) => match[1])) {
      const frames = block(css, `@keyframes ${name}`)
      expect(frames).not.toMatch(/visibility|display|background|filter|scale|rotate|skew/)
      for (const match of frames.matchAll(/opacity:\s*([0-9.]+)/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('follows neither the pointer nor the scroll, and never flashes', () => {
    expect(css).not.toMatch(/mousemove|pointermove|--mouse|--pointer|:hover[^{]*\{[^}]*transform/)
    expect(css).not.toMatch(/background-attachment|scroll-timeline|animation-timeline|view-timeline|scroll-behavior|steps\(/)
    expect(css).not.toMatch(/shake|wobble|jitter|blink|strobe|flash/i)
  })

  it('keeps the drawings out of the way of the pointer', () => {
    expect(css).toMatch(/\.hh-stage-art \{[^}]*pointer-events: none/)
    expect(css).toMatch(/\.hh-stage-ghosts \{[^}]*pointer-events: none/)
    // Only a figure marked as a shortcut takes the pointer, and it never moves under it.
    expect(css).toContain(".hh-stage[data-pick], .hh-stage [data-pick] { pointer-events: auto; cursor: pointer; }")
  })
})

describe('stage drawings', () => {
  const drawings = [
    ...HOUSE_ROOM_IDS.flatMap((room) => [<StageWallArt room={room} />, <StagePropArt room={room} />]),
    <StageRoofArt />,
    <StageSkyArt />,
    <StageYardArt />,
    ...DESK_ITEMS.map((item) => <StageDeskArt item={item} />),
  ]

  it('are single hidden, unfocusable, wordless svgs of plain shapes', () => {
    expect(drawings).toHaveLength(20)
    for (const drawing of drawings) {
      const { container, unmount } = render(drawing)
      const svg = container.firstElementChild!
      expect(container.querySelectorAll('svg')).toHaveLength(1)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
      expect(container.textContent).toBe('')
      for (const node of container.querySelectorAll('*')) {
        expect(['svg', 'g', 'path', 'rect', 'circle', 'ellipse']).toContain(node.tagName.toLowerCase())
        for (const attribute of node.getAttributeNames()) {
          expect(attribute).not.toMatch(/^(?:on|xlink|xmlns)|^(?:href|src|style|role|title|tabindex|id)$/i)
        }
        for (const name of ['fill', 'stroke']) {
          const value = node.getAttribute(name)
          if (value !== null) expect(value).toMatch(/^(?:none|currentColor|var\(--hh-(?:sc-)?[a-z-]+, none\))$/)
        }
        // Every fill class is one the sheet defines.
        for (const name of node.classList) if (name.startsWith('hh-sf-')) expect(css).toContain(`.${name} {`)
      }
      unmount()
    }
  })

  it('load nothing, make no sound, and name no product', () => {
    for (const source of [artSource, dioramaSource]) {
      expect(source).not.toMatch(/https?:|data:[a-z]+\/|url\(|<image\b|<use\b|<animate|dangerouslySetInnerHTML/i)
      expect(source).not.toMatch(/AudioContext|<audio\b|\.play\s*\(/)
      expect(source).not.toMatch(/addEventListener|clientX|clientY|onMouseMove|onPointerMove/)
    }
    // The drawings themselves carry no handler at all.
    expect(artSource).not.toMatch(/\bon[A-Z][A-Za-z]+[=:]/)
  })
})

describe('walk-in room and its guide', () => {
  it('opens a surface from a pressed figure through the map control, and walks to the next room', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    const ghost = document.querySelector<HTMLElement>('[data-stage-room] .hh-stage-figure')!
    expect(ghost.closest('[aria-hidden="true"]')).not.toBeNull()
    fireEvent.click(ghost)
    expect(document.querySelector('.hh-ui-panel')!.getAttribute('data-surface')).toBe('ghost')
    // The other rooms are behind "Something else".
    fireEvent.click(screen.getByRole('button', { name: 'Something else…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to the Drafting Room' }))
    expect(document.querySelector('.hh-ui-panel')!.getAttribute('data-room-panel')).toBe('drafting-room')
    const stage = document.querySelector("[data-stage-room='drafting-room']")!
    expect(stage.querySelector('[data-guide-text]')!.textContent).not.toBe('')
    // The big drawing is still hidden decoration with no focus stop, and it sits outside the panel.
    expect(stage.closest('.hh-ui-panel')).toBeNull()
    expect(stage.querySelector('.hh-paint')!.getAttribute('aria-hidden')).toBe('true')
    expect(stage.querySelectorAll('.hh-stage-room-scene [tabindex], .hh-stage-room-scene button')).toHaveLength(0)
  })
})

describe('the room the Operator stands in', () => {
  const choices = (stage: Element) => Array.from(stage.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (item) => item.textContent)

  it('is on show from the start, with the Warden, his choices and the things on the desk', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    const stage = document.querySelector('[data-stage-room]')!
    // It starts where the work is: the first room that needs the visitor.
    expect(stage.getAttribute('data-stage-room')).toBe('study')
    expect(stage.querySelector('[data-stage-title]')!.textContent).toBe('You are in the Study')
    expect(stage.querySelector('[data-guide-text]')!.textContent).toBe('The Archivist has finished what it must do. The door waits for you.')
    expect(choices(stage)).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', 'See the whole house'])
    // The Warden is a hidden drawing; the words beside him say how he stands.
    expect(stage.querySelector('.hh-stage-warden')!.getAttribute('aria-hidden')).toBe('true')
    expect(stage.querySelector('.hh-paint-warden')!.getAttribute('data-pose')).toBe('offering-key')
    expect(stage.querySelector('[data-guide-pose]')!.textContent).toBe('The Warden holds out a key.')
    // The painting and its pressable spots are pointer-only decoration: no focus stop, and each spot presses a real control.
    for (const spots of stage.querySelectorAll('.hh-stage-spots')) {
      expect(spots.getAttribute('aria-hidden')).toBe('true')
      expect(spots.querySelectorAll('button, [tabindex]')).toHaveLength(0)
    }
    expect(stage.querySelector('.hh-paint')!.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(stage.querySelector("[data-spot='ledger']")!)
    expect(document.querySelector('.hh-ui-panel')!.getAttribute('data-room-panel')).toBe('study')
    // With the room's sheet open the proposal is in front of the visitor, so the choices change.
    expect(choices(stage)).toEqual(['Open the door', 'Ask for a change', 'Close this sheet', 'See the whole house'])
    // The map of the whole house is laid over the room on request, takes focus, and is put away again.
    const root = document.querySelector('.hh-ui')!
    expect(root.getAttribute('data-map')).toBe('closed')
    fireEvent.click(screen.getByRole('button', { name: 'House map: closed' }))
    expect(root.getAttribute('data-map')).toBe('open')
    expect(document.activeElement).toBe(document.querySelector('[data-map-title]'))
    fireEvent.click(screen.getByRole('button', { name: 'House map: open' }))
    expect(root.getAttribute('data-map')).toBe('closed')
    // Looking, walking and opening decided nothing.
    expect(recorded.decisions).toEqual([])
  })

  it('sets its text on the balloon and the nameplate in ink, well above 4.5:1', () => {
    for (const mode of ['light', 'dark'] as const) {
      const scene = SCENE_PALETTES[mode]
      expect(contrastRatio(scene.ink, scene.balloon)).toBeGreaterThan(7)
      expect(contrastRatio(scene.ink, scene.brass)).toBeGreaterThan(7)
      // The words beside the Warden sit on the apron, in the balloon's colour.
      expect(contrastRatio(scene.balloon, scene.poche)).toBeGreaterThan(7)
      // Night paper: words on the house's own paper are bone on dark slate.
      expect(contrastRatio(scene.slateInk, scene.slate)).toBeGreaterThan(7)
      expect(contrastRatio(scene.slateInk, scene.slateBrass)).toBeGreaterThan(4.5)
      expect(contrastRatio(scene.slateInk, scene.poche)).toBeGreaterThan(7)
    }
    expect(css).toMatch(/\.hh-guide-balloon \{[^}]*color: var\(--hh-sc-ink\); background: var\(--hh-sc-balloon\)/)
    expect(css).toMatch(/\.hh-stage-pose \{[^}]*color: var\(--hh-sc-ink\)/)
    expect(css).toMatch(/--hh-sc-ink: var\(--hh-sc-slate-ink\); --hh-sc-balloon: var\(--hh-sc-slate\)/)
    expect(css).toMatch(/\.hh-guide-option:focus-visible \{ outline: 3px solid/)
    expect(css).toMatch(/\.hh-stage-exit:focus-visible \{ outline: 3px solid/)
  })
})

describe('painted rooms', () => {
  const paintings = [
    ...HOUSE_ROOM_IDS.flatMap((room) =>
      (['sealed', 'waiting', 'open', 'rejected'] as const).map((door) => <RoomPainting room={room} door={door} secondDoor={door} lit hasPrevious hasNext />),
    ),
    <RoomPainting room="foyer" door={null} hasPrevious={false} hasNext />,
    <DeskPainting />,
    ...WARDEN_POSES.map((pose) => <WardenArt pose={pose} />),
    <FrontDoorPainting />,
    ...SPECTRE_ROLES.flatMap((role) => PRESENTATION_GHOST_STATES.map((state) => <SpectreArt state={state} role={role} />)),
  ]

  it('are hidden, wordless drawings of plain shapes whose every paint the paint box defines', () => {
    for (const painting of paintings) {
      const { container, unmount } = render(painting)
      const svg = container.firstElementChild!
      expect(container.querySelectorAll('svg')).toHaveLength(1)
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      expect(svg.getAttribute('focusable')).toBe('false')
      expect(container.textContent).toBe('')
      for (const node of container.querySelectorAll('*')) {
        expect(['svg', 'g', 'path', 'rect', 'circle', 'ellipse']).toContain(node.tagName.toLowerCase())
        for (const attribute of node.getAttributeNames()) {
          expect(attribute).not.toMatch(/^(?:on|xlink|xmlns)|^(?:href|src|style|role|title|tabindex|id)$/i)
          expect(node.getAttribute(attribute) ?? '').not.toMatch(/NaN|undefined|url\(|https?:/)
        }
        for (const name of node.classList) {
          if (name.startsWith('hh-p-')) expect(PAINT_FILL_NAMES).toContain(name.slice(5))
          if (name.startsWith('hh-ps-')) expect(PAINT_LINE_NAMES).toContain(name.slice(6))
        }
      }
      unmount()
    }
  })

  it('shows each Door state on the painted door, and a different picture for each room', () => {
    const doorOf = (state: 'sealed' | 'waiting' | 'open' | 'rejected') => {
      const { container, unmount } = render(<RoomPainting room="study" door={state} hasPrevious hasNext />)
      const html = container.innerHTML
      unmount()
      return html
    }
    expect(new Set((['sealed', 'waiting', 'open', 'rejected'] as const).map(doorOf)).size).toBe(4)
    const rooms = HOUSE_ROOM_IDS.map((room) => {
      const { container, unmount } = render(<RoomPainting room={room} door={null} hasPrevious hasNext />)
      const html = container.innerHTML
      unmount()
      return html
    })
    expect(new Set(rooms).size).toBe(HOUSE_ROOM_IDS.length)
  })

  it('takes every paint from the Scene Palette and loads nothing', () => {
    expect(ROOM_PAINT_STYLES).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|url\(|@import|https?:/i)
    expect(paintSource).not.toMatch(/https?:|data:[a-z]+\/|url\(|<image\b|<use\b|<animate|dangerouslySetInnerHTML|<text\b/i)
    expect(paintSource).not.toMatch(/\bon[A-Z][A-Za-z]+[=:]|addEventListener|AudioContext/)
  })
})

describe('room box', () => {
  it('is hidden decoration that repeats each Door and ghost state of its room', () => {
    for (const room of waitingHouse().rooms) {
      const { container, unmount } = render(<RoomDiorama room={room} />)
      const stage = container.firstElementChild!
      expect(stage.getAttribute('aria-hidden')).toBe('true')
      expect(stage.getAttribute('data-scene')).toBe(room.roomId)
      expect(container.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
      expect(container.textContent).toBe('')
      expect(Array.from(container.querySelectorAll('.hh-stage-door'), (door) => door.getAttribute('data-door'))).toEqual(room.doors.map((door) => door.state))
      expect(Array.from(container.querySelectorAll('.hh-stage-ghost'), (ghost) => ghost.getAttribute('data-ghost'))).toEqual(room.ghosts.map((ghost) => ghost.state))
      unmount()
    }
  })
})
