// Contract of the 3D stage: its sheet, its drawings and the room box. Static
// checks of what ships; rendered evidence is the screenshot pass.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HOUSE_ROOM_IDS, PRESENTATION_GHOST_STATES } from '../core/house-registry'
import { ROOM_GUIDE_TEXT, guideFor, guideText } from '../core/house-guide'
import { Shell, newRecorded, waitingHouse } from '../test/shell-kit'
import { SCENE_PALETTES, contrastRatio, sceneVariableName } from './house-palette'
import { DESK_ITEMS, StageDeskArt, StagePlinthArt, StagePropArt, StageRoofArt, StageSkyArt, StageWallArt, StageYardArt } from './house-stage-art'
import { DOOR_SWING_SECONDS, HOUSE_STAGE_STYLES, STAGE_MIN_LOOP_SECONDS } from './house-stage-styles'
import { RoomDiorama } from './RoomDiorama'
import { CaretakerArt, DeskPainting, FrontDoorPainting, RoomPainting, SPECTRE_ROLES, SpectreArt } from './room-paint'
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
    <StagePlinthArt />,
  ]

  it('are single hidden, unfocusable, wordless svgs of plain shapes', () => {
    expect(drawings).toHaveLength(21)
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
  it('says the most pressing thing about the room and names the rooms either side', () => {
    const house = waitingHouse()
    const study = house.rooms.find((room) => room.roomId === 'study')!
    expect(guideFor(house, 'study')).toMatchObject({ previous: { roomId: 'foyer' }, next: { roomId: 'drafting-room' } })
    expect(guideFor(house, 'foyer')!.previous).toBeNull()
    expect(guideText({ ...study, waitingItems: [], ghosts: [] })).toBe(ROOM_GUIDE_TEXT.study)
    expect(guideText({ ...study, waitingItems: [], ghosts: [{ ghostId: 'archivist', name: 'Archivist', state: 'working', reason: null, pendingText: null }] })).toBe(
      'Archivist is at work. A door opens only when you approve it.',
    )
    expect(guideText({ ...study, waitingItems: study.waitingItems.slice(0, 1) })).toBe("One thing in this room is waiting for you. It is on this room's sheet.")
    expect(guideText({ ...study, locked: true, diagnostic: 'Locked for now.' })).toBe('Locked for now.')
  })

  it('opens a surface from a pressed figure through the map control, and walks to the next room', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    const ghost = document.querySelector<HTMLElement>('[data-stage-room] .hh-stage-figure')!
    expect(ghost.closest('[aria-hidden="true"]')).not.toBeNull()
    fireEvent.click(ghost)
    expect(document.querySelector('.hh-ui-panel')!.getAttribute('data-surface')).toBe('ghost')
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
  it('is on show from the start, with the Caretaker, his choices and the things on the desk', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    const stage = document.querySelector('[data-stage-room]')!
    // It starts in the first room that needs the Operator.
    expect(stage.getAttribute('data-stage-room')).toBe('study')
    expect(stage.querySelector('[data-stage-title]')!.textContent).toBe('You are in the Study')
    expect(Array.from(stage.querySelectorAll('.hh-stage-option'), (item) => item.textContent)).toEqual([
      'Look around the Study',
      'Go to the Foyer',
      'Go to the Drafting Room',
      'See the whole house',
    ])
    // The painting and its pressable spots are pointer-only decoration: no focus stop, and each spot presses a real control.
    for (const spots of stage.querySelectorAll('.hh-stage-spots')) {
      expect(spots.getAttribute('aria-hidden')).toBe('true')
      expect(spots.querySelectorAll('button, [tabindex]')).toHaveLength(0)
    }
    expect(stage.querySelector('.hh-paint')!.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(stage.querySelector("[data-spot='ledger']")!)
    expect(document.querySelector('.hh-ui-panel')!.getAttribute('data-room-panel')).toBe('study')
    // With the room open, the choice to open it is gone.
    expect(Array.from(stage.querySelectorAll('.hh-stage-option'), (item) => item.textContent)).not.toContain('Look around the Study')
    // The map of the whole house is laid over the room on request, takes focus, and is put away again.
    const root = document.querySelector('.hh-ui')!
    expect(root.getAttribute('data-map')).toBe('closed')
    fireEvent.click(screen.getByRole('button', { name: 'See the whole house' }))
    expect(root.getAttribute('data-map')).toBe('open')
    expect(document.activeElement).toBe(document.querySelector('[data-map-title]'))
    fireEvent.click(screen.getByRole('button', { name: 'Put the house map away' }))
    expect(root.getAttribute('data-map')).toBe('closed')
    expect(recorded.decisions).toEqual([])
  })

  it('sets its text on the balloon and the nameplate in ink, well above 4.5:1', () => {
    for (const mode of ['light', 'dark'] as const) {
      const scene = SCENE_PALETTES[mode]
      expect(contrastRatio(scene.ink, scene.balloon)).toBeGreaterThan(7)
      expect(contrastRatio(scene.ink, scene.brass)).toBeGreaterThan(7)
    }
    expect(css).toMatch(/\.hh-stage-balloon \{[^}]*color: var\(--hh-sc-ink\); background: var\(--hh-sc-balloon\)/)
    expect(css).toMatch(/\.hh-stage-option:focus-visible \{ outline: 3px solid/)
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
    <CaretakerArt />,
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
