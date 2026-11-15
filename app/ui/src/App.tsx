// Haunted House dashboard page. Spec 1 shows only the status panel: whether
// our backend answers, and whether the backend can reach the gateway.
import { CircleCheck, CircleDashed, LoaderCircle, RotateCw, TriangleAlert } from 'lucide-react'
import { useBackendStatus, type BackendStatus, type GatewayErrorKind } from './adapters/sdk'

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

// Plain CSS on Crew's theme variables, with fallbacks for hosts that lack them.
// Icons carry color as a hint only; every state is also spelled out in text.
const STYLES = `
.hh-status { color: var(--card-fg, var(--text, inherit)); background: var(--card, transparent);
  border: 1px solid var(--border, currentColor); border-radius: 8px; padding: 16px 20px;
  max-width: 560px; margin: 24px; font: inherit; }
.hh-status h1 { font-size: 1.25rem; margin: 0 0 12px; }
.hh-rows { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; }
.hh-row { display: grid; grid-template-columns: 18px 5rem 1fr; column-gap: 10px; align-items: center; }
.hh-row-name { font-weight: 600; }
.hh-row-detail { grid-column: 3; color: var(--muted, inherit); font-size: 0.875rem; overflow-wrap: anywhere; }
.hh-icon { flex: none; }
.hh-icon-ok { color: var(--ok, currentColor); }
.hh-icon-problem { color: var(--warn, currentColor); }
.hh-icon-pending, .hh-icon-unknown { color: var(--muted, currentColor); }
.hh-summary { margin: 0; }
.hh-actions { margin-top: 12px; }
.hh-retry { display: inline-flex; align-items: center; gap: 6px; font: inherit; cursor: pointer;
  color: var(--accent-fg, inherit); background: var(--accent, transparent);
  border: 1px solid var(--border-strong, currentColor); border-radius: 6px; padding: 6px 12px; }
.hh-retry:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 2px; }
@keyframes hh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: no-preference) {
  .hh-icon-pending { animation: hh-spin 2s linear infinite; }
}
`

export default function HauntedHouseApp() {
  const { state, retry } = useBackendStatus()
  return (
    <main className="hh-status" aria-labelledby="hh-status-title">
      <style>{STYLES}</style>
      <h1 id="hh-status-title">Haunted House</h1>
      <ul className="hh-rows" aria-label="Status">
        <StatusRow name="Backend" view={backendRow(state)} />
        <StatusRow name="Gateway" view={gatewayRow(state)} />
      </ul>
      <p className="hh-summary" aria-live="polite">
        {summaryLine(state)}
      </p>
      {state.kind === 'unreachable' ? (
        <div className="hh-actions">
          <button type="button" className="hh-retry" onClick={retry}>
            <RotateCw size={16} aria-hidden />
            Retry
          </button>
        </div>
      ) : null}
    </main>
  )
}
