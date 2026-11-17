// The Word Book (Spec 8, Requirement 7): every idea the guide names, once.
// Each term has the everyday word the guide uses, the word Kiro and the real
// controls use, and two sentences that say what it is. The guide writes with
// the plain word and can show Kiro's beside it, so a newcomer needs no Kiro
// vocabulary and meets all of it on the way.
//
// This is the only place a plain word, a Kiro word or an explanation is
// written. Guide copy is written as templates with `{term}` slots and filled
// here; it never types these words itself.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.

export const TERM_IDS = ['plan', 'requirements', 'design', 'tasks', 'build', 'ghost', 'approve', 'reject', 'revise', 'steering', 'wall'] as const
export type TermId = (typeof TERM_IDS)[number]

export interface Term {
  readonly id: TermId
  /** The everyday word. */
  readonly plain: string
  /** The word Kiro, a Kiro file or the real control uses. */
  readonly kiro: string
  /** What it is, in exactly two sentences. */
  readonly about: readonly [string, string]
  /** The Kiro file of the term, when it has one. */
  readonly file: string | null
}

/** `plain`: the everyday word alone. `with-kiro`: Kiro's word beside it. */
export type WordMode = 'plain' | 'with-kiro'

export const TERMS: readonly Term[] = [
  {
    id: 'plan',
    plain: 'plan',
    kiro: 'spec',
    about: ["A spec is Kiro's name for the written plan of one feature.", 'It is three files: requirements, design and tasks.'],
    file: null,
  },
  {
    id: 'requirements',
    plain: 'what it must do',
    kiro: 'requirements',
    about: ['Requirements say what the software must do, one testable statement at a time.', 'Kiro keeps them in requirements.md.'],
    file: 'requirements.md',
  },
  {
    id: 'design',
    plain: 'how it will work',
    kiro: 'design',
    about: ['The design says how the software will be built to meet the requirements.', 'Kiro keeps it in design.md.'],
    file: 'design.md',
  },
  {
    id: 'tasks',
    plain: 'to-do list',
    kiro: 'tasks',
    about: ['Tasks are the ordered to-do list that turns the design into code.', 'Kiro keeps them in tasks.md and ticks each one off.'],
    file: 'tasks.md',
  },
  {
    id: 'build',
    plain: 'the build',
    kiro: 'implementation',
    about: ['Implementation is the work of carrying out the tasks.', 'Each finished task leaves code in the project folder.'],
    file: null,
  },
  {
    id: 'ghost',
    plain: 'ghost',
    kiro: 'agent',
    about: ['An agent is an AI worker with one job and its own limits.', 'Each ghost in this house is one Kiro agent.'],
    file: null,
  },
  {
    id: 'approve',
    plain: 'open the door',
    kiro: 'approve',
    about: ['Approving says a document is good enough to build on.', 'Nothing moves to the next step until you approve.'],
    file: null,
  },
  {
    id: 'reject',
    plain: 'keep the door shut',
    kiro: 'reject',
    about: ['To reject a document says it is not good enough yet.', 'The door stays shut until a new version is approved.'],
    file: null,
  },
  {
    id: 'revise',
    plain: 'ask for a change',
    kiro: 'revision request',
    about: ['A revision request is one note to the ghost that wrote the document.', 'It writes a new version, and the door stays shut meanwhile.'],
    file: null,
  },
  {
    id: 'steering',
    plain: 'house rules',
    kiro: 'steering',
    about: ['Steering is the standing guidance every agent reads before it works.', 'It keeps the work in line with how the project is run.'],
    file: null,
  },
  {
    id: 'wall',
    plain: 'wall',
    kiro: 'path limit',
    about: ['A path limit is the list of folders an agent may read and write.', 'An attempt to go outside it is refused.'],
    file: null,
  },
]

const BY_ID: ReadonlyMap<string, Term> = new Map(TERMS.map((entry) => [entry.id, entry]))

export function isTermId(value: unknown): value is TermId {
  return typeof value === 'string' && BY_ID.has(value)
}

export function term(id: TermId): Term {
  return BY_ID.get(id)!
}

/** The word to show for a term: "what it must do", or "what it must do (requirements)". */
export function word(id: TermId, mode: WordMode): string {
  const entry = term(id)
  return mode === 'with-kiro' ? `${entry.plain} (${entry.kiro})` : entry.plain
}

const SLOT = /\{([A-Za-z]+)\}/g

function capitalised(text: string): string {
  return text === '' ? text : text[0].toUpperCase() + text.slice(1)
}

/**
 * Fills the `{term}` slots of a template. `{Requirements}` (capitalised) starts
 * the word with a capital, for the start of a sentence. A slot that names no
 * term is left as written.
 */
export function write(template: string, mode: WordMode): string {
  return template.replace(SLOT, (whole, name: string) => {
    const id = name[0].toLowerCase() + name.slice(1)
    if (!isTermId(id)) return whole
    const shown = word(id, mode)
    return name[0] === name[0].toUpperCase() ? capitalised(shown) : shown
  })
}

/** The terms a template names, in the order they first appear. */
export function termsIn(template: string): readonly TermId[] {
  const found: TermId[] = []
  for (const match of template.matchAll(SLOT)) {
    const id = match[1][0].toLowerCase() + match[1].slice(1)
    if (isTermId(id) && !found.includes(id)) found.push(id)
  }
  return found
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const KIRO_WORD = new RegExp(`(?<![A-Za-z0-9_$])(?:${TERMS.map((entry) => escapeRegExp(entry.kiro)).join('|')})(?![A-Za-z0-9_$])`, 'i')

/** True when the text holds a Kiro word of the book as a whole word. Used to check plain copy. */
export function namesKiroWord(text: string): boolean {
  return KIRO_WORD.test(text)
}
