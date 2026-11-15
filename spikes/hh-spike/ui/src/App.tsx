import { useAppEvents } from '@kirocrew/app-sdk'
import { useEffect, useState } from 'react'

// Spike UI: proves the page mounts and shows the backend + live events.
export default function HHSpike() {
  const [who, setWho] = useState<string>('checking backend...')
  const [events, setEvents] = useState<string[]>([])
  useEffect(() => {
    fetch('/apps/hh-spike/api/whoami')
      .then((r) => r.text())
      .then(setWho)
      .catch((e) => setWho(String(e)))
  }, [])
  const push = (name: string) => (e: unknown) =>
    setEvents((xs) => [`${name}: ${JSON.stringify(e).slice(0, 200)}`, ...xs].slice(0, 30))
  useAppEvents('tool_call', push('tool_call'))
  useAppEvents('approval', push('approval'))
  useAppEvents('subagent_done', push('subagent_done'))
  return (
    <div style={{ padding: 24 }}>
      <h1>HH Spike</h1>
      <p>Backend: <code>{who}</code></p>
      <h2>Events</h2>
      <ul>{events.map((e, i) => <li key={i}><code>{e}</code></li>)}</ul>
    </div>
  )
}
