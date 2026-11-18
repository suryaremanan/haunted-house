// The room the visitor stands in (the walk-in view): one painted room fills
// the stage, a desk runs across the front, and the Warden stands on the apron
// below it with his balloon. The balloon says what is true now and lists what
// can be done; the Warden's pose says what kind of moment it is.
//
// Everything painted is decoration. A pointer may press a ghost, a door or a
// thing on the desk as a shortcut, and with labels on show each of those has a
// real, labelled button. Every press, from the painting, a label or the
// balloon, is a press plan: the page presses the one real control for it
// elsewhere. Nothing here decides anything.
import { Ghost, Languages, LogOut, Map as MapIcon, Megaphone, MousePointerClick } from 'lucide-react'
import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { FRIGHT_TEXT, cobwebStep, dreadEffects, roomLight, wardenStance, type FrightLevel } from '../core/dread'
import { workingObjects, type Box, type WorkingObject } from '../core/guide-layout'
import { pressedControls, type GuideView, type PressStep } from '../core/house-guide'
import type { HouseProjection } from '../core/house-projection'
import type { EffectiveMotion } from '../core/motion-policy'
import type { RoomId } from '../core/house-registry'
import type { WordMode } from '../core/house-words'
import { GuideBalloon } from './GuideBalloon'
import { ObjectLabels } from './ObjectLabels'
import { Atmosphere, FleeingGhost, HollowSpectre, StateLight, WardenShadow, type LeakAt } from './dread-art'
import { useHoldAftermath } from './use-hold-aftermath'
import { DeskPainting, RoomPainting, SpectreArt, WardenArt, spectreRoleOf } from './room-paint'

/** The guide's own settings, kept on the apron so they work while the Warden has stepped back. */
export interface StageSettings {
  /** Whether the map of the whole house lies over the room. */
  readonly mapOpen: boolean
  readonly onToggleMap: () => void
  readonly kiroWords: boolean
  readonly onToggleWords: () => void
  readonly reveal: boolean
  readonly onToggleReveal: () => void
  /** How frightening the house is drawn: Calm, Eerie or Dread. It changes no word and no control. */
  readonly fright: FrightLevel
  readonly onCycleFright: () => void
}

export interface RoomStageProps {
  projection: HouseProjection
  roomId: RoomId
  /** What the Warden says, offers and how he stands, for this room. */
  view: GuideView
  words: WordMode
  /** The Warden has stepped back: no balloon. */
  quiet?: boolean
  settings: StageSettings
  /** True while a surface of this room is open over the stage. */
  open?: boolean
  /** Runs a press plan: the page presses the real controls. `from` is the control the visitor pressed. */
  onPress: (steps: readonly PressStep[], from?: HTMLElement | null) => void
  onStepBack: () => void
  onCallWarden: () => void
  /** Leaves the Mansion for the Foyer. Omitted on a page that cannot. */
  onReturn?: () => void
  /** Why the last press did nothing. */
  refusal?: string | null
  statusRef?: RefObject<HTMLParagraphElement>
  /** Whether the house may move (the Motion Policy). */
  motion?: EffectiveMotion
  /** Shown in place of the Warden's own balloon while it is not null (the replay's practice question). */
  balloon?: ReactNode
}

export const FRIGHT_LABEL = 'Fright'
export const FRIGHT_HINT = 'Calm, Eerie or Dread: how dark and frightening the house is drawn. It changes nothing else.'
export const CALL_WARDEN_LABEL = 'Call the Warden'
export const CALL_WARDEN_HINT = 'He says what is going on in this room and lists what you can do.'
export const GUIDE_SETTINGS_NAME = 'Guide settings'
export const MAP_TOGGLE_LABEL = 'House map'
export const WORDS_TOGGLE_LABEL = "Show Kiro's words"
export const REVEAL_TOGGLE_LABEL = 'Show me what I can press'

