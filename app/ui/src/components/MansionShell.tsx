// The Mansion Shell (Spec 6 tasks 5.4 and 7.3): the primary surface of an open
// Mansion. In document order: the toolbar, the House Map, short notes about
// the house as a whole, the one open panel, and the one polite live region.
//
// The shell takes a House Projection and typed callbacks. It holds only UI
// state: which surface is open, the Still House toggle, the last announcement.
// It has no reducer for rooms, Doors, ghosts or approvals, no generic approve
// function, no raw path and no composer. What a panel shows and sends is
// decided by `renderSurface`, which the upstream room modules fill.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHostEffects, type HostEffectsInput } from '../adapters/host-effects'
import {
  needsYouTarget,
  surfaceKey,
  type HouseProjection,
  type HouseSurfaceTarget,
  type NeedsYouItem,
  type OpenSurface,
} from '../core/house-projection'
import type { HostSummary } from '../core/interruption-policy'
import { motionState } from '../core/motion-policy'
import { HouseMap } from './HouseMap'
import { HOUSE_STAGE_STYLES } from './house-stage-styles'
import { ROOM_PAINT_STYLES } from './room-paint-styles'
import { HOUSE_UI_STYLES } from './house-styles'
import type { RoomId } from '../core/house-registry'
import { RoomStage } from './RoomStage'
import { useHouseSound } from './use-house-sound'
import { HouseToolbar } from './HouseToolbar'
import { LiveAnnouncer } from './LiveAnnouncer'
import { RoomPanelHost, useSurfaceStack, type OpenFocus, type PanelMode } from './RoomPanelHost'
import { useReducedMotion } from './use-reduced-motion'

/** What a panel may ask of the shell. Neither call is a decision. */
export interface SurfaceApi {
  /** Opens a surface on top of this one. `opener` should carry a `data-opener-key`. */
  readonly openNested: (target: HouseSurfaceTarget, opener: HTMLElement) => void
  readonly close: () => void
  /** True while optional motion is off (Still House or the browser's reduced-motion preference). */
  readonly stillHouse: boolean
}

export interface MansionShellProps {
  projection: HouseProjection
  /** The body of the open surface, built from the upstream room modules. */
  renderSurface: (surface: OpenSurface, api: SurfaceApi) => ReactNode
  /** The canonical ghost facts host effects are derived from. The badge count comes from the projection. */
  host: Omit<HostEffectsInput, 'needsYouCount' | 'onSummary'>
  /**
   * The latest result of something the Operator asked for (a Mansion opened, a
   * command answered). Said once, through the same one live region.
   */
  message?: string
  /** The foundation status details, shown in the toolbar's disclosure. */
  status?: ReactNode
  /** Notes about the whole house: loading, a log problem, why decisions are off. Placed after the map. */
  notes?: ReactNode
  /** A strip between the toolbar and the map: the static replay's playback bar. */
  banner?: ReactNode
  /** True while the first state of the house is still being read. */
  busy?: boolean
  /** Leaves the Mansion. Called for Escape when no surface is open. */
  onReturn?: () => void
  /**
   * `region` (default): the panel follows the map in the page. `dialog`: a
   * modal overlay. The overlay stays opt-in until rendered-layout evidence
   * (HUI-S2) shows it fits the dashboard.
   */
  panelMode?: PanelMode
  /** The command on its way, so a control that goes away with it does not take focus along. */
  inFlight?: string | null
  /** Sheets of the room panels, appended to the house sheet in the one style element. */
  panelStyles?: string
}

export const CLOSE_LABEL: Readonly<Record<HouseSurfaceTarget['kind'], string>> = {
  room: 'Close room',
  ghost: 'Close ghost details',
  door: 'Close door details',
}

/** The heading of a surface, from the projection alone. */
export function surfaceTitle(projection: HouseProjection, target: HouseSurfaceTarget): string {
  const room = projection.rooms.find((candidate) => candidate.roomId === target.roomId)
  if (room === undefined) return ''
  switch (target.kind) {
    case 'room':
      return room.name
    case 'ghost':
      return room.ghosts.find((ghost) => ghost.ghostId === target.ghostId)?.name ?? room.name
    case 'door':
      return `${room.doors.find((door) => door.phase === target.phase)?.phaseName ?? room.name} door`
  }
}

