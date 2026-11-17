// What was made, as a component (Spec 8, Requirement 13): the approved
// documents under their plain word, Kiro's word and their real path, the
// finished work, the folder, and how to open it in Kiro. It reads a built
// view and sends nothing.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUILT_STEPS, REPLAY_FOLDER_NOTE, builtView, type BuiltInput } from '../../core/house-built'
import type { HouseProjection } from '../../core/house-projection'
import { waitingHouse } from '../../test/shell-kit'
import { BUILT_LEDE, BUILT_OPEN_TITLE, BUILT_TITLE, BUILT_WORK_TITLE, BuiltPage } from './BuiltPage'

const INPUT: BuiltInput = {
  documents: [
    { phase: 'tasks', path: '.kiro/specs/guest-book/tasks.md' },
    { phase: 'requirements', path: '.kiro/specs/guest-book/requirements.md' },
    { phase: 'design', path: '.kiro/specs/guest-book/design.md' },
  ],
  tasks: [
    { taskId: '1.1', title: 'Write the entry model', complete: true, writes: ['src/entry.py', 'tests/test_entry.py'] },
    { taskId: '1.2', title: 'Write the command line', complete: false, writes: ['src/cli.py'] },
  ],
  folder: '~/workspace/haunted-house/mansions/guest-book',
}

/** The fixture house with the Doors of the given phases open, the rest as they were. */
function houseWith(open: readonly string[], mode: HouseProjection['mode'] = 'live'): HouseProjection {
  const house = waitingHouse({ mode })
  return { ...house, rooms: house.rooms.map((room) => ({ ...room, doors: room.doors.map((door) => ({ ...door, state: open.includes(door.phase) ? ('open' as const) : door.state })) })) }
}

const EVERY = ['requirements', 'design', 'tasks', 'implementation']

describe('what was made', () => {
  it('is not shown until every Door is open', () => {
    const { container } = render(<BuiltPage view={builtView(houseWith(['requirements', 'design', 'tasks']), INPUT)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each approved document under its plain word, Kiro’s word and its real path, in phase order', () => {
    render(<BuiltPage view={builtView(houseWith(EVERY), INPUT)} />)
    const section = screen.getByRole('region', { name: BUILT_TITLE })
    expect(within(section).getByText(BUILT_LEDE)).toBeInTheDocument()
    const table = within(section).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['What', 'Kiro calls it', 'File'])
    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['What it must do', 'How it will work', 'To-do list'])
    expect(Array.from(table.querySelectorAll('tbody tr'), (row) => Array.from(row.querySelectorAll('td'), (cell) => cell.textContent))).toEqual([
      ['requirements', '.kiro/specs/guest-book/requirements.md'],
      ['design', '.kiro/specs/guest-book/design.md'],
      ['tasks', '.kiro/specs/guest-book/tasks.md'],
    ])
  })

  it('lists finished work with the files the list names for it, and leaves out work that is not finished', () => {
    render(<BuiltPage view={builtView(houseWith(EVERY), INPUT)} />)
    expect(screen.getByText(BUILT_WORK_TITLE)).toBeInTheDocument()
    const tasks = Array.from(document.querySelectorAll('[data-built-task]'))
    expect(tasks.map((task) => task.getAttribute('data-built-task'))).toEqual(['1.1'])
    expect(tasks[0].querySelector('span')!.textContent).toBe('Write the entry model')
    expect(Array.from(tasks[0].querySelectorAll('code'), (file) => file.textContent)).toEqual(['src/entry.py', 'tests/test_entry.py'])
    expect(document.body.textContent).not.toContain('Write the command line')
  })

  it('shows the folder as the backend reported it and the steps that open it in Kiro', () => {
    render(<BuiltPage view={builtView(houseWith(EVERY), INPUT)} />)
    expect(screen.getByText(BUILT_OPEN_TITLE)).toBeInTheDocument()
    expect(document.querySelector('[data-built-folder]')!.textContent).toBe(INPUT.folder)
    expect(screen.getAllByRole('listitem').slice(-BUILT_STEPS.length).map((item) => item.textContent)).toEqual([...BUILT_STEPS])
    expect(document.querySelector('[data-built-note]')).toBeNull()
  })

  it('says in a recording that the folder is not on this computer, and gives no steps', () => {
    render(<BuiltPage view={builtView(houseWith(EVERY, 'replay'), INPUT)} />)
    expect(document.querySelector('[data-built-note]')!.textContent).toBe(REPLAY_FOLDER_NOTE)
    expect(document.querySelector('ol')).toBeNull()
  })

  it('is one labelled section that can take focus, and has nothing to press', () => {
    render(<BuiltPage view={builtView(houseWith(EVERY), INPUT)} />)
    const section = screen.getByRole('region', { name: BUILT_TITLE })
    expect(section).toHaveAttribute('data-section', 'built')
    expect(section.tabIndex).toBe(-1)
    // It adds no command and no request: there is no control in it at all.
    expect(section.querySelectorAll('button, a, input, textarea, select, form, [role="button"], [onclick]')).toHaveLength(0)
  })
})
