import { afterEach, describe, expect, it, vi } from 'vitest'
import demo from '../../../../fixtures/replay/demo.jsonl?raw'
import {
  createPlayer,
  frameDelays,
  parseFrames,
  ReplayParseError,
  type ReplayFrame,
  type Schedule,
} from './replay-player'

const frame = (t: number, type: string, data: unknown): ReplayFrame => ({ t, frame: { type, data } })

/** A scheduler the test runs by hand. Records every wait it was asked for. */
function manualSchedule() {
  const pending: (() => void)[] = []
  const waits: number[] = []
  const schedule: Schedule = (fn, delayMs) => {
    pending.push(fn)
    waits.push(delayMs)
  }
  const runAll = () => {
    for (let fn = pending.shift(); fn; fn = pending.shift()) fn()
  }
  return { schedule, waits, runAll }
}

describe('parseFrames', () => {
  it('parses one frame per line in file order and skips blank lines', () => {
    const text = [
      '{"t": 1.5, "frame": {"type": "approval", "data": {"id": "a"}}}',
      '',
      '   ',
      '{"t": 2, "frame": {"type": "subagent_chunk", "data": null}}\r',
      '',
    ].join('\n')
    expect(parseFrames(text)).toEqual([frame(1.5, 'approval', { id: 'a' }), frame(2, 'subagent_chunk', null)])
  })

  it('returns no frames for an empty file', () => {
    expect(parseFrames('')).toEqual([])
    expect(parseFrames('\n\n')).toEqual([])
  })

  it.each([
    ['not JSON', '{"t": 1,', 'not valid JSON'],
    ['an array', '[1, 2]', 'expected a JSON object'],
    ['no t', '{"frame": {"type": "x", "data": 1}}', '"t" must be a number'],
    ['a string t', '{"t": "1", "frame": {"type": "x", "data": 1}}', '"t" must be a number'],
    ['no frame', '{"t": 1}', '"frame" must be an object'],
    ['an empty type', '{"t": 1, "frame": {"type": "", "data": 1}}', '"frame.type" must be a non-empty string'],
    ['no data', '{"t": 1, "frame": {"type": "x"}}', '"frame.data" is missing'],
  ])('rejects a line with %s, naming the line', (_, bad, problem) => {
    const text = `{"t": 0, "frame": {"type": "ok", "data": 0}}\n\n${bad}\n`
    let caught: unknown
    try {
      parseFrames(text)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ReplayParseError)
    expect((caught as ReplayParseError).line).toBe(3)
    expect((caught as ReplayParseError).message).toContain('Replay fixture line 3: ')
    expect((caught as ReplayParseError).message).toContain(problem)
  })

  it('reads the committed demo recording, with times in order', () => {
    const frames = parseFrames(demo)
    expect(frames.length).toBeGreaterThan(0)
    const times = frames.map((f) => f.t)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })
})

describe('frameDelays', () => {
  it('measures from the first frame and divides by speed', () => {
    const frames = [frame(100, 'a', 0), frame(100.5, 'a', 0), frame(102, 'a', 0)]
    expect(frameDelays(frames)).toEqual([0, 500, 2000])
    expect(frameDelays(frames, 2)).toEqual([0, 250, 1000])
  })

  it('plays a frame recorded earlier than the one before it together with that one', () => {
    expect(frameDelays([frame(10, 'a', 0), frame(9, 'a', 0), frame(12, 'a', 0)])).toEqual([0, 0, 2000])
  })

  it('handles an empty recording', () => {
    expect(frameDelays([])).toEqual([])
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects speed %s', (speed) => {
    expect(() => frameDelays([frame(0, 'a', 0)], speed)).toThrow(RangeError)
    expect(() => createPlayer({ speed })).toThrow(RangeError)
  })
})

describe('createPlayer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives each subscriber the data of its own type only, in file order', () => {
    const clock = manualSchedule()
    const player = createPlayer({ schedule: clock.schedule })
    const approvals: unknown[] = []
    const chunks: unknown[] = []
    player.subscribe('approval', (data) => approvals.push(data))
    player.subscribe('subagent_chunk', (data) => chunks.push(data))

    player.play([
      frame(1, 'approval', { id: 1 }),
      frame(2, 'subagent_chunk', 'a'),
      frame(3, 'notification', 'ignored'),
      frame(4, 'subagent_chunk', 'b'),
      frame(5, 'approval', { id: 2 }),
    ])
    expect(approvals).toEqual([])
    clock.runAll()

    expect(approvals).toEqual([{ id: 1 }, { id: 2 }])
    expect(chunks).toEqual(['a', 'b'])
  })

  it('plays frames that share a time in one step, in file order', () => {
    const clock = manualSchedule()
    const player = createPlayer({ schedule: clock.schedule })
    const seen: unknown[] = []
    player.subscribe('x', (data) => seen.push(data))

    player.play([frame(5, 'x', 1), frame(5, 'x', 2), frame(6, 'x', 3), frame(6, 'x', 4)])
    clock.runAll()

    expect(seen).toEqual([1, 2, 3, 4])
    expect(clock.waits).toEqual([0, 1000])
  })

  it('waits the recorded time divided by speed, using setTimeout by default', () => {
    vi.useFakeTimers()
    const player = createPlayer({ speed: 2 })
    const seen: unknown[] = []
    player.subscribe('x', (data) => seen.push(data))

    player.play([frame(10, 'x', 'first'), frame(11, 'x', 'second'), frame(13, 'x', 'third')])
    expect(seen).toEqual([])
    vi.advanceTimersByTime(0)
    expect(seen).toEqual(['first'])
    vi.advanceTimersByTime(499)
    expect(seen).toEqual(['first'])
    vi.advanceTimersByTime(1)
    expect(seen).toEqual(['first', 'second'])
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual(['first', 'second', 'third'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops calling a subscriber once it unsubscribes, and keeps each subscription separate', () => {
    const clock = manualSchedule()
    const player = createPlayer({ schedule: clock.schedule })
    const seen: unknown[] = []
    const listener = (data: unknown) => seen.push(data)
    const offFirst = player.subscribe('x', listener)
    player.subscribe('x', listener)
    offFirst()

    player.play([frame(0, 'x', 'once')])
    clock.runAll()

    expect(seen).toEqual(['once'])
  })

  it('reports a failing subscriber and keeps playing to the others', () => {
    const clock = manualSchedule()
    const errors: unknown[] = []
    const player = createPlayer({ schedule: clock.schedule, onError: (err) => errors.push(err) })
    const boom = new Error('boom')
    const seen: unknown[] = []
    player.subscribe('x', () => {
      throw boom
    })
    player.subscribe('x', (data) => seen.push(data))

    player.play([frame(0, 'x', 1), frame(1, 'x', 2)])
    clock.runAll()

    expect(seen).toEqual([1, 2])
    expect(errors).toEqual([boom, boom])
  })

  it('plays only once and schedules nothing for an empty recording', () => {
    const clock = manualSchedule()
    const player = createPlayer({ schedule: clock.schedule })
    player.play([])
    expect(clock.waits).toEqual([])
    expect(() => player.play([frame(0, 'x', 1)])).toThrow('already played')
  })
})
