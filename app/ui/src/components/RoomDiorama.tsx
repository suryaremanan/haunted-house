// One room of the model as a real box (the 3D overhaul): a back wall, a
// floor, a ceiling and two side walls placed with CSS 3D transforms, with the
// room's furniture, its Doors and its ghosts standing inside at their own
// depths. house-stage-styles.ts gives the box its perspective.
//
// Decoration. The whole box is hidden from assistive technology, takes no
// focus, and repeats states that the room's controls already say in words: a
// Door leaf swings to its Door state, a ghost takes its ghost state's pose,
// and the lamps come on while a ghost is at work.
//
// With `interactive`, a pointer may press a ghost, a Door or the furniture as
// a shortcut. The press is forwarded to the house map's own control for the
// same thing, so there is one way to open a surface and the keyboard path is
// the map's. Opening is never a decision.
import type { CSSProperties, MouseEvent } from 'react'
import { surfaceKey, type HouseSurfaceTarget, type RoomPresentation } from '../core/house-projection'
import { GhostArt, ghostVariantOf } from './house-art'
import { StagePropArt, StageWallArt } from './house-stage-art'

export interface RoomDioramaProps {
  room: RoomPresentation
  /** Lets a pointer press the figures as a shortcut to the map's controls. */
  interactive?: boolean
}

/** Presses the house map's control for `target`, found from any element inside the same house. */
export function pressMapControl(from: Element, target: HouseSurfaceTarget): void {
  const key = surfaceKey(target)
  const controls = from.closest('.hh-ui')?.querySelectorAll<HTMLElement>('[data-opener-key]') ?? []
  for (const control of controls) {
    if (control.getAttribute('data-opener-key') === key) {
      control.click()
      return
    }
  }
}

/** Custom properties the sheet reads to place the nth of count figures. */
function slot(index: number, count: number): CSSProperties {
  return { '--hh-i': index, '--hh-n': count } as CSSProperties
}

export function RoomDiorama({ room, interactive = false }: RoomDioramaProps) {
  const pick = (target: HouseSurfaceTarget) =>
    interactive
      ? {
          'data-pick': target.kind,
          onClick: (event: MouseEvent<HTMLElement>) => {
            // A figure inside the room answers for itself, not for the room around it.
            event.stopPropagation()
            pressMapControl(event.currentTarget, target)
          },
        }
      : {}
  const lit = room.ghosts.some((ghost) => ghost.state === 'working' || ghost.state === 'waiting')
  return (
    <div
      className="hh-stage"
      data-scene={room.roomId}
      data-lit={lit}
      data-locked={room.locked}
      aria-hidden="true"
      {...pick({ kind: 'room', roomId: room.roomId })}
    >
      <span className="hh-stage-plane hh-stage-ceiling" />
      <span className="hh-stage-plane hh-stage-left" />
      <span className="hh-stage-plane hh-stage-right" />
      <span className="hh-stage-plane hh-stage-floor" />
      <span className="hh-stage-plane hh-stage-back" data-doors={Math.min(room.doors.length, 2)}>
        <StageWallArt room={room.roomId} />
        {room.doors.length === 0 ? null : (
          <span className="hh-stage-doors">
            {room.doors.map((door) => (
              <span
                key={door.phase}
                className="hh-stage-door"
                data-door={door.state}
                {...pick({ kind: 'door', roomId: room.roomId, phase: door.phase, proposalId: door.proposalId })}
              >
                <span className="hh-stage-doorway" />
                <span className="hh-stage-leaf">
                  <span className="hh-stage-mark" />
                  <span className="hh-stage-mark" />
                </span>
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="hh-stage-glow" />
      <span className="hh-stage-eyes" />
      <span className="hh-stage-props">
        <StagePropArt room={room.roomId} />
      </span>
      {room.ghosts.length === 0 ? null : (
        <span className="hh-stage-ghosts">
          {room.ghosts.map((ghost, index) => (
            <span
              key={ghost.ghostId}
              className="hh-stage-ghost"
              data-ghost={ghost.state}
              style={slot(index, room.ghosts.length)}
              {...pick({ kind: 'ghost', roomId: room.roomId, ghostId: ghost.ghostId })}
            >
              <GhostArt state={ghost.state} variant={ghostVariantOf(ghost.ghostId)} size={72} />
            </span>
          ))}
        </span>
      )}
      <span className="hh-stage-web" />
      <span className="hh-stage-mist" />
    </div>
  )
}
