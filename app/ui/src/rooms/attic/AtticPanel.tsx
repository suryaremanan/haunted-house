// The Attic: the replay of the open Mansion's séance log (replay-and-submission
// task 4.2; Requirement 3). It is the body of the Attic room panel: the Mansion
// Shell's panel host supplies the heading, Close, Escape and focus return, and
// puts any session link after it.
//
// Order, also the Tab order: what this is, playback controls with the Cursor
// and event count, the state at this point, the Timeline, the diagnostics.
// The panel takes a replay and an announcer and nothing else: it has no
// mutation, no navigation and no live region of its own.
import { History, Lock, RefreshCw } from 'lucide-react'
import { useId } from 'react'
import type { AtticReplay } from '../../adapters/attic-replay'
import { LIVE_REPLAY_TEXT, LOADING_LOG_TEXT, READ_ONLY_REPLAY_TEXT } from '../../core/attic-view'
import type { EffectiveMotion } from '../../core/motion-policy'
import { ATTIC_STYLES } from './attic-styles'
import { ReplayControls } from './ReplayControls'
import { ReplayDiagnostics } from './ReplayDiagnostics'
import { ReplaySummary } from './ReplaySummary'
import { ReplayTimeline } from './ReplayTimeline'
import { useAtticPanel } from './use-attic-panel'

export interface AtticPanelProps {
  /** `useAtticReplay` of the open Mansion, called by the Mansion Shell. */
  replay: AtticReplay
  /** Receives each announcement for the page's one polite live region. */
  onAnnounce: (message: string) => void
  /** The Motion Policy's verdict. Anything but `low-frequency` shows no transition. Default `none`. */
  motion?: EffectiveMotion
  /** Announces the replay's own outcomes. False when another control on the page (the replay bar) already does. Default true. */
  watch?: boolean
}

export function AtticPanel({ replay, onAnnounce, motion = 'none', watch = true }: AtticPanelProps) {
  const panel = useAtticPanel(replay, onAnnounce, { watch })
  const id = useId()
  const loading = replay.source === 'loading' && panel.total === 0
  return (
    <div className="hh-attic" data-attic-panel data-mode={replay.mode} data-motion={motion} data-source={replay.source}>
      <style>{ATTIC_STYLES}</style>
      <p className="hh-attic-note" data-attic="mode">
        {replay.readOnly ? <Lock size={16} aria-hidden /> : <History size={16} aria-hidden />}
        <span>{replay.readOnly ? READ_ONLY_REPLAY_TEXT : LIVE_REPLAY_TEXT}</span>
      </p>
      {loading ? (
        <p className="hh-attic-line hh-attic-muted" data-attic="loading">
          <RefreshCw size={16} aria-hidden />
          <span>{LOADING_LOG_TEXT}</span>
        </p>
      ) : null}
      <section className="hh-attic-section" aria-labelledby={`${id}-controls`}>
        <h4 id={`${id}-controls`}>Playback</h4>
        <ReplayControls
          transport={panel.transport}
          speed={panel.speed}
          cursor={panel.cursor}
          total={panel.total}
          positionText={panel.summary.positionText}
          onPlay={panel.onPlay}
          onRestart={panel.onRestart}
          onPrevious={panel.onPrevious}
          onNext={panel.onNext}
          onSeek={panel.onSeek}
          onSpeed={panel.onSpeed}
        />
      </section>
      <section className="hh-attic-section" aria-labelledby={`${id}-summary`}>
        <h4 id={`${id}-summary`}>The house at this point</h4>
        <ReplaySummary summary={panel.summary} status={replay.state.status} />
      </section>
      <section className="hh-attic-section" aria-labelledby={`${id}-timeline`}>
        <h4 id={`${id}-timeline`}>Timeline</h4>
        <ReplayTimeline rows={panel.rows} label="Timeline of recorded events" />
      </section>
      <section className="hh-attic-section" aria-labelledby={`${id}-diagnostics`}>
        <h4 id={`${id}-diagnostics`}>Diagnostics</h4>
        <ReplayDiagnostics diagnostics={panel.diagnostics} />
      </section>
    </div>
  )
}
