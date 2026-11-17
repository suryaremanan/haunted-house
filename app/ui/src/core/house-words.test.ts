// The Word Book says the words the real controls and Kiro's files say
// (Spec 8, Requirements 7.1, 7.2, 7.9, 7.10). If a control is renamed, this
// fails until the book follows, so the guide can never teach a word the house
// does not use.
import { describe, expect, it } from 'vitest'
import decisionSource from '../rooms/house/DecisionButtons.tsx?raw'
import revisionSource from '../rooms/house/RevisionRequest.tsx?raw'
import { PHASE_NAMES } from './house-view'
import { TERMS, TERM_IDS, isTermId, namesKiroWord, term, termsIn, word, write } from './house-words'
import roomViewSource from './room-view.ts?raw'

describe('the Word Book', () => {
  it('holds the eight terms the owner listed, word for word', () => {
    const pairs = Object.fromEntries(TERMS.map((entry) => [entry.plain, entry.kiro]))
    expect(pairs).toMatchObject({
      plan: 'spec',
      'what it must do': 'requirements',
      'how it will work': 'design',
      'to-do list': 'tasks',
      ghost: 'agent',
      'open the door': 'approve',
      'house rules': 'steering',
      wall: 'path limit',
    })
    expect(TERMS.map((entry) => entry.id)).toEqual([...TERM_IDS])
    expect(new Set(TERMS.map((entry) => entry.plain)).size).toBe(TERMS.length)
    expect(new Set(TERMS.map((entry) => entry.kiro)).size).toBe(TERMS.length)
  })

  it('explains every term in exactly two plain sentences', () => {
    for (const entry of TERMS) {
      expect(entry.about).toHaveLength(2)
      for (const sentence of entry.about) {
        expect(sentence, entry.id).toMatch(/^[A-Z].*\.$/)
        expect(sentence, entry.id).not.toMatch(/[!?]/)
        // One sentence: no full stop followed by the start of another.
        expect(sentence.split(/(?<=\.)\s+(?=[A-Z])/), entry.id).toHaveLength(1)
      }
      // The explanation is of Kiro's word, so it says it.
      expect(namesKiroWord(entry.about.join(' ')), entry.id).toBe(true)
    }
  })

  it('never uses a Kiro word as an everyday word', () => {
    for (const entry of TERMS) expect(namesKiroWord(entry.plain), entry.id).toBe(false)
  })
})

describe("Kiro's words are the words on the real controls", () => {
  it('names each phase as the house names it', () => {
    expect(term('requirements').kiro).toBe(PHASE_NAMES.requirements.toLowerCase())
    expect(term('design').kiro).toBe(PHASE_NAMES.design.toLowerCase())
    expect(term('tasks').kiro).toBe(PHASE_NAMES.tasks.toLowerCase())
    expect(term('build').kiro).toBe(PHASE_NAMES.implementation.toLowerCase())
  })

  it('names a decision as its two buttons do', () => {
    const approve = /'Sending…' : '([A-Za-z]+)'/.exec(decisionSource)?.[1]
    const reject = />\s*\n\s*([A-Z][a-z]+)\s*\n\s*<\/button>\s*\n\s*<\/div>/.exec(decisionSource)?.[1]
    expect(approve?.toLowerCase()).toBe(term('approve').kiro)
    expect(reject?.toLowerCase()).toBe(term('reject').kiro)
  })

  it('names a change request as its send button does', () => {
    expect(revisionSource).toContain(`Send ${term('revise').kiro}`)
  })

  it('names each document file as the house writes it', () => {
    // One path shape for every document: .kiro/specs/<name>/<phase>.md
    expect(roomViewSource).toContain('`.kiro/specs/${specName}/${phase}.md`')
    expect('.kiro/specs/').toContain(`${term('plan').kiro}s`)
    for (const id of ['requirements', 'design', 'tasks'] as const) expect(term(id).file).toBe(`${term(id).kiro}.md`)
    for (const entry of TERMS) if (!['requirements', 'design', 'tasks'].includes(entry.id)) expect(entry.file, entry.id).toBeNull()
  })
})

describe('writing with the book', () => {
  it('shows the everyday word alone, or with the Kiro word beside it', () => {
    expect(word('requirements', 'plain')).toBe('what it must do')
    expect(word('requirements', 'with-kiro')).toBe('what it must do (requirements)')
    expect(word('wall', 'with-kiro')).toBe('wall (path limit)')
  })

  it('fills the slots of a template and starts a sentence with a capital', () => {
    expect(write('The Archivist writes {requirements} here.', 'plain')).toBe('The Archivist writes what it must do here.')
    expect(write('The Archivist writes {requirements} here.', 'with-kiro')).toBe('The Archivist writes what it must do (requirements) here.')
    expect(write('{Build} is under way.', 'plain')).toBe('The build is under way.')
    expect(write('{Build} is under way.', 'with-kiro')).toBe('The build (implementation) is under way.')
    // A slot that names no term stays as written; text without slots is untouched.
    expect(write('Keep {this} and that.', 'plain')).toBe('Keep {this} and that.')
    expect(write('No slots here.', 'with-kiro')).toBe('No slots here.')
  })

  it('lists the terms a template names, once each, in order', () => {
    expect(termsIn('The Foreman writes the {tasks}, and the Tinkers do {build}. The {tasks} comes first.')).toEqual(['tasks', 'build'])
    expect(termsIn('{Requirements} and {unknown}.')).toEqual(['requirements'])
    expect(termsIn('Nothing named.')).toEqual([])
    expect(isTermId('wall')).toBe(true)
    expect(isTermId('door')).toBe(false)
  })

  it('spots a Kiro word only as a whole word', () => {
    expect(namesKiroWord('Read the requirements.')).toBe(true)
    expect(namesKiroWord('The Design is ready.')).toBe(true)
    expect(namesKiroWord('Send a revision request.')).toBe(true)
    expect(namesKiroWord('It keeps to its path limit.')).toBe(true)
    expect(namesKiroWord('Another ghost holds this task.')).toBe(false)
    expect(namesKiroWord('Nothing can be approved or rejected here.')).toBe(false)
    expect(namesKiroWord('The designer inspected the specification.')).toBe(false)
    expect(namesKiroWord('Read what it must do.')).toBe(false)
  })
})
