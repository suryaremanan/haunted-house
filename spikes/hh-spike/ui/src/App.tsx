import { useEffect, useState } from 'react'

import { S2CallbackProbe } from './S2CallbackProbe'

// Throwaway spike UI: backend reachability plus the scrubbed S2 callback probe.
export default function HHSpike() {
  const [who, setWho] = useState<string>('checking backend...')
  useEffect(() => {
    fetch('/apps/hh-spike/api/whoami')
      .then((response) => response.text())
      .then(setWho)
      .catch(() => setWho('backend unavailable'))
  }, [])

  return (
    <div style={{ padding: 24 }}>
      <h1>HH Spike</h1>
      <p>Backend: <code>{who}</code></p>
      <S2CallbackProbe />
    </div>
  )
}
