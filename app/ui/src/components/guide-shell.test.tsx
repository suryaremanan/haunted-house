// The Warden in the Mansion Shell (Spec 8, Requirements 4 to 8): every choice
// presses a control the house already has, a decision is never one stray
// Enter away, a press that cannot be carried out changes nothing and says
// why, and his settings work whether he is talking or has stepped back.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { OpenSurface } from '../core/house-projection'
import { Shell, newRecorded, quietHouse, waitingHouse } from '../test/shell-kit'
import { NO_GUIDE_SETTINGS, SETTING_SAID, type GuideSettings, type SurfaceApi } from './MansionShell'
import { NOT_AVAILABLE_TEXT } from './use-guide-press'

const choice = (name: string) => screen.getByRole('button', { name })
const choices = () => Array.from(document.querySelectorAll('[data-guide-primary] .hh-guide-option-label'), (item) => item.textContent)
const announced = () => document.querySelector('[data-announcer]')!.textContent
const status = () => document.querySelector('[data-guide-text]')!
const panel = () => document.querySelector<HTMLElement>('.hh-ui-panel')

describe('a choice presses a control the house already has', () => {
  it('opens a room, a ghost and a door through the house map, and decides nothing by looking', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    expect(choices()).toEqual(['Read what it must do', 'Ask for a change', 'Go to the door', 'See the whole house'])

    fireEvent.click(choice('Go to the door'))
    expect(panel()!.getAttribute('data-surface')).toBe('door')
    // The surface was opened by the map's own Door control: it is marked as the open one.
    expect(document.querySelector('[data-opener-key][aria-expanded="true"]')!.getAttribute('aria-label')).toBe('Requirements door of the Study. State: waiting.')

    fireEvent.click(choice('Read what it must do again'))
    expect(panel()!.getAttribute('data-room-panel')).toBe('study')
    expect(recorded.decisions).toEqual([])
  })

  it('offers a decision only beside the thing decided, and then presses the real button', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    // In the bare room nothing decides, in the short list or the long one.
    fireEvent.click(choice('Something else…'))
    expect(document.querySelectorAll('[data-guide-option][data-kind="decide"]')).toHaveLength(0)

    fireEvent.click(choice('Read what it must do'))
    expect(panel()!.getAttribute('data-room-panel')).toBe('study')
    const open = choice('Open the door')
    expect(open.getAttribute('data-kind')).toBe('decide')
    expect(open).toHaveAccessibleDescription('Accepts this version. The next step can then be started.')
    expect(recorded.decisions).toEqual([])

    fireEvent.click(open)
    // One decision, made by the panel's own button.
    expect(recorded.decisions).toEqual([{ kind: 'room', roomId: 'study' }])
  })

  it('puts focus on what is being decided, so a second Enter decides nothing', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    const read = choice('Read what it must do')
    read.focus()
    fireEvent.click(read)
    // The sheet took the focus: its heading, or the proposal itself. Never a button.
    const focused = document.activeElement as HTMLElement
    expect(panel()!.contains(focused)).toBe(true)
    expect(focused.tagName).not.toBe('BUTTON')
    fireEvent.keyDown(focused, { key: 'Enter' })
    fireEvent.keyUp(focused, { key: 'Enter' })
    expect(recorded.decisions).toEqual([])

    // The door: focus goes to the proposal, one Tab before its buttons.
    fireEvent.click(choice('Close this sheet'))
    fireEvent.click(choice('Read what it must do'))
    fireEvent.click(choice('Close this sheet'))
    expect(panel()).toBeNull()
    expect(recorded.decisions).toEqual([])
  })

  it('changes nothing and says why when the control is not there', () => {
    const recorded = newRecorded()
    render(<Shell projection={quietHouse()} recorded={recorded} />)
    expect(choices()[0]).toBe('Have the Archivist write what it must do')
    // The stand-in sheet of this test has no start control at all.
    fireEvent.click(choice('Have the Archivist write what it must do'))
    expect(panel()!.getAttribute('data-room-panel')).toBe('study')
    expect(document.querySelector('[data-guide-refusal]')!.textContent).toBe(NOT_AVAILABLE_TEXT)
    // The visitor asked, so the one live region says it once.
    expect(announced()).toBe(NOT_AVAILABLE_TEXT)
    expect(recorded.decisions).toEqual([])
    // The next press starts clean.
    fireEvent.click(choice('Close this sheet'))
    expect(document.querySelector('[data-guide-refusal]')).toBeNull()
  })

  it('changes nothing and gives the control’s own reason when the control is switched off', () => {
    const started = vi.fn()
    const body = (surface: OpenSurface, _api: SurfaceApi): ReactNode =>
      surface.target.kind !== 'room' ? null : (
        <>
          <button type="button" data-guide-control="start:requirements" aria-disabled="true" aria-describedby="why-off" onClick={started}>
            Start requirements
          </button>
          <p id="why-off">The house is catching up. Its controls are off.</p>
        </>
      )
    render(<Shell projection={quietHouse()} recorded={newRecorded()} renderSurface={body} />)
    fireEvent.click(choice('Have the Archivist write what it must do'))
    expect(started).not.toHaveBeenCalled()
    expect(document.querySelector('[data-guide-refusal]')!.textContent).toBe('The house is catching up. Its controls are off.')
    expect(announced()).toBe('The house is catching up. Its controls are off.')
  })

  it('presses each control of a plan only after the one before has taken effect', () => {
    const presses: string[] = []
    function Body() {
      const [ticked, setTicked] = useState(false)
      return (
        <>
          <input type="checkbox" data-guide-control="task:1" aria-label="Select task 1" checked={ticked} onChange={() => setTicked((value) => !value)} />
          {/* Like the task board: the start works only once a task is ticked. */}
          <button type="button" data-guide-control="start-workshop" aria-disabled={!ticked} onClick={() => presses.push(ticked ? 'start with a task ticked' : 'start with nothing ticked')}>
            Start
          </button>
        </>
      )
    }
    const house = waitingHouse()
    // The to-do list approved and the build ready, read by the Workshop.
    const ready = {
      ...house,
      rooms: house.rooms.map((room) =>
        room.roomId !== 'workshop'
          ? { ...room, waitingItems: [] }
          : {
              ...room,
              waitingItems: [],
              ghosts: [],
              doors: room.doors.map((door) =>
                door.phase === 'tasks' ? { ...door, state: 'open' as const, phaseStatus: 'approved' as const } : { ...door, state: 'sealed' as const, phaseStatus: 'ready' as const },
              ),
            },
      ),
      needsYou: [],
    }
    render(<Shell projection={ready} recorded={newRecorded()} renderSurface={(surface) => (surface.target.roomId === 'workshop' ? <Body /> : null)} />)
    fireEvent.click(choice('Something else…'))
    fireEvent.click(choice('Go to the Workshop'))
    fireEvent.click(choice('Build everything that is ready'))
    expect(presses).toEqual(['start with a task ticked'])
  })
})

