// The Replay Controller timer adapter (replay-and-submission task 3.4).
// **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.8, 2.10, 3.6**
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import type { ReplayCommand } from '../core/replay-reducer'
import { buildReplayModel, parseCanonicalLog, replayFoldFor, selectCanonical, type ReplayModel } from '../core/replay-timeline'
import { parseEventLog } from '../core/seance-log'
import { TIMEOUT_SCHEDULER, rebaseReplayState, useReplayController, type ReplayScheduler } from './replay-controller'

const MODEL = buildReplayModel(parseCanonicalLog(demo))
const FOLD = replayFoldFor(MODEL)
const TOTAL = MODEL.records.length
const offset = (index: number) => MODEL.timeline[index].presentationOffsetMs
/** The wait between record `index - 1` and record `index` at speed 1. */
const gap = (index: number) => offset(index) - offset(index - 1)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function mount(model: ReplayModel = MODEL, scheduler?: ReplayScheduler) {
  const hook = renderHook(({ current }: { current: ReplayModel }) => useReplayController(current, FOLD, scheduler), {
    initialProps: { current: model },
  })
  const send = (command: ReplayCommand) => act(() => hook.result.current.command(command))
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const state = () => hook.result.current.state
  /** Lets the rest of the recording play: each step is scheduled by the render after the one before. */
  const playOut = () => {
    for (let step = 0; step <= model.records.length && vi.getTimerCount() > 0; step += 1) advance(4_000)
  }
  return { hook, send, advance, state, playOut }
}

