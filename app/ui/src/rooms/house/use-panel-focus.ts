// Focus management for the room panel (Requirement 9.8): opening a room moves
// focus to its heading; closing it returns focus to the room's button on the
// map; and when a decided proposal's controls disappear under the focus, the
// heading takes it instead of the page losing it.
import { useEffect, useRef, type RefObject } from 'react'
import type { RoomId } from '../../core/house-view'

export function usePanelFocus(
  root: RefObject<HTMLElement | null>,
  heading: RefObject<HTMLElement | null>,
  openRoom: RoomId | null,
  inFlight: string | null,
): void {
  const previousRoom = useRef<RoomId | null>(null)
  useEffect(() => {
    const before = previousRoom.current
    previousRoom.current = openRoom
    if (openRoom !== null && openRoom !== before) {
      heading.current?.focus()
    } else if (openRoom === null && before !== null) {
      root.current?.querySelector<HTMLElement>(`[data-room="${before}"]`)?.focus()
    }
  }, [openRoom, heading, root])

  const wasInFlight = useRef<string | null>(null)
  useEffect(() => {
    const settled = wasInFlight.current !== null && inFlight === null
    wasInFlight.current = inFlight
    if (!settled || openRoom === null) return
    const active = document.activeElement
    if (active === null || active === document.body) heading.current?.focus()
  }, [inFlight, openRoom, heading])
}
