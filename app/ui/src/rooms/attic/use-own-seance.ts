// Opens a séance log from the visitor's own computer in the static replay
// (Spec 11, own-seance). The file is read in the browser with File.text();
// the replay stand-in checks it whole and, if it is a whole log, the page
// starts again on it. Nothing is uploaded, stored or fetched.
import { useCallback, useState } from 'react'
import { REPLAY_RECORDING } from '../../adapters/sdk'

export interface OwnSeance {
  /** False where the page cannot open a log (the live app). */
  readonly available: boolean
  /** The last refusal, in one plain sentence, or null. */
  readonly refusal: string | null
  readonly open: (file: File | null | undefined) => void
}

export const OWN_SEANCE_UNREADABLE = 'That file could not be read.'
export const OWN_SEANCE_NOT_ONE = 'Open one file at a time.'

export function useOwnSeance(onAnnounce: (message: string) => void): OwnSeance {
  const replace = REPLAY_RECORDING?.replace
  const [refusal, setRefusal] = useState<string | null>(null)
  const open = useCallback(
    (file: File | null | undefined) => {
      if (replace === undefined || file === null || file === undefined) return
      file.text().then(
        (text) => {
          const result = replace(text, file.size)
          onAnnounce(result.message)
          setRefusal(result.ok ? null : result.message)
        },
        () => {
          onAnnounce(OWN_SEANCE_UNREADABLE)
          setRefusal(OWN_SEANCE_UNREADABLE)
        },
      )
    },
    [replace, onAnnounce],
  )
  return { available: replace !== undefined, refusal, open }
}
