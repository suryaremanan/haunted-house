// Playback controls of the Attic: one play control (Play, Pause or Resume),
// Restart, Previous, Next, the three speeds and the seek slider. Native
// controls only, so the keyboard works as the browser defines it: Enter or
// Space on a button, arrow keys inside the speed group and on the slider.
// A control that cannot act stays focusable, says why in words, and does nothing.
import { Gauge, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { useId } from 'react'
import { SPEED_OPTIONS, type TransportControl, type TransportView } from '../../core/attic-view'
import type { ReplaySpeed } from '../../core/replay-reducer'

export interface ReplayControlsProps {
  transport: TransportView
  speed: ReplaySpeed
  cursor: number
  total: number
  /** `Event n of N`, or `Start of replay`. */
  positionText: string
  onPlay: () => void
  onRestart: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (cursor: number) => void
  onSpeed: (speed: number) => void
}

export function ReplayControls({
  transport,
  speed,
  cursor,
  total,
  positionText,
  onPlay,
  onRestart,
  onPrevious,
  onNext,
  onSeek,
  onSpeed,
}: ReplayControlsProps) {
  const id = useId()
  const reasonId = (name: string) => `${id}-${name}-reason`
  const describedBy = (name: string, control: TransportControl) => (control.enabled ? undefined : reasonId(name))
  const reasons: readonly (readonly [string, string, TransportControl])[] = [
    ['play', transport.playLabel, transport.play],
    ['restart', 'Restart', transport.restart],
    ['previous', 'Previous event', transport.previous],
    ['next', 'Next event', transport.next],
  ]
  return (
    <div className="hh-attic-section" data-attic="controls">
      <div className="hh-attic-buttons">
        <button
          type="button"
          className="hh-attic-button"
          data-variant="primary"
          data-action={transport.playAction}
          data-guide-control="attic:toggle"
          aria-disabled={!transport.play.enabled}
          aria-describedby={describedBy('play', transport.play)}
          onClick={onPlay}
        >
          {transport.playAction === 'pause' ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {transport.playLabel}
        </button>
        <button
          type="button"
          className="hh-attic-button"
          data-action="restart"
          aria-disabled={!transport.restart.enabled}
          aria-describedby={describedBy('restart', transport.restart)}
          onClick={onRestart}
        >
          <RotateCcw size={16} aria-hidden />
          Restart
        </button>
        <button
          type="button"
          className="hh-attic-button"
          data-action="previous"
          aria-disabled={!transport.previous.enabled}
          aria-describedby={describedBy('previous', transport.previous)}
          onClick={onPrevious}
        >
          <SkipBack size={16} aria-hidden />
          Previous event
        </button>
        <button
          type="button"
          className="hh-attic-button"
          data-action="next"
          data-guide-control="attic:next"
          aria-disabled={!transport.next.enabled}
          aria-describedby={describedBy('next', transport.next)}
          onClick={onNext}
        >
          <SkipForward size={16} aria-hidden />
          Next event
        </button>
      </div>
      {reasons.some(([, , control]) => !control.enabled) ? (
        <ul className="hh-attic-reasons">
          {reasons.map(([name, label, control]) =>
            control.enabled ? null : (
              <li key={name} id={reasonId(name)}>
                {label}: {control.reason}
              </li>
            ),
          )}
        </ul>
      ) : null}
      <fieldset className="hh-attic-speed">
        <legend>
          <Gauge size={16} aria-hidden />
          Playback speed
        </legend>
        {SPEED_OPTIONS.map((option) => (
          <label key={option.speed}>
            <input
              type="radio"
              name={`${id}-speed`}
              value={option.speed}
              checked={speed === option.speed}
              onChange={() => onSpeed(option.speed)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <div className="hh-attic-seek">
        <label htmlFor={`${id}-seek`}>Replay position: {positionText}</label>
        <input
          id={`${id}-seek`}
          className="hh-attic-range"
          type="range"
          min={0}
          max={total}
          step={1}
          value={cursor}
          aria-valuetext={positionText}
          aria-disabled={!transport.seek.enabled}
          aria-describedby={transport.seek.enabled ? undefined : `${id}-seek-reason`}
          onChange={(event) => {
            if (transport.seek.enabled) onSeek(Number(event.currentTarget.value))
          }}
        />
        {transport.seek.enabled ? null : (
          <p className="hh-attic-muted" id={`${id}-seek-reason`}>
            {transport.seek.reason}
          </p>
        )}
      </div>
    </div>
  )
}
