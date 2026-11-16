// The replay bar (static replay only): a compact strip at the top of the
// mansion view with the recording's own transport. It is a second view of the
// one replay the Attic plays: it renders an `AtticPanelModel` and sends the
// same Replay Commands through its handlers. It holds no state of its own.
//
// It also says, once for the whole house, that this is a recording and that
// nothing can be decided here. Controls that cannot act stay focusable and
// carry their reason as their description.
import { CircleDot, Gauge, Lock, Pause, Play, RotateCcw } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { SPEED_OPTIONS } from '../../core/attic-view'
import type { AtticPanelModel } from './use-attic-panel'

export interface ReplayBarProps {
  panel: AtticPanelModel
  /** The house's read-only sentence: why nothing can be decided here. */
  readOnlyText: string
  /** Shown at the start of the recording only: how to begin. */
  startText: string | null
}

export const REPLAY_BAR_LABEL = 'Recording playback'

export function ReplayBar({ panel, readOnlyText, startText }: ReplayBarProps) {
  const id = useId()
  const { transport } = panel
  const reason = (name: string, control: { enabled: boolean; reason?: string | null }): ReactNode =>
    control.enabled ? null : (
      <span className="hh-ui-visually-hidden" id={`${id}-${name}`}>
        {control.reason}
      </span>
    )
  return (
    <div className="hh-ui-replay-bar" role="group" aria-label={REPLAY_BAR_LABEL} data-replay-bar>
      <span className="hh-ui-replay-label">
        <CircleDot size={16} aria-hidden />
        Recording
      </span>
      <div className="hh-ui-replay-buttons">
        <button
          type="button"
          className="hh-ui-button"
          data-variant="primary"
          data-action={transport.playAction}
          aria-disabled={!transport.play.enabled}
          aria-describedby={transport.play.enabled ? undefined : `${id}-play`}
          onClick={panel.onPlay}
        >
          {transport.playAction === 'pause' ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {transport.playLabel}
        </button>
        <button
          type="button"
          className="hh-ui-button"
          data-action="restart"
          aria-disabled={!transport.restart.enabled}
          aria-describedby={transport.restart.enabled ? undefined : `${id}-restart`}
          onClick={panel.onRestart}
        >
          <RotateCcw size={16} aria-hidden />
          Restart
        </button>
        {reason('play', transport.play)}
        {reason('restart', transport.restart)}
      </div>
      <div className="hh-ui-replay-progress">
        <label className="hh-ui-replay-position" htmlFor={`${id}-seek`}>
          {panel.summary.positionText}
        </label>
        <input
          id={`${id}-seek`}
          className="hh-ui-replay-range"
          type="range"
          min={0}
          max={panel.total}
          step={1}
          value={panel.cursor}
          aria-label={`Recording position: ${panel.summary.positionText}`}
          aria-valuetext={panel.summary.positionText}
          aria-disabled={!transport.seek.enabled}
          onChange={(event) => {
            if (transport.seek.enabled) panel.onSeek(Number(event.currentTarget.value))
          }}
        />
      </div>
      <fieldset className="hh-ui-replay-speed">
        <legend>
          <Gauge size={14} aria-hidden /> Speed
        </legend>
        {SPEED_OPTIONS.map((option) => (
          <label key={option.speed}>
            <input
              type="radio"
              name={`${id}-speed`}
              value={option.speed}
              checked={panel.speed === option.speed}
              onChange={() => panel.onSpeed(option.speed)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <p className="hh-ui-note hh-ui-replay-note" data-kind="read-only" data-block="read_only">
        <Lock size={16} aria-hidden />
        <span>
          {readOnlyText}
          {startText === null ? null : (
            <span data-replay-start>
              {' '}
              {startText}
            </span>
          )}
        </span>
      </p>
    </div>
  )
}
