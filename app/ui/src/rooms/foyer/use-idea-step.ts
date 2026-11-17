// State of the Idea Step (Spec 8, Requirement 10): the idea's text under the
// existing Mansion brief rules, the example it started from, and the name the
// project folder will get. Nothing here sends anything.
import { useCallback, useMemo, useState } from 'react'
import { mansionNameFromIdea, type ExampleIdea } from '../../core/first-visit'
import { normalizeMansionBrief } from '../../core/mansion-api'
import { useMansionBrief } from './use-mansion-brief'

export const IDEA_REQUIRED = 'Say what you want to build, or pick an example.'

/** A mansion the Idea Step has already made from an idea, when opening it did not succeed. */
export interface MadeFromIdea {
  readonly name: string
  readonly brief: string
}

export interface IdeaStepField {
  readonly text: string
  readonly counter: string
  /** Why the idea cannot be sent as it is, or null. */
  readonly error: string | null
  /** The name the project folder gets. Shown before anything is made. */
  readonly name: string
  /** True when that folder is already made from this very idea, so only opening it is left. */
  readonly alreadyMade: boolean
  readonly pick: (idea: ExampleIdea) => void
  readonly change: (text: string) => void
  /** Shows the refusal, if any, and returns true when the idea may be sent. */
  readonly check: () => boolean
}

export function useIdeaStep(mansions: readonly { readonly name: string }[], made: MadeFromIdea | null): IdeaStepField {
  const brief = useMansionBrief()
  /** The example the idea started from: it keeps that example's name, also after its words are edited. */
  const [preferred, setPreferred] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  const taken = useMemo(() => new Set(mansions.map((mansion) => mansion.name)), [mansions])
  const blank = useMemo(() => normalizeMansionBrief(brief.text).length === 0, [brief.text])
  const alreadyMade = made !== null && made.brief === brief.text
  const name = useMemo(() => (alreadyMade ? made.name : mansionNameFromIdea(brief.text, taken, preferred)), [alreadyMade, made, brief.text, taken, preferred])

  const pick = useCallback(
    (idea: ExampleIdea) => {
      brief.change(idea.brief)
      setPreferred(idea.name)
      setMissing(false)
    },
    [brief.change],
  )
  const change = useCallback(
    (text: string) => {
      brief.change(text)
      setMissing(false)
      // An emptied field starts over: the next idea is named for itself.
      if (text.trim() === '') setPreferred(null)
    },
    [brief.change],
  )
  const check = useCallback(() => {
    if (blank) {
      setMissing(true)
      return false
    }
    return brief.check()
  }, [blank, brief.check])

  return { text: brief.text, counter: brief.counter, error: missing ? IDEA_REQUIRED : brief.error, name, alreadyMade, pick, change, check }
}
