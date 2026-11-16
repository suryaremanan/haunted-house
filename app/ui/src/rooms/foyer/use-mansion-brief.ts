// State for the optional feature brief in the create form. The normalising
// rule lives in core/mansion-api.ts (it mirrors the backend); this hook only
// holds the text, the error shown after a refused submit, and the counter copy.
import { useCallback, useMemo, useState } from 'react'
import { MAX_MANSION_BRIEF_LENGTH, normalizeMansionBrief, type MansionBriefResult } from '../../core/mansion-api'

export const MANSION_BRIEF_LABEL = 'What should this mansion become?'
export const MANSION_BRIEF_HINT =
  'Optional. A few plain sentences about the feature; the Archivist reads them before writing requirements.'
export const MANSION_BRIEF_TOO_LONG = `Keep the brief to ${MAX_MANSION_BRIEF_LENGTH} characters or fewer.`
export const MANSION_BRIEF_INVALID = 'Remove control characters from the brief. Line breaks and tabs are fine.'

/** Counter copy: code points of the normalised, trimmed brief against the limit. */
export const briefCounterText = (result: MansionBriefResult): string =>
  `${result.length} / ${MAX_MANSION_BRIEF_LENGTH} characters${result.ok ? '' : result.reason === 'too_long' ? ', too long' : ''}`

const refusalCopy = (result: MansionBriefResult): string | null =>
  result.ok ? null : result.reason === 'too_long' ? MANSION_BRIEF_TOO_LONG : MANSION_BRIEF_INVALID

export interface MansionBriefField {
  readonly text: string
  readonly counter: string
  readonly error: string | null
  readonly change: (text: string) => void
  /** Shows the refusal, if any, and returns true when the brief may be sent. */
  readonly check: () => boolean
  readonly clear: () => void
}

export const useMansionBrief = (): MansionBriefField => {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const result = useMemo(() => normalizeMansionBrief(text), [text])

  const change = useCallback((next: string) => {
    setText(next)
    setError(null)
  }, [])
  const check = useCallback(() => {
    const refusal = refusalCopy(result)
    setError(refusal)
    return refusal === null
  }, [result])
  const clear = useCallback(() => {
    setText('')
    setError(null)
  }, [])

  return { text, counter: briefCounterText(result), error, change, check, clear }
}