describe('quiet mode', () => {
  it('puts the balloon away, keeps the house working, and brings him back on request', () => {
    const recorded = newRecorded()
    render(<Shell projection={waitingHouse()} recorded={recorded} />)
    fireEvent.click(choice('Step back'))
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
    expect(document.querySelector('[data-guide-pose]')!.textContent).toBe('The Warden has stepped back.')
    expect(document.querySelector('.hh-paint-warden')!.getAttribute('data-pose')).toBe('stepped-back')
    expect(announced()).toBe(SETTING_SAID.quiet(true))
    const call = choice('Call the Warden')
    expect(call).toHaveFocus()

    // Everything he offered is still there to press: the map, the toolbar, the panels.
    fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="study"]')!)
    expect(panel()!.getAttribute('data-room-panel')).toBe('study')
    fireEvent.click(within(panel()!).getByRole('button', { name: 'Approve' }))
    expect(recorded.decisions).toHaveLength(1)
    fireEvent.click(choice('Needs you: 2 things need you. Go to the first.'))
    expect(panel()).not.toBeNull()
    // His settings stay on the apron.
    expect(choice('House map: closed')).toBeInTheDocument()
    expect(choice("Show Kiro's words: off")).toBeInTheDocument()
    expect(choice('Show me what I can press: off')).toBeInTheDocument()
    // He stays back until he is called, whatever the house does.
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()

    fireEvent.click(choice('Call the Warden'))
    expect(document.querySelector('[data-guide-balloon]')).not.toBeNull()
    expect(status()).toHaveFocus()
    expect(announced()).toBe(SETTING_SAID.quiet(false))
  })
})

