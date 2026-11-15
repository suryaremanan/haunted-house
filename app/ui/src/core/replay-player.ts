// Pure replay player: parses a recorded event file and plays it back to
// subscribers keyed by event type. No SDK, React or network. Time comes only
// from the injected `schedule` function, so tests can drive it by hand or with
// fake timers. The replay stand-in (src/adapters/sdk-shim) wires it to fetch.

/** One line of a recorded event file. */
export interface ReplayFrame {
  /** Recording time, in unix seconds. */
  readonly t: number
  readonly frame: {
    /** Gateway event type, the key subscribers listen on. */
    readonly type: string
    /** Event payload, passed to subscribers as is. */
    readonly data: unknown
  }
}

/** A line of a recorded event file that isn't a valid frame. */
export class ReplayParseError extends Error {
  /** 1-based line number in the file. */
  readonly line: number

  constructor(line: number, problem: string) {
    super(`Replay fixture line ${line}: ${problem}`)
    this.name = 'ReplayParseError'
    this.line = line
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseLine(raw: string, line: number): ReplayFrame {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new ReplayParseError(line, `not valid JSON (${reason})`)
  }
  if (!isRecord(value)) throw new ReplayParseError(line, 'expected a JSON object')
  if (typeof value.t !== 'number' || !Number.isFinite(value.t)) {
    throw new ReplayParseError(line, '"t" must be a number of unix seconds')
  }
  const frame = value.frame
  if (!isRecord(frame)) throw new ReplayParseError(line, '"frame" must be an object')
  if (typeof frame.type !== 'string' || frame.type === '') {
    throw new ReplayParseError(line, '"frame.type" must be a non-empty string')
  }
  if (!('data' in frame)) throw new ReplayParseError(line, '"frame.data" is missing')
  return { t: value.t, frame: { type: frame.type, data: frame.data } }
}

/**
 * Parses a JSONL event file: one `{"t": <seconds>, "frame": {"type", "data"}}`
 * per line. Blank lines are skipped. Throws a ReplayParseError naming the first
 * malformed line.
 */
export function parseFrames(text: string): ReplayFrame[] {
  const frames: ReplayFrame[] = []
  text.split(/\r?\n/).forEach((raw, index) => {
    if (raw.trim() !== '') frames.push(parseLine(raw, index + 1))
  })
  return frames
}

function checkSpeed(speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new RangeError(`Replay speed must be a positive number, got ${speed}`)
  }
}

/**
 * When each frame plays, in milliseconds after playback starts: its time since
 * the first frame, divided by `speed`. A frame recorded earlier than the one
 * before it plays together with that one, so playback always keeps file order.
 */
export function frameDelays(frames: readonly ReplayFrame[], speed = 1): number[] {
  checkSpeed(speed)
  const delays: number[] = []
  const start = frames[0]?.t ?? 0
  let previous = 0
  for (const { t } of frames) {
    previous = Math.max(previous, ((t - start) * 1000) / speed)
    delays.push(previous)
  }
  return delays
}

/** Runs `fn` after `delayMs` milliseconds. Defaults to setTimeout. */
export type Schedule = (fn: () => void, delayMs: number) => void

export type FrameListener = (data: unknown) => void

export interface PlayerOptions {
  /** Playback speed: 2 plays twice as fast as recorded. Default 1. */
  speed?: number
  schedule?: Schedule
  /** Gets anything a listener throws, so one bad listener can't stop the replay. Default console.error. */
  onError?: (err: unknown) => void
}

export interface ReplayPlayer {
  /**
   * Calls `listener` with `frame.data` for every frame of `type` played after
   * this call. Each call is its own subscription. Returns an unsubscribe function.
   */
  subscribe(type: string, listener: FrameListener): () => void
  /** Plays `frames` once, in file order. Throws if called a second time. */
  play(frames: readonly ReplayFrame[]): void
}

const defaultSchedule: Schedule = (fn, delayMs) => {
  setTimeout(fn, delayMs)
}

export function createPlayer(options: PlayerOptions = {}): ReplayPlayer {
  const speed = options.speed ?? 1
  checkSpeed(speed)
  const schedule = options.schedule ?? defaultSchedule
  const onError = options.onError ?? ((err: unknown) => console.error('Replay listener failed:', err))
  // One entry object per subscription, so the same function subscribed twice
  // is called twice and unsubscribes independently.
  const listeners = new Map<string, Set<{ listener: FrameListener }>>()
  let started = false

  function deliver({ frame }: ReplayFrame): void {
    const entries = listeners.get(frame.type)
    if (!entries) return
    // Snapshot: a listener that subscribes during delivery waits for the next frame.
    for (const { listener } of [...entries]) {
      try {
        listener(frame.data)
      } catch (err) {
        onError(err)
      }
    }
  }

  return {
    subscribe(type, listener) {
      const entry = { listener }
      const entries = listeners.get(type) ?? new Set()
      listeners.set(type, entries)
      entries.add(entry)
      return () => {
        entries.delete(entry)
      }
    },

    play(frames) {
      if (started) throw new Error('This replay player has already played its frames.')
      started = true
      const queue = [...frames]
      const delays = frameDelays(queue, speed)
      let next = 0
      // One timer at a time: each step plays every frame due at its time, in
      // file order, then waits for the next one. Timer ordering can't reorder frames.
      const step = () => {
        const now = delays[next]
        while (next < queue.length && delays[next] === now) {
          deliver(queue[next])
          next += 1
        }
        if (next < queue.length) schedule(step, delays[next] - now)
      }
      if (queue.length > 0) schedule(step, delays[0])
    },
  }
}
