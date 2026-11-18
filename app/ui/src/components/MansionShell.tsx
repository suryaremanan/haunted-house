// The Mansion Shell (Spec 6 tasks 5.4 and 7.3): the primary surface of an open
// Mansion. In document order: the toolbar, the House Map, short notes about
// the house as a whole, the one open panel, and the one polite live region.
//
// The shell takes a House Projection and typed callbacks. It holds only UI
// state: which surface is open, the Still House toggle, the guide's settings,
// the last announcement. The Warden's words are read from the projection on
// every render (`core/house-guide.ts`), and whatever he offers is carried out
// by pressing a control that is already on this page (`use-guide-press.ts`).
// It has no reducer for rooms, Doors, ghosts or approvals, no generic approve
// function, no raw path and no composer. What a panel shows and sends is
// decided by `renderSurface`, which the upstream room modules fill.
import { DEFAULT_FRIGHT, FRIGHT_TEXT, nextFright, type FrightLevel } from '../core/dread'
import { DREAD_STYLES } from './dread-styles'
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
import { guideView, landingRoom, type GuideTask } from '../core/house-guide'
import type { WordMode } from '../core/house-words'
import type { HostSummary } from '../core/interruption-policy'
import { motionState } from '../core/motion-policy'
import { HouseMap } from './HouseMap'
import { HOUSE_STAGE_STYLES } from './house-stage-styles'
import { ROOM_PAINT_STYLES } from './room-paint-styles'
import { HOUSE_UI_STYLES, WIDE_BREAKPOINT_PX } from './house-styles'
import type { RoomId } from '../core/house-registry'
import { RoomStage } from './RoomStage'
import { useHouseSound } from './use-house-sound'
import { HouseToolbar } from './HouseToolbar'
import { LiveAnnouncer } from './LiveAnnouncer'
import { RoomPanelHost, useSurfaceStack, type OpenFocus, type PanelMode } from './RoomPanelHost'
import { useGuidePress } from './use-guide-press'
import { useReducedMotion } from './use-reduced-motion'
import { useStageMetrics } from './use-stage-metrics'

/** What a panel may ask of the shell. Neither call is a decision. */
export interface SurfaceApi {
  /** Opens a surface on top of this one. `opener` should carry a `data-opener-key`. */
  readonly openNested: (target: HouseSurfaceTarget, opener: HTMLElement) => void
  readonly close: () => void
  /** True while optional motion is off (Still House or the browser's reduced-motion preference). */
  readonly stillHouse: boolean
}

/** The guide's settings. Page state for the visit: off on every load and written nowhere. */
export interface GuideSettings {
  /** The Warden has stepped back. */
  readonly quiet: boolean
  /** Kiro's word is shown beside each plain word. */
  readonly kiroWords: boolean
  /** Every working object of the room wears its label. */
  readonly reveal: boolean
}

export const NO_GUIDE_SETTINGS: GuideSettings = { quiet: false, kiroWords: false, reveal: false }