function placed(box: Box): CSSProperties {
  return { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%` }
}

const ON_DESK: readonly WorkingObject['kind'][] = ['ledger', 'bell']

export function RoomStage({
  projection,
  roomId,
  view,
  words,
  quiet = false,
  settings,
  open = false,
  onPress,
  onStepBack,
  onCallWarden,
  onReturn,
  refusal = null,
  statusRef,
  motion = 'none',
  balloon = null,
}: RoomStageProps) {
  const callHintId = useId()
  const frightHintId = useId()
  const aftermath = useHoldAftermath(projection, settings.fright !== 'calm' && motion === 'low-frequency')
  const room = projection.rooms.find((candidate) => candidate.roomId === roomId)
  if (room === undefined) return null
  const lit = room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')
  const [firstDoor, secondDoor] = room.doors
  const objects = workingObjects(room, view, words, projection.needsYou.length)
  // Dread: every effect is read from the projection, so it shows something true.
  const effects = dreadEffects(settings.fright, motion)
  const dread = settings.fright !== 'calm'
  const light = roomLight(room)
  const stance = wardenStance(projection).stance
  const leakAt: LeakAt = firstDoor?.state === 'waiting' ? 'side' : secondDoor?.state === 'waiting' ? 'back' : null

  const spot = (object: WorkingObject) => {
    const ghost = object.kind === 'ghost' ? room.ghosts.find((candidate) => `ghost:${candidate.ghostId}` === object.key) : undefined
    return ghost === undefined ? (
      <span key={object.key} className="hh-stage-spot" data-spot={object.key} data-label={object.label} style={placed(object.box)} onClick={() => onPress(object.steps)} />
    ) : (
      <span
        key={object.key}
        className="hh-stage-figure"
        data-ghost={ghost.state}
        data-label={object.label}
        data-dragged={aftermath !== null && aftermath.outcome === 'refused' && aftermath.ghostId === ghost.ghostId ? 'true' : undefined}
        style={placed(object.box)}
        onClick={() => onPress(object.steps)}
      >
        {dread ? <HollowSpectre state={ghost.state} role={spectreRoleOf(ghost.ghostId)} /> : <SpectreArt state={ghost.state} role={spectreRoleOf(ghost.ghostId)} />}
      </span>
    )
  }

  return (
    <div
      className="hh-stage-room"
      data-stage-room={roomId}
      data-open={open}
      data-quiet={quiet}
      data-reveal={settings.reveal}
      data-light={dread ? light : undefined}
      data-stance={stance}
    >
      <h3 className="hh-stage-room-title" data-stage-title>
        You are in the {room.name}
      </h3>
      <div className="hh-stage-room-scene">
        <RoomPainting
          room={roomId}
          door={firstDoor === undefined ? null : firstDoor.state}
          secondDoor={secondDoor === undefined ? null : secondDoor.state}
          lit={lit}
          hasPrevious={view.previous !== null}
          hasNext={view.next !== null}
          dread={dread ? { webs: cobwebStep(room) } : undefined}
        />
        <div className="hh-stage-spots" aria-hidden="true">
          {objects.filter((object) => !ON_DESK.includes(object.kind)).map(spot)}
        </div>
        <DeskPainting />
        <StateLight light={light} leakAt={leakAt} effects={effects} />
        <Atmosphere effects={effects} />
        {dread ? <WardenShadow stance={stance} /> : null}
        {aftermath !== null && aftermath.outcome === 'released' ? <FleeingGhost key={aftermath.proposalId} /> : null}
        <div className="hh-stage-spots" aria-hidden="true">
          {objects.filter((object) => ON_DESK.includes(object.kind)).map(spot)}
        </div>
      </div>
      {settings.reveal ? <ObjectLabels objects={objects} onPress={onPress} /> : null}
      <div className="hh-stage-apron" data-stage-apron>
        {balloon !== null ? (
          balloon
        ) : quiet ? null : (
          <GuideBalloon
            view={view}
            words={words}
            onPress={(option, from) => onPress(option.steps, from)}
            onStepBack={onStepBack}
            refusal={refusal}
            pressesOf={(option) => pressedControls(option.steps).join(' ')}
            statusRef={statusRef}
          />
        )}
        <div className="hh-stage-settings" role="group" aria-label={GUIDE_SETTINGS_NAME} data-guide-settings>
          <button type="button" className="hh-stage-setting" data-map-toggle aria-pressed={settings.mapOpen} onClick={settings.onToggleMap}>
            <MapIcon size={13} aria-hidden />
            {MAP_TOGGLE_LABEL}: {settings.mapOpen ? 'open' : 'closed'}
          </button>
          <button type="button" className="hh-stage-setting" data-words-toggle aria-pressed={settings.kiroWords} onClick={settings.onToggleWords}>
            <Languages size={13} aria-hidden />
            {WORDS_TOGGLE_LABEL}: {settings.kiroWords ? 'on' : 'off'}
          </button>
          <button type="button" className="hh-stage-setting" data-reveal-toggle aria-pressed={settings.reveal} onClick={settings.onToggleReveal}>
            <MousePointerClick size={13} aria-hidden />
            {REVEAL_TOGGLE_LABEL}: {settings.reveal ? 'on' : 'off'}
          </button>
          <button type="button" className="hh-stage-setting" data-fright-toggle={settings.fright} aria-describedby={frightHintId} onClick={settings.onCycleFright}>
            <Ghost size={13} aria-hidden />
            {FRIGHT_LABEL}: {FRIGHT_TEXT[settings.fright]}
          </button>
          <span className="hh-guide-hidden" id={frightHintId}>
            {FRIGHT_HINT}
          </span>
        </div>
        <div className="hh-stage-keeper" data-guide-keeper>
          <span className="hh-stage-warden" aria-hidden="true">
            <WardenArt pose={view.pose} />
          </span>
          <div className="hh-stage-caption">
            <p className="hh-stage-pose" data-guide-pose={view.pose}>
              {view.poseLabel}
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
            {onReturn === undefined ? null : (
              <button type="button" className="hh-stage-exit" data-guide-exit aria-label="Exit to the Foyer" onClick={onReturn}>
                <LogOut size={13} aria-hidden />
                Exit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
