// Reveal (Spec 8, Requirement 8): one text label on every working object of
// the painted room. With labels off this renders nothing, and the painted
// spots stay pointer shortcuts hidden from assistive technology. With labels
// on, each object gets a real button: visible words, a full accessible name,
// and the same press plan as the object itself. Furniture gets nothing.
import type { CSSProperties } from 'react'
import type { Box, WorkingObject } from '../core/guide-layout'
import type { PressStep } from '../core/house-guide'

export const OBJECT_LABELS_NAME = 'Things you can press in this room'

export interface ObjectLabelsProps {
  /** The working objects of the room, in reading order. */
  objects: readonly WorkingObject[]
  onPress: (steps: readonly PressStep[], from?: HTMLElement | null) => void
}

/**
 * Where a label sits: above its object, centred on it, and pulled inward near
 * the side walls so it stays inside the scene.
 */
export function labelPlace(box: Box): { readonly style: CSSProperties; readonly anchor: 'left' | 'centre' | 'right' } {
  const centre = box.left + box.width / 2
  const bottom = `${100 - box.top}%`
  if (centre < 20) return { anchor: 'left', style: { left: `${box.left}%`, bottom } }
  if (centre > 80) return { anchor: 'right', style: { right: `${100 - box.left - box.width}%`, bottom } }
  return { anchor: 'centre', style: { left: `${centre}%`, bottom } }
}

export function ObjectLabels({ objects, onPress }: ObjectLabelsProps) {
  return (
    <ul className="hh-stage-labels" data-object-labels aria-label={OBJECT_LABELS_NAME}>
      {objects.map((object) => {
        const place = labelPlace(object.box)
        return (
          <li key={object.key} className="hh-stage-label-place" data-anchor={place.anchor} style={place.style}>
            <button type="button" className="hh-stage-label" data-object-label={object.key} data-kind={object.kind} aria-label={object.name} onClick={(event) => onPress(object.steps, event.currentTarget)}>
              {object.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