/** What the one live region says when the visitor changes a setting. They asked, so it is said once. */
export const SETTING_SAID: Readonly<Record<keyof GuideSettings, (on: boolean) => string>> = {
  quiet: (on) => (on ? 'The Warden has stepped back. The house map and every control still work.' : 'The Warden is back.'),
  kiroWords: (on) => (on ? "Kiro's words are shown beside the plain ones." : "Kiro's words are hidden."),
  reveal: (on) => (on ? 'Everything you can press in this room now has a label.' : 'The labels are off.'),
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
  /**
   * The guide's settings, when the page holds them so they outlast one
   * Mansion. Without it the shell holds them itself.
   */
  guide?: { readonly settings: GuideSettings; readonly onChange: (settings: GuideSettings) => void }
  /** Shown in the Warden's place instead of his balloon (the replay's practice question). Null for his own words. */
  guideOverride?: ReactNode
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

/** The layout in which the house map is a sheet that is put away: the wide one. */
const WIDE_LAYOUT = `(min-width: ${WIDE_BREAKPOINT_PX}px)`

/**
 * True where the map is a put-away sheet. Asked of the browser, and believed
 * only when the answer is about this very question, so a page that cannot say
 * (or a stand-in that answers every question alike) counts as narrow.
 */
function mapIsPutAway(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  const answer = window.matchMedia(WIDE_LAYOUT)
  return answer.media === WIDE_LAYOUT && answer.matches
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
  guide,
  guideOverride = null,
}: MansionShellProps) {
  const root = useRef<HTMLElement>(null)
  const mansionTitle = useRef<HTMLHeadingElement>(null)
  /** The Warden's first line, so focus can be put on it. */
  const statusRef = useRef<HTMLParagraphElement>(null)
  const panelId = useId()
  const stack = useSurfaceStack(projection, root, inFlight)
  // Whether the balloon lies under the room or stands beside it: whichever gives the larger room on this page.
  const layout = useStageMetrics(root)

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

  // A press plan that opens a surface says where focus should land in it (the
  // thing being decided, never a control that decides) and which control the
  // visitor pressed, so closing the surface returns focus there.
  const opening = useRef<{ readonly focus: OpenFocus; readonly from: HTMLElement | null } | null>(null)
  const openFromMap = useCallback(
    (target: HouseSurfaceTarget, opener: HTMLElement) =>
      stack.open(target, opening.current?.from ?? opener, { placement: 'replace', focus: opening.current?.focus }),
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
  // Then the map sheet, then the labels, and only then the Mansion itself.
  const escape = useRef({ open: stack.top !== null, close: stack.close, onReturn, mapOpen: false, closeMap: () => {}, reveal: false, setReveal: (_on: boolean) => {} })
  escape.current = { ...escape.current, open: stack.top !== null, close: stack.close, onReturn }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const now = escape.current
      // The ? key labels everything that can be pressed. Inside a text field it is just a question mark.
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target instanceof Element ? event.target : null
        if (target !== null && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null) return
        event.preventDefault()
        now.setReveal(!now.reveal)
        return
      }
      if (event.key !== 'Escape') return
      if (now.open) {
        event.preventDefault()
        now.close()
      } else if (now.mapOpen) {
        event.preventDefault()
        now.closeMap()
      } else if (now.reveal) {
        event.preventDefault()
        now.setReveal(false)
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
  // How frightening the house is drawn. Like Still House, it lasts while the page is open.
  const [fright, setFright] = useState<FrightLevel>(DEFAULT_FRIGHT)
  const sound = useHouseSound(projection, openKey, undefined, fright)
  const [turned, setTurned] = useState(false)
  // The room the visitor is standing in: the one on show, else the last one visited,
  // else where the work is (`landingRoom`).
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
    // A surface just closed and focus went back to a control of the house map.
    // Where the map is a sheet that is put away (the wide layout lays it over
    // the room only on request), focus there would pull the sheet back out, so
    // the Warden's first line takes it instead, or the control that calls him.
    const sheet = document.activeElement?.closest<HTMLElement>('[data-map-sheet]') ?? null
    if (sheet !== null && mapIsPutAway()) {
      const line = statusRef.current ?? root.current?.querySelector<HTMLElement>('[data-guide-call]')
      line?.focus()
    }
  }, [openKey])
  escape.current.mapOpen = mapOpen
  escape.current.closeMap = () => {
    setMapOpen(false)
    root.current?.querySelector<HTMLElement>('[data-map-toggle]')?.focus()
  }
  const wanted = shown ?? visited ?? landingRoom(projection)
  const current = projection.rooms.some((room) => room.roomId === wanted) ? wanted : (projection.rooms[0]?.roomId ?? 'foyer')

  // The guide's settings: quiet, Kiro's words, labels.
  const [ownSettings, setOwnSettings] = useState<GuideSettings>(NO_GUIDE_SETTINGS)
  const settings = guide?.settings ?? ownSettings
  const changeSettings = guide?.onChange ?? setOwnSettings
  const settingsNow = useRef(settings)
  settingsNow.current = settings
  const setSetting = useCallback(
    (name: keyof GuideSettings, on: boolean) => {
      if (settingsNow.current[name] === on) return
      changeSettings({ ...settingsNow.current, [name]: on })
      say(SETTING_SAID[name](on))
    },
    [changeSettings, say],
  )
  const frightNow = useRef(fright)
  frightNow.current = fright
  const cycleFright = useCallback(() => {
    const next = nextFright(frightNow.current)
    setFright(next)
    say(`Fright: ${FRIGHT_TEXT[next]}.`)
  }, [say])
  escape.current.reveal = settings.reveal
  escape.current.setReveal = (on) => setSetting('reveal', on)

  // What the visitor is in the middle of (asking for a change). It ends with the surface it belongs to.
  const [task, setTask] = useState<GuideTask | null>(null)
  useEffect(() => setTask(null), [openKey])

  // The Warden's words for the room on show: read from the projection, held nowhere.
  const words: WordMode = settings.kiroWords ? 'with-kiro' : 'plain'
  const view = guideView(projection, {
    roomId: current,
    surface: top === null ? null : top.target,
    task,
    quiet: settings.quiet,
    words,
    reveal: settings.reveal,
    mapOpen,
    canLeave: onReturn !== undefined,
  })
  const note = useRef<string | null>(null)
  note.current = view?.note ?? null
  const press = useGuidePress({
    root,
    setOpening: (next) => {
      opening.current = next
    },
    onTask: setTask,
    fallbackReason: () => note.current,
  })
  // A press that could not be carried out: the visitor asked, so the reason is said once.
  useEffect(() => {
    if (press.refusal !== null) say(press.refusal)
  }, [press.refusal, say])

  // Stepping back puts focus on the control that calls him again; calling him puts it on his first line.
  const guideFocus = useRef<'status' | 'call' | null>(null)
  const stepBack = useCallback(() => {
    guideFocus.current = 'call'
    setSetting('quiet', true)
  }, [setSetting])
  const callWarden = useCallback(() => {
    guideFocus.current = 'status'
    setSetting('quiet', false)
  }, [setSetting])
  useEffect(() => {
    const where = guideFocus.current
    guideFocus.current = null
    if (where === 'status') statusRef.current?.focus()
    if (where === 'call') root.current?.querySelector<HTMLElement>('[data-guide-call]')?.focus()
  }, [settings.quiet])
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
      data-fright={fright}
      data-still={motion.effective === 'none'}
      data-mode={projection.mode}
      data-map={mapOpen ? 'open' : 'closed'}
      data-layout={layout}
      ref={root}
      onKeyDown={(event) => {
        // Handled here first, so a listener further out sees the key as taken.
        if (event.key !== 'Escape' || event.defaultPrevented || stack.top === null) return
        event.preventDefault()
        stack.close()
      }}
    >
      <style>{HOUSE_UI_STYLES + HOUSE_STAGE_STYLES + ROOM_PAINT_STYLES + DREAD_STYLES + panelStyles}</style>
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
        {view === null ? null : (
          <RoomStage
            projection={projection}
            roomId={current}
            view={view}
            words={words}
            quiet={settings.quiet}
            settings={{
              mapOpen,
              onToggleMap: toggleMap,
              kiroWords: settings.kiroWords,
              onToggleWords: () => setSetting('kiroWords', !settingsNow.current.kiroWords),
              reveal: settings.reveal,
              onToggleReveal: () => setSetting('reveal', !settingsNow.current.reveal),
              fright,
              onCycleFright: cycleFright,
            }}
            motion={motion.effective}
            balloon={guideOverride}
            open={top !== null && top.target.roomId === current}
            onPress={press.run}
            onStepBack={stepBack}
            onCallWarden={callWarden}
            onReturn={onReturn}
            refusal={press.refusal}
            statusRef={statusRef}
          />
        )}
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
