// The Attic's door for a séance log of the visitor's own (Spec 11,
// own-seance): drop a file on it, or choose one. Only in the static replay.
// What the file holds is shown later by the same house, as text only.
import { FileUp } from 'lucide-react'
import { useId, useState } from 'react'
import { OWN_SEANCE_NOT_ONE, useOwnSeance } from './use-own-seance'

export const OWN_SEANCE_TITLE = 'Replay your own séance'
export const OWN_SEANCE_LEDE =
  'Drop a séance log file here, or choose one, to watch that run instead. It is read on this page only: nothing is uploaded or kept, and it is gone when you leave.'
export const OWN_SEANCE_CHOOSE = 'Choose a séance log'

export function OwnSeanceDrop({ onAnnounce }: { onAnnounce: (message: string) => void }) {
  const own = useOwnSeance(onAnnounce)
  const id = useId()
  const [over, setOver] = useState(false)
  const [tooMany, setTooMany] = useState(false)
  if (!own.available) return null
  return (
    <section
      className="hh-attic-section hh-attic-own"
      aria-labelledby={`${id}-own`}
      data-own-seance
      data-over={over}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const files = event.dataTransfer.files
        setTooMany(files.length > 1)
        if (files.length === 1) own.open(files[0])
      }}
    >
      <h4 id={`${id}-own`}>{OWN_SEANCE_TITLE}</h4>
      <p>{OWN_SEANCE_LEDE}</p>
      <label className="hh-attic-own-choose">
        <FileUp size={16} aria-hidden />
        <span>{OWN_SEANCE_CHOOSE}</span>
        <input
          type="file"
          accept=".jsonl,.ndjson,.json,.txt,application/x-ndjson,text/plain"
          data-own-seance-input
          onChange={(event) => {
            setTooMany(false)
            own.open(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }}
        />
      </label>
      {tooMany || own.refusal !== null ? (
        <p className="hh-attic-own-refusal" data-own-seance-refusal>
          {tooMany ? OWN_SEANCE_NOT_ONE : own.refusal}
        </p>
      ) : null}
    </section>
  )
}
