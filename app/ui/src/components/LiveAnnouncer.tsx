// The one polite live region of an open Mansion (Spec 6 task 5.3;
// Requirements 4.4 to 4.7). It shows the latest message it was given and
// nothing else: an interruption summary, or the result of something the
// Operator just asked for. Ambient state never reaches it, so the previous
// message stays until the next one. No room or panel may add another region.
export interface LiveAnnouncerProps {
  /** The latest message. An empty string leaves the region empty. */
  message: string
  /**
   * Counts the messages. The region element stays; its text node is replaced
   * on each turn, so the same words said twice are still announced twice.
   */
  turn?: number
}

export function LiveAnnouncer({ message, turn = 0 }: LiveAnnouncerProps) {
  return (
    <p className="hh-ui-announcer" aria-live="polite" aria-atomic="true" data-announcer>
      <span key={turn}>{message}</span>
    </p>
  )
}
