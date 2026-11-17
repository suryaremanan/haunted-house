// The Warden at the Gate and in the Foyer hall (Spec 8, Requirements 9 and
// 10): his figure, the words that say how he stands, and his balloon. In the
// hall each choice is one of the Foyer's own actions: opening a listed
// mansion, asking what to build, or stepping outside again. He has no action
// of his own.
import { Megaphone } from 'lucide-react'
import { useId, type ReactNode, type RefObject } from 'react'
import { GuideBalloon } from '../../components/GuideBalloon'
import { WardenArt } from '../../components/room-paint'
import type { HallOption } from '../../core/first-visit'
import type { WardenPose } from '../../core/house-guide'
import type { WordMode } from '../../core/house-words'

export const CALL_WARDEN_LABEL = 'Call the Warden'
export const CALL_WARDEN_HINT = 'The Warden says what is true here and what you can do about it.'
export const STEPPED_BACK_LABEL = 'The Warden has stepped back.'

export interface HallGuideProps {
  /** What he says. */
  status: string
  /** His question, or null where the screen's own form asks it (the Gate). */
  question: string | null
  /** What he offers: at most four. */
  options: readonly HallOption[]
  pose: WardenPose
  poseLabel: string
  words: WordMode
  /** He has stepped back: the balloon is put away, and the screen's own form stays. */
  quiet: boolean
  onPress: (option: HallOption, from: HTMLElement) => void
  onStepBack: () => void
  onCallWarden: () => void
  statusRef?: RefObject<HTMLParagraphElement>
  /** The screen's own form, shown in the balloon under his words (the Gate's name and Knock, the idea). */
  children?: ReactNode
}

export function HallGuide({ status, question, options, pose, poseLabel, words, quiet, onPress, onStepBack, onCallWarden, statusRef, children }: HallGuideProps) {
  const callHintId = useId()
  const shown: WardenPose = quiet ? 'stepped-back' : pose
  return (
    <div className="hh-hall-guide" data-hall-guide data-quiet={quiet}>
      {quiet ? (
        children === undefined || children === null ? null : <div className="hh-hall-own">{children}</div>
      ) : (
        <GuideBalloon view={{ status, question, options, everything: options }} words={words} onPress={onPress} onStepBack={onStepBack} statusRef={statusRef}>
          {children}
        </GuideBalloon>
      )}
      <div className="hh-hall-keeper" data-guide-keeper>
        <span className="hh-hall-warden" aria-hidden="true">
          <WardenArt pose={shown} />
        </span>
        <div className="hh-hall-caption">
          <p className="hh-hall-pose" data-guide-pose={shown}>
            {quiet ? STEPPED_BACK_LABEL : poseLabel}
          </p>
          {quiet ? (
            <>
              <button type="button" className="hh-stage-call" data-guide-call aria-describedby={callHintId} onClick={onCallWarden}>
                <Megaphone size={13} aria-hidden />
                {CALL_WARDEN_LABEL}
              </button>
              <span className="hh-guide-hidden" id={callHintId}>
                {CALL_WARDEN_HINT}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
