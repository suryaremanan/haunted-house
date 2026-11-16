// The panel host and the surface stack behind it (Spec 6 task 5.3;
// Requirements 1.6, 3.4 to 3.6, 4.8, 4.9).
//
// One surface is shown at a time: the top of a small stack. A control on the
// map opens a surface as the only entry; a control inside an open panel opens
// a nested surface on top of it. Escape or Close removes only the top entry.
//
// Focus contract, the same in both modes:
// - opening moves focus to the panel heading (or, for the Needs You shortcut,
//   to the decision it points at);
// - closing returns focus to the control that opened the surface. If that
//   element was replaced by a rerender, the control with the same stable
//   opener key takes it; failing that, the Room control of the closed
//   surface; failing that, the map's heading;
// - when the open surface's room disappears, the stale panel closes the same
//   way and nothing in it can act;
// - when a control vanishes under the focus (a decided proposal), the heading
//   takes the focus instead of the page losing it.
// Focus recovery only ever calls `focus()`. It never clicks.
//
// A closed surface is not rendered at all, so nothing of it stays in the
// accessibility tree. The host has no live region.
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { surfaceKey, surfaceStillOpen, type HouseProjection, type HouseSurfaceTarget, type OpenSurface } from '../core/house-projection'

export type PanelMode = 'region' | 'dialog'

/** Where focus goes once a surface has opened. */
export type OpenFocus = { readonly kind: 'heading' } | { readonly kind: 'selector'; readonly selector: string }

export interface OpenOptions {
  /** `replace`: the surface becomes the only one (a map control). `push`: it opens on top (a control inside a panel). */
  readonly placement?: 'replace' | 'push'
  readonly focus?: OpenFocus
}

export interface SurfaceStack {
  /** The surface on show, or null. */
  readonly top: OpenSurface | null
  readonly depth: number
  /** Opens a surface. `opener` is the element that asked; its `data-opener-key` is remembered. */
  readonly open: (target: HouseSurfaceTarget, opener: HTMLElement | null, options?: OpenOptions) => void
  /** Closes the top surface and returns focus to what opened it. */
  readonly close: () => void
  readonly headingRef: RefObject<HTMLHeadingElement>
  readonly panelRef: RefObject<HTMLElement>
}

interface Entry {
  readonly surface: OpenSurface
  readonly opener: HTMLElement | null
}

type PendingFocus =
  | { readonly kind: 'opened'; readonly focus: OpenFocus }
  | { readonly kind: 'restore'; readonly opener: HTMLElement | null; readonly openerKey: string; readonly target: HouseSurfaceTarget }

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * The surface stack of one Mansion Shell. `root` is the shell element focus
 * recovery searches; `inFlight` is the command on its way, so a control that
 * goes away when it settles does not take the focus with it.
 */
