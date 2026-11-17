// Haunted House dashboard page. The status panel says whether our backend
// answers and whether the backend can reach the gateway. Once the backend is
// reachable, the Foyer mounts below it and lists, creates, and opens mansions.
// An opened mansion shows its house; the status details then move into the
// house toolbar, and the house's own live region is the page's one.
import { CircleCheck, CircleDashed, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { useCallback, useState } from 'react'
import { REPLAY_RECORDING, useBackendStatus, type BackendStatus, type GatewayErrorKind } from './adapters/sdk'
import { FrontDoorPainting, WardenArt } from './components/room-paint'
import { ROOM_PAINT_STYLES } from './components/room-paint-styles'
import { paletteCssVariables, sceneCssVariables } from './components/house-palette'
import { NO_GUIDE_SETTINGS, type GuideSettings } from './components/MansionShell'
import type { MansionDescriptor } from './core/mansion-api'
import { REPLAY_LANDING, TAGLINE, type LandingInvitation } from './landing'
import { Foyer } from './rooms/foyer/Foyer'
import { House } from './rooms/house/House'

type Tone = 'ok' | 'problem' | 'pending' | 'unknown'

interface RowView {
  tone: Tone
  text: string
  detail?: string
}

const GATEWAY_ERROR_COPY: Record<GatewayErrorKind, { short: string; long: string }> = {
  denied: {
    short: 'Refused the app token',
    long: 'Gateway refused the app token. Re-enable the app or approve its permissions on the app page.',
  },
  timeout: { short: 'No answer in time', long: 'Gateway did not answer in time.' },
  unreachable: { short: 'Not reachable', long: 'Backend could not reach the gateway.' },
  config: {
    short: 'Not set up',
    long: 'Gateway settings for this app are missing or not local, so the backend did not call it.',
  },
}

function httpSuffix(status: number | undefined): string {
  return status === undefined ? '' : ` (HTTP ${status})`
}

function backendRow(state: BackendStatus): RowView {
  switch (state.kind) {
    case 'loading':
      return { tone: 'pending', text: 'Checking…' }
    case 'ok':
      return { tone: 'ok', text: 'Reachable' }
    case 'unreachable':
      return { tone: 'problem', text: `Not reachable${httpSuffix(state.status)}`, detail: state.message }
  }
}

function gatewayRow(state: BackendStatus): RowView {
  switch (state.kind) {
    case 'loading':
      return { tone: 'pending', text: 'Checking…' }
    case 'unreachable':
      return { tone: 'unknown', text: 'Unknown until the backend answers' }
    case 'ok':
      if ('version' in state.gateway) return { tone: 'ok', text: `Version ${state.gateway.version}` }
      return { tone: 'problem', text: GATEWAY_ERROR_COPY[state.gateway.error].short }
  }
}

function summaryLine(state: BackendStatus): string {
  switch (state.kind) {
    case 'loading':
      return 'Checking the backend…'
    case 'unreachable':
      return `Backend not reachable${httpSuffix(state.status)}`
    case 'ok':
      if ('version' in state.gateway) return `Backend reachable · Gateway ${state.gateway.version}`
      return `Backend reachable · ${GATEWAY_ERROR_COPY[state.gateway.error].long}`
  }
}

function ToneIcon({ tone }: { tone: Tone }) {
  const common = { size: 18, 'aria-hidden': true } as const
  switch (tone) {
    case 'ok':
      return <CircleCheck {...common} className="hh-icon hh-icon-ok" />
    case 'problem':
      return <TriangleAlert {...common} className="hh-icon hh-icon-problem" />
    case 'pending':
      return <LoaderCircle {...common} className="hh-icon hh-icon-pending" />
    case 'unknown':
      return <CircleDashed {...common} className="hh-icon hh-icon-unknown" />
  }
}

function StatusRow({ name, view }: { name: string; view: RowView }) {
  return (
    <li className="hh-row" data-tone={view.tone}>
      <ToneIcon tone={view.tone} />
      <span className="hh-row-name">{name}</span>
      <span className="hh-row-text">{view.text}</span>
      {view.detail ? <span className="hh-row-detail">{view.detail}</span> : null}
    </li>
  )
}

// Plain CSS on Crew's theme variables, with the house palette as the fallback
// for hosts that lack them (the static replay page among them), in light and
// dark. Icons carry color as a hint only; every state is also spelled out in text.
const STYLES = `
.hh-house { ${paletteCssVariables('light')} ${sceneCssVariables('light')}
  font-family: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  color: var(--card-fg, var(--text, var(--hh-fb-text))); line-height: 1.45;
  display: block; max-width: 76rem; margin: 0 auto; padding: 8px 12px 32px; box-sizing: border-box; }
@media (prefers-color-scheme: dark) { .hh-house { ${paletteCssVariables('dark')} ${sceneCssVariables('dark')} } }
/* Inside a mansion the room is sized to the window, so the page keeps little under it. */
.hh-house:has(.hh-ui) { padding-bottom: 12px; }
.hh-status { color: var(--card-fg, var(--text, var(--hh-fb-text))); background: var(--card, var(--hh-fb-surface));
  border: 1px solid var(--border, var(--hh-fb-border)); border-radius: 12px; padding: 16px 20px;
  max-width: 48rem; margin: 16px auto 0; font: inherit; }
.hh-status h1 { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif; font-size: 2.5rem; line-height: 1.1;
  margin: 0 0 12px; letter-spacing: 0; }
.hh-status[data-compact='true'] { border: 0; background: transparent; padding: 0; margin: 8px 0 10px; max-width: none; }
.hh-status[data-compact='true'] h1 { margin: 0; font-size: 1.25rem; }
.hh-status[data-quiet='true'] { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: 20px;
  border: 0; background: transparent; padding: 8px 0 0; }
.hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 2; }
.hh-status[data-quiet='true'] h1 { margin: 0 0 6px; }
.hh-hero-art { grid-row: 1 / span 3; width: 14rem; max-width: 36vw; height: auto; color: var(--hh-sc-ink); }
.hh-hero-sheet { fill: var(--hh-sc-sheet); stroke: var(--hh-sc-sheet-ink); }
.hh-hero-grid { stroke: var(--hh-sc-sheet-line); }
.hh-hero-line { stroke: var(--hh-sc-sheet-ink); }
.hh-hero-line-fill { fill: var(--hh-sc-sheet-ink); }
.hh-hero-moon { fill: var(--hh-sc-moon); stroke: var(--hh-sc-sheet-ink); }
.hh-hero-wall { fill: var(--hh-sc-wall-foyer); }
.hh-hero-roof { fill: var(--hh-sc-roof); }
.hh-hero-door { fill: var(--hh-sc-wood); }
.hh-hero-lamp { fill: var(--hh-sc-lamp); }
.hh-hero-bone { fill: var(--hh-sc-bone); }
.hh-tagline { margin: 0 0 8px; font-size: 1.0625rem; max-width: 36rem; }
.hh-status[data-quiet='true'] .hh-rows { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
.hh-status[data-quiet='true'] .hh-summary { font-size: 0.8125rem; color: var(--muted, var(--hh-fb-text-muted)); }
.hh-rows { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }
.hh-row { display: grid; grid-template-columns: 18px 5rem 1fr; column-gap: 10px; align-items: center; }
.hh-row-name { font-weight: 600; }
.hh-row-detail { grid-column: 3; color: var(--muted, var(--hh-fb-text-muted)); font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-icon { flex: none; }
.hh-icon-ok { color: var(--ok, var(--hh-fb-ok)); }
.hh-icon-problem { color: var(--warn, var(--hh-fb-danger)); }
.hh-icon-pending, .hh-icon-unknown { color: var(--muted, var(--hh-fb-text-muted)); }
.hh-summary { margin: 0; }
.hh-announcement { display: block; margin-top: 4px; }
.hh-actions { margin-top: 12px; }
.hh-retry { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;
  color: var(--accent-fg, var(--hh-fb-accent-text)); background: var(--accent, var(--hh-fb-accent));
  border: 1px solid var(--border-strong, var(--hh-fb-border)); border-radius: 6px; padding: 6px 12px; }
.hh-retry:focus-visible { outline: 2px solid var(--ring, var(--hh-fb-focus)); outline-offset: 2px; }
/* The way in: the front door fills the page, the name is its brass plate, and the Foyer is a sheet of cream paper. */
.hh-house[data-landing='true'] { position: relative; max-width: none; min-height: 100vh; margin: 0; padding: 0 16px 48px; overflow: hidden;
  background: var(--hh-sc-front-door); }
.hh-landing-door { position: absolute; inset: 0; display: block; }
.hh-landing-keeper { display: none; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] { position: relative; z-index: 1; display: block; max-width: 30rem; margin: 5vh auto 0;
  padding: 14px 24px 12px; text-align: center; color: var(--hh-sc-ink); background: var(--hh-sc-brass); border: 3px solid var(--hh-sc-ink);
  border-radius: 6px; box-shadow: 0 5px 0 var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-tagline { margin: 0 auto 6px; }
.hh-house[data-landing='true'] .hh-status[data-quiet='true'] .hh-summary { color: var(--hh-sc-ink); }
.hh-house[data-landing='true'] .hh-foyer { position: relative; z-index: 1; max-width: 44rem; }
.hh-house[data-landing='true'] .hh-foyer-hall { ${paletteCssVariables('light')}
  --card: var(--hh-sc-balloon); --card-fg: var(--hh-fb-text); --text: var(--hh-fb-text); --muted: var(--hh-fb-text-muted);
  --border: var(--hh-fb-border); --border-strong: var(--hh-fb-border); --input: var(--hh-fb-surface-raised); --ok: var(--hh-fb-ok);
  --warn: var(--hh-fb-accent); --accent: var(--hh-fb-accent); --accent-fg: var(--hh-fb-accent-text); --ring: var(--hh-fb-focus);
  color: var(--hh-fb-text); background: var(--hh-sc-balloon); border: 2px solid var(--hh-sc-ink); border-radius: 10px;
  box-shadow: 4px 5px 0 var(--hh-sc-ink); }
@media (min-width: 900px) {
  .hh-landing-keeper { display: block; position: fixed; z-index: 1; right: 2.5%; bottom: 2%; width: clamp(96px, 11vw, 170px); aspect-ratio: 200 / 300; }
}
@media (max-width: 640px) {
  .hh-status[data-quiet='true'] { grid-template-columns: minmax(0, 1fr); }
  .hh-status[data-quiet='true'] > :not(.hh-hero-art) { grid-column: 1; }
  .hh-hero-art { grid-row: auto; width: 10rem; }
  .hh-status h1 { font-size: 1.875rem; }
}
@keyframes hh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-icon-pending { animation: hh-spin 2s linear infinite; }
}
`

interface HauntedHouseAppProps {
  /** Overrides the landing invitation. By default the static replay invites the visitor into its recording's mansion. */
  landing?: LandingInvitation
}

function StatusRows({ state }: { state: BackendStatus }) {
  return (
    <ul className="hh-rows" aria-label="Status">
      <StatusRow name="Backend" view={backendRow(state)} />
      <StatusRow name="Gateway" view={gatewayRow(state)} />
    </ul>
  )
}

export default function HauntedHouseApp({ landing }: HauntedHouseAppProps = {}) {
  const { state, retry } = useBackendStatus()
  const invite = landing ?? (REPLAY_RECORDING === null ? undefined : REPLAY_LANDING)
  // The page has one polite live region. Before a mansion is open it is the
  // summary line, and the Foyer hands it each completed create or open result.
  // In an open mansion it is the house's announcer, and the summary line is
  // plain text inside the toolbar's status disclosure.
  const [announcement, setAnnouncement] = useState('')
  const [openMansion, setOpenMansion] = useState<MansionDescriptor | null>(null)
  // The guide's settings last for the visit: held here so they outlast one Mansion, and written nowhere.
  const [guideSettings, setGuideSettings] = useState<GuideSettings>(NO_GUIDE_SETTINGS)
  const reachable = state.kind === 'ok'
  const inMansion = reachable && openMansion !== null
  const renderShell = useCallback(
    (mansion: MansionDescriptor, onReturn: () => void) => (
      <House
        mansion={mansion}
        onReturn={onReturn}
        announcement={announcement}
        guide={{ settings: guideSettings, onChange: setGuideSettings }}
        status={
          <>
            <StatusRows state={state} />
            <p className="hh-summary">{summaryLine(state)}</p>
          </>
        }
      />
    ),
    [announcement, guideSettings, state],
  )
  return (
    <main className="hh-house" aria-labelledby="hh-status-title" data-landing={reachable && !inMansion}>
      <style>{STYLES + ROOM_PAINT_STYLES}</style>
      {reachable && !inMansion ? (
        <>
          <span className="hh-landing-door" aria-hidden="true">
            <FrontDoorPainting />
          </span>
          <span className="hh-landing-keeper" aria-hidden="true">
            <WardenArt pose="watching" />
          </span>
        </>
      ) : null}
      <div className="hh-status" data-compact={inMansion} data-quiet={reachable && !inMansion}>
        <h1 id="hh-status-title">Haunted House</h1>
        {inMansion ? null : (
          <>
            {reachable ? <p className="hh-tagline">{TAGLINE}</p> : null}
            <StatusRows state={state} />
            <p className="hh-summary" aria-live="polite">
              {summaryLine(state)}
              {reachable && announcement !== '' ? (
                <>
                  {' '}
                  <span className="hh-announcement">{announcement}</span>
                </>
              ) : null}
            </p>
            {state.kind === 'unreachable' ? (
              <div className="hh-actions">
                <button type="button" className="hh-retry" onClick={retry}>
                  <RotateCw size={16} aria-hidden />
                  Retry
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {/* Mounted only once the backend answers, so an outage has one retry path. */}
      {reachable ? (
        <Foyer
          onAnnounce={setAnnouncement}
          onMansionChange={setOpenMansion}
          renderShell={renderShell}
          preselect={invite?.mansion}
          invitation={invite?.text}
        />
      ) : null}
    </main>
  )
}
