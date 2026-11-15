// State of one revision request form (Spec 5 Requirements 5.7, 6.7): closed
// until the Operator opens it, focus into the field on open and back to the
// opening button on close, and one bounded text that is sent only by an
// explicit press. Nothing is sent while typing.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { checkFeedback, type FeedbackView, type RoomCommand } from '../../core/room-view'

export interface RevisionRequestModel {
  readonly open: boolean
  readonly text: string
  /** Why the last send was refused here. Null when there is nothing to fix. */
  readonly error: string | null
  readonly toggleRef: RefObject<HTMLButtonElement>
  readonly fieldRef: RefObject<HTMLTextAreaElement>
  readonly show: () => void
  readonly hide: () => void
  readonly change: (text: string) => void
  readonly submit: () => void
}

export function useRevisionRequest(view: FeedbackView, onSend: (command: RoomCommand) => void): RevisionRequestModel {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) fieldRef.current?.focus()
    if (!open && wasOpen.current) toggleRef.current?.focus()
    wasOpen.current = open
  }, [open])

  const show = useCallback(() => setOpen(true), [])
  const hide = useCallback(() => {
    setOpen(false)
    setError(null)
  }, [])
  const change = useCallback((next: string) => {
    setText(next)
    setError(null)
  }, [])
  const submit = useCallback(() => {
    if (!view.enabled) return
    const checked = checkFeedback(text)
    if (!checked.ok) {
      setError(checked.text)
      fieldRef.current?.focus()
      return
    }
    onSend({ kind: 'send_feedback', phase: view.phase, feedback: checked.feedback, expectedVersion: view.expectedVersion })
    setText('')
    setError(null)
    setOpen(false)
  }, [view.enabled, view.phase, view.expectedVersion, text, onSend])

  return { open, text, error, toggleRef, fieldRef, show, hide, change, submit }
}