export function useSurfaceStack(projection: HouseProjection, root: RefObject<HTMLElement>, inFlight: string | null = null): SurfaceStack {
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const pending = useRef<PendingFocus | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  const open = useCallback((target: HouseSurfaceTarget, opener: HTMLElement | null, options: OpenOptions = {}) => {
    const openerKey = opener?.getAttribute('data-opener-key') ?? surfaceKey(target)
    const entry: Entry = { surface: { target, openerKey }, opener }
    pending.current = { kind: 'opened', focus: options.focus ?? { kind: 'heading' } }
    setEntries((current) => (options.placement === 'push' ? [...current, entry] : [entry]))
  }, [])

  const close = useCallback(() => {
    const current = entriesRef.current
    const closing = current[current.length - 1]
    if (closing === undefined) return
    pending.current = { kind: 'restore', opener: closing.opener, openerKey: closing.surface.openerKey, target: closing.surface.target }
    setEntries(current.slice(0, -1))
  }, [])

  // A surface whose room, ghost or Door is no longer shown closes, with everything above it.
  const firstStale = entries.findIndex((entry) => surfaceStillOpen(entry.surface, projection) === null)
  useEffect(() => {
    if (firstStale === -1) return
    const stale = entriesRef.current[firstStale]
    if (stale === undefined) return
    pending.current = { kind: 'restore', opener: stale.opener, openerKey: stale.surface.openerKey, target: stale.surface.target }
    setEntries(entriesRef.current.slice(0, firstStale))
  }, [firstStale])

  // Runs after the stack rendered: the new panel, or the one underneath, is in the DOM now.
  useEffect(() => {
    const request = pending.current
    if (request === null) return
    pending.current = null
    const scope = root.current
    if (request.kind === 'opened') {
      const wanted = request.focus.kind === 'selector' ? panelRef.current?.querySelector<HTMLElement>(request.focus.selector) : null
      if (wanted != null) {
        // A decision surface is not focusable by itself; make it so for this one move.
        if (!wanted.hasAttribute('tabindex')) wanted.setAttribute('tabindex', '-1')
        wanted.focus()
        if (document.activeElement === wanted) return
      }
      headingRef.current?.focus()
      return
    }
    const byKey = () => scope?.querySelector<HTMLElement>(`[data-opener-key="${escapeAttribute(request.openerKey)}"]`) ?? null
    const roomControl = () => scope?.querySelector<HTMLElement>(`[data-room-control="${escapeAttribute(request.target.roomId)}"]`) ?? null
    const target =
      (request.opener !== null && request.opener.isConnected ? request.opener : null) ??
      byKey() ??
      roomControl() ??
      scope?.querySelector<HTMLElement>('[data-map-title]') ??
      null
    target?.focus()
  }, [entries, root])

  // A command settled and the control that had focus is gone: the heading takes it.
  const wasInFlight = useRef<string | null>(null)
  useEffect(() => {
    const settled = wasInFlight.current !== null && inFlight === null
    wasInFlight.current = inFlight
    if (!settled || entriesRef.current.length === 0) return
    const active = document.activeElement
    if (active === null || active === document.body) headingRef.current?.focus()
  }, [inFlight])

  const top = entries[entries.length - 1]?.surface ?? null
  return { top, depth: entries.length, open, close, headingRef, panelRef }
}

export interface RoomPanelHostProps {
  /** The DOM id the opening control names with `aria-controls`. */
  id: string
  /** The heading text: the room, ghost or Door on show. */
  title: string
  mode: PanelMode
  stack: SurfaceStack
  /** What the Close control says ("Close room"). */
  closeLabel: string
  children: ReactNode
}

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'

/**
 * The labelled panel of the open surface: a region beside the map, or a modal
 * dialog. Renders nothing when no surface is open.
 */
export function RoomPanelHost({ id, title, mode, stack, closeLabel, children }: RoomPanelHostProps) {
  const top = stack.top
  if (top === null) return null
  const titleId = `${id}-title`
  const target = top.target

  // A modal dialog keeps Tab inside itself. A region leaves Tab alone.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (mode !== 'dialog' || event.key !== 'Tab') return
    const panel = event.currentTarget
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((item) => !item.hasAttribute('disabled'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === stack.headingRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const panel = (
    <section
      className="hh-ui-panel"
      id={id}
      role={mode === 'dialog' ? 'dialog' : 'region'}
      aria-modal={mode === 'dialog' ? true : undefined}
      aria-labelledby={titleId}
      data-mode={mode}
      data-surface={target.kind}
      data-room-panel={target.kind === 'room' ? target.roomId : undefined}
      data-surface-room={target.roomId}
      data-depth={stack.depth}
      ref={stack.panelRef}
      onKeyDown={onKeyDown}
    >
      <div className="hh-ui-panel-head">
        <h4 id={titleId} ref={stack.headingRef} tabIndex={-1}>
          {title}
        </h4>
        <button type="button" className="hh-ui-panel-close" onClick={stack.close}>
          <X size={16} aria-hidden />
          {closeLabel}
        </button>
      </div>
      <div className="hh-ui-panel-body">{children}</div>
    </section>
  )
  if (mode !== 'dialog') return panel
  return (
    <>
      <div className="hh-ui-backdrop" data-backdrop onClick={stack.close} />
      {panel}
    </>
  )
}
