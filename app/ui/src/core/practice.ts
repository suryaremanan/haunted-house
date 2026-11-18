// The practice house (Spec 10, practice-house): in the public replay a
// visitor makes the owner's decisions. This module reads, from the canonical
// log alone, where the owner decided (the Decision Points), what was asked
// there and what the owner chose; and the run's numbers. It decides nothing
// and changes nothing: a practice answer is compared with the recording and
// explained, never written anywhere.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import type { AppEvent } from './seance-event'
import { readDomainRecord, type DomainRecord } from './workflow-fold'

export type PracticeChoice = 'approved' | 'rejected'

export interface DecisionPoint {
  /** The Sequence of the record that holds the owner's decision. Playback stops on the record before it. */
  readonly sequence: number
  /** The decision record itself. */
  readonly eventId: string
  readonly subject: 'door' | 'risky'
  readonly proposalId: string
  readonly ghostId: string
  /** What the owner was asked, in plain words. */
  readonly question: string
  /** The two answers the owner had, in the order approve, refuse. */
  readonly choices: readonly [string, string]
  /** What the owner chose in the recording. */
  readonly recorded: PracticeChoice
}

const DECISIONS: Readonly<Record<string, { subject: DecisionPoint['subject']; outcome: PracticeChoice }>> = {
  door_approved: { subject: 'door', outcome: 'approved' },
  door_rejected: { subject: 'door', outcome: 'rejected' },
  risky_action_approved: { subject: 'risky', outcome: 'approved' },
  risky_action_rejected: { subject: 'risky', outcome: 'rejected' },
}

const PHASE_WORDS: Readonly<Record<string, string>> = {
  requirements: 'what it must do (the requirements)',
  design: 'how it will be built (the design)',
  tasks: 'the to-do list (the tasks)',
  implementation: 'the finished work',
}

export const PRACTICE_NOTE = 'Practice. Nothing real changes: this is a recording.'

function ghostName(ghostId: string): string {
  const [role, number] = ghostId.split('-')
  const name = role.charAt(0).toUpperCase() + role.slice(1)
  return number === undefined ? `the ${name}` : `${name} ${number}`
}

function commandOf(records: readonly DomainRecord[], proposalId: string): string | null {
  const proposed = records.find((record) => record.kind === 'risky_action_proposed' && record.data.proposal_id === proposalId)
  const descriptor = proposed?.data.descriptor as { arguments?: { argv?: unknown } } | undefined
  const argv = descriptor?.arguments?.argv
  return Array.isArray(argv) && argv.every((part) => typeof part === 'string') ? argv.join(' ') : null
}

/** Every owner decision in the log, in Sequence order, once per proposal (the first decision wins, as in the fold). */
export function decisionPoints(events: readonly AppEvent[]): readonly DecisionPoint[] {
  const records = events.map(readDomainRecord).filter((record): record is DomainRecord => record !== null && typeof record !== 'string')
  const seen = new Set<string>()
  const points: DecisionPoint[] = []
  for (const record of records) {
    const decision = DECISIONS[record.kind]
    const proposalId = record.data.proposal_id
    if (decision === undefined || typeof proposalId !== 'string' || seen.has(proposalId)) continue
    seen.add(proposalId)
    if (decision.subject === 'door') {
      const phase = typeof record.data.phase === 'string' ? record.data.phase : ''
      points.push({
        sequence: record.sequence,
        eventId: record.eventId,
        subject: 'door',
        proposalId,
        ghostId: record.ghostId,
        question: `${ghostName(record.ghostId).replace(/^the/, 'The')} has finished ${PHASE_WORDS[phase] ?? 'its work'}. Do you open the door?`,
        choices: ['Open the door', 'Keep it shut and ask for changes'],
        recorded: decision.outcome,
      })
    } else {
      const command = commandOf(records, proposalId)
      points.push({
        sequence: record.sequence,
        eventId: record.eventId,
        subject: 'risky',
        proposalId,
        ghostId: record.ghostId,
        question: `${ghostName(record.ghostId).replace(/^the/, 'The')} wants to run ${command === null ? 'a command' : `"${command}"`}. Do you let it?`,
        choices: ['Allow it, once', 'Refuse it'],
        recorded: decision.outcome,
      })
    }
  }
  return points.sort((a, b) => a.sequence - b.sequence)
}

/** The first Decision Point after `cursor` (records shown so far), or null. */
export function nextDecision(points: readonly DecisionPoint[], cursor: number): DecisionPoint | null {
  return points.find((point) => point.sequence > cursor) ?? null
}

export interface PracticeAnswer {
  /** What the visitor's choice means. */
  readonly meaning: string
  /** What the owner chose in the recording. */
  readonly recorded: string
  readonly same: boolean
}

/** Explains a practice choice against the recording. Nothing is decided. */
export function practiceAnswer(point: DecisionPoint, choice: PracticeChoice): PracticeAnswer {
  const meaning =
    point.subject === 'door'
      ? choice === 'approved'
        ? 'Opening the door accepts this version, and the next room may start.'
        : 'Keeping it shut stops the next room from starting until the work is changed and shown to you again.'
      : choice === 'approved'
        ? 'Allowing it lets this exact command run once, in the folder it named, and nothing else.'
        : 'Refusing it means nothing runs. The ghost goes back to its work and may ask again for less.'
  const recorded = point.recorded === 'approved' ? `In the recording, the owner chose: ${point.choices[0].toLowerCase()}.` : `In the recording, the owner chose: ${point.choices[1].toLowerCase()}.`
  return { meaning, recorded, same: choice === point.recorded }
}

export interface LogNumbers {
  readonly records: number
  readonly ghosts: number
  /** Times the house waited for a person: Door proposals and risky-action proposals. */
  readonly waits: number
}

/** The run in numbers, counted from the log. */
export function logNumbers(events: readonly AppEvent[]): LogNumbers {
  const ghosts = new Set(events.map((event) => event.scope.ghost_id).filter((id) => id !== ''))
  let waits = 0
  for (const event of events) {
    const record = readDomainRecord(event)
    if (record !== null && typeof record !== 'string' && (record.kind === 'phase_output_ready' || record.kind === 'risky_action_proposed')) waits += 1
  }
  return { records: events.length, ghosts: ghosts.size, waits }
}

export function logNumbersText(numbers: LogNumbers): string {
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  return `This recording holds ${plural(numbers.records, 'event', 'events')} from ${plural(numbers.ghosts, 'ghost', 'ghosts')}. The house stopped and waited for a person ${plural(numbers.waits, 'time', 'times')}.`
}