function escapeAttribute(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * Where the Needs You shortcut puts focus inside the room it opened: on the
 * decision itself, one Tab before its first control, so a repeated Enter on
 * the shortcut cannot decide anything. Without a matching element the panel
 * heading takes focus.
 */
export function needsYouFocus(item: NeedsYouItem): OpenFocus {
  const separator = item.id.indexOf(':')
  const proposalId = item.kind === 'door-decision' || item.kind === 'risky-decision' ? item.id.slice(separator + 1) : null
  return proposalId === null || proposalId === '' ? { kind: 'heading' } : { kind: 'selector', selector: `[data-proposal="${escapeAttribute(proposalId)}"]` }
}

interface Said {
  readonly text: string
  readonly turn: number
}

export function MansionShell({
  projection,
  renderSurface,
  host,
  message = '',
  status,
  notes,
  banner,
  busy = false,
  onReturn,
  panelMode = 'region',
  inFlight = null,
  panelStyles = '',
}: MansionShellProps) {
  const root = useRef<HTMLElement>(null)
  const mansionTitle = useRef<HTMLHeadingElement>(null)
  const panelId = useId()
  const stack = useSurfaceStack(projection, root, inFlight)

  // Motion: derived on every render from the two inputs, never stored.
  const [stillHouse, setStillHouse] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const motion = motionState({ stillHouse, prefersReducedMotion })

  // The one live region. A repeated text is still a new announcement, so each gets its own turn.
  const [said, setSaid] = useState<Said>({ text: message, turn: 0 })
  const say = useCallback((text: string) => {
    if (text !== '') setSaid((previous) => ({ text, turn: previous.turn + 1 }))
  }, [])
  const firstMessage = useRef(true)
  useEffect(() => {
    if (firstMessage.current) {
      firstMessage.current = false
      return
    }
    say(message)
  }, [message, say])
  const onSummary = useCallback((summary: HostSummary) => say(summary.text), [say])

  const { theme } = useHostEffects({ ...host, needsYouCount: projection.needsYou.length, onSummary })

  // Entering the Mansion moves focus to its name, so a screen reader says which one opened.
  useEffect(() => {
    mansionTitle.current?.focus()
  }, [])

  const openFromMap = useCallback(
    (target: HouseSurfaceTarget, opener: HTMLElement) => stack.open(target, opener, { placement: 'replace' }),
    [stack.open],
  )
  const api: SurfaceApi = useMemo(
    () => ({
      openNested: (target, opener) => stack.open(target, opener, { placement: 'push' }),
      close: stack.close,
      stillHouse: motion.effective === 'none',
    }),
    [stack.open, stack.close, motion.effective],
  )

  const needsYou = projection.needsYou
  const onNeedsYou = useCallback(
    (opener: HTMLElement) => {
      const roomId = needsYouTarget(needsYou)
      const first = needsYou[0]
      if (roomId === null || first === undefined) return
      stack.open({ kind: 'room', roomId }, opener, { placement: 'replace', focus: needsYouFocus(first) })
    },
    [needsYou, stack.open],
  )

  // Escape closes only the top surface. With none open it leaves the Mansion,
  // from anywhere on the page, unless something inside already handled the key.
  const escape = useRef({ open: stack.top !== null, close: stack.close, onReturn, mapOpen: false, closeMap: () => {} })
  escape.current = { open: stack.top !== null, close: stack.close, onReturn, mapOpen: escape.current.mapOpen, closeMap: escape.current.closeMap }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const now = escape.current
      if (now.open) {
        event.preventDefault()
        now.close()
      } else if (now.mapOpen) {
        event.preventDefault()
        now.closeMap()
      } else if (now.onReturn !== undefined) {
        event.preventDefault()
        now.onReturn()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const top = stack.top
  const openKey = top === null ? null : surfaceKey(top.target)
  const sound = useHouseSound(projection, openKey)
  const [turned, setTurned] = useState(false)
  // The room the Operator is standing in: the one on show, else the last one visited,
  // else the first that needs them, else the Foyer.
  const [visited, setVisited] = useState<RoomId | null>(null)
  const shown = top === null ? null : top.target.roomId
  useEffect(() => {
    if (shown !== null) setVisited(shown)
  }, [shown])
  // The map of the whole house lies over the room only while asked for. It is
  // put away again as soon as something is opened from it.
  const [mapOpen, setMapOpen] = useState(false)
  const toggleMap = useCallback(() => setMapOpen((value) => !value), [])
  useEffect(() => {
    if (mapOpen) root.current?.querySelector<HTMLElement>('[data-map-title]')?.focus()
  }, [mapOpen])
  useEffect(() => {
    if (openKey !== null) {
      setMapOpen(false)
      return
    }
    // A surface just closed and focus went back to the control that opened it.
    // Where the map is a sheet that is put away (the wide layout), that control
    // is clipped out of sight, so the Caretaker's choices take focus instead.
    const sheet = document.activeElement?.closest<HTMLElement>('[data-map-sheet]') ?? null
    if (sheet !== null && typeof window !== 'undefined' && window.getComputedStyle(sheet).clipPath.startsWith('inset')) {
      root.current?.querySelector<HTMLElement>('[data-guide-option]')?.focus()
    }
  }, [openKey])
  escape.current.mapOpen = mapOpen
  escape.current.closeMap = () => {
    setMapOpen(false)
    root.current?.querySelector<HTMLElement>('[data-guide-option="map"]')?.focus()
  }
  const wanted = shown ?? visited ?? needsYouTarget(projection.needsYou) ?? 'foyer'
  const current = projection.rooms.some((room) => room.roomId === wanted) ? wanted : (projection.rooms[0]?.roomId ?? 'foyer')
  const modal = panelMode === 'dialog' && top !== null
  // The page behind a modal dialog is inert. React 18 passes the attribute through as a string.
  const behind = modal ? { inert: '' } : {}
  return (
    <section
      className="hh-ui"
      aria-label={`Mansion ${projection.mansionName}`}
      aria-busy={busy}
      data-theme={theme.mode}
      data-motion={motion.effective}
      data-still={motion.effective === 'none'}
      data-mode={projection.mode}
      data-map={mapOpen ? 'open' : 'closed'}
      ref={root}
      onKeyDown={(event) => {
        // Handled here first, so a listener further out sees the key as taken.
        if (event.key !== 'Escape' || event.defaultPrevented || stack.top === null) return
        event.preventDefault()
        stack.close()
      }}
    >
      <style>{HOUSE_UI_STYLES + HOUSE_STAGE_STYLES + ROOM_PAINT_STYLES + panelStyles}</style>
      <div className="hh-ui-behind" {...behind}>
        <HouseToolbar
          ref={mansionTitle}
          mansionName={projection.mansionName}
          needsYou={needsYou}
          onNeedsYou={onNeedsYou}
          motion={motion}
          onToggleStillHouse={() => setStillHouse((value) => !value)}
          status={status}
          sound={{ on: sound.on, available: sound.available, onToggle: sound.toggle }}
          view={{ turned, onToggle: () => setTurned((value) => !value) }}
        />
        {banner}
        <RoomStage
          projection={projection}
          roomId={current}
          open={top !== null && top.target.roomId === current}
          onReturn={onReturn}
          mapOpen={mapOpen}
          onToggleMap={toggleMap}
        />
        {notes}
      </div>
      {top === null ? null : (
        <RoomPanelHost
          key={`${stack.depth}:${surfaceKey(top.target)}`}
          id={panelId}
          title={surfaceTitle(projection, top.target)}
          mode={panelMode}
          stack={stack}
          closeLabel={CLOSE_LABEL[top.target.kind]}
        >
          {renderSurface(top, api)}
        </RoomPanelHost>
      )}
      <div className="hh-ui-behind" data-map-sheet {...behind}>
        <HouseMap
          projection={projection}
          openSurface={openFromMap}
          motion={motion.effective}
          openKey={openKey}
          panelId={panelId}
          view={turned ? 'turned' : 'front'}
        />
      </div>
      <LiveAnnouncer message={said.text} turn={said.turn} />
    </section>
  )
}
