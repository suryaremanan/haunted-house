// Which open tasks the Operator has ticked for the next Workshop start. Local
// to the page: ticking sends nothing and starts nothing. A tick is dropped as
// soon as its task can no longer be selected, so a stale tick never rides
// along with a later start.
import { useCallback, useMemo, useState } from 'react'
import { workshopStartCommand, type RoomCommand, type TaskBoardView } from '../../core/room-view'

export interface TaskSelection {
  /** Ticked tasks that can still be selected. */
  readonly chosen: ReadonlySet<string>
  readonly toggle: (taskId: string) => void
  /** The start command for the ticked tasks, or null when it may not be sent. */
  readonly command: RoomCommand | null
  readonly clear: () => void
}

export function useTaskSelection(board: TaskBoardView): TaskSelection {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())
  const chosen = useMemo(() => {
    const selectable = new Set(board.waves.flatMap((wave) => wave.tasks.filter((row) => row.selectable).map((row) => row.taskId)))
    return new Set([...ticked].filter((taskId) => selectable.has(taskId)))
  }, [board.waves, ticked])
  const toggle = useCallback((taskId: string) => {
    setTicked((current) => {
      const next = new Set(current)
      if (!next.delete(taskId)) next.add(taskId)
      return next
    })
  }, [])
  const clear = useCallback(() => setTicked(new Set()), [])
  const command = useMemo(() => workshopStartCommand(board, chosen), [board, chosen])
  return { chosen, toggle, command, clear }
}
