// Toast coalescing examples (Spec 4 task 13.3; Requirements 9.5, 9.6).
import { describe, expect, it } from 'vitest'
import { needsYou } from './house-view'
import {
  EMPTY_COALESCER,
  collectInterruptions,
  flushCoalescer,
  nextFlushAtMs,
  offerInterruption,
  type Interruption,
} from './notify-coalescer'
import { projection, riskyProposal } from '../test/workflow-arbitraries'

const tinker = (id: string, kind: Interruption['kind'], text: string): Interruption => ({
  id,
  ghostKey: '["demo-mansion","tinker-2"]',
  ghostName: 'Tinker 2',
  kind,
  text,
})

describe('coalescer', () => {
  it('shows the first interruption at once and merges the rest of the window into one summary', () => {
    let step = offerInterruption(EMPTY_COALESCER, tinker('a', 'waiting', 'Tinker 2 is waiting for your approval.'), 0)
    expect(step.toasts).toEqual([{ ghostKey: '["demo-mansion","tinker-2"]', text: 'Tinker 2 is waiting for your approval.', count: 1, atMs: 0 }])
    step = offerInterruption(step.state, tinker('b', 'waiting', 'Tinker 2 asks to run a command.'), 2_000)
    expect(step.toasts).toEqual([])
    step = offerInterruption(step.state, tinker('c', 'failed', 'Tinker 2 failed.'), 9_999)
    expect(step.toasts).toEqual([])
    expect(nextFlushAtMs(step.state)).toBe(10_000)
    expect(flushCoalescer(step.state, 9_999).toasts).toEqual([])

    step = flushCoalescer(step.state, 10_000)
    expect(step.toasts).toEqual([
      { ghostKey: '["demo-mansion","tinker-2"]', text: 'Tinker 2: 2 more updates (waiting, failed). Latest: Tinker 2 failed.', count: 2, atMs: 10_000 },
    ])
    // The summary opened the next window; with nothing held it simply closes.
    expect(nextFlushAtMs(step.state)).toBe(20_000)
    step = flushCoalescer(step.state, 20_000)
    expect(step.toasts).toEqual([])
    expect(nextFlushAtMs(step.state)).toBeNull()
  })

  it('shows a single held interruption as itself', () => {
    let step = offerInterruption(EMPTY_COALESCER, tinker('a', 'waiting', 'first'), 0)
    step = offerInterruption(step.state, tinker('b', 'blocked', 'Tinker 2 is blocked.'), 1)
    expect(flushCoalescer(step.state, 10_000).toasts).toEqual([
      { ghostKey: '["demo-mansion","tinker-2"]', text: 'Tinker 2 is blocked.', count: 1, atMs: 10_000 },
    ])
  })

  it('keeps separate windows per ghost and ignores a clock that steps back', () => {
    let step = offerInterruption(EMPTY_COALESCER, tinker('a', 'waiting', 'one'), 5_000)
    const other: Interruption = { ...tinker('b', 'failed', 'Archivist failed.'), ghostKey: '["demo-mansion","archivist"]', ghostName: 'Archivist' }
    step = offerInterruption(step.state, other, 5_001)
    expect(step.toasts.map((toast) => toast.text)).toEqual(['Archivist failed.'])
    step = offerInterruption(step.state, tinker('c', 'waiting', 'two'), 1_000)
    expect(step.toasts).toEqual([])
    expect(step.state.nowMs).toBe(5_001)
  })
})

describe('collectInterruptions', () => {
  it('offers a new Door or risky proposal for its ghost and skips prompts no ghost is named for', () => {
    const value = projection({
      riskyProposals: [riskyProposal()],
      pendingPermissions: [{ slot: 's', mid: 'm', requestedSequence: 9, toolName: 'fs_write', actionDigest: null, proposalId: null }],
    })
    const items = needsYou(value)
    const collected = collectInterruptions({ mansionId: 'demo-mansion', transitions: [], snapshots: [], items, seen: new Set() })
    expect(collected.seen).toEqual(['risky:risky-1', 'permission:["s","m"]'])
    expect(collected.interruptions).toEqual([
      { id: 'risky:risky-1', ghostKey: '["demo-mansion","tinker-2"]', ghostName: 'Tinker 2', kind: 'waiting', text: 'Tinker 2 asks to run a command.' },
    ])
  })
})
