// Handlers and announcements of the Attic panel (replay-and-submission task
// 4.2; Requirements 3.4, 3.6, 3.9). The components only render.
//
// Every handler sends one Replay Command to the controller and nothing else:
// the Attic has no mutation and no navigation. The page's one live region is
// used for what the Operator asked for or must know, and for nothing else:
//   - an explicit Previous, Next or Restart press says the new position;
//   - a replay that played to its end says so, once;
//   - a refused command and a log that could not be read say why.
// A timer step, Play, Pause, Resume, a speed change and the seek slider (which
// speaks its own value text) announce nothing.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { AtticReplay } from '../../adapters/attic-replay'
import {
  atticSummary,
  completeAnnouncement,
  diagnosticsView,
  positionAnnouncement,
  timelineRows,
  transportView,
  type AtticSummary,
  type DiagnosticsView,
  type TimelineRow,
  type TransportView,
} from '../../core/attic-view'
import type { ReplaySpeed } from '../../core/replay-reducer'
import { REPLAY_DIAGNOSTIC_TEXT } from '../../core/replay-timeline'

export interface AtticPanelModel {
  readonly transport: TransportView
  readonly summary: AtticSummary
  readonly rows: readonly TimelineRow[]
  readonly diagnostics: DiagnosticsView
  readonly speed: ReplaySpeed
  readonly cursor: number
  readonly total: number
  readonly onPlay: () => void
  readonly onRestart: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onSeek: (cursor: number) => void
  readonly onSpeed: (speed: number) => void
}

export interface AtticPanelOptions {
  /**
   * Announces the replay's own outcomes (played to its end, a refused command,
   * an unreadable log). Exactly one caller per page watches, so each is said once.
   * Default true.
   */
  readonly watch?: boolean
  /** Reads a live log again when this caller mounts: the Attic room does, the replay bar does not. Default true. */
  readonly refresh?: boolean
}

export function useAtticPanel(
  replay: AtticReplay,
  onAnnounce: (message: string) => void,
  { watch = true, refresh: refreshOnMount = true }: AtticPanelOptions = {},
): AtticPanelModel {
  const { model, state, command, mansionId, source, mode, refresh } = replay
  const announceRef = useRef(onAnnounce)
  announceRef.current = onAnnounce

  const transport = useMemo(() => transportView(model, state), [model, state])
  const summary = useMemo(() => atticSummary(model, state, mansionId), [model, state, mansionId])
  const rows = useMemo(() => timelineRows(model, state.cursor), [model, state.cursor])
  const diagnostics = useMemo(() => diagnosticsView(model, state), [model, state])

  // Handlers read the latest view through a ref, so they stay stable while playback runs.
  const latest = useRef({ transport, model })
  latest.current = { transport, model }

  const onPlay = useCallback(() => {
    const { transport: view } = latest.current
    if (view.play.enabled) command({ kind: view.playAction })
  }, [command])
  const onRestart = useCallback(() => {
    const { transport: view, model: current } = latest.current
    if (!view.restart.enabled) return
    command({ kind: 'restart' })
    announceRef.current(positionAnnouncement(current, 0))
  }, [command])
  const step = useCallback(
    (direction: 'previous' | 'next') => {
      const { transport: view, model: current } = latest.current
      if (!view[direction].enabled) return
      const cursor = direction === 'previous' ? view.previousCursor : view.nextCursor
      command({ kind: 'seek', cursor })
      announceRef.current(positionAnnouncement(current, cursor))
    },
    [command],
  )
  const onPrevious = useCallback(() => step('previous'), [step])
  const onNext = useCallback(() => step('next'), [step])
  const onSeek = useCallback((cursor: number) => command({ kind: 'seek', cursor }), [command])
  const onSpeed = useCallback((speed: number) => command({ kind: 'set_speed', speed }), [command])

  // A replay that played to its end: said once. Reaching the end by a seek is not announced here.
  const previousStatus = useRef(state.status)
  useEffect(() => {
    const before = previousStatus.current
    previousStatus.current = state.status
    if (watch && before === 'playing' && state.status === 'complete') announceRef.current(completeAnnouncement(model))
  }, [state.status, model, watch])

  // A refused command: its fixed copy, once per refusal.
  useEffect(() => {
    if (watch && state.commandError !== null) announceRef.current(state.commandError.safeDetail)
  }, [state.commandError, watch])

  // A log that could not be read.
  useEffect(() => {
    if (watch && source === 'error') announceRef.current(REPLAY_DIAGNOSTIC_TEXT.fixture_unavailable)
  }, [source, watch])

  // In Crew the log may have grown since the Mansion was opened: opening the Attic reads it again.
  // A recording never changes, so the static build reads it once.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  useEffect(() => {
    if (refreshOnMount && mode === 'live') refreshRef.current()
  }, [mode, mansionId, refreshOnMount])

  return {
    transport,
    summary,
    rows,
    diagnostics,
    speed: state.speed,
    cursor: state.cursor,
    total: model.records.length,
    onPlay,
    onRestart,
    onPrevious,
    onNext,
    onSeek,
    onSpeed,
  }
}
