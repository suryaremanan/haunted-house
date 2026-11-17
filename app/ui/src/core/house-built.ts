// What was made (Spec 8, Requirement 13): once every Door is open, the list of
// what now exists, each thing under its everyday name, Kiro's name and its
// real file path, and how to open the same folder in Kiro.
//
// It lists only what was approved: a document appears when its Door is open,
// a piece of work when it is finished. It reads values the house already
// holds and adds no command, request or state.
//
// Pure: no React, DOM, SDK, network, storage, timer or clock.
import { isBuilt } from './house-guide'
import type { HouseProjection } from './house-projection'
import { term, type TermId } from './house-words'

export const BUILT_DOCUMENT_PHASES = ['requirements', 'design', 'tasks'] as const
export type BuiltDocumentPhase = (typeof BUILT_DOCUMENT_PHASES)[number]

export interface BuiltInput {
  /** The documents of the rooms, with the path the house wrote them at. */
  readonly documents: readonly { readonly phase: BuiltDocumentPhase; readonly path: string }[]
  /** The rows of the Workshop's task board. */
  readonly tasks: readonly { readonly taskId: string; readonly title: string; readonly complete: boolean; readonly writes: readonly string[] }[]
  /** The mansion's folder as the backend reported it: home-relative. */
  readonly folder: string
}

export interface BuiltRow {
  readonly term: TermId
  readonly plain: string
  readonly kiro: string
  /** The real path of the file inside the project folder. */
  readonly path: string
}

export interface BuiltTask {
  readonly taskId: string
  readonly title: string
  /** The files the to-do list names for this piece of work. */
  readonly files: readonly string[]
}

export interface BuiltView {
  /** True when every phase Door is open. */
  readonly built: boolean
  readonly rows: readonly BuiltRow[]
  readonly tasks: readonly BuiltTask[]
  readonly folder: string
  /** Set in a recording: the folder is somewhere else. */
  readonly folderNote: string | null
  /** How to open the folder in Kiro. Empty in a recording. */
  readonly steps: readonly string[]
}

export const BUILT_STEPS: readonly string[] = ['Open Kiro.', 'Choose File, then Open Folder.', 'Pick the folder shown above.', 'The plan is listed under Specs.']
export const REPLAY_FOLDER_NOTE = 'This is a recording. The folder was on the computer that made it, not on this one.'

function doorOpen(projection: HouseProjection, phase: BuiltDocumentPhase): boolean {
  return projection.rooms.some((room) => room.doors.some((door) => door.phase === phase && door.state === 'open'))
}

/** The summary of a Mansion's work products. Total and pure. */
export function builtView(projection: HouseProjection, input: BuiltInput): BuiltView {
  const rows: BuiltRow[] = []
  for (const phase of BUILT_DOCUMENT_PHASES) {
    if (!doorOpen(projection, phase)) continue
    const entry = term(phase)
    // Only a path that ends in the file Kiro keeps for this term is shown.
    const supplied = input.documents.find((candidate) => candidate.phase === phase && entry.file !== null && candidate.path.split('/').pop() === entry.file)
    if (supplied === undefined) continue
    rows.push({ term: phase, plain: entry.plain, kiro: entry.kiro, path: supplied.path })
  }
  const replay = projection.mode === 'replay'
  return {
    built: isBuilt(projection),
    rows,
    tasks: input.tasks.filter((task) => task.complete).map((task) => ({ taskId: task.taskId, title: task.title, files: [...task.writes] })),
    folder: input.folder,
    folderNote: replay ? REPLAY_FOLDER_NOTE : null,
    steps: replay ? [] : BUILT_STEPS,
  }
}
