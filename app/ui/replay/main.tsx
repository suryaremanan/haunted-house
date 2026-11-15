// Replay entry: renders the same root component the Crew dashboard renders.
// The replay build swaps the SDK for the stand-in in src/adapters/sdk-shim.
import { createRoot } from 'react-dom/client'
import HauntedHouseApp from '../src/App'

const container = document.getElementById('root')
if (!container) throw new Error('The replay page has no #root element.')
createRoot(container).render(<HauntedHouseApp />)