describe("the guide's settings", () => {
  it("shows Kiro's words beside the plain ones on request, from the apron or from the balloon", () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    expect(status().textContent).toBe('The Archivist has finished what it must do. The door waits for you.')
    const toggle = choice("Show Kiro's words: off")
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(choice("Show Kiro's words: on")).toHaveAttribute('aria-pressed', 'true')
    expect(status().textContent).toBe('The Archivist has finished what it must do (requirements). The door waits for you.')
    expect(choice('Read what it must do (requirements)')).toBeInTheDocument()
    expect(announced()).toBe(SETTING_SAID.kiroWords(true))
    // The balloon's own choice presses that same toggle.
    fireEvent.click(choice('Something else…'))
    fireEvent.click(choice("Hide Kiro's words"))
    expect(choice("Show Kiro's words: off")).toHaveAttribute('aria-pressed', 'false')
    expect(announced()).toBe(SETTING_SAID.kiroWords(false))
  })

  it('labels every working thing on request, and each label presses what its object presses', () => {
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    expect(document.querySelector('[data-object-labels]')).toBeNull()
    fireEvent.click(choice('Show me what I can press: off'))
    expect(announced()).toBe(SETTING_SAID.reveal(true))
    const labels = document.querySelector<HTMLElement>('[data-object-labels]')!
    expect(Array.from(labels.querySelectorAll('button'), (button) => button.textContent)).toEqual([
      'To the Foyer',
      'Archivist: done',
      'Door for what it must do: waiting',
      "Ledger: this room's sheet",
      'Bell: 2 things need you',
    ])
    // Real buttons, each named by its label and what a press does.
    for (const button of labels.querySelectorAll('button')) {
      expect(button.tabIndex).toBe(0)
      expect(button.getAttribute('aria-label')!.startsWith(button.textContent!)).toBe(true)
      expect(button.getAttribute('aria-label')!.length).toBeGreaterThan(button.textContent!.length)
    }
    fireEvent.click(within(labels).getByRole('button', { name: /^Archivist: done/ }))
    expect(panel()!.getAttribute('data-surface')).toBe('ghost')
    fireEvent.click(choice('Show me what I can press: on'))
    expect(document.querySelector('[data-object-labels]')).toBeNull()
    expect(announced()).toBe(SETTING_SAID.reveal(false))
  })

  it('toggles the labels on the ? key, except while typing', () => {
    render(
      <>
        <Shell projection={waitingHouse()} recorded={newRecorded()} />
        <input aria-label="A text field" />
      </>,
    )
    fireEvent.keyDown(document.body, { key: '?' })
    expect(document.querySelector('[data-object-labels]')).not.toBeNull()
    fireEvent.keyDown(document.body, { key: '?' })
    expect(document.querySelector('[data-object-labels]')).toBeNull()
    // In a text field it is a question mark and nothing else.
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'A text field' }), { key: '?' })
    expect(document.querySelector('[data-object-labels]')).toBeNull()
    // With a modifier it is someone else's shortcut.
    fireEvent.keyDown(document.body, { key: '?', ctrlKey: true })
    expect(document.querySelector('[data-object-labels]')).toBeNull()
  })

  it('closes on Escape in order: the sheet, the map, the labels, and only then the Mansion', () => {
    const onReturn = vi.fn()
    render(<Shell projection={waitingHouse()} recorded={newRecorded()} onReturn={onReturn} />)
    fireEvent.click(choice('Show me what I can press: off'))
    fireEvent.click(choice('House map: closed'))
    fireEvent.click(document.querySelector<HTMLElement>('[data-room-control="study"]')!)
    expect(panel()).not.toBeNull()
    // Opening something from the map puts the map away again.
    expect(document.querySelector('.hh-ui')!.getAttribute('data-map')).toBe('closed')
    fireEvent.click(choice('House map: closed'))

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(panel()).toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(document.querySelector('.hh-ui')!.getAttribute('data-map')).toBe('closed')
    expect(document.querySelector('[data-object-labels]')).not.toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(document.querySelector('[data-object-labels]')).toBeNull()
    expect(onReturn).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onReturn).toHaveBeenCalledTimes(1)
  })

  it('starts every setting off, and lets the page hold them so they outlast one Mansion', () => {
    expect(NO_GUIDE_SETTINGS).toEqual({ quiet: false, kiroWords: false, reveal: false })
    const changes: GuideSettings[] = []
    function Page() {
      const [settings, setSettings] = useState(NO_GUIDE_SETTINGS)
      return (
        <Shell
          projection={waitingHouse()}
          recorded={newRecorded()}
          guide={{
            settings,
            onChange: (next) => {
              changes.push(next)
              setSettings(next)
            },
          }}
        />
      )
    }
    render(<Page />)
    fireEvent.click(choice("Show Kiro's words: off"))
    fireEvent.click(choice('Step back'))
    expect(changes).toEqual([
      { quiet: false, kiroWords: true, reveal: false },
      { quiet: true, kiroWords: true, reveal: false },
    ])
    expect(document.querySelector('[data-guide-balloon]')).toBeNull()
  })
})

describe('inside the interruption budget', () => {
  it('changes the balloon in place and announces nothing when the house changes', () => {
    const { rerender } = render(<Shell projection={waitingHouse()} recorded={newRecorded()} />)
    const before = announced()
    expect(status().textContent).toBe('The Archivist has finished what it must do. The door waits for you.')
    act(() => rerender(<Shell projection={quietHouse()} recorded={newRecorded()} />))
    // The house changed under the visitor: new words, new pose, and not a word in the live region.
    expect(status().textContent).toBe('This is the Study. The Archivist writes what it must do here. Nothing is written yet.')
    expect(document.querySelector('[data-guide-pose]')!.textContent).toBe('The Warden points to your next step.')
    expect(announced()).toBe(before)
    // One live region, and the balloon is not one.
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
    expect(document.querySelector('[data-guide-balloon]')!.closest('[aria-live], [role="dialog"], [aria-modal]')).toBeNull()
    // Focus did not move either.
    expect(document.querySelector('[data-stage-room]')!.contains(document.activeElement)).toBe(false)
  })
})