describe('Replay Controller', () => {
  it('starts paused at Cursor zero with nothing scheduled, and time alone changes nothing', () => {
    const { state, advance } = mount()
    expect(state()).toMatchObject({ status: 'paused', cursor: 0, speed: 1, commandError: null })
    expect(vi.getTimerCount()).toBe(0)
    advance(10 * 60_000)
    expect(state()).toMatchObject({ status: 'paused', cursor: 0 })
  })

  it('advances one record per scheduled step, at the recorded pace, and completes', () => {
    const { state, send, advance, playOut } = mount()
    const projection = state().projection
    send({ kind: 'play' })
    // Play itself presents nothing.
    expect(state()).toMatchObject({ status: 'playing', cursor: 0 })
    expect(state().projection).toBe(projection)
    expect(vi.getTimerCount()).toBe(1)

    // The first record follows Play at once.
    advance(0)
    expect(state().cursor).toBe(1)
    for (let index = 1; index < 6; index += 1) {
      expect(vi.getTimerCount()).toBe(1)
      advance(gap(index) - 1)
      expect(state().cursor).toBe(index)
      advance(1)
      expect(state().cursor).toBe(index + 1)
      expect(state().projection).toEqual(FOLD(MODEL.records.slice(0, index + 1)))
    }

    playOut()
    expect(state()).toMatchObject({ status: 'complete', cursor: TOTAL })
    expect(state().projection).toEqual(FOLD(MODEL.records))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the step on pause and schedules the whole interval again on resume', () => {
    const { state, send, advance } = mount()
    send({ kind: 'play' })
    advance(0)
    advance(gap(1) - 1)
    send({ kind: 'pause' })
    expect(vi.getTimerCount()).toBe(0)
    advance(60_000)
    expect(state()).toMatchObject({ status: 'paused', cursor: 1 })

    send({ kind: 'resume' })
    expect(vi.getTimerCount()).toBe(1)
    advance(gap(1) - 1)
    expect(state().cursor).toBe(1)
    advance(1)
    expect(state().cursor).toBe(2)
  })

  it('reschedules the complete next interval at the new speed', () => {
    const { state, send, advance } = mount()
    send({ kind: 'play' })
    advance(0)
    advance(gap(1) - 1)
    send({ kind: 'set_speed', speed: 2 })
    expect(vi.getTimerCount()).toBe(1)
    // The one millisecond left of the old timer does not count.
    advance(1)
    expect(state().cursor).toBe(1)
    advance(gap(1) / 2 - 1)
    expect(state()).toMatchObject({ cursor: 2, speed: 2 })

    send({ kind: 'set_speed', speed: 0.5 })
    advance(gap(2) * 2 - 1)
    expect(state().cursor).toBe(2)
    advance(1)
    expect(state().cursor).toBe(3)

    send({ kind: 'set_speed', speed: 3 })
    expect(state()).toMatchObject({ speed: 0.5, cursor: 3, commandError: { code: 'invalid_speed' } })
    expect(vi.getTimerCount()).toBe(1)
  })

  it('reschedules on seek, completes at the end, and cancels on restart', () => {
    const { state, send, advance } = mount()
    send({ kind: 'play' })
    advance(0)
    send({ kind: 'seek', cursor: 10 })
    expect(state()).toMatchObject({ status: 'playing', cursor: 10 })
    expect(vi.getTimerCount()).toBe(1)
    advance(gap(10) - 1)
    expect(state().cursor).toBe(10)
    advance(1)
    expect(state().cursor).toBe(11)

    send({ kind: 'seek', cursor: TOTAL + 1 })
    expect(state()).toMatchObject({ cursor: 11, status: 'playing', commandError: { code: 'invalid_cursor' } })

    send({ kind: 'seek', cursor: TOTAL })
    expect(state()).toMatchObject({ status: 'complete', cursor: TOTAL })
    expect(vi.getTimerCount()).toBe(0)

    send({ kind: 'seek', cursor: 4 })
    expect(state()).toMatchObject({ status: 'paused', cursor: 4 })
    expect(vi.getTimerCount()).toBe(0)

    send({ kind: 'play' })
    send({ kind: 'restart' })
    expect(state()).toMatchObject({ status: 'paused', cursor: 0 })
    expect(state().projection).toEqual(FOLD([]))
    expect(vi.getTimerCount()).toBe(0)
    advance(60_000)
    expect(state().cursor).toBe(0)
  })

  it('never advances from a callback whose generation was superseded', () => {
    // A scheduler that cannot cancel: every callback it was ever given can still fire.
    const callbacks: { generation: number; step: () => void }[] = []
    const leaky: ReplayScheduler = {
      schedule(_delayMs, generation, step) {
        callbacks.push({ generation, step })
        return () => {}
      },
    }
    const { state, send } = mount(MODEL, leaky)
    send({ kind: 'play' })
    const first = callbacks.at(-1)!
    send({ kind: 'pause' })
    act(() => first.step())
    expect(state()).toMatchObject({ status: 'paused', cursor: 0 })

    send({ kind: 'play' })
    send({ kind: 'seek', cursor: 5 })
    const stale = callbacks.slice(0, -1)
    act(() => stale.forEach(({ step }) => step()))
    expect(state().cursor).toBe(5)

    // The current callback advances exactly once, however often it fires.
    const current = callbacks.at(-1)!
    expect(current.generation).toBe(state().generation)
    act(() => {
      current.step()
      current.step()
    })
    expect(state().cursor).toBe(6)
  })

  it('keeps at most one timeout through any command sequence, and none after unmount', () => {
    const { hook, send, advance } = mount()
    const commands: ReplayCommand[] = [
      { kind: 'play' },
      { kind: 'set_speed', speed: 2 },
      { kind: 'seek', cursor: 3 },
      { kind: 'pause' },
      { kind: 'resume' },
      { kind: 'set_speed', speed: 0.5 },
      { kind: 'restart' },
      { kind: 'play' },
      { kind: 'seek', cursor: 20 },
    ]
    for (const command of commands) {
      send(command)
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1)
      advance(300)
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1)
    }
    expect(hook.result.current.state.status).toBe('playing')
    expect(vi.getTimerCount()).toBe(1)
    hook.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts over, paused, when the model is replaced by another log', () => {
    const { hook, send, advance, state } = mount()
    send({ kind: 'play' })
    advance(0)
    send({ kind: 'set_speed', speed: 2 })
    const generation = state().generation
    const other = buildReplayModel(selectCanonical(parseEventLog(demo).events.slice(10, 20)))
    hook.rerender({ current: other })
    expect(hook.result.current.model).toBe(other)
    expect(state()).toMatchObject({ status: 'paused', cursor: 0, speed: 1 })
    expect(state().generation).toBeGreaterThan(generation)
    expect(vi.getTimerCount()).toBe(0)
    advance(60_000)
    expect(state().cursor).toBe(0)
  })

  it('keeps the Cursor, paused, when the same log only grew', () => {
    const short = buildReplayModel(selectCanonical(MODEL.records.slice(0, 12)))
    const { hook, send, advance, state } = mount(short)
    send({ kind: 'set_speed', speed: 2 })
    send({ kind: 'seek', cursor: 12 })
    expect(state().status).toBe('complete')
    hook.rerender({ current: MODEL })
    expect(state()).toMatchObject({ status: 'paused', cursor: 12, speed: 2 })
    expect(state().projection).toEqual(FOLD(MODEL.records.slice(0, 12)))
    expect(vi.getTimerCount()).toBe(0)

    // Mid-playback growth pauses too: the pending step was timed for the old log.
    send({ kind: 'play' })
    hook.rerender({ current: buildReplayModel(selectCanonical(MODEL.records)) })
    expect(state()).toMatchObject({ status: 'paused', cursor: 12 })
    expect(vi.getTimerCount()).toBe(0)
    advance(60_000)
    expect(state().cursor).toBe(12)
  })

  it('rebases to the start when the fold of the kept Cursor fails', () => {
    const short = buildReplayModel(selectCanonical(MODEL.records.slice(0, 5)))
    const previous = { model: short, state: { ...rebaseReplayState({ model: short, state: mount(short).state() }, short, FOLD), cursor: 3 } }
    const failing = (records: readonly unknown[]) => {
      if (records.length > 0) throw new Error('fold failed')
      return FOLD([])
    }
    expect(rebaseReplayState(previous, MODEL, failing)).toMatchObject({ status: 'paused', cursor: 0 })
  })

  it('causes no host, storage, network or announcement effect while it plays', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((records) => mutations.push(...records))
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true })
    try {
      // The SDK double throws when any host hook is called: the controller calls none.
      const { send, state, playOut } = mount()
      send({ kind: 'play' })
      playOut()
      expect(state().status).toBe('complete')
      send({ kind: 'restart' })
      send({ kind: 'seek', cursor: 9 })
      expect(state().cursor).toBe(9)
      mutations.push(...observer.takeRecords())
      // renderHook mounts one empty container; playback adds or changes nothing in the document.
      expect(mutations.filter((record) => record.type !== 'childList' || record.target !== document.body)).toEqual([])
      expect(document.querySelector('[aria-live], [role="status"], [role="alert"], [role="log"]')).toBeNull()
      expect(setItem).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      observer.disconnect()
      vi.unstubAllGlobals()
    }
  })

  it('schedules with one setTimeout and cancels with clearTimeout', () => {
    const step = vi.fn()
    const cancel = TIMEOUT_SCHEDULER.schedule(500, 1, step)
    expect(vi.getTimerCount()).toBe(1)
    cancel()
    expect(vi.getTimerCount()).toBe(0)
    TIMEOUT_SCHEDULER.schedule(500, 2, step)
    vi.advanceTimersByTime(500)
    expect(step).toHaveBeenCalledTimes(1)
  })
})
